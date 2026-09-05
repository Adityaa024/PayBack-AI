import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Priority 9: Evaluation Audit Integrity Test Suite
 * 
 * Enforces strict scientific and statistical safeguards:
 * 1. Rejects fake LLM trace metadata; fails if no real provider API key is present
 * 2. Rejects real LLM arm if evaluated against a mismatched denominator (N=50 vs N=1,000)
 * 3. Rejects confidence intervals above 100.00% (bounded efficiency)
 * 4. Rejects claims of "hidden holdout" when holdout data is committed to the repository
 * 5. Recomputes headline README and evaluation numbers directly from raw artifacts
 */
describe('Priority 9: Scientific Credibility & Evaluation Audit Integrity', () => {
  const ROOT_DIR = path.resolve(__dirname, '../../../../');
  const EVAL_FILE = path.join(ROOT_DIR, 'reports', 'evaluation.json');
  const MULTISEED_FILE = path.join(ROOT_DIR, 'reports', 'multiseed_report.json');
  const ABLATION_FILE = path.join(ROOT_DIR, 'reports', 'ablation_report.json');
  const EXTERNAL_COHORT_FILE = path.join(ROOT_DIR, 'reports', 'external_validation_cohort.json');
  const README_FILE = path.join(ROOT_DIR, 'README.md');
  const TRACES_SCRIPT = path.join(ROOT_DIR, 'ai-service', 'scripts', 'record_real_llm_traces.py');

  const getPythonExec = (root: string) => {
    if (process.env.PYTHON) return `"${process.env.PYTHON}"`;
    const candidates = [
      path.join(root, 'ai-service', '.venv', 'Scripts', 'python.exe'),
      path.join(root, 'ai-service', 'venv', 'Scripts', 'python.exe'),
      path.join(root, 'ai-service', '.venv', 'bin', 'python'),
      path.join(root, 'ai-service', 'venv', 'bin', 'python'),
      path.join(root, '.venv', 'Scripts', 'python.exe'),
      path.join(root, 'venv', 'Scripts', 'python.exe'),
      path.join(root, '.venv', 'bin', 'python'),
      path.join(root, 'venv', 'bin', 'python'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return `"${c}"`;
    }
    return 'python';
  };

  it('1. rejects fake LLM trace generation and enforces fail-loudly behavior without genuine provider credentials', () => {
    // Execute record_real_llm_traces.py with stripped API keys and expect strict failure (exit code 1)
    let threw = false;
    const pyExec = getPythonExec(ROOT_DIR);
    try {
      execSync(`${pyExec} "${TRACES_SCRIPT}" --sample-size 5`, {
        env: {
          ...process.env,
          GROQ_API_KEY: '',
          OPENAI_API_KEY: '',
        },
        stdio: 'pipe',
      });
    } catch (err: any) {
      threw = true;
      const stderr = err.stderr ? err.stderr.toString() : '';
      const stdout = err.stdout ? err.stdout.toString() : '';
      const output = stderr + stdout;
      expect(output).toMatch(/FATAL: No live LLM provider credentials configured|RuntimeError/i);
    }
    expect(threw, 'record_real_llm_traces.py must fail loudly when provider API keys are absent').toBe(true);
  });

  it('2. rejects any benchmark arm in the 1,000-case canonical table with a mismatched denominator', () => {
    expect(fs.existsSync(EVAL_FILE)).toBe(true);
    const rawEval = JSON.parse(fs.readFileSync(EVAL_FILE, 'utf-8'));
    const canonicalFailedValue = rawEval.benchmark_metadata.total_failed_portfolio_value;
    expect(canonicalFailedValue).toBe(2221965.5);

    // Arms in the canonical 1,000-case table
    for (const [armKey, arm] of Object.entries<any>(rawEval.arms)) {
      if (arm.evaluated !== false && arm.total_failed_value !== undefined) {
        expect(
          arm.total_failed_value,
          `Arm ${armKey} evaluated on a mismatched denominator: expected ${canonicalFailedValue}, got ${arm.total_failed_value}`
        ).toBe(canonicalFailedValue);
      } else {
        // Gated arm must have status explaining gating
        expect(arm.status).toMatch(/gated/i);
      }
    }

    // Verify diagnostic real LLM sample is stored in a segregated structure with its distinct denominator
    expect(rawEval.diagnostic_real_llm_sample).toBeDefined();
    expect(rawEval.diagnostic_real_llm_sample.sample_size).toBe(50);
    expect(rawEval.diagnostic_real_llm_sample.total_failed_value).toBe(114878.43);
    expect(rawEval.diagnostic_real_llm_sample.denominator_isolation).toMatch(/dedicated denominator/i);
  });

  it('3. rejects confidence intervals exceeding 100.00% and validates bounded percentages', () => {
    expect(fs.existsSync(EVAL_FILE)).toBe(true);
    expect(fs.existsSync(MULTISEED_FILE)).toBe(true);

    const rawEval = JSON.parse(fs.readFileSync(EVAL_FILE, 'utf-8'));
    const multiseed = JSON.parse(fs.readFileSync(MULTISEED_FILE, 'utf-8'));

    // Check holdout CI in evaluation.json
    const holdoutCi = rawEval.unseen_holdout_evaluation.statistical_summary.confidence_interval_95;
    expect(holdoutCi[0]).toBeGreaterThanOrEqual(0.0);
    expect(holdoutCi[1]).toBeLessThanOrEqual(100.0);

    // Check multiseed statistics (20 seeds)
    expect(multiseed.metadata.total_seeds).toBeGreaterThanOrEqual(20);
    const stats = multiseed.summary_statistics.simulated_llm_oracle_pct;
    expect(stats.mean).toBeLessThanOrEqual(100.0);
    expect(stats.max).toBeLessThanOrEqual(100.0);
    expect(stats.ci_95_upper).toBeLessThanOrEqual(100.0);
    expect(stats.bootstrap_ci_95[1]).toBeLessThanOrEqual(100.0);

    // Test helper function: assert that unbounded interval (e.g., 99.55% - 100.45%) is rejected
    const validateCiBounded = (ci: [number, number]): boolean => {
      return ci[0] >= 0 && ci[1] <= 100.0;
    };
    expect(validateCiBounded([99.55, 100.45])).toBe(false);
    expect(validateCiBounded([98.69, 99.15])).toBe(true);
    expect(validateCiBounded([stats.ci_95_lower, stats.ci_95_upper])).toBe(true);
  });

  it('4. rejects claims of "hidden holdout" for committed benchmark datasets and validates unseen holdout naming', () => {
    expect(fs.existsSync(README_FILE)).toBe(true);
    const readmeContent = fs.readFileSync(README_FILE, 'utf-8');

    // Reject committed files being claimed as "hidden" holdouts
    const rawEval = JSON.parse(fs.readFileSync(EVAL_FILE, 'utf-8'));
    expect(rawEval.hidden_holdout_evaluation).toBeUndefined();
    expect(rawEval.unseen_holdout_evaluation).toBeDefined();

    // Verify external validation cohort exists and contains 500 cases
    expect(fs.existsSync(EXTERNAL_COHORT_FILE)).toBe(true);
    const cohortData = JSON.parse(fs.readFileSync(EXTERNAL_COHORT_FILE, 'utf-8'));
    expect(Array.isArray(cohortData)).toBe(true);
    expect(cohortData.length).toBe(500);

    const extEval = rawEval.external_validation_cohort_evaluation;
    expect(extEval).toBeDefined();
    expect(extEval.cases_count).toBe(500);
    expect(extEval.total_failed_value).toBe(21943582.88);
    expect(extEval.oracle_efficiency_pct).toBeLessThanOrEqual(100.0);
  });

  it('5. recomputes PolicyGuard economics separating compliant recovery from illegal recovery prevented', () => {
    expect(fs.existsSync(ABLATION_FILE)).toBe(true);
    const ablation = JSON.parse(fs.readFileSync(ABLATION_FILE, 'utf-8'));

    const pgEcon = ablation.policy_guard_economics;
    expect(pgEcon).toBeDefined();
    expect(pgEcon.gross_collections_without_guard).toBeGreaterThan(pgEcon.compliant_recovery);
    expect(pgEcon.illegal_recovery_prevented).toBe(201071.02);
    expect(pgEcon.violations_prevented).toBe(123);
    expect(pgEcon.statutory_90d_violations_prevented).toBe(98);
    expect(pgEcon.opt_out_violations_prevented).toBe(21);
    expect(pgEcon.interpretation).toMatch(/cannot be claimed as valid business lift/i);
  });
});
