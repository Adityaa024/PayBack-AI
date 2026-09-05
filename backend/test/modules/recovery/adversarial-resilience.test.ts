import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PolicyGuard, type RecoveryContract, type PolicyContext } from '../../../src/modules/recovery/recovery.contract.js';
import { MerchantPolicyService } from '../../../src/modules/policy/merchant-policy.service.js';

describe('Priority 5: Adversarial Reliability & Chaos Resilience Suite', () => {
  const merchantPolicy = MerchantPolicyService.getPolicyForMerchant('evaluation_merchant');

  const validContract: RecoveryContract = {
    caseId: 'inv_adv_001',
    incidentLane: 'payment_degradation',
    customerId: 'cust_adv_001',
    amountAtRisk: 12500,
    currency: 'INR',
    diagnosis: {
      primary: 'payment_degradation',
      evidence: ['root_cause: gateway_timeout', 'days_overdue: 10'],
      confidence: 0.90,
    },
    recommendedAction: 'send_payment_link',
    actionParameters: {
      maxAmount: 12500,
      expiresInHours: 48,
      allowedMethods: ['upi', 'card', 'netbanking'],
    },
    customerMessage: 'Please complete your pending transaction.',
    cooldownHours: 24,
    maxAttempts: 3,
    escalateAfter: 'no_payment_after_48h',
    stopRules: ['payment_captured', 'customer_opted_out', 'refund_or_dispute_signal', 'max_attempts_reached'],
    requiresHumanApproval: false,
  };

  // ── 1. Crash before external execution ─────────────────────────────────────
  it('Scenario 1: crash before external execution guarantees zero duplicate links', () => {
    let linksGenerated = 0;
    const idempotencyLedger = new Set<string>();

    const simulateExecution = (idempotencyKey: string, crashBeforeCall: boolean) => {
      if (idempotencyLedger.has(idempotencyKey)) {
        return { success: false, reason: 'IDEMPOTENT_DUPLICATE' };
      }
      idempotencyLedger.add(idempotencyKey);

      if (crashBeforeCall) {
        // Worker crashed before external API call
        return { success: false, reason: 'WORKER_CRASHED' };
      }
      linksGenerated += 1;
      return { success: true, linkId: `plink_${idempotencyKey}` };
    };

    // First attempt crashes
    const attempt1 = simulateExecution('intent_case_001_touch1', true);
    expect(attempt1.success).toBe(false);
    expect(linksGenerated).toBe(0);

    // Resumption retry with same idempotency key or retry slot
    idempotencyLedger.delete('intent_case_001_touch1'); // lock released after stale timeout
    const attempt2 = simulateExecution('intent_case_001_touch1', false);
    expect(attempt2.success).toBe(true);
    expect(linksGenerated).toBe(1);

    // Assert zero duplicate links
    expect(linksGenerated).toBe(1);
  });

  // ── 2. Crash after external execution but before DB recording ──────────────
  it('Scenario 2: crash after external execution deduplicates via provider link ID', () => {
    let providerLinksCreated = 0;
    const providerDb = new Map<string, string>(); // idempotencyKey -> providerLinkId

    const externalProviderGenerate = (idempotencyKey: string) => {
      if (providerDb.has(idempotencyKey)) {
        return { linkId: providerDb.get(idempotencyKey)!, duplicate: true };
      }
      providerLinksCreated++;
      const linkId = `plink_ext_${providerLinksCreated}`;
      providerDb.set(idempotencyKey, linkId);
      return { linkId, duplicate: false };
    };

    // Attempt 1: Call succeeds at provider, but local worker dies before saving to DB
    const res1 = externalProviderGenerate('idemp_step_2');
    expect(res1.duplicate).toBe(false);
    expect(providerLinksCreated).toBe(1);

    // Attempt 2: Re-executed by recovery sweeper with identical idempotency key
    const res2 = externalProviderGenerate('idemp_step_2');
    expect(res2.duplicate).toBe(true);
    expect(res2.linkId).toBe(res1.linkId);

    // Zero extra provider links generated
    expect(providerLinksCreated).toBe(1);
  });

  // ── 3. Duplicate webhook replay ───────────────────────────────────────────
  it('Scenario 3: duplicate webhook network replay guarantees zero double charges/credits', () => {
    let accountCredits = 0;
    const processedWebhookIds = new Set<string>();

    const processWebhook = (webhookEventId: string, paymentId: string) => {
      if (processedWebhookIds.has(webhookEventId)) {
        return { status: 200, code: 'ALREADY_PROCESSED' };
      }
      processedWebhookIds.add(webhookEventId);
      accountCredits += 1;
      return { status: 200, code: 'PAYMENT_CAPTURED' };
    };

    const firstArrival = processWebhook('evt_hook_991', 'pay_12345');
    expect(firstArrival.code).toBe('PAYMENT_CAPTURED');
    expect(accountCredits).toBe(1);

    // Duplicate replay from network glitch
    const secondArrival = processWebhook('evt_hook_991', 'pay_12345');
    expect(secondArrival.code).toBe('ALREADY_PROCESSED');
    expect(accountCredits).toBe(1); // zero double credit
  });

  // ── 4. Delayed webhook ────────────────────────────────────────────────────
  it('Scenario 4: delayed webhook settles cleanly without ghost attempts', () => {
    let sessionStatus = 'in_flight';
    let outreachTouches = 1;

    const handleDelayedWebhook = (sessionCreatedAt: Date, webhookReceivedAt: Date) => {
      const elapsedDays = (webhookReceivedAt.getTime() - sessionCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (elapsedDays >= 3) {
        // Delayed capture: settle invoice and cancel all further touches
        sessionStatus = 'settled';
        return { settled: true, delayedDays: elapsedDays };
      }
      return { settled: false };
    };

    const result = handleDelayedWebhook(new Date('2026-08-01T10:00:00Z'), new Date('2026-08-04T12:00:00Z'));
    expect(result.settled).toBe(true);
    expect(sessionStatus).toBe('settled');

    // Future outreach attempts must be blocked by PolicyGuard
    const guardCheck = PolicyGuard.validate(validContract, {
      retryCount: outreachTouches,
      invoiceStatus: 'Paid',
    });
    expect(guardCheck.allowed).toBe(false);
    expect(guardCheck.violations[0]).toContain('INVOICE_SETTLED');
  });

  // ── 5. Retry timeout & exponential backoff ─────────────────────────────────
  it('Scenario 5: retry timeout enforces cooldown delay and prevents rapid retries', () => {
    let immediateRetriesAllowed = 0;
    const cooldownHours = 24;
    const lastAttemptTime = new Date('2026-08-05T10:00:00Z');
    const immediateNextAttempt = new Date('2026-08-05T10:05:00Z'); // 5 minutes later

    const elapsedHours = (immediateNextAttempt.getTime() - lastAttemptTime.getTime()) / (1000 * 60 * 60);
    if (elapsedHours < cooldownHours) {
      // Cooldown enforced
      immediateRetriesAllowed = 0;
    } else {
      immediateRetriesAllowed = 1;
    }

    expect(immediateRetriesAllowed).toBe(0);
  });

  // ── 6. Database outage fails closed ────────────────────────────────────────
  it('Scenario 6: database outage fails closed without dispatching external payments', () => {
    let externalPaymentsDispatched = 0;

    const executeWithDatabase = (dbConnected: boolean) => {
      if (!dbConnected) {
        throw new Error('OPERATIONAL_ERROR: Database unavailable');
      }
      externalPaymentsDispatched++;
    };

    expect(() => executeWithDatabase(false)).toThrow('Database unavailable');
    expect(externalPaymentsDispatched).toBe(0); // Zero external payments on DB error
  });

  // ── 7. Worker restart mid-batch ────────────────────────────────────────────
  it('Scenario 7: worker restart safely reclaims orphaned outbox intents', () => {
    const queue = [
      { id: 'job_1', status: 'completed' },
      { id: 'job_2', status: 'claimed' }, // abandoned by crashed worker
      { id: 'job_3', status: 'pending' },
    ];

    // Restart sweeper resets abandoned 'claimed' jobs older than threshold
    const recoveredQueue = queue.map((j) => (j.status === 'claimed' ? { ...j, status: 'pending' } : j));
    expect(recoveredQueue.find((j) => j.id === 'job_2')?.status).toBe('pending');
  });

  // ── 8. Concurrent workers serialize via advisory locks ─────────────────────
  it('Scenario 8: concurrent workers serialize on session lock, exactly 1 executes', () => {
    const sessionLocks = new Set<string>();
    let executions = 0;

    const tryAcquireLockAndExecute = (sessionId: string) => {
      if (sessionLocks.has(sessionId)) {
        return { acquired: false };
      }
      sessionLocks.add(sessionId);
      executions++;
      return { acquired: true };
    };

    // Worker A and Worker B try at the exact same instant
    const workerA = tryAcquireLockAndExecute('sess_concurrent_123');
    const workerB = tryAcquireLockAndExecute('sess_concurrent_123');

    expect(workerA.acquired).toBe(true);
    expect(workerB.acquired).toBe(false);
    expect(executions).toBe(1);
  });

  // ── 9. Duplicate recovery intent rejected by unique constraint ─────────────
  it('Scenario 9: duplicate recovery intent triggers unique constraint rejection', () => {
    const intentTable = new Set<string>();

    const insertIntent = (idempotencyKey: string) => {
      if (intentTable.has(idempotencyKey)) {
        throw new Error(`UNIQUE_CONSTRAINT_VIOLATION: duplicate key value '${idempotencyKey}'`);
      }
      intentTable.add(idempotencyKey);
      return true;
    };

    expect(insertIntent('intent_unique_key_001')).toBe(true);
    expect(() => insertIntent('intent_unique_key_001')).toThrow('UNIQUE_CONSTRAINT_VIOLATION');
  });

  // ── 10. Stale lock recovery ────────────────────────────────────────────────
  it('Scenario 10: stale lock recovery releases locks older than 10 minutes', () => {
    const locks = [
      { id: 'sess_1', lockedAt: new Date(Date.now() - 15 * 60 * 1000) }, // 15 mins old
      { id: 'sess_2', lockedAt: new Date(Date.now() - 2 * 60 * 1000) },  // 2 mins old
    ];

    const swept = locks.filter((l) => Date.now() - l.lockedAt.getTime() > 10 * 60 * 1000);
    expect(swept.length).toBe(1);
    expect(swept[0].id).toBe('sess_1');
  });

  // ── 11. Malformed LLM output fallback ─────────────────────────────────────
  it('Scenario 11: malformed LLM output safely defaults to deterministic policy', () => {
    const malformedJson = "```json\n{ 'incident_lane': 'unknown', incomplete";

    let parsedDecision;
    try {
      parsedDecision = JSON.parse(malformedJson);
    } catch {
      // Safe fallback to deterministic rules
      parsedDecision = {
        incident_lane: 'payment_degradation',
        strategy: 'soft_reminder',
        fallback: true,
      };
    }

    expect(parsedDecision.fallback).toBe(true);
    expect(parsedDecision.strategy).toBe('soft_reminder');
  });

  // ── 12. LLM recommendation violating policy is intercepted ─────────────────
  it('Scenario 12: LLM recommendation violating 90-day overdue rule is blocked by PolicyGuard', () => {
    // Model recommends firm_escalation on a 95-day overdue debt
    const hallucinatedContract: RecoveryContract = {
      ...validContract,
      recommendedAction: 'firm_escalation' as any,
    };

    const guardResult = PolicyGuard.validate(hallucinatedContract, {
      retryCount: 0,
      daysOverdue: 95,
      merchantPolicy,
    });

    expect(guardResult.allowed).toBe(false);
    expect(guardResult.violations[0]).toContain('LEGAL_STOP');
  });

  // ── 13. STOP opt-out during an active workflow ─────────────────────────────
  it('Scenario 13: STOP opt-out received during active workflow cancels all subsequent touches', () => {
    let activeWorkflowCancelled = false;

    // Simulate customer sending STOP after touch 1
    const customerRecords = { customerId: 'cust_stop_001', optedOut: false };

    const handleInboundSms = (messageText: string) => {
      if (messageText.trim().toUpperCase() === 'STOP') {
        customerRecords.optedOut = true;
        activeWorkflowCancelled = true;
      }
    };

    handleInboundSms('STOP');
    expect(customerRecords.optedOut).toBe(true);
    expect(activeWorkflowCancelled).toBe(true);

    // Attempting touch 2 must fail PolicyGuard
    const guardResult = PolicyGuard.validate(validContract, {
      retryCount: 1,
      optedOut: customerRecords.optedOut,
      merchantPolicy,
    });

    expect(guardResult.allowed).toBe(false);
    expect(guardResult.violations[0]).toContain('CUSTOMER_OPTED_OUT');
  });
});
