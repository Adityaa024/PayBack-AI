import crypto from 'crypto';
import { IPaymentGateway, WebhookEventPayload } from '../gateway.interface.js';
import { logger } from '../../../shared/logger.js';
import { ValidationError, ExternalServiceError } from '../../../shared/errors/index.js';

export class RazorpayAdapter implements IPaymentGateway {
  getProviderName(): string {
    return 'razorpay';
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
    if (!signature || !secret || !rawBody) {
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      const expectedBuffer = Buffer.from(expectedSignature);
      const signatureBuffer = Buffer.from(signature);

      if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
    } catch (error) {
      logger.error('Error verifying Razorpay signature', { error });
      return false;
    }
  }

  parseWebhookEvent(rawBody: Buffer): WebhookEventPayload | null {
    try {
      const parsedBody = JSON.parse(rawBody.toString('utf8'));

      if (parsedBody.event === 'payment.captured' || parsedBody.event === 'payment.failed') {
        const entity = parsedBody.payload?.payment?.entity;
        const paymentLinkEntity = parsedBody.payload?.payment_link?.entity;
        if (!entity) return null;

        const invoiceId = entity.notes?.invoice_id || paymentLinkEntity?.notes?.invoice_id;

        return {
          provider: 'razorpay',
          invoiceId: invoiceId,
          amount: entity.amount, // in paise
          currency: entity.currency,
          status: parsedBody.event === 'payment.captured' ? 'captured' : 'failed',
          externalRefId: entity.id,
          rawEvent: parsedBody,
          // Carry failure details for recovery agent
          failureReason: parsedBody.event === 'payment.failed'
            ? (entity.error_description || entity.error_code || 'Payment failed')
            : undefined,
          errorCode: parsedBody.event === 'payment.failed' ? entity.error_code : undefined,
        };
      }
      
      return null;
    } catch (error) {
      logger.error('Error parsing Razorpay webhook payload', { error });
      return null;
    }
  }

  async createPaymentLink(
    credentials: Record<string, string>,
    invoiceId: string,
    amount: number,
    currency: string,
    description: string,
    expiryHours?: number
  ): Promise<{ paymentUrl: string; providerPaymentLinkId: string; providerOrderId?: string }> {
    const { keyId, keySecret } = credentials;
    if (!keyId || !keySecret) {
      throw new ValidationError('Razorpay credentials missing keyId or keySecret');
    }

    const amountInPaise = Math.round(amount * 100);
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    // Set expiry for urgency (default 48 hours for recovery links)
    const expireBy = expiryHours
      ? Math.floor(Date.now() / 1000) + expiryHours * 3600
      : undefined;

    const response = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency,
        accept_partial: false,
        description,
        ...(expireBy ? { expire_by: expireBy } : {}),
        notes: {
          invoice_id: invoiceId,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('Razorpay createPaymentLink failed', { status: response.status, body: errorBody });
      throw new ExternalServiceError('Failed to generate Razorpay payment link', `Razorpay API error: ${response.status} ${errorBody}`);
    }

    const data = await response.json() as { short_url: string; id: string; order_id: string };
    return {
      paymentUrl: data.short_url,
      providerPaymentLinkId: data.id,
      providerOrderId: data.order_id,
    };
  }

  /**
   * Cancel a Razorpay payment link (e.g., when regenerating a fresh recovery link).
   */
  async cancelPaymentLink(
    credentials: Record<string, string>,
    paymentLinkId: string
  ): Promise<void> {
    const { keyId, keySecret } = credentials;
    if (!keyId || !keySecret || !paymentLinkId) return;

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    try {
      await fetch(`https://api.razorpay.com/v1/payment_links/${paymentLinkId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}` },
      });
    } catch (err) {
      logger.warn('Razorpay cancelPaymentLink failed (non-fatal)', { paymentLinkId, err });
    }
  }

  /**
   * Retry a Razorpay subscription mandate.
   * Uses Razorpay test API: POST /v1/subscriptions/{id}/retry
   */
  async retrySubscription(
    credentials: Record<string, string>,
    subscriptionId: string
  ): Promise<{ success: boolean; message: string }> {
    const { keyId, keySecret } = credentials;
    if (!keyId || !keySecret) {
      throw new ValidationError('Razorpay credentials missing keyId or keySecret');
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    try {
      const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error('Razorpay subscription retry failed', { subscriptionId, status: response.status, body });
        return { success: false, message: `Razorpay retry failed: ${response.status}` };
      }

      logger.info('Razorpay subscription retried', { subscriptionId });
      return { success: true, message: 'Mandate retry initiated' };
    } catch (err) {
      logger.error('Razorpay subscription retry exception', { subscriptionId, err });
      return { success: false, message: String(err) };
    }
  }
}
