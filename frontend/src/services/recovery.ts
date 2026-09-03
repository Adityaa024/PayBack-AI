import { api } from './api';

export interface RecoveryStats {
  totalAtRisk: string;
  totalRecovered: string;
  recoveryRatePercent: number;
  activeSessions: number;
  recoveredSessions: number;
  stoppedSessions: number;
}

export interface RecoveryContract {
  caseId: string;
  incidentLane: 'payment_degradation' | 'subscription_rescue' | 'checkout_dropoff' | 'b2b_receivables';
  customerId: string;
  amountAtRisk: number;
  currency: string;
  diagnosis: {
    primary: string;
    evidence: string[];
    confidence: number;
  };
  recommendedAction: string;
  actionParameters: {
    maxAmount: number;
    expiresInHours: number;
    allowedMethods: string[];
  };
  customerMessage: string;
  voiceScriptHinglish?: string;
  cooldownHours: number;
  maxAttempts: number;
  escalateAfter: string;
  stopRules: string[];
  requiresHumanApproval: boolean;
}

export interface ExperimentMetrics {
  totalEligible: number;
  totalAtRisk: number;
  treatmentCount: number;
  treatmentEligibleAmount: number;
  treatmentRecoveredAmount: number;
  treatmentRecoveryRate: number;
  holdoutCount: number;
  holdoutEligibleAmount: number;
  holdoutRecoveredAmount: number;
  holdoutRecoveryRate: number;
  incrementalRecovered: number;
  netIncrementalRecovered: number;
  incrementalLiftPercent: number;
  contactEfficiency: number;
  outboundContactsCount: number;
  badgerRate: number;
  policyViolationsCount: number;
  optOutCount: number;
}

export interface RecoverySession {
  id: string;
  tenantId: string;
  invoiceId: string;
  status: 'active' | 'recovered' | 'stopped' | 'escalated';
  strategy: string;
  incidentLane?: 'payment_degradation' | 'subscription_rescue' | 'checkout_dropoff' | 'b2b_receivables';
  isHoldout?: boolean;
  recoveryContract?: RecoveryContract | null;
  voiceScriptHinglish?: string | null;
  optedOut?: boolean;
  amountAtRisk: string;
  amountRecovered: string;
  currency: string;
  aiConfidence: string | null;
  aiReasoning: string | null;
  stopReason: string | null;
  retryCount: number;
  lastActionAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryAuditEntry {
  id: string;
  sessionId: string;
  tenantId: string;
  invoiceId: string;
  action: string;
  actor: string;
  aiDecision: Record<string, unknown> | null;
  razorpayRef: string | null;
  amountAtRisk: string | null;
  result: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PromiseToPay {
  id: string;
  tenantId: string;
  invoiceId: string;
  sessionId: string | null;
  detectedFromCommunicationId: string | null;
  promisedAmount: string | null;
  promisedDate: string | null;
  currency: string;
  status: 'pending' | 'kept' | 'broken' | 'escalated';
  brokenCount: number;
  aiExtractedText: string | null;
  aiConfidence: string | null;
  checkedAt: string | null;
  createdAt: string;
}

export interface RecoveryBatchSummary {
  batchId: string;
  startedAt: string;
  completedAt: string;
  totalAtRisk: string;
  totalRecovered: string;
  recoveryRatePercent: number;
  sessionsStarted: number;
  sessionsSkipped: number;
  currency: string;
}

export interface RecoveryRunResult {
  success: boolean;
  batch: RecoveryBatchSummary;
}

export const recoveryService = {
  async getStats(): Promise<RecoveryStats> {
    const { data } = await api.get<RecoveryStats>('/recovery/stats');
    return data;
  },

  async getSessions(): Promise<{ sessions: RecoverySession[]; recentAudit: RecoveryAuditEntry[] }> {
    const { data } = await api.get<{ sessions: RecoverySession[]; recentAudit: RecoveryAuditEntry[] }>('/recovery/sessions');
    return data;
  },

  async getSessionAudit(sessionId: string): Promise<{ session: RecoverySession; audit: RecoveryAuditEntry[] }> {
    const { data } = await api.get<{ session: RecoverySession; audit: RecoveryAuditEntry[] }>(`/recovery/sessions/${sessionId}/audit`);
    return data;
  },

  async triggerRun(): Promise<RecoveryRunResult> {
    const { data } = await api.post<RecoveryRunResult>('/recovery/run');
    return data;
  },

  async executeAction(sessionId: string): Promise<{ success: boolean; message: string; razorpayRef?: string }> {
    const { data } = await api.post<{ success: boolean; message: string; razorpayRef?: string }>(`/recovery/sessions/${sessionId}/execute`);
    return data;
  },

  async getPTPs(): Promise<PromiseToPay[]> {
    const { data } = await api.get<PromiseToPay[]>('/recovery/ptp');
    return data;
  },

  async checkBrokenPromises(): Promise<{ checked: number; broken: number; escalated: number }> {
    const { data } = await api.post<{ checked: number; broken: number; escalated: number }>('/recovery/ptp/check');
    return data;
  },

  async seed50Batch(): Promise<{
    success: boolean;
    totalSeeded: number;
    treatmentCount: number;
    holdoutCount: number;
    totalAmountAtRisk: number;
  }> {
    const { data } = await api.post<{
      success: boolean;
      totalSeeded: number;
      treatmentCount: number;
      holdoutCount: number;
      totalAmountAtRisk: number;
    }>('/recovery/scenarios/seed-50');
    return data;
  },

  async replayScenario(actNumber: 1 | 2 | 3 | 4 | 5): Promise<any> {
    const { data } = await api.post<any>('/recovery/scenarios/replay', { actNumber });
    return data;
  },

  async getExperimentMetrics(): Promise<ExperimentMetrics> {
    const { data } = await api.get<ExperimentMetrics>('/recovery/metrics/experiment');
    return data;
  },

  async getSessionContract(sessionId: string): Promise<{
    session: RecoverySession;
    contract: RecoveryContract | null;
    policyStatus: { allowed: boolean; violations: string[]; blockedReason?: string };
  }> {
    const { data } = await api.get<{
      session: RecoverySession;
      contract: RecoveryContract | null;
      policyStatus: { allowed: boolean; violations: string[]; blockedReason?: string };
    }>(`/recovery/sessions/${sessionId}/contract`);
    return data;
  },

  async optOutSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const { data } = await api.post<{ success: boolean; message: string }>(`/recovery/sessions/${sessionId}/opt-out`);
    return data;
  },

  async resetDemo(): Promise<{ success: boolean; message: string }> {
    const { data } = await api.post<{ success: boolean; message: string }>('/recovery/reset');
    return data;
  },
};
