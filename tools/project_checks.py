from __future__ import annotations

import argparse
import compileall
import os
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "apps" / "web"


def _bin(name: str) -> str:
    if os.name == "nt":
        return f"{name}.cmd"
    return name


def run_python_checks() -> bool:
    print("== Python compile checks ==")
    targets = [
        ROOT / "admin.py",
        ROOT / "apps" / "api",
        ROOT / "tools",
    ]
    ok = True
    for target in targets:
        print(f"Checking {target}")
        if target.is_dir():
            ok = compileall.compile_dir(str(target), quiet=1) and ok
        elif target.is_file():
            ok = compileall.compile_file(str(target), quiet=1) and ok
    return ok


def run_command(label: str, command: list[str], cwd: Path) -> bool:
    print(f"== {label} ==")
    print("$", " ".join(command))
    completed = subprocess.run(command, cwd=str(cwd), check=False)
    return completed.returncode == 0


def run_web_checks() -> bool:
    npm_cmd = _bin("npm")
    npx_cmd = _bin("npx")
    if shutil.which(npm_cmd) is None or shutil.which(npx_cmd) is None:
        print("Node.js tooling is not available on this machine.")
        return False

    ok = run_command("Web lint", [npm_cmd, "run", "lint"], WEB_DIR)
    ok = run_command("TypeScript", [npx_cmd, "tsc", "--noEmit"], WEB_DIR) and ok
    return ok


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-python", action="store_true")
    parser.add_argument("--skip-web", action="store_true")
    args = parser.parse_args()

    ok = True
    if not args.skip_python:
        ok = run_python_checks() and ok
    if not args.skip_web:
        ok = run_web_checks() and ok

    print("== Summary ==")
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
