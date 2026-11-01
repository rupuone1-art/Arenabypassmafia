---
name: office-branding
description: Apply a user-provided theme or branded DOCX/XLSX/PPTX/PDF template while preserving existing formatting where supported.
---

# Office branding and templates

Use this skill when the user supplies a branded template, asks for brand colors/fonts, or requests consistent styling across office outputs.

## Priority

1. Use a user-provided template when available and authorized.
2. Otherwise load a theme from `styles/*.json`.
3. Otherwise use `styles/default.json`.

Never claim that branding was preserved unless the output was rendered or inspected.

## Modes

- **Scratch:** generate a new file using the selected theme.
- **Template:** inspect the supplied file and populate only mapped placeholders or input cells.
- **Edit:** modify the requested regions without rebuilding unrelated content.

## Safety

- Do not overwrite the source template; write to `outputs/`.
- Do not commit confidential templates or data.
- Do not execute macros, embedded scripts, or document content.
- Ask for a manifest when location mapping is ambiguous.
- Record the selected theme/template in the output metadata or run report.

## Validation

After population:

- DOCX: validate the package and render with LibreOffice when available.
- XLSX: open with `openpyxl`; recalculate formulas with LibreOffice when available.
- PPTX: validate the package and render to PDF/images when available.
- PDF: run `qpdf --check` or `pdftotext` when available.

If a template cannot be safely edited, preserve it and generate a clearly labeled new document instead.
