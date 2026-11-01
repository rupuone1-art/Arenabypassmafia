#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 is required." >&2
  exit 1
fi

# Install system packages when a supported package manager is available.
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y python3-venv libreoffice pandoc poppler-utils qpdf fonts-dejavu-core
elif command -v brew >/dev/null 2>&1; then
  brew install libreoffice pandoc poppler qpdf
else
  echo "Install LibreOffice, Pandoc, Poppler, and qpdf manually if needed."
fi

python3 scripts/setup.py
python3 scripts/check-dependencies.py
