import json
import yaml
import random
import hashlib
from pathlib import Path

def generate_dataset():
    script_dir = Path(__file__).parent
    assumptions_path = script_dir / 'world_assumptions.yaml'
    
    with open(assumptions_path, 'r') as f:
        assumptions = yaml.safe_load(f)

    random.seed(42)  # Fixed seed for reproducibility

    total_cases = assumptions['cohort_sizes']['total_batch_size']
    holdout_pct = assumptions['cohort_sizes']['holdout_percentage']
    
    avg_value = assumptions['avg_value'] if 'avg_value' in assumptions else assumptions['avg_invoice_value']

    dataset = []

    lanes = list(assumptions['incident_lanes'].keys())
    lane_probs = list(assumptions['incident_lanes'].values())

    for i in range(total_cases):
        invoice_id = f"inv_sim_{i:04d}"
        
        # Deterministic assignment to holdout (e.g. 20% holdout)
        # Using hash to assign cohort reliably
        h = int(hashlib.md5(invoice_id.encode()).hexdigest(), 16)
        is_holdout = (h % 100) < (holdout_pct * 100)
        
        lane = random.choices(lanes, weights=lane_probs)[0]
        
        # Randomize value around the average
        value = round(avg_value * random.uniform(0.5, 2.5), 2)
        
        # Realistic attributes for policy evaluation
        # 10% of cases are > 90 days overdue (Rule 1: Legal Stop)
        if random.random() < 0.10:
            days_overdue = random.randint(91, 130)
        else:
            days_overdue = random.randint(1, 89)

        # 3% of cases have 2+ broken promises (Rule 3: PTP Broken Twice)
        ptp_rand = random.random()
        if ptp_rand < 0.03:
            ptp_broken = 2
        elif ptp_rand < 0.08:
            ptp_broken = 1
        else:
            ptp_broken = 0

        # 2.5% have active dispute / refund inquiry (Rule 6: Dispute Active)
        has_dispute = random.random() < 0.025

        # 2% have sent STOP keyword opt-out (Rule 2: Opt-Out)
        opted_out = random.random() < 0.02

        # 1% under economic floor of ₹100 (Rule 7: Economic Floor)
        if random.random() < 0.01:
            value = round(random.uniform(25.0, 95.0), 2)

        # Ground-truth customer responsiveness
        natural_rec = random.random() < assumptions['natural_recovery_rate']
        
        # Naive responsiveness: customer responds to a generic link
        naive_rec = natural_rec or (random.random() < (assumptions['recovery_probabilities']['naive_baseline'] - assumptions['natural_recovery_rate']))
        
        # Lane-specific responsiveness based on optimal channel and intervention
        resp_cfg = assumptions.get('customer_responsiveness', {})
        base_lane_prob = resp_cfg.get(lane, 0.45)
        lane_rec = natural_rec or (random.random() < base_lane_prob)
        
        # Additional response if escalated to firm tone (Stage 2)
        tone_boost = resp_cfg.get('tone_escalation_lift', 0.12)
        tone_escalation_rec = lane_rec or (random.random() < tone_boost)

        dataset.append({
            "invoice_id": invoice_id,
            "incident_lane": lane,
            "amount": value,
            "days_overdue": days_overdue,
            "ptp_broken": ptp_broken,
            "has_dispute": has_dispute,
            "opted_out": opted_out,
            "retry_count": 0,
            "is_holdout": is_holdout,
            "truth": {
                "natural_recovery": natural_rec,
                "naive_recovery": naive_rec,
                "lane_recovery": lane_rec,
                "tone_escalation_recovery": tone_escalation_rec
            }
        })

    output_path = script_dir.parent.parent / 'reports'
    output_path.mkdir(exist_ok=True)
    
    with open(output_path / 'simulated_batch.json', 'w') as f:
        json.dump(dataset, f, indent=2)
        
    print(f"Generated {total_cases} simulated cases at {output_path / 'simulated_batch.json'}")

if __name__ == '__main__':
    generate_dataset()
