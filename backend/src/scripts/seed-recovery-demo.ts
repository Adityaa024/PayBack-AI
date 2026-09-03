#!/usr/bin/env node
/**
 * RecoverIQ AI Revenue Recovery — RecoverIQ 50-Case Benchmark Seed Script
 * 
 * Generates the full 50-case deterministic test batch stratified across 4 incident lanes
 * with a 15% counterfactual holdout split, Recovery Contracts, and PolicyGuard rules.
 * 
 * Usage:
 *   cd backend
 *   npx tsx src/scripts/seed-recovery-demo.ts
 */

import { ScenarioCatalog } from '../modules/recovery/recovery.scenarios.js';
import { HoldoutManager } from '../modules/recovery/recovery.holdout.js';

function run() {
  const tenantId = process.env.DEMO_TENANT_ID || 'tenant_demo_001';
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log('⚡ RecoverIQ Control Tower — 50-Case Benchmark Generator');
  console.log('─────────────────────────────────────────────────────────────────────────────');

  const cases = ScenarioCatalog.generate50Batch(tenantId);
  const lanes = {
    payment_degradation: cases.filter((c) => c.incidentLane === 'payment_degradation').length,
    subscription_rescue: cases.filter((c) => c.incidentLane === 'subscription_rescue').length,
    b2b_receivables: cases.filter((c) => c.incidentLane === 'b2b_receivables').length,
    checkout_dropoff: cases.filter((c) => c.incidentLane === 'checkout_dropoff').length,
  };

  const holdouts = cases.filter((c) => c.isHoldout);
  const treatments = cases.filter((c) => !c.isHoldout);
  const totalAmountAtRisk = cases.reduce((acc, c) => acc + c.amountAtRisk, 0);

  console.log(`\n📦 Total Scenarios Generated: ${cases.length}`);
  console.log(`   💳 Payment Degradation: ${lanes.payment_degradation} cases`);
  console.log(`   🔄 Subscription Rescue: ${lanes.subscription_rescue} cases`);
  console.log(`   📄 B2B Receivables:     ${lanes.b2b_receivables} cases`);
  console.log(`   🛒 Checkout Drop-off:   ${lanes.checkout_dropoff} cases`);
  console.log(`\n⚖️  Cohort Stratification:`);
  console.log(`   Treatment Group: ${treatments.length} cases (${((treatments.length / cases.length) * 100).toFixed(0)}%)`);
  console.log(`   Holdout Group:   ${holdouts.length} cases (${((holdouts.length / cases.length) * 100).toFixed(0)}%) [Counterfactual control]`);
  console.log(`   Total ₹ at Risk: ₹${(totalAmountAtRisk / 100000).toFixed(2)} Lakhs`);

  // Example Counterfactual calculation
  const demoMetrics = HoldoutManager.calculateExperimentMetrics({
    treatmentEligible: 2800000,
    treatmentRecovered: 2150000,
    treatmentCases: treatments.length,
    holdoutEligible: 450000,
    holdoutRecovered: 85000,
    holdoutCases: holdouts.length,
    outboundContacts: 54,
    optOuts: 0,
    discounts: 15000,
    refunds: 0,
  });

  console.log('\n📊 Counterfactual Experiment Projection:');
  console.log(`   Treatment Recovery Rate: ${demoMetrics.treatmentRecoveryRate}%`);
  console.log(`   Holdout Natural Rate:    ${demoMetrics.holdoutRecoveryRate}%`);
  console.log(`   Incremental Recovered:  ₹${(demoMetrics.incrementalRecovered / 100000).toFixed(2)} Lakhs`);
  console.log(`   Net Incremental Money:  ₹${(demoMetrics.netIncrementalRecovered / 100000).toFixed(2)} Lakhs`);
  console.log(`   Contact Efficiency:      ₹${demoMetrics.contactEfficiency.toLocaleString('en-IN')} / outbound contact`);
  console.log(`   Badger Rate:             ${demoMetrics.badgerRate}% (Zero policy violations)`);

  console.log('\n🎯 Demo Presets Available (Acts 1–5):');
  for (let act = 1; act <= 5; act++) {
    const preset = ScenarioCatalog.getDemoPreset(act as any, tenantId);
    console.log(`   [Act ${act}] ${preset.title}`);
  }

  console.log('\n✅ 50-Case benchmark seed blueprint ready.');
}

run();
