import { describe, it, expect } from 'vitest';
import { EconomicEngine } from '../../../src/modules/recovery/economic-engine.js';
import { PolicyGuard, type RecoveryContract } from '../../../src/modules/recovery/recovery.contract.js';

describe('P2 — Economically Grounded Decision Engine', () => {
  it('calculates positive Expected Incremental Value (EIV) and recommends proceed', () => {
    const decision = EconomicEngine.evaluateIntervention({
      predictedProbability: 0.85,
      amountAtRisk: 10000,
      channel: 'email',
    });

    // P_pred * amount = 8500
    // Costs: channel (0.20) + provider (min(15, 200) = 15) = 15.20
    // EIV = 8500 - 15.20 = 8484.80
    expect(decision.expectedGrossRecovery).toBe(8500);
    expect(decision.channelCost).toBe(0.20);
    expect(decision.providerCost).toBe(15.00);
    expect(decision.totalInterventionCost).toBe(15.20);
    expect(decision.expectedIncrementalValue).toBe(8484.80);
    expect(decision.recommendation).toBe('proceed');
    expect(decision.rationale).toContain('Positive EIV');
    expect(decision.modelVersion).toBe('payback-ai-v1');
    expect(decision.promptVersion).toBe('v1.2.0');
  });

  it('recommends abstain when expected incremental value is non-positive', () => {
    // Very low probability on small amount: EIV <= 0
    const decision = EconomicEngine.evaluateIntervention({
      predictedProbability: 0.0001,
      amountAtRisk: 50,
      channel: 'voice', // voice costs ₹5.00
    });

    expect(decision.expectedIncrementalValue).toBeLessThanOrEqual(0);
    expect(decision.recommendation).toBe('abstain');
    expect(decision.rationale).toContain('economically unviable');
  });

  it('routes to human review when model confidence is below policy threshold (< 0.35)', () => {
    const decision = EconomicEngine.evaluateIntervention({
      predictedProbability: 0.25,
      amountAtRisk: 12000,
      channel: 'sms',
      minConfidenceThreshold: 0.35,
    });

    expect(decision.recommendation).toBe('human_review');
    expect(decision.rationale).toContain('below the required 0.35 threshold');
  });

  it('routes to human review when invoice amount exceeds high-value threshold (₹5,00,000)', () => {
    const decision = EconomicEngine.evaluateIntervention({
      predictedProbability: 0.90,
      amountAtRisk: 750000,
      channel: 'email',
    });

    expect(decision.recommendation).toBe('human_review');
    expect(decision.rationale).toContain('exceeds high-value threshold');
  });

  it('PolicyGuard blocks execution when economic decision is abstain', () => {
    const contract: RecoveryContract = {
      caseId: 'case_econ_1',
      incidentLane: 'payment_degradation',
      customerId: 'cust_econ_1',
      amountAtRisk: 1000,
      currency: 'INR',
      diagnosis: { primary: 'low_intent', evidence: [], confidence: 0.1 },
      recommendedAction: 'send_payment_link',
      actionParameters: { maxAmount: 1000, expiresInHours: 48, allowedMethods: ['upi'] },
      customerMessage: 'Please pay',
      cooldownHours: 24,
      maxAttempts: 3,
      escalateAfter: '48h',
      stopRules: ['payment_captured'],
      requiresHumanApproval: false,
      economics: {
        expectedIncrementalValue: -4.50,
        predictedProbability: 0.01,
        totalInterventionCost: 15.00,
        channelCost: 5.00,
        providerCost: 10.00,
        discountCost: 0,
        recommendation: 'abstain',
        rationale: 'Negative EIV',
        modelVersion: 'payback-ai-v1',
        promptVersion: 'v1.2.0',
        chosenChannel: 'voice',
      },
    };

    const guardResult = PolicyGuard.validate(contract, {
      retryCount: 0,
      amountAtRisk: 1000,
      economics: {
        expectedIncrementalValue: -4.50,
        recommendation: 'abstain',
      },
    });

    expect(guardResult.allowed).toBe(false);
    expect(guardResult.violations.some(v => v.includes('ECONOMIC_ABSTAIN'))).toBe(true);
  });

  describe('10-Decile Calibration Evaluation', () => {
    it('produces reliable decile breakdown with ECE and Brier score', () => {
      // Create 100 synthetic test predictions across deciles
      const testCases: Array<{ predictedProbability: number; recovered: boolean; amount: number }> = [];
      for (let i = 0; i < 100; i++) {
        const prob = (i % 10) * 0.1 + 0.05; // 0.05, 0.15, ..., 0.95
        // Recovery outcome correlates with probability
        const recovered = (i % 10) >= 4;
        testCases.push({
          predictedProbability: prob,
          recovered,
          amount: 5000,
        });
      }

      const report = EconomicEngine.evaluateDecileCalibration(testCases);

      expect(report.totalSamples).toBe(100);
      expect(report.deciles).toHaveLength(10);
      expect(report.expectedCalibrationError).toBeGreaterThanOrEqual(0);
      expect(report.expectedCalibrationError).toBeLessThanOrEqual(1);
      expect(report.brierScore).toBeGreaterThanOrEqual(0);
      expect(report.brierScore).toBeLessThanOrEqual(1);

      // Verify each decile has valid probability range
      for (let d = 0; d < 10; d++) {
        const decile = report.deciles[d];
        expect(decile.decileIndex).toBe(d + 1);
        expect(decile.sampleCount).toBe(10);
        expect(decile.meanPredictedProbability).toBeGreaterThanOrEqual(0);
        expect(decile.meanPredictedProbability).toBeLessThanOrEqual(1);
        expect(decile.empiricalRecoveryRate).toBeGreaterThanOrEqual(0);
        expect(decile.empiricalRecoveryRate).toBeLessThanOrEqual(1);
      }
    });
  });
});
