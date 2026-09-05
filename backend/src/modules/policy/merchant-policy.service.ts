import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import yaml from 'yaml';
import { z } from 'zod';
import { logger } from '../../shared/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MerchantPolicyConfigSchema = z.object({
  version: z.string().default('1.0.0'),
  amountFloor: z.number().default(100.0),
  holdoutRatio: z.number().min(0).max(1).default(0.20),
  interventionCaps: z.object({
    maxContactsPerInvoice: z.number().default(3),
    maxDailyContactsPerCustomer: z.number().default(1),
    maxTotalSpendPerBatch: z.number().default(5000.0),
  }),
  retrySchedule: z.object({
    maxAttempts: z.number().default(3),
    cooldownHours: z.number().default(24),
    retryIntervalsDays: z.array(z.number()).default([1, 3, 7]),
  }),
  compliance: z.object({
    quietHoursStart: z.string().default('21:00'),
    quietHoursEnd: z.string().default('08:00'),
    customerTimezone: z.string().default('Asia/Kolkata'),
    requireHumanApprovalAbove: z.number().default(500000.0),
    allowedChannels: z.array(z.string()).default(['email', 'sms', 'whatsapp']),
  }),
  allowedIncidentLanes: z.array(
    z.enum([
      'payment_degradation',
      'subscription_rescue',
      'checkout_dropoff',
      'b2b_receivables',
    ])
  ).default([
    'payment_degradation',
    'subscription_rescue',
    'checkout_dropoff',
    'b2b_receivables',
  ]),
});

export type MerchantPolicyConfig = z.infer<typeof MerchantPolicyConfigSchema> & {
  policyHash: string;
};

const DEFAULT_POLICY_RAW: z.infer<typeof MerchantPolicyConfigSchema> = {
  version: '1.0.0',
  amountFloor: 100.0,
  holdoutRatio: 0.20,
  interventionCaps: {
    maxContactsPerInvoice: 3,
    maxDailyContactsPerCustomer: 1,
    maxTotalSpendPerBatch: 5000.0,
  },
  retrySchedule: {
    maxAttempts: 3,
    cooldownHours: 24,
    retryIntervalsDays: [1, 3, 7],
  },
  compliance: {
    quietHoursStart: '21:00',
    quietHoursEnd: '08:00',
    customerTimezone: 'Asia/Kolkata',
    requireHumanApprovalAbove: 500000.0,
    allowedChannels: ['email', 'sms', 'whatsapp'],
  },
  allowedIncidentLanes: [
    'payment_degradation',
    'subscription_rescue',
    'checkout_dropoff',
    'b2b_receivables',
  ],
};

export class MerchantPolicyService {
  private static cachedPolicies: Map<string, MerchantPolicyConfig> = new Map();
  private static globalVersion: string = '1.0.0';
  private static initialized: boolean = false;

