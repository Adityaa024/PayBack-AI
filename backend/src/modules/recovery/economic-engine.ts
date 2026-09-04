export interface EconomicParameters {
  predictedProbability: number;
  amountAtRisk: number;
  channel: 'email' | 'sms' | 'whatsapp' | 'voice';
  discountPercentage?: number;
  minConfidenceThreshold?: number; // default: 0.35
  minExpectedValueThreshold?: number; // default: 0.0
  modelVersion?: string;
  promptVersion?: string;
}

export interface EconomicDecision {
  expectedIncrementalValue: number;
  expectedGrossRecovery: number;
  predictedProbability: number;
  totalInterventionCost: number;
  channelCost: number;
  providerCost: number;
  discountCost: number;
  recommendation: 'proceed' | 'human_review' | 'abstain';
  rationale: string;
  modelVersion: string;
  promptVersion: string;
  chosenChannel: 'email' | 'sms' | 'whatsapp' | 'voice';
}

export interface DecileBin {
  decileIndex: number;
  probabilityRange: string;
  sampleCount: number;
  meanPredictedProbability: number;
  empiricalRecoveryRate: number;
  totalRecoveredAmount: number;
  calibrationError: number;
}

export interface DecileCalibrationReport {
  deciles: DecileBin[];
  totalSamples: number;
  expectedCalibrationError: number; // ECE
  brierScore: number;
  meanPredictedProbability: number;
  overallObservedRate: number;
}

export class EconomicEngine {
  public static readonly CHANNEL_COSTS: Record<'email' | 'sms' | 'whatsapp' | 'voice', number> = {
    email: 0.20,
    sms: 1.50,
    whatsapp: 2.00,
    voice: 5.00,
  };

  /**
   * Calculates the Expected Incremental Value (EIV) of a proposed recovery intervention.
   * EIV = (P_predicted * amountAtRisk) - (channelCost + providerCost + discountCost)
   */
  public static evaluateIntervention(params: EconomicParameters): EconomicDecision {
    const {
      predictedProbability,
      amountAtRisk,
      channel,
      discountPercentage = 0,
      minConfidenceThreshold = 0.35,
      minExpectedValueThreshold = 0.0,
      modelVersion = 'payback-ai-v1',
      promptVersion = 'v1.2.0',
    } = params;

    const channelCost = this.CHANNEL_COSTS[channel] ?? 1.0;
    // Standard gateway interchange fee estimate: 2% capped at ₹15
    const providerCost = Math.min(15.0, Number((amountAtRisk * 0.02).toFixed(2)));
    const discountCost = Number(((discountPercentage / 100) * amountAtRisk).toFixed(2));
    const totalInterventionCost = Number((channelCost + providerCost + discountCost).toFixed(2));

    const expectedGrossRecovery = Number((predictedProbability * amountAtRisk).toFixed(2));
    const expectedIncrementalValue = Number((expectedGrossRecovery - totalInterventionCost).toFixed(2));

    let recommendation: 'proceed' | 'human_review' | 'abstain' = 'proceed';
    let rationale = `Positive EIV of ₹${expectedIncrementalValue} exceeds intervention cost (₹${totalInterventionCost}).`;

    if (expectedIncrementalValue <= minExpectedValueThreshold) {
      recommendation = 'abstain';
      rationale = `Expected incremental value (₹${expectedIncrementalValue}) is <= ₹${minExpectedValueThreshold}. Automated intervention is economically unviable.`;
    } else if (predictedProbability < minConfidenceThreshold) {
      recommendation = 'human_review';
      rationale = `Model confidence (${predictedProbability.toFixed(2)}) is below the required ${minConfidenceThreshold} threshold; routed to human review.`;
    } else if (amountAtRisk > 500000) {
      recommendation = 'human_review';
      rationale = `Invoice amount (₹${amountAtRisk}) exceeds high-value threshold (₹5,00,000); requires explicit human operator signoff.`;
    }

    return {
      expectedIncrementalValue,
      expectedGrossRecovery,
      predictedProbability,
      totalInterventionCost,
      channelCost,
      providerCost,
      discountCost,
      recommendation,
      rationale,
      modelVersion,
      promptVersion,
      chosenChannel: channel,
    };
  }

  /**
   * Computes reliability diagram metrics across 10 probability deciles.
   * Compares predicted probabilities against observed binary outcomes to prove calibration.
   */
  public static evaluateDecileCalibration(
    predictions: Array<{ predictedProbability: number; recovered: boolean; amount?: number }>
  ): DecileCalibrationReport {
    const bins: Array<{
      sumPredicted: number;
      sumObserved: number;
      sumAmountRecovered: number;
      count: number;
    }> = Array.from({ length: 10 }, () => ({
      sumPredicted: 0,
      sumObserved: 0,
      sumAmountRecovered: 0,
      count: 0,
    }));

    let totalBrierLoss = 0;
    let totalSamples = 0;
    let overallPredictedSum = 0;
    let overallObservedSum = 0;

    for (const p of predictions) {
      const prob = Math.max(0, Math.min(1, p.predictedProbability));
      const binIdx = Math.min(9, Math.floor(prob * 10));

      bins[binIdx].count += 1;
      bins[binIdx].sumPredicted += prob;
      bins[binIdx].sumObserved += p.recovered ? 1 : 0;
      if (p.recovered && p.amount) {
        bins[binIdx].sumAmountRecovered += p.amount;
      }

      const outcome = p.recovered ? 1 : 0;
      totalBrierLoss += Math.pow(prob - outcome, 2);
      overallPredictedSum += prob;
      overallObservedSum += outcome;
      totalSamples += 1;
    }

    let weightedCalibrationError = 0;

    const deciles: DecileBin[] = bins.map((bin, i) => {
      const lower = (i * 0.1).toFixed(1);
      const upper = ((i + 1) * 0.1).toFixed(1);
      const meanPred = bin.count > 0 ? bin.sumPredicted / bin.count : (i * 0.1 + 0.05);
      const empiricalRate = bin.count > 0 ? bin.sumObserved / bin.count : 0;
      const calError = Math.abs(empiricalRate - meanPred);

      if (bin.count > 0 && totalSamples > 0) {
        weightedCalibrationError += (bin.count / totalSamples) * calError;
      }

      return {
        decileIndex: i + 1,
        probabilityRange: `[${lower}, ${upper})`,
        sampleCount: bin.count,
        meanPredictedProbability: Number(meanPred.toFixed(4)),
        empiricalRecoveryRate: Number(empiricalRate.toFixed(4)),
        totalRecoveredAmount: Number(bin.sumAmountRecovered.toFixed(2)),
        calibrationError: Number(calError.toFixed(4)),
      };
    });

    const brierScore = totalSamples > 0 ? Number((totalBrierLoss / totalSamples).toFixed(4)) : 0;
    const expectedCalibrationError = Number(weightedCalibrationError.toFixed(4));
    const meanPredictedProbability = totalSamples > 0 ? Number((overallPredictedSum / totalSamples).toFixed(4)) : 0;
    const overallObservedRate = totalSamples > 0 ? Number((overallObservedSum / totalSamples).toFixed(4)) : 0;

    return {
      deciles,
      totalSamples,
      expectedCalibrationError,
      brierScore,
      meanPredictedProbability,
      overallObservedRate,
    };
  }
}
