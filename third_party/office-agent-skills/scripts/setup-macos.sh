#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Install Python 3 from https://www.python.org/downloads/" >&2
  exit 1
fi

if command -v brew >/dev/null 2>&1; then
  # Homebrew exits non-zero when a package is already installed, so install
  # each dependency only when its command is not already available.
  command -v soffice >/dev/null 2>&1 || brew install --cask libreoffice
  command -v pandoc >/dev/null 2>&1 || brew install pandoc
  command -v pdftoppm >/dev/null 2>&1 || brew install poppler
  command -v qpdf >/dev/null 2>&1 || brew install qpdf
else
  echo "Homebrew is recommended: https://brew.sh/"
  echo "Install LibreOffice, Pandoc, Poppler, and qpdf manually if they are unavailable."
fi

python3 scripts/setup.py
python3 scripts/check-dependencies.py