  private static resolveConfigPath(): string | null {
    const candidates = [
      path.resolve(process.cwd(), '../ai-service/config/merchant_policies.yaml'),
      path.resolve(process.cwd(), 'ai-service/config/merchant_policies.yaml'),
      path.resolve(process.cwd(), 'config/merchant_policies.yaml'),
      path.resolve(__dirname, '../../../../ai-service/config/merchant_policies.yaml'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  public static loadPolicies(forceReload = false): void {
    if (this.initialized && !forceReload) {
      return;
    }

    const configPath = this.resolveConfigPath();
    if (!configPath) {
      logger.warn('merchant_policy_yaml_not_found_using_defaults', {
        defaultVersion: DEFAULT_POLICY_RAW.version,
      });
      const hash = this.computePolicyHash(DEFAULT_POLICY_RAW);
      this.cachedPolicies.set('default', { ...DEFAULT_POLICY_RAW, policyHash: hash });
      this.initialized = true;
      return;
    }

    try {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const parsed = yaml.parse(fileContent) || {};

      this.globalVersion = parsed.version || '1.0.0';

      for (const [key, rawConfig] of Object.entries(parsed)) {
        if (key === 'version' || typeof rawConfig !== 'object' || !rawConfig) continue;

        const typed = this.normalizeRawConfig(rawConfig, this.globalVersion);
        const validated = MerchantPolicyConfigSchema.parse(typed);
        const policyHash = this.computePolicyHash(validated);

        this.cachedPolicies.set(key, {
          ...validated,
          policyHash,
        });
      }

      // Ensure default exists
      if (!this.cachedPolicies.has('default_merchant') && !this.cachedPolicies.has('default')) {
        const hash = this.computePolicyHash(DEFAULT_POLICY_RAW);
        this.cachedPolicies.set('default', { ...DEFAULT_POLICY_RAW, policyHash: hash });
      }

      this.initialized = true;
      logger.info('merchant_policies_loaded', {
        count: this.cachedPolicies.size,
        version: this.globalVersion,
        configPath,
      });
    } catch (err) {
      logger.error('failed_to_load_merchant_policies_yaml', { error: err });
      const hash = this.computePolicyHash(DEFAULT_POLICY_RAW);
      this.cachedPolicies.set('default', { ...DEFAULT_POLICY_RAW, policyHash: hash });
      this.initialized = true;
    }
  }

  private static normalizeRawConfig(raw: any, version: string): z.infer<typeof MerchantPolicyConfigSchema> {
    return {
      version: raw.version || version,
      amountFloor: raw.amount_floor !== undefined ? Number(raw.amount_floor) : 100.0,
      holdoutRatio: raw.holdout_ratio !== undefined ? Number(raw.holdout_ratio) : 0.20,
      interventionCaps: {
        maxContactsPerInvoice: raw.intervention_caps?.max_contacts_per_invoice ?? 3,
        maxDailyContactsPerCustomer: raw.intervention_caps?.max_daily_contacts_per_customer ?? 1,
        maxTotalSpendPerBatch: raw.intervention_caps?.max_total_spend_per_batch ?? 5000.0,
      },
      retrySchedule: {
        maxAttempts: raw.retry_schedule?.max_attempts ?? 3,
        cooldownHours: raw.retry_schedule?.cooldown_hours ?? 24,
        retryIntervalsDays: raw.retry_schedule?.retry_intervals_days ?? [1, 3, 7],
      },
      compliance: {
        quietHoursStart: raw.compliance?.quiet_hours_start ?? '21:00',
        quietHoursEnd: raw.compliance?.quiet_hours_end ?? '08:00',
        customerTimezone: raw.compliance?.customer_timezone ?? 'Asia/Kolkata',
        requireHumanApprovalAbove: raw.compliance?.require_human_approval_above ?? 500000.0,
        allowedChannels: raw.compliance?.allowed_channels ?? ['email', 'sms', 'whatsapp'],
      },
      allowedIncidentLanes: raw.allowed_incident_lanes ?? [
        'payment_degradation',
        'subscription_rescue',
        'checkout_dropoff',
        'b2b_receivables',
      ],
    };
  }

  public static computePolicyHash(policy: z.infer<typeof MerchantPolicyConfigSchema>): string {
    const normalizedString = JSON.stringify({
      version: policy.version,
      amountFloor: policy.amountFloor,
      holdoutRatio: policy.holdoutRatio,
      interventionCaps: policy.interventionCaps,
      retrySchedule: policy.retrySchedule,
      compliance: policy.compliance,
      allowedIncidentLanes: policy.allowedIncidentLanes.slice().sort(),
    });

    return crypto.createHash('sha256').update(normalizedString).digest('hex');
  }

  public static getPolicyForMerchant(merchantOrTenantId?: string): MerchantPolicyConfig {
    if (!this.initialized) {
      this.loadPolicies();
    }

    if (merchantOrTenantId && this.cachedPolicies.has(merchantOrTenantId)) {
      return this.cachedPolicies.get(merchantOrTenantId)!;
    }

    if (this.cachedPolicies.has('default_merchant')) {
      return this.cachedPolicies.get('default_merchant')!;
    }

    if (this.cachedPolicies.has('default')) {
      return this.cachedPolicies.get('default')!;
    }

    const hash = this.computePolicyHash(DEFAULT_POLICY_RAW);
    return { ...DEFAULT_POLICY_RAW, policyHash: hash };
  }
}
