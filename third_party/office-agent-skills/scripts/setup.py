#!/usr/bin/env python3
import platform
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENV = ROOT / ".venv"


def run(cmd, cwd=None):
    printable = " ".join(map(str, cmd))
    print(f"$ {printable}")
    subprocess.run([str(x) for x in cmd], cwd=cwd, check=True)


def detect_python():
    for candidate in (shutil.which("python3"), shutil.which("python"), sys.executable):
        if candidate:
            return candidate
    raise RuntimeError("No Python interpreter found on PATH.")


def ensure_venv(python_bin):
    if not VENV.exists():
        run([python_bin, "-m", "venv", VENV])


def venv_python():
    return VENV / ("Scripts/python.exe" if platform.system() == "Windows" else "bin/python")


def install_requirements():
    py = venv_python()
    run([py, "-m", "pip", "install", "--upgrade", "pip"])
    # The project is intentionally an empty Python package: its useful contents
    # are skills and scripts. Installing editable still installs pyproject.toml
    # dependencies without setuptools discovering skills/styles as packages.
    run([py, "-m", "pip", "install", "-e", ROOT])
    print(f"Using environment interpreter: {py}")
    run([py, "-m", "pip", "--version"])


def ensure_node_packages():
    if shutil.which("npm") is None:
        print("Node.js/npm not found; PPTX/DOCX Node workflows will be unavailable.")
        return
    run(["npm", "install"], cwd=ROOT)


def main():
    print("Preparing project environment for office-agent-skills")
    ensure_venv(detect_python())
    install_requirements()
    ensure_node_packages()
    print(f"Environment ready. Python: {venv_python()}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"Setup failed: {exc}", file=sys.stderr)
        sys.exit(1)
