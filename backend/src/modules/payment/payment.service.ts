import crypto from 'crypto';
import { PaymentRepository } from './payment.repository.js';
import type { InvoiceRepository } from '../invoice/invoice.repository.js';
import { PaymentGatewayFactory } from './gateway.factory.js';
import { IntegrationService } from '../settings/integration.service.js';
import { logger } from '../../shared/logger.js';
import type { SettingsRepository } from '../settings/settings.repository.js';
import type { EventRepository } from '../event/event.repository.js';
import { NotFoundError, ValidationError, AuthError } from '../../shared/errors/index.js';
import type { InvoicePaymentLink } from '../../db/index.js';

// Lazy-imported to avoid circular dependency
type RecoveryServiceLike = {
  startRecoverySession(tenantId: string, invoiceId: string, daysOverdue: number, failureReason?: string): Promise<unknown>;
  markSessionRecovered(tenantId: string, invoiceId: string, amountRecovered: string): Promise<void>;
};

interface RazorpayWebhookPayload {
  event_id?: string;
  'x-razorpay-event-id'?: string;
  payload?: {
    payment?: {
      entity?: {
        email?: string;
        contact?: string;
        payment_link_id?: string;
      };
    };
    payment_link?: {
      entity?: {
        id?: string;
      };
    };
  };
}

export class PaymentService {
  constructor(
    private readonly repo: PaymentRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly integrationService: IntegrationService,
    private readonly gatewayFactory: PaymentGatewayFactory,
    private readonly settingsRepo: SettingsRepository,
    private readonly eventRepo: EventRepository,
    private recoveryService?: RecoveryServiceLike
  ) { }

  /** Wire recovery service after creation to avoid circular deps */
  setRecoveryService(svc: RecoveryServiceLike): void {
    this.recoveryService = svc;
  }

