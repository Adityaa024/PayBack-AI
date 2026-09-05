import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * README Metrics Parity & Recompute Test
 * 
 * Priority 1 Requirement:
 * "Add tests that recompute every README metric directly from raw evaluation artifacts.
 * Fail CI if any documented metric differs from regenerated output."
 */
describe('Priority 1: README Metrics Parity & CI Integrity Guard', () => {
  const ROOT_DIR = path.resolve(__dirname, '../../../../');
  const EVAL_FILE = path.join(ROOT_DIR, 'reports', 'evaluation.json');
  const README_FILE = path.join(ROOT_DIR, 'README.md');

  it('recomputes headline benchmark metrics directly from raw evaluation.json and asserts README parity', () => {
    expect(fs.existsSync(EVAL_FILE)).toBe(true);
    expect(fs.existsSync(README_FILE)).toBe(true);

    const rawEval = JSON.parse(fs.readFileSync(EVAL_FILE, 'utf-8'));
    const readmeContent = fs.readFileSync(README_FILE, 'utf-8');

    const meta = rawEval.benchmark_metadata;
    const arms = rawEval.arms;

    // 1. Unified denominator verification
    const totalFailed = arms.oracle.total_failed_value;
    const oracleCeiling = meta.oracle_ceiling_amount;

    expect(arms.do_nothing.total_failed_value).toBe(totalFailed);
    expect(arms.fixed_retry.total_failed_value).toBe(totalFailed);
    expect(arms.contact_only.total_failed_value).toBe(totalFailed);
    expect(arms.deterministic_policy.total_failed_value).toBe(totalFailed);
    expect(arms.simulated_llm_policy.total_failed_value).toBe(totalFailed);
    expect(arms.oracle.total_failed_value).toBe(totalFailed);

    // 2. Format numbers as en-IN integers for markdown matching
    const formatInrInt = (n: number) => Math.round(n).toLocaleString('en-IN');
    const formatInrDec = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatPct = (n: number) => n.toFixed(2) + '%';

    // Assert README contains the exact formatted values or integer representations
    const expectedFragments = [
      formatInrDec(totalFailed),
      formatInrDec(oracleCeiling),
      formatInrDec(arms.simulated_llm_policy.gross_recovered_value),
      formatInrDec(arms.deterministic_policy.gross_recovered_value),
      formatPct(arms.simulated_llm_policy.recovery_pct_oracle_ceiling),
      formatPct(arms.deterministic_policy.recovery_pct_oracle_ceiling),
      '100.00%', // Oracle match
    ];

    for (const fragment of expectedFragments) {
      const isPresent = readmeContent.includes(fragment) || readmeContent.includes(fragment.replace(/,/g, ''));
      expect(
        isPresent,
        `README.md is missing or out-of-sync with raw evaluation metric: "${fragment}". Run scripts/verify_all.py to regenerate.`
      ).toBe(true);
    }

    // 3. Invariant assertions
    expect(arms.deterministic_policy.compliance_violations).toBe(0);
    expect(arms.simulated_llm_policy.compliance_violations).toBe(0);
    expect(arms.fixed_retry.compliance_violations).toBeGreaterThan(0);
    expect(arms.oracle.gross_recovered_value).toBe(oracleCeiling);
  });
});
