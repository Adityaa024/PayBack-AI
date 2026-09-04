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
        
        # We pre-determine if the customer WOULD pay under each arm.
        # This prevents 'datetime.now()' drift and keeps results 100% reproducible.
        
        # Organic recovery (no intervention)
        natural_rec = random.random() < assumptions['natural_recovery_rate']
        
        # Naive recovery (dumb link send)
        # If they naturally recover, they also recover here.
        naive_rec = natural_rec or (random.random() < (assumptions['recovery_probabilities']['naive_baseline'] - assumptions['natural_recovery_rate']))
        
        # AI recovery (smart, optimal timing/tone)
        ai_rec = naive_rec or (random.random() < (assumptions['recovery_probabilities']['ai_agent_baseline'] - assumptions['recovery_probabilities']['naive_baseline']))

        dataset.append({
            "invoice_id": invoice_id,
            "incident_lane": lane,
            "amount": value,
            "is_holdout": is_holdout,
            "truth": {
                "natural_recovery": natural_rec,
                "naive_recovery": naive_rec,
                "ai_recovery": ai_rec
            }
        })

    output_path = script_dir.parent.parent / 'reports'
    output_path.mkdir(exist_ok=True)
    
    with open(output_path / 'simulated_batch.json', 'w') as f:
        json.dump(dataset, f, indent=2)
        
    print(f"Generated {total_cases} simulated cases at {output_path / 'simulated_batch.json'}")

if __name__ == '__main__':
    generate_dataset()