  async getOrGeneratePaymentLink(tenantId: string, invoiceId: string, provider: 'razorpay'): Promise<string> {
    try {
      const existingLink = await this.repo.getActivePaymentLink(tenantId, invoiceId, provider);
      if (existingLink) {
        return existingLink.paymentUrl;
      }
      const invoice = await this.invoiceRepo.findById(invoiceId);
      if (!invoice) throw new NotFoundError('Invoice not found');
      if (invoice.tenantId !== tenantId) throw new NotFoundError('Invoice not found');

      const credentials = await this.integrationService.getDecryptedRazorpayConfig(tenantId);

      const adapter = this.gatewayFactory.getAdapter(provider);
      if (!adapter) throw new ValidationError(`Provider ${provider} not registered`);

      let linkData;
      try {
        linkData = await adapter.createPaymentLink(
          credentials,
          invoiceId,
          Number(invoice.invoiceAmount),
          invoice.currency,
          `Payment for Invoice ${invoice.invoiceNo}`
        );
      } catch (adapterError) {
        logger.error('Provider failed to generate payment link, attempting fallback', { error: adapterError, tenantId, invoiceId });
        const settings = await this.settingsRepo.getSettings(tenantId);
        if (settings?.paymentLink) {
          try {
            await this.repo.insertPaymentLinkFallback({
              tenantId,
              invoiceId,
              provider,
              providerPaymentLinkId: 'fallback-' + crypto.randomUUID(),
              providerOrderId: null,
              paymentUrl: settings.paymentLink,
              amount: String(invoice.invoiceAmount),
              currency: invoice.currency,
            });
          } catch (e: unknown) {
            // Non-fatal: log all unexpected errors (23505 conflicts are already
            // handled gracefully at the DB level via onConflictDoNothing).
            logger.error('Failed to save fallback payment link', { error: e, tenantId, invoiceId });
          }
          return settings.paymentLink;
        }
        throw adapterError;
      }

      try {
        const newLink = await this.repo.insertPaymentLink({
          tenantId,
          invoiceId,
          provider,
          providerPaymentLinkId: linkData.providerPaymentLinkId,
          providerOrderId: linkData.providerOrderId,
          paymentUrl: linkData.paymentUrl,
          amount: String(invoice.invoiceAmount),
          currency: invoice.currency,
        });
        return newLink.paymentUrl;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
          logger.warn(`Concurrent link generation for invoice ${invoiceId}. Re-fetching active link.`);
          const activeLink = await this.repo.getActivePaymentLink(tenantId, invoiceId, provider);
          if (activeLink) return activeLink.paymentUrl;
        }
        throw err;
      }
    } catch (error) {
      logger.error('Failed to get or generate payment link', { error, tenantId, invoiceId });
      throw error;
    }
  }

  async getLatestPaymentLink(invoiceId: string, tenantId: string): Promise<InvoicePaymentLink | null> {
    return this.repo.getLatestPaymentLink(invoiceId, tenantId);
  }

  async cancelActivePaymentLinks(tenantId: string, invoiceId: string): Promise<void> {
    await this.repo.cancelActiveLinks(tenantId, invoiceId);
  }

  /**
   * BUG-06 FIX: Generate a FRESH Razorpay payment link with 48h expiry for recovery urgency.
   * Cancels any existing stale link before creating a new one.
   * Returns { paymentUrl, providerPaymentLinkId } so callers can store the actual Razorpay ref.
   */
  async generateFreshRecoveryLink(
    tenantId: string,
    invoiceId: string
  ): Promise<{ paymentUrl: string; providerPaymentLinkId: string }> {
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found');
    if (invoice.tenantId !== tenantId) throw new NotFoundError('Invoice not found');

    const credentials = await this.integrationService.getDecryptedRazorpayConfig(tenantId);
    const adapter = this.gatewayFactory.getAdapter('razorpay');
    if (!adapter) throw new ValidationError('Razorpay provider not registered');

    // BUG-13 FIX: Cancel stale existing link before generating fresh one
    const existingLink = await this.repo.getActivePaymentLink(tenantId, invoiceId, 'razorpay');
    if (existingLink?.providerPaymentLinkId && adapter.cancelPaymentLink) {
      await adapter.cancelPaymentLink(credentials, existingLink.providerPaymentLinkId);
      await this.repo.cancelActiveLinks(tenantId, invoiceId);
    }

    // Create fresh link with 48h expiry for urgency
    const linkData = await adapter.createPaymentLink(
      credentials,
      invoiceId,
      Number(invoice.invoiceAmount),
      invoice.currency,
      `[Recovery] Payment for Invoice ${invoice.invoiceNo} — Please pay within 48 hours`,
      48 // expiryHours — BUG-06 FIX
    );

    // Persist the new link
    try {
      await this.repo.insertPaymentLink({
        tenantId,
        invoiceId,
        provider: 'razorpay',
        providerPaymentLinkId: linkData.providerPaymentLinkId,
        providerOrderId: linkData.providerOrderId,
        paymentUrl: linkData.paymentUrl,
        amount: String(invoice.invoiceAmount),
        currency: invoice.currency,
      });
    } catch (err: unknown) {
      // 23505 = unique violation (concurrent generation) — non-fatal
      if (!(err && typeof err === 'object' && 'code' in err && (err as any).code === '23505')) {
        logger.warn('generateFreshRecoveryLink: failed to persist link', { err });
      }
    }

    logger.info('fresh_recovery_link_generated', {
      tenantId,
      invoiceId,
      providerPaymentLinkId: linkData.providerPaymentLinkId,
    });

    return {
      paymentUrl: linkData.paymentUrl,
      providerPaymentLinkId: linkData.providerPaymentLinkId,
    };
  }

  /**
   * BUG-10 FIX: Retry a Razorpay mandate/subscription for failed subscription recovery.
   * Calls Razorpay POST /v1/subscriptions/{id}/retry via the adapter.
   * The subscriptionId is stored in invoice.externalRefId (convention).
   */
  async retryMandate(
    tenantId: string,
    invoiceId: string
  ): Promise<{ success: boolean; message: string }> {
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice || invoice.tenantId !== tenantId) {
      return { success: false, message: 'Invoice not found' };
    }

    const subscriptionId = invoice.externalRefId;
    if (!subscriptionId) {
      logger.warn('retryMandate: no subscriptionId (externalRefId) on invoice', { invoiceId });
      return { success: false, message: 'No mandate/subscription ID on invoice — skipping Razorpay retry' };
    }

    const adapter = this.gatewayFactory.getAdapter('razorpay');
    if (!adapter?.retrySubscription) {
      return { success: false, message: 'Razorpay adapter does not support mandate retry' };
    }

    const credentials = await this.integrationService.getDecryptedRazorpayConfig(tenantId);
    return adapter.retrySubscription(credentials, subscriptionId);
  }

  async processPaymentCaptured(tenantId: string, provider: 'razorpay', payload: RazorpayWebhookPayload, rawBody: Buffer, signature: string): Promise<{ status: 'processed' | 'ignored' | 'error'; message?: string }> {
    const adapter = this.gatewayFactory.getAdapter(provider);
    if (!adapter) throw new ValidationError(`Provider ${provider} not registered`);

    const credentials = await this.integrationService.getDecryptedRazorpayConfig(tenantId);
    const isValid = adapter.verifyWebhookSignature(rawBody, signature, credentials.webhookSecret);
    if (!isValid) {
      logger.error(`Webhook signature validation failed for tenant ${tenantId}`);
      throw new AuthError('Invalid signature', 401);
    }

    const parsedEvent = adapter.parseWebhookEvent(rawBody);
    if (!parsedEvent) {
      const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
      const externalEventId = payload?.event_id || payload?.['x-razorpay-event-id'] || `hash-${payloadHash}`;
      if (externalEventId !== 'unknown') {
        try {
          const sanitizedPayload = { ...payload };
          if (sanitizedPayload.payload?.payment?.entity) {
            delete sanitizedPayload.payload.payment.entity.email;
            delete sanitizedPayload.payload.payment.entity.contact;
          }

          await this.repo.insertWebhookEvent({
            tenantId,
            provider,
            externalEventId,
            status: 'ignored',
            rawPayload: sanitizedPayload,
          });
        } catch (e: unknown) {
          if (e && typeof e === 'object' && 'code' in e && e.code === '23505') return { status: 'ignored' };
        }
      }
      return { status: 'ignored' };
    }

    const { invoiceId, amount, currency, externalRefId, status } = parsedEvent;

    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const finalEventId = payload?.event_id || `${provider}-${externalRefId}-${status}-${payloadHash}`;

    let resolvedInvoiceId = invoiceId;
    if (!resolvedInvoiceId) {
      const plinkId = payload?.payload?.payment?.entity?.payment_link_id || payload?.payload?.payment_link?.entity?.id;
      if (plinkId) {
        const linkRecord = await this.repo.getActivePaymentLinkByProviderId(tenantId, plinkId, provider);
        if (linkRecord) {
          resolvedInvoiceId = linkRecord.invoiceId;
        }
      }
    }

    const sanitizedPayload = { ...payload };
    if (sanitizedPayload.payload?.payment?.entity) {
      delete sanitizedPayload.payload.payment.entity.email;
      delete sanitizedPayload.payload.payment.entity.contact;
    }

    try {
      await this.repo.insertWebhookEvent({
        tenantId,
        provider,
        externalEventId: finalEventId,
        paymentId: externalRefId,
        invoiceId: resolvedInvoiceId,
        status: 'pending',
        rawPayload: sanitizedPayload,
      });
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'code' in e && e.code === '23505') {
        return { status: 'ignored' };
      }
      throw e;
    }

    let invoice = null;
    if (resolvedInvoiceId) {
      invoice = await this.invoiceRepo.findById(resolvedInvoiceId);
    }

    let validationError = null;
    let expectedAmount = 0;
    if (invoice) {
      const numAmount = Number(invoice.invoiceAmount);
      const zeroDecimalCurrencies = ['JPY', 'KRW', 'VND', 'CLP', 'PYG', 'BIF', 'DJF', 'GNF', 'KMF', 'RWF', 'UGX', 'VUV', 'XAF', 'XOF', 'XPF'];
      const isZeroDecimal = zeroDecimalCurrencies.includes(invoice.currency.toUpperCase());
      expectedAmount = isZeroDecimal ? Math.round(numAmount) : Math.round(numAmount * 100);
    }

    if (!invoice) {
      validationError = 'Invoice not found';
    } else if (invoice.tenantId !== tenantId) {
      validationError = 'Tenant mismatch';
    } else if (expectedAmount !== amount) {
      validationError = 'Amount mismatch';
    } else if (invoice.currency.toUpperCase() !== currency.toUpperCase()) {
      validationError = 'Currency mismatch';
    } else if (invoice.paymentStatus === 'Paid') {
      await this.repo.updateWebhookEventStatus(finalEventId, 'ignored');
      return { status: 'ignored' };
    }

    if (validationError) {
      logger.error(`Webhook validation failed: ${validationError} for event ${finalEventId}`);
      await this.repo.updateWebhookEventStatus(finalEventId, 'error');

      if (invoice) {
        try {
          await this.eventRepo.create({
            tenantId,
            entityType: 'invoice',
            entityId: invoice.id,
            eventType: 'payment_webhook_failed',
            actorName: 'system',
            source: 'system',
            payload: {
              reason: validationError,
              provider,
              receivedAmount: amount,
              expectedAmount,
              receivedCurrency: currency,
              expectedCurrency: invoice.currency
            }
          });
        } catch (eventError) {
          logger.error('Failed to log payment webhook failure event', { eventError, invoiceId });
        }
      }

      return { status: 'error', message: validationError };
    }

    if (status === 'failed') {
      logger.info(`Payment failed for invoice ${resolvedInvoiceId} (ref: ${externalRefId})`);
      await this.repo.updateWebhookEventStatus(finalEventId, 'processed');

      // Auto-trigger AI Recovery session for failed payments
      if (resolvedInvoiceId && this.recoveryService) {
        const failedInvoice = resolvedInvoiceId ? await this.invoiceRepo.findById(resolvedInvoiceId) : null;
        const dueDate = failedInvoice?.dueDate ? new Date(failedInvoice.dueDate) : new Date();
        const daysOverdue = Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        const failureReason = (parsedEvent as any).failureReason ?? 'Payment failed via Razorpay';

        this.recoveryService.startRecoverySession(tenantId, resolvedInvoiceId, daysOverdue, failureReason)
          .catch((err) => logger.warn('Recovery session start failed (non-fatal)', { err, invoiceId: resolvedInvoiceId }));
      }

      return { status: 'processed' };
    }

    const activeLink = resolvedInvoiceId ? await this.repo.getActivePaymentLink(tenantId, resolvedInvoiceId, provider) : null;
    const result = await this.repo.resolveSuccessfulPayment(tenantId, resolvedInvoiceId!, activeLink?.id, finalEventId);

    // Mark any active recovery session as recovered on successful payment
    if (result?.status === 'processed' && resolvedInvoiceId && this.recoveryService) {
      const paidInvoice = await this.invoiceRepo.findById(resolvedInvoiceId);
      if (paidInvoice) {
        this.recoveryService.markSessionRecovered(tenantId, resolvedInvoiceId, String(paidInvoice.invoiceAmount))
          .catch((err) => logger.warn('Recovery session mark recovered failed (non-fatal)', { err }));
      }
    }

    return result || { status: 'processed' };
  }
}

