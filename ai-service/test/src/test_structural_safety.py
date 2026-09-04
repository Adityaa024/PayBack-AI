import ast
import os
import pytest
from pathlib import Path

# The agents are not allowed to use any of these libraries directly.
# All Razorpay interaction must go through the Node.js PolicyGuard.
BANNED_MODULES = {'requests', 'httpx', 'aiohttp', 'urllib', 'urllib3', 'razorpay'}

def check_file_for_banned_imports(filepath: Path):
    with open(filepath, 'r', encoding='utf-8') as f:
        tree = ast.parse(f.read(), filename=str(filepath))

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                base_module = alias.name.split('.')[0]
                assert base_module not in BANNED_MODULES, \
                    f"Structural Safety Violation: Banned import '{alias.name}' found in {filepath}. " \
                    "The AI layer must not bypass the Node.js PolicyGuard."
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                base_module = node.module.split('.')[0]
                assert base_module not in BANNED_MODULES, \
                    f"Structural Safety Violation: Banned import '{node.module}' found in {filepath}. " \
                    "The AI layer must not bypass the Node.js PolicyGuard."

def test_structural_safety_no_banned_imports():
    """
    Enforces that the diagnosis/LLM layer cannot call a payment provider directly.
    Only the deterministic policy engine (Node backend) can authorize an action.
    """
    project_root = Path(__file__).parent.parent.parent
    agents_dir = project_root / 'src' / 'agents'

    assert agents_dir.exists(), f"Agents directory not found at {agents_dir}"

    python_files = list(agents_dir.glob('**/*.py'))
    assert len(python_files) > 0, "No python files found in agents directory to check"

    for py_file in python_files:
        check_file_for_banned_imports(py_file)
