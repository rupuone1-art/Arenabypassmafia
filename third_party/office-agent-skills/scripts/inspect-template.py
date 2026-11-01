#!/usr/bin/env python3
"""Inspect basic OOXML package parts and list text-bearing files."""
import argparse
import zipfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file")
    args = parser.parse_args()
    path = Path(args.file)
    if not zipfile.is_zipfile(path):
        raise SystemExit(f"Not an OOXML template: {path}")
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        print(f"format: {path.suffix.lower()}")
        print(f"parts: {len(names)}")
        for name in names:
            if name.endswith((".xml", ".rels")) and any(x in name for x in ("document", "header", "footer", "sheet", "slide", "workbook")):
                print(name)


if __name__ == "__main__":
    main()
