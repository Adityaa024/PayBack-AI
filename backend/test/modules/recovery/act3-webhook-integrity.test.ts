import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecoveryService } from '../../../src/modules/recovery/recovery.service.js';
import crypto from 'crypto';

describe('P0 — Demo Act 3 & Webhook Payment Integrity', () => {
  let recoveryService: RecoveryService;
  let mockRecoveryRepo: any;
  let mockInvoiceRepo: any;
  let mockPaymentService: any;
  let mockCommunicationService: any;
  let mockEventService: any;
  let mockIntegrationService: any;
  let mockDisputeRepo: any;

  const tenantId = 'tenant_demo_001';
  const invoiceId = 'inv_demo_003';
  const sessionId = 'sess_demo_003';

  beforeEach(() => {
    mockRecoveryRepo = {
      getSessionByInvoiceId: vi.fn(),
      getSessionById: vi.fn(),
      acquireSessionLock: vi.fn().mockResolvedValue(true),
      releaseSessionLock: vi.fn().mockResolvedValue(undefined),
      countRetryAttempts: vi.fn().mockResolvedValue(0),
      createRetryAttempt: vi.fn().mockResolvedValue(undefined),
      incrementRetryCount: vi.fn().mockResolvedValue(undefined),
      appendAuditLog: vi.fn().mockImplementation((data) => Promise.resolve({ id: 'log_1', ...data })),
      updateSessionStatus: vi.fn().mockResolvedValue(undefined),
      markSessionRecoveredAtomic: vi.fn(),
    };

    mockInvoiceRepo = {
      findById: vi.fn().mockResolvedValue({
        id: invoiceId,
        tenantId,
        invoiceNo: 'INV-DEMO-003',
        clientName: 'Demo Client',
        invoiceAmount: '15000.00',
        currency: 'INR',
        dueDate: '2026-08-15',
        paymentStatus: 'Pending',
        contactEmail: 'client@example.com',
      }),
    };

    mockPaymentService = {
      generateFreshRecoveryLink: vi.fn().mockResolvedValue({
        paymentUrl: 'https://rzp.io/i/live_demo_link_123',
        providerPaymentLinkId: 'plink_demo_123456',
      }),
      processPaymentCaptured: vi.fn().mockImplementation(async (tId, prov, payload, rawBody, signature) => {
        // Simulates normal signed webhook path: updates status in DB and calls markSessionRecovered
        await recoveryService.markSessionRecovered(tId, invoiceId, '15000.00');
        return { status: 'processed', invoiceId };
      }),
    };

    mockCommunicationService = {
      send: vi.fn().mockResolvedValue(true),
    };

    mockEventService = {
      emitEvent: vi.fn().mockResolvedValue(undefined),
    };

    mockIntegrationService = {
      getDecryptedRazorpayConfig: vi.fn().mockResolvedValue({
        keyId: 'rzp_test_demo',
        keySecret: 'demo_secret_123',
        webhookSecret: 'test_webhook_secret',
      }),
    };

    mockDisputeRepo = {
      hasActiveDisputeForInvoice: vi.fn().mockResolvedValue(false),
    };

    recoveryService = new RecoveryService(
      mockRecoveryRepo,
      {} as any, // aimlService
      mockInvoiceRepo,
      mockPaymentService,
      mockCommunicationService,
      mockEventService,
      mockIntegrationService,
      mockDisputeRepo
    );
  });

  it('REGRESSION: executeRecoveryAction alone NEVER marks a session as recovered', async () => {
    const sessionRecord = {
      id: sessionId,
      tenantId,
      invoiceId,
      status: 'active',
      strategy: 'payment_link_refresh',
      incidentLane: 'payment_degradation',
      isHoldout: false,
      amountAtRisk: '15000.00',
      amountRecovered: '0.00',
      recoveryContract: {
        maxAttempts: 3,
        cooldownHours: 24,
        requiresHumanApproval: false,
        amountAtRisk: 15000,
      },
      retryCount: 0,
      lastActionAt: null,
      optedOut: false,
      createdAt: new Date('2026-08-20'),
    };

    mockRecoveryRepo.getSessionById.mockResolvedValue(sessionRecord);

    // Act: execute recovery action alone
    const result = await recoveryService.executeRecoveryAction(sessionId, tenantId);

    // Assert: action succeeded, link generated
    expect(result.success).toBe(true);
    expect(mockPaymentService.generateFreshRecoveryLink).toHaveBeenCalledTimes(1);

    // Crucial safety guarantee: markSessionRecoveredAtomic must NOT have been called!
    expect(mockRecoveryRepo.markSessionRecoveredAtomic).not.toHaveBeenCalled();
    // updateSessionStatus to 'recovered' must NOT have been called!
    expect(mockRecoveryRepo.updateSessionStatus).not.toHaveBeenCalledWith(sessionId, 'recovered', expect.anything());

    // Session status in DB remains active with 0 recovered
    expect(sessionRecord.status).toBe('active');
    expect(sessionRecord.amountRecovered).toBe('0.00');
  });

  it('routes Demo Act 3 through signed Razorpay payment.captured webhook to count money recovered', async () => {
    const sessionRecord = {
      id: sessionId,
      tenantId,
      invoiceId: 'rcv_pay_001',
      status: 'active',
      strategy: 'payment_link_refresh',
      incidentLane: 'payment_degradation',
      isHoldout: false,
      amountAtRisk: '15000.00',
      amountRecovered: '0.00',
      recoveryContract: {
        maxAttempts: 3,
        cooldownHours: 24,
        amountAtRisk: 15000,
      },
      retryCount: 0,
      lastActionAt: null,
      optedOut: false,
      createdAt: new Date('2026-08-20'),
    };

    mockRecoveryRepo.getSessionByInvoiceId.mockResolvedValue(sessionRecord);
    mockRecoveryRepo.getSessionById.mockResolvedValue(sessionRecord);

    // Execute Act 3 replay
    const act3Result = await recoveryService.replayScenario(tenantId, 3);

    // Assert: It invoked executeRecoveryAction
    expect(mockPaymentService.generateFreshRecoveryLink).toHaveBeenCalledTimes(1);

    // Assert: It routed through paymentService.processPaymentCaptured with signed payload
    expect(mockPaymentService.processPaymentCaptured).toHaveBeenCalledTimes(1);
    const [calledTenant, provider, payload, rawBody, signature] = mockPaymentService.processPaymentCaptured.mock.calls[0];

    expect(calledTenant).toBe(tenantId);
    expect(provider).toBe('razorpay');
    expect(payload.event).toBe('payment.captured');
    expect(rawBody).toBeInstanceOf(Buffer);

    // Verify HMAC SHA-256 signature correctness against the tenant's webhookSecret
    const expectedSig = crypto
      .createHmac('sha256', 'test_webhook_secret')
      .update(rawBody)
      .digest('hex');
    expect(signature).toBe(expectedSig);

    // Assert: Result confirms webhook verification
    expect(act3Result.verifiedByWebhook).toBe(true);
    expect(act3Result.webhookResult).toEqual({ status: 'processed', invoiceId });
  });

  it('sanitizes audit log metadata: never stores raw payment URLs, only redacted references', async () => {
    const sessionRecord = {
      id: sessionId,
      tenantId,
      invoiceId,
      status: 'active',
      strategy: 'payment_link_refresh',
      incidentLane: 'payment_degradation',
      isHoldout: false,
      amountAtRisk: '15000.00',
      amountRecovered: '0.00',
      recoveryContract: {
        maxAttempts: 3,
        cooldownHours: 24,
        amountAtRisk: 15000,
      },
      retryCount: 0,
      lastActionAt: null,
      optedOut: false,
      createdAt: new Date('2026-08-20'),
    };

    mockRecoveryRepo.getSessionById.mockResolvedValue(sessionRecord);

    await recoveryService.executeRecoveryAction(sessionId, tenantId);

    // Inspect all appendAuditLog calls
    for (const call of mockRecoveryRepo.appendAuditLog.mock.calls) {
      const logEntry = call[0];
      const metadata = logEntry.metadata || {};
      
      // Raw paymentUrl must NOT exist in audit log metadata
      expect(metadata.paymentUrl).toBeUndefined();

      // If payment link reference exists, it must be securely redacted
      if (metadata.paymentLinkRef) {
        expect(metadata.paymentLinkRef).toMatch(/https:\/\/rzp\.io\/i\/\[REDACTED_.*\]/);
      }
    }
  });
});
