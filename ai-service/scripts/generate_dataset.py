import json
import yaml
import random
import hashlib
from pathlib import Path

def generate_dataset(seed: int = 42, output_file: Path = None, total_cases_override: int = None, write_to_disk: bool = True):
    script_dir = Path(__file__).parent
    assumptions_path = script_dir / 'world_assumptions.yaml'
    
    with open(assumptions_path, 'r') as f:
        assumptions = yaml.safe_load(f)

    random.seed(seed)  # Fixed seed for reproducibility

    total_cases = total_cases_override or assumptions['cohort_sizes']['total_batch_size']
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

        # Ground-truth customer responsiveness (advances global random state identically)
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

        # Candidate strategy effectiveness matrix
        # Uses independent RNG stream keyed by seed and invoice_id so global random state is untouched
        if lane == 'b2b_receivables':
            strat_key = 'b2b_receivables_late' if days_overdue > 45 else 'b2b_receivables_early'
        else:
            strat_key = lane

        strat_matrix = assumptions.get('strategy_effectiveness_matrix', {})
        strat_probs = strat_matrix.get(strat_key, {})
        candidate_strategies = [
            'payment_link_refresh',
            'soft_reminder',
            'firm_escalation',
            'mandate_retry',
            'human_escalation'
        ]

        strat_rng = random.Random(f"{seed}_{invoice_id}_strat")
        strategy_outcomes = {}
        for strat in candidate_strategies:
            if natural_rec:
                strategy_outcomes[strat] = True
            else:
                p = strat_probs.get(strat, 0.05)
                strategy_outcomes[strat] = (strat_rng.random() < p)

        # Observable signals for AI agent diagnosis (with ~10% ambiguous noise)
        is_ambiguous = (random.random() < 0.10)
        
        if lane == 'payment_degradation':
            inv_prefix = "INV" if is_ambiguous else "PAY-DEG"
            failure_reasons = [
                ("Payment declined: bank gateway timeout", "GATEWAY_TIMEOUT"),
                ("UPI collect request timed out after 15 minutes", "UPI_COLLECT_TIMEOUT"),
                ("Card network temporary authorization error", "NETWORK_DECLINE")
            ]
            reason, err_code = random.choice(failure_reasons)
            client_name = random.choice(["Rahul Sharma", "Vikram Malhotra", "Ananya Singh", "Siddharth Rao", "Priya Patel"])
            portal_views = 1 if random.random() < 0.2 else 0

        elif lane == 'subscription_rescue':
            inv_prefix = "INV" if is_ambiguous else "SUB-REC"
            failure_reasons = [
                ("Mandate auto-debit failed: recurring payment declined by issuer", "MANDATE_DEBIT_FAILED"),
                ("Customer card on file expired for monthly subscription", "CARD_EXPIRED"),
                ("Recurring payment authorization expired", "MANDATE_EXPIRED")
            ]
            reason, err_code = random.choice(failure_reasons)
            client_name = random.choice(["CloudScale SaaS", "DevMetrics Pro", "MediaFlow Stream", "ZenDesk User", "FinTrack App"])
            portal_views = 1 if random.random() < 0.25 else 0

        elif lane == 'checkout_dropoff':
            inv_prefix = "INV" if is_ambiguous else "CHK-DRP"
            failure_reasons = [
                ("Checkout abandoned at payment method selection step", "CHECKOUT_ABANDONED"),
                ("Customer dropped off on invoice payment portal", "PORTAL_SESSION_EXPIRED"),
                ("Payment session expired before gateway handoff", "PAYMENT_UNATTEMPTED")
            ]
            reason, err_code = random.choice(failure_reasons)
            client_name = random.choice(["Rohan Mehta", "Sneha Kapoor", "Kunal Ghosh", "Divya Nair", "Arjun Reddy"])
            portal_views = random.randint(1, 4)

        else:  # b2b_receivables
            inv_prefix = "INV" if is_ambiguous else "INV-B2B"
            failure_reasons = [
                ("Corporate Net-30 payment terms overdue", "NET30_OVERDUE"),
                ("Commercial vendor invoice awaiting finance clearance", "AP_APPROVAL_PENDING"),
                ("Commercial billing terms Net-45 past due", "COMMERCIAL_TERMS_EXPIRED")
            ]
            reason, err_code = random.choice(failure_reasons)
            client_name = random.choice(["Acme Technologies Ltd", "Tata Logistics Ltd", "Reliance Infra Corp", "Infosys Solutions B2B", "L&T Heavy Engg"])
            portal_views = 0

        if is_ambiguous:
            reason = random.choice([
                "Transaction declined - general payment failure",
                "Payment overdue - standard account notification",
                "Payment processing was unsuccessful",
                "Outstanding balance pending settlement"
            ])
            err_code = "GENERIC_DECLINE"
            client_name = random.choice(["Apex Enterprises", "Sharma Traders", "Global Services", "Vanguard Logistics", "Nexus Retail"])

        # Deterministic dimensional assignment
        dim_hash = int(hashlib.md5(f"{invoice_id}_dim".encode()).hexdigest(), 16)
        if lane == 'payment_degradation':
            rails = ['upi', 'card', 'netbanking']
            rail = rails[dim_hash % 3]
            segment = 'consumer_d2c' if (dim_hash % 10 < 7) else 'smb_saas'
        elif lane == 'subscription_rescue':
            rails = ['mandate', 'card']
            rail = rails[dim_hash % 2]
            segment = 'smb_saas' if (dim_hash % 10 < 7) else 'consumer_d2c'
        elif lane == 'checkout_dropoff':
            rails = ['upi', 'card']
            rail = rails[dim_hash % 2]
            segment = 'consumer_d2c' if (dim_hash % 10 < 8) else 'smb_saas'
        else:  # b2b_receivables
            rails = ['netbanking', 'mandate']
            rail = rails[dim_hash % 2]
            segment = 'enterprise_b2b'

        if value < 1000:
            amount_band = '< ₹1,000'
        elif value < 10000:
            amount_band = '₹1,000–₹10,000'
        elif value <= 50000:
            amount_band = '₹10,000–₹50,000'
        else:
            amount_band = '> ₹50,000'

        dataset.append({
            "invoice_id": invoice_id,
            "invoice_no": f"{inv_prefix}-{i:04d}",
            "client_name": client_name,
            "incident_lane": lane,
            "failure_type": lane,
            "payment_rail": rail,
            "customer_segment": segment,
            "amount_band": amount_band,
            "amount": value,
            "days_overdue": days_overdue,
            "ptp_broken": ptp_broken,
            "has_dispute": has_dispute,
            "opted_out": opted_out,
            "retry_count": 0,
            "is_holdout": is_holdout,
            "failure_reason": reason,
            "error_code": err_code,
            "portal_views": portal_views,
            "due_date": "2026-08-15",
            "truth": {
                "natural_recovery": natural_rec,
                "strategy_outcomes": strategy_outcomes,
                "naive_recovery": naive_rec,
                "lane_recovery": lane_rec,
                "tone_escalation_recovery": tone_escalation_rec
            }
        })

    if write_to_disk:
        target_file = output_file or (script_dir.parent.parent / 'reports' / 'simulated_batch.json')
        target_file.parent.mkdir(parents=True, exist_ok=True)
        with open(target_file, 'w', encoding='utf-8') as f:
            json.dump(dataset, f, indent=2)
        print(f"Generated {total_cases} simulated cases (seed={seed}) at {target_file}")

    return dataset

if __name__ == '__main__':
    generate_dataset()
