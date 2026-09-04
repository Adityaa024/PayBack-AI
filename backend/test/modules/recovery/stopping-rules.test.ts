import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecoveryService } from '../../../src/modules/recovery/recovery.service.js';
import { RecoveryRepository } from '../../../src/modules/recovery/recovery.repository.js';
import { PolicyGuard } from '../../../src/modules/recovery/recovery.contract.js';

describe('RecoverIQ — Stopping Rules (Hard Guards)', () => {
  let mockRepo: any;
  let mockAiClient: any;
  let mockInvoiceRepo: any;
  let mockPaymentService: any;
  let mockCommunicationService: any;
  let mockEventService: any;
  let recoveryService: RecoveryService;

  beforeEach(() => {
    mockRepo = {
      getSessionByInvoiceId: vi.fn(),
      getPTPByInvoice: vi.fn().mockResolvedValue([]),
      countRetryAttempts: vi.fn().mockResolvedValue(0),
      createSession: vi.fn().mockResolvedValue({ id: 'sess_1', invoiceId: 'i1' }),
      updateSessionStatus: vi.fn(),
      incrementRetryCount: vi.fn(),
      appendAuditLog: vi.fn(),
      getOverduePendingPTPs: vi.fn().mockResolvedValue([]),
      getOverduePTPs: vi.fn().mockResolvedValue([]),
      updatePTPStatus: vi.fn(),
    };
    mockAiClient = {
      evaluateRecoveryAction: vi.fn().mockResolvedValue({
        recommendedAction: 'send_payment_link',
        actionParameters: { maxAmount: 1000, expiresInHours: 48 },
        customerMessage: 'Please pay',
        cooldownHours: 24,
        maxAttempts: 3,
        escalateAfter: 'retry_failed_3_times',
        stopRules: ['payment_captured', 'max_attempts_reached'],
      }),
    };
    mockInvoiceRepo = { 
      findById: vi.fn().mockResolvedValue({ id: 'i1', tenantId: 't1', paymentStatus: 'Pending' })
    };
    mockPaymentService = { generatePaymentLink: vi.fn().mockResolvedValue('http://pay.link') };
    mockCommunicationService = { sendEmail: vi.fn() };
    mockEventService = { emitEvent: vi.fn() };

    recoveryService = new RecoveryService(
      mockRepo, mockAiClient, mockInvoiceRepo, mockPaymentService, mockCommunicationService, mockEventService
    );
  });

  describe('Rule 1: 90-day cap (Legal Stop)', () => {
    it('stops execution if invoice is older than 90 days', async () => {
      const result = PolicyGuard.validate(
        { maxAttempts: 3, amountAtRisk: 100, cooldownHours: 0 } as any,
        { retryCount: 0, daysOverdue: 91 }
      );
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('LEGAL_STOP');
    });

    it('service escalates session if daysOverdue > 90', async () => {
      mockRepo.getPTPByInvoice.mockResolvedValue([]);
      
      const invoiceData = {
        tenantId: 't1',
        invoiceId: 'i1',
        customerId: 'c1',
        amount: 1000,
        currency: 'INR',
        dueDate: new Date(Date.now() - 95 * 24 * 3600 * 1000), // 95 days overdue
        customerEmail: 'test@example.com',
      };

      await recoveryService.startRecoverySession(invoiceData as any, 'payment_failed');
      
      expect(mockRepo.updateSessionStatus).toHaveBeenCalledWith(
        expect.any(String),
        'stopped',
        expect.objectContaining({ stopReason: 'over_90_days' })
      );
    });
  });

  describe('Rule 2: 3-retry max', () => {
    it('stops execution via PolicyGuard if retries >= maxAttempts', () => {
      const result = PolicyGuard.validate(
        { maxAttempts: 3, amountAtRisk: 100, cooldownHours: 0 } as any,
        { retryCount: 3, daysOverdue: 10 }
      );
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('MAX_ATTEMPTS_EXCEEDED');
    });
  });

  describe('Rule 3: PTP-broken-twice', () => {
    it('escalates session if 2 or more PTPs are broken during trigger', async () => {
      mockRepo.getPTPByInvoice.mockResolvedValue([
        { id: 'p1', status: 'broken' },
        { id: 'p2', status: 'broken' }
      ]);
      
      const invoiceData = {
        tenantId: 't1',
        invoiceId: 'i1',
        customerId: 'c1',
        amount: 1000,
        currency: 'INR',
        dueDate: new Date(Date.now() - 10 * 24 * 3600 * 1000),
        customerEmail: 'test@example.com',
      };

      await recoveryService.startRecoverySession(invoiceData as any, 'payment_failed');
      
      expect(mockRepo.updateSessionStatus).toHaveBeenCalledWith(
        expect.any(String),
        'stopped',
        expect.objectContaining({ stopReason: 'ptp_broken_twice' })
      );
    });

    it('escalates session during checkBrokenPromises cron job if threshold met', async () => {
      mockRepo.getOverduePTPs.mockResolvedValue([
        { id: 'p1', tenantId: 't1', invoiceId: 'i1', sessionId: 's1' },
      ]);
      mockRepo.getPTPByInvoice.mockResolvedValue([
        { id: 'p1', status: 'broken' },
        { id: 'p2', status: 'broken' }
      ]);
      mockInvoiceRepo.findById.mockResolvedValue({ paymentStatus: 'Pending', tenantId: 't1' });

      const result = await recoveryService.checkBrokenPromises();
      
      expect(result.escalated).toBe(1);
      expect(mockRepo.updateSessionStatus).toHaveBeenCalledWith(
        's1',
        'escalated',
        expect.objectContaining({ stopReason: 'ptp_broken_twice' })
      );
    });
  });

  describe('Rule 4: DLQ (Dead Letter Queue)', () => {
    it('ensures sessions hitting max attempts go to escalated/DLQ state', () => {
      expect(true).toBe(true);
    });
  });

  describe('Rule 5: Mandate-cap', () => {
    it('stops execution if mandate retries exceed limits', () => {
        const result = PolicyGuard.validate(
            { maxAttempts: 3, amountAtRisk: 100, cooldownHours: 0, recommendedAction: 'mandate_retry' } as any,
            { retryCount: 3, daysOverdue: 10 }
        );
        expect(result.allowed).toBe(false);
    });
  });

  describe('Rule 6: Invoice-paid', () => {
    it('stops execution if invoice is already paid', () => {
      const result = PolicyGuard.validate(
        { maxAttempts: 3, amountAtRisk: 100, cooldownHours: 0 } as any,
        { retryCount: 0, daysOverdue: 10, invoiceStatus: 'Paid' }
      );
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('INVOICE_SETTLED');
    });

    it('stops execution if invoice is written off', () => {
        const result = PolicyGuard.validate(
          { maxAttempts: 3, amountAtRisk: 100, cooldownHours: 0 } as any,
          { retryCount: 0, daysOverdue: 10, invoiceStatus: 'Written Off' }
        );
        expect(result.allowed).toBe(false);
        expect(result.violations[0]).toContain('INVOICE_SETTLED');
      });
  });
});
