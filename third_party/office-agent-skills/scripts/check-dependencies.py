#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def which(name):
    return shutil.which(name) is not None


def command_output(cmd):
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
        return out.strip()
    except Exception:
        return ""


def check_tool(name):
    return {"name": name, "available": which(name)}


def main():
    tools = [
        "python3",
        "python",
        "node",
        "npm",
        "soffice",
        "pandoc",
        "pdftoppm",
        "pdftotext",
        "qpdf",
        "git",
    ]

    results = [check_tool(t) for t in tools]
    for item in results:
        print(f"{item['name']}: {'OK' if item['available'] else 'MISSING'}")

    print("\nDetected Python env:")
    if (ROOT / ".venv").exists():
        if os.name == "nt":
            py = ROOT / ".venv" / "Scripts" / "python.exe"
        else:
            py = ROOT / ".venv" / "bin" / "python"
        print(py)
    else:
        print("No .venv created yet")

    print("\nIf something is missing, install it with the platform setup script.")


if __name__ == "__main__":
    main()
