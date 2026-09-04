import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyGuard, type RecoveryContract } from '../../../src/modules/recovery/recovery.contract.js';
import { RecoveryService } from '../../../src/modules/recovery/recovery.service.js';

describe('P0 — Execution-Time PolicyGuard Context & Stopping Rules', () => {
  const sampleContract: RecoveryContract = {
    incidentLane: 'payment_degradation',
    selectedChannel: 'email',
    maxAttempts: 3,
    cooldownHours: 24,
    escalationThreshold: 0.65,
    requiresHumanApproval: false,
    amountAtRisk: 5000,
    voiceScriptApproved: false,
  };

  describe('PolicyGuard.validate rule evaluations', () => {
    it('1. rejects when invoice is already Paid', () => {
      const result = PolicyGuard.validate(sampleContract, {
        retryCount: 0,
        invoiceStatus: 'Paid',
      });
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('INVOICE_SETTLED: Invoice is already settled or paid.');
    });

    it('1b. rejects when invoice is Written Off', () => {
      const result = PolicyGuard.validate(sampleContract, {
        retryCount: 0,
        invoiceStatus: 'Written Off',
      });
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('INVOICE_SETTLED: Invoice is already settled or paid.');
    });

    it('2. rejects when customer has opted out (STOP reply)', () => {
      const result = PolicyGuard.validate(sampleContract, {
        retryCount: 0,
        optedOut: true,
      });
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('CUSTOMER_OPTED_OUT: Customer has opted out of communication (received STOP reply).');
    });

    it('3. rejects when there is an active dispute or refund signal', () => {
      const result = PolicyGuard.validate(sampleContract, {
        retryCount: 0,
        hasDispute: true,
      });
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('DISPUTE_ACTIVE: Active dispute or refund inquiry pending; routed to human review.');
    });

    it('4. rejects when retryCount exceeds or equals maxAttempts', () => {
      const result = PolicyGuard.validate(sampleContract, {
        retryCount: 3,
      });
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('MAX_ATTEMPTS_EXCEEDED');
    });

    it('5. rejects when within the cooldown window', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const result = PolicyGuard.validate(sampleContract, {
        retryCount: 1,
        lastContactedAt: twoHoursAgo,
      });
      expect(result.allowed).toBe(false);
      expect(result.violations[0]).toContain('COOLDOWN_ACTIVE');
    });

    it('6. rejects when days overdue exceeds 90-day legal stop', () => {
      const result = PolicyGuard.validate(sampleContract, {
        retryCount: 0,
        daysOverdue: 95,
      });
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('LEGAL_STOP: Overdue duration (95 days) exceeds 90-day automated recovery cap.');
    });

    it('7. rejects high-value invoice (> ₹5,00,000) without human approval', () => {
      const highValContract: RecoveryContract = {
        ...sampleContract,
        amountAtRisk: 750000,
        requiresHumanApproval: true,
      };

      const unapproved = PolicyGuard.validate(highValContract, {
        retryCount: 0,
        hasHumanApproval: false,
        amountAtRisk: 750000,
      });
      expect(unapproved.allowed).toBe(false);
      expect(unapproved.violations).toContain('HUMAN_APPROVAL_REQUIRED: High-value threshold (> ₹5,00,000) requires explicit human approval before execution.');

      const approved = PolicyGuard.validate(highValContract, {
        retryCount: 0,
        hasHumanApproval: true,
        amountAtRisk: 750000,
      });
      expect(approved.allowed).toBe(true);
    });

    it('8. rejects invoice below the ₹100 economic floor', () => {
      const result = PolicyGuard.validate(sampleContract, {
        retryCount: 0,
        amountAtRisk: 50,
      });
      expect(result.allowed).toBe(false);
      expect(result.violations).toContain('ECONOMIC_FLOOR_VIOLATION: Amount (₹50) is below the ₹100 economic floor for automated recovery.');
    });
  });

  describe('RecoveryService execution-time context resolution', () => {
    let recoveryService: RecoveryService;
    let mockRecoveryRepo: any;
    let mockInvoiceRepo: any;
    let mockDisputeRepo: any;
    let mockPaymentService: any;

    beforeEach(() => {
      mockRecoveryRepo = {
        getSessionById: vi.fn(),
        acquireSessionLock: vi.fn().mockResolvedValue(true),
        releaseSessionLock: vi.fn().mockResolvedValue(undefined),
        countRetryAttempts: vi.fn().mockResolvedValue(0),
        updateSessionStatus: vi.fn().mockResolvedValue(undefined),
        appendAuditLog: vi.fn().mockResolvedValue({ id: 'log_1' }),
      };

      mockInvoiceRepo = {
        findById: vi.fn(),
      };

      mockDisputeRepo = {
        hasActiveDisputeForInvoice: vi.fn().mockResolvedValue(false),
      };

      mockPaymentService = {
        generateFreshRecoveryLink: vi.fn(),
      };

      recoveryService = new RecoveryService(
        mockRecoveryRepo,
        {} as any,
        mockInvoiceRepo,
        mockPaymentService,
        {} as any,
        {} as any,
        {} as any,
        mockDisputeRepo
      );
    });

    it('derives daysOverdue from invoice.dueDate and stops 95-day overdue invoice even if session is freshly created', async () => {
      const sessionId = 'sess_fresh_95d';
      const invoiceId = 'inv_95d';

      // Session was created 5 minutes ago
      const freshSession = {
        id: sessionId,
        tenantId: 'tenant_1',
        invoiceId,
        status: 'active',
        strategy: 'payment_link_refresh',
        amountAtRisk: '10000.00',
        recoveryContract: sampleContract,
        retryCount: 0,
        lastActionAt: null,
        optedOut: false,
        createdAt: new Date(), // Today!
      };

      // But invoice due date was 95 days ago
      const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      mockInvoiceRepo.findById.mockResolvedValue({
        id: invoiceId,
        tenantId: 'tenant_1',
        dueDate: ninetyFiveDaysAgo,
        paymentStatus: 'Pending',
        invoiceAmount: '10000.00',
      });

      mockRecoveryRepo.getSessionById.mockResolvedValue(freshSession);

      const result = await recoveryService.executeRecoveryAction(sessionId, 'tenant_1');

      // Assert: Blocked by legal stop because of invoice.dueDate
      expect(result.success).toBe(false);
      expect(result.message).toContain('Blocked by PolicyGuard');
      expect(result.message).toContain('LEGAL_STOP');
      expect(mockPaymentService.generateFreshRecoveryLink).not.toHaveBeenCalled();
      expect(mockRecoveryRepo.updateSessionStatus).toHaveBeenCalledWith(sessionId, 'escalated', { stopReason: 'manual_override' });
    });

    it('blocks execution when invoice was already marked Paid in the database', async () => {
      const sessionId = 'sess_already_paid';
      const invoiceId = 'inv_paid';

      mockRecoveryRepo.getSessionById.mockResolvedValue({
        id: sessionId,
        tenantId: 'tenant_1',
        invoiceId,
        status: 'active',
        recoveryContract: sampleContract,
        retryCount: 0,
      });

      mockInvoiceRepo.findById.mockResolvedValue({
        id: invoiceId,
        tenantId: 'tenant_1',
        paymentStatus: 'Paid',
        dueDate: '2026-08-01',
        invoiceAmount: '10000.00',
      });

      const result = await recoveryService.executeRecoveryAction(sessionId, 'tenant_1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('INVOICE_SETTLED');
      expect(mockPaymentService.generateFreshRecoveryLink).not.toHaveBeenCalled();
    });

    it('blocks execution and escalates when an active dispute exists', async () => {
      const sessionId = 'sess_disputed';
      const invoiceId = 'inv_disputed';

      mockRecoveryRepo.getSessionById.mockResolvedValue({
        id: sessionId,
        tenantId: 'tenant_1',
        invoiceId,
        status: 'active',
        recoveryContract: sampleContract,
        retryCount: 0,
      });

      mockInvoiceRepo.findById.mockResolvedValue({
        id: invoiceId,
        tenantId: 'tenant_1',
        paymentStatus: 'Pending',
        dueDate: '2026-08-01',
        invoiceAmount: '10000.00',
      });

      mockDisputeRepo.hasActiveDisputeForInvoice.mockResolvedValue(true);

      const result = await recoveryService.executeRecoveryAction(sessionId, 'tenant_1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('DISPUTE_ACTIVE');
      expect(mockPaymentService.generateFreshRecoveryLink).not.toHaveBeenCalled();
      expect(mockRecoveryRepo.updateSessionStatus).toHaveBeenCalledWith(sessionId, 'escalated', { stopReason: 'manual_override' });
    });
  });
});
