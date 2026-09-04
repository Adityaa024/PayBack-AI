import json
import sys
from pathlib import Path

def verify_reproduce():
    reports_dir = Path(__file__).parent.parent.parent / 'reports'
    eval_file = reports_dir / 'evaluation.json'
    
    if not eval_file.exists():
        print("ERROR: evaluation.json not found! Run run_evaluation.py first.")
        sys.exit(1)
        
    with open(eval_file, 'r', encoding='utf-8') as f:
        old_data = json.load(f)
        
    # Re-run generator and evaluator
    import generate_dataset
    import run_evaluation
    
    print("Re-generating dataset from fixed seed...")
    generate_dataset.generate_dataset()
    
    print("Re-evaluating pipeline...")
    run_evaluation.run_evaluation()
    
    with open(eval_file, 'r', encoding='utf-8') as f:
        new_data = json.load(f)
        
    if old_data != new_data:
        print("ERROR: Reproducibility check failed! Output drifted from committed numbers.")
        sys.exit(1)
        
    print("SUCCESS: Reproducibility verified. All metrics match the committed baseline.")
    sys.exit(0)

if __name__ == '__main__':
    verify_reproduce()
