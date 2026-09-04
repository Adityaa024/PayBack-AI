import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecoveryService } from '../../../src/modules/recovery/recovery.service.js';

describe('RecoverIQ — Control Arm (Holdout) Isolation', () => {
  let mockRepo: any;
  let mockAiClient: any;
  let mockInvoiceRepo: any;
  let mockPaymentService: any;
  let mockCommunicationService: any;
  let mockEventService: any;
  let recoveryService: RecoveryService;

  beforeEach(() => {
    mockRepo = {
      getSessionById: vi.fn(),
      getSessionByInvoiceId: vi.fn(),
      countRetryAttempts: vi.fn().mockResolvedValue(0),
      updateSessionStatus: vi.fn(),
      appendAuditLog: vi.fn(),
    };
    mockAiClient = {
      evaluateRecoveryAction: vi.fn(),
    };
    mockInvoiceRepo = { findById: vi.fn() };
    mockPaymentService = { generatePaymentLink: vi.fn() };
    mockCommunicationService = { sendEmail: vi.fn() };
    mockEventService = { emitEvent: vi.fn() };

    recoveryService = new RecoveryService(
      mockRepo, mockAiClient, mockInvoiceRepo, mockPaymentService, mockCommunicationService, mockEventService
    );
  });

  it('guarantees zero contact is made when processing a holdout session', async () => {
    mockRepo.getSessionById.mockResolvedValue({
      id: 'session_123',
      tenantId: 'tenant_1',
      isHoldout: true,
      amountAtRisk: 1000,
      status: 'active'
    });

    try {
      await recoveryService.executeRecoveryAction('session_123', 'tenant_1');
    } catch (e) {
      // The service throws an error or aborts when holdout is executed
    }

    // Absolutely no external calls should be made
    expect(mockAiClient.evaluateRecoveryAction).not.toHaveBeenCalled();
    expect(mockCommunicationService.sendEmail).not.toHaveBeenCalled();
    expect(mockPaymentService.generatePaymentLink).not.toHaveBeenCalled();
    
    // Audit log should register that holdout was enforced
    expect(mockRepo.appendAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'holdout_action_suppressed',
        result: 'stopped',
      })
    );
  });
});
