import ast
import os
import pytest
from pathlib import Path

# The agents are not allowed to use any of these libraries directly.
# All Razorpay interaction and database writes must go through the Node.js PolicyGuard.
BANNED_MODULES = {
    # HTTP and payment providers
    'requests', 'httpx', 'aiohttp', 'urllib', 'urllib3', 'razorpay', 'stripe', 'paypal',
    # Database drivers and ORMs
    'sqlalchemy', 'psycopg2', 'asyncpg', 'sqlite3', 'pymysql', 'tortoise', 'peewee', 'motor', 'pymongo',
    # Direct process execution
    'subprocess',
}

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
    Enforces that the diagnosis/LLM layer cannot touch money, write to database, or call payment providers.
    Zero execution authority is enforced at the AST/compiler level.
    Only the deterministic policy engine (Node backend) can authorize an action.
    """
    project_root = Path(__file__).parent.parent.parent
    agents_dir = project_root / 'src' / 'agents'

    assert agents_dir.exists(), f"Agents directory not found at {agents_dir}"

    python_files = list(agents_dir.glob('**/*.py'))
    assert len(python_files) > 0, "No python files found in agents directory to check"

    for py_file in python_files:
        check_file_for_banned_imports(py_file)

if __name__ == "__main__":
    test_structural_safety_no_banned_imports()
    print("PASS: Structural safety verified — 0 banned execution/DB imports in AI agents.")
