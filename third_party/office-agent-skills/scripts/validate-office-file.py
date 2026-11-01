#!/usr/bin/env python3
"""Basic format-aware validation without requiring every optional system tool."""
import argparse
import sys
import zipfile
from pathlib import Path


def validate_zip_office(path: Path, required_parts):
    if not zipfile.is_zipfile(path):
        raise ValueError("file is not a valid OOXML ZIP package")
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        missing = [part for part in required_parts if part not in names]
        if missing:
            raise ValueError("missing package parts: " + ", ".join(missing))


def main():
    parser = argparse.ArgumentParser(description="Validate an office artifact")
    parser.add_argument("file")
    args = parser.parse_args()
    path = Path(args.file)
    if not path.is_file():
        print(f"ERROR: file does not exist: {path}", file=sys.stderr)
        return 2
    suffix = path.suffix.lower()
    try:
        if suffix == ".docx":
            validate_zip_office(path, ["[Content_Types].xml", "word/document.xml"])
        elif suffix == ".xlsx":
            validate_zip_office(path, ["[Content_Types].xml", "xl/workbook.xml"])
        elif suffix == ".pptx":
            validate_zip_office(path, ["[Content_Types].xml", "ppt/presentation.xml"])
        elif suffix == ".pdf":
            data = path.read_bytes()
            if not data.startswith(b"%PDF-"):
                raise ValueError("missing PDF header")
            if b"%%EOF" not in data[-2048:]:
                raise ValueError("missing PDF EOF marker")
        else:
            raise ValueError(f"unsupported extension: {suffix}")
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"INVALID: {path}: {exc}", file=sys.stderr)
        return 1
    print(f"VALID: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
