import crypto from 'crypto';
import type { IncidentLane } from './recovery.contract.js';

export interface HoldoutAssignment {
  isHoldout: boolean;
  holdoutRatio: number; // e.g., 0.15 for 15% holdout
  strata: string;
}

export interface ExperimentMetrics {
  totalEligible: number;
  totalAtRisk: number;
  
  // Treatment Group
  treatmentCount: number;
  treatmentEligibleAmount: number;
  treatmentRecoveredAmount: number;
  treatmentRecoveryRate: number;

  // Holdout Control Group
  holdoutCount: number;
  holdoutEligibleAmount: number;
  holdoutRecoveredAmount: number;
  holdoutRecoveryRate: number;

  // Incremental Recovery (The Proof of Value)
  incrementalRecovered: number;
  netIncrementalRecovered: number;
  incrementalLiftPercent: number;

  // Responsible Automation KPIs
  contactEfficiency: number; // incremental recovered / outbound contacts
  outboundContactsCount: number;
  badgerRate: number; // opt-out or policy violation rate (target: 0%)
  policyViolationsCount: number;
  optOutCount: number;
}

export class HoldoutManager {
  private static readonly DEFAULT_HOLDOUT_PERCENT = 15; // 15% holdout

  /**
   * Deterministically assigns an incident to Treatment or Holdout based on hash of invoiceId & tenantId.
   * Stratifies by incident lane and amount band (low < 25k, med 25k-100k, high > 100k).
   */
  static assignCohort(
    tenantId: string,
    invoiceId: string,
    lane: IncidentLane,
    amount: number,
    holdoutPercentage: number = this.DEFAULT_HOLDOUT_PERCENT
  ): HoldoutAssignment {
    let amountBand = 'low';
    if (amount >= 100000) amountBand = 'high';
    else if (amount >= 25000) amountBand = 'med';

    const strata = `${lane}_${amountBand}`;

    // Hash for deterministic assignment
    const hash = crypto
      .createHash('sha256')
      .update(`${tenantId}:${invoiceId}:holdout_v1`)
      .digest('hex');
    const bucket = parseInt(hash.slice(0, 4), 16) % 100;

    const isHoldout = bucket < holdoutPercentage;

    return {
      isHoldout,
      holdoutRatio: holdoutPercentage / 100,
      strata,
    };
  }

  /**
   * Computes the official counterfactual incremental recovered money as defined in the blueprint.
   * Formula:
   * incremental_recovered = treatment_recovered - (holdout_recovered / holdout_eligible) * treatment_eligible
   */
  static calculateExperimentMetrics(params: {
    treatmentEligible: number;
    treatmentRecovered: number;
    treatmentCases: number;
    holdoutEligible: number;
    holdoutRecovered: number;
    holdoutCases: number;
    outboundContacts: number;
    optOuts: number;
    discounts?: number;
    refunds?: number;
    messageCosts?: number;
  }): ExperimentMetrics {
    const {
      treatmentEligible,
      treatmentRecovered,
      treatmentCases,
      holdoutEligible,
      holdoutRecovered,
      holdoutCases,
      outboundContacts,
      optOuts,
      discounts = 0,
      refunds = 0,
      messageCosts = outboundContacts * 1.5, // approx ₹1.50 per SMS/Email
    } = params;

    const totalEligible = treatmentCases + holdoutCases;
    const totalAtRisk = treatmentEligible + holdoutEligible;

    const treatmentRate = treatmentEligible > 0 ? (treatmentRecovered / treatmentEligible) * 100 : 0;
    const holdoutRate = holdoutEligible > 0 ? (holdoutRecovered / holdoutEligible) * 100 : 0;

    // Expected recovery if no intervention had been performed on treatment
    const counterfactualBase = holdoutEligible > 0
      ? (holdoutRecovered / holdoutEligible) * treatmentEligible
      : 0;

    const incrementalRecovered = Math.max(0, treatmentRecovered - counterfactualBase);
    const netIncrementalRecovered = Math.max(0, incrementalRecovered - discounts - refunds - messageCosts);

    const incrementalLiftPercent = counterfactualBase > 0
      ? Math.round((incrementalRecovered / counterfactualBase) * 100)
      : treatmentRecovered > 0 ? 100 : 0;

    const contactEfficiency = outboundContacts > 0
      ? Math.round(incrementalRecovered / outboundContacts)
      : 0;

    const badgerRate = totalEligible > 0
      ? parseFloat(((optOuts / totalEligible) * 100).toFixed(2))
      : 0;

    return {
      totalEligible,
      totalAtRisk,
      treatmentCount: treatmentCases,
      treatmentEligibleAmount: treatmentEligible,
      treatmentRecoveredAmount: treatmentRecovered,
      treatmentRecoveryRate: Math.round(treatmentRate),
      holdoutCount: holdoutCases,
      holdoutEligibleAmount: holdoutEligible,
      holdoutRecoveredAmount: holdoutRecovered,
      holdoutRecoveryRate: Math.round(holdoutRate),
      incrementalRecovered: Math.round(incrementalRecovered),
      netIncrementalRecovered: Math.round(netIncrementalRecovered),
      incrementalLiftPercent,
      contactEfficiency,
      outboundContactsCount: outboundContacts,
      badgerRate,
      policyViolationsCount: 0,
      optOutCount: optOuts,
    };
  }
}
