---
name: office-pdf
description: Create, combine, split, read, and validate PDF files with headless local tooling.
---

# Office PDF Skill

Use this skill whenever the user wants to work with PDF files.

## Responsibilities

- Create PDF files from text or HTML
- Merge or split PDFs
- Extract text and tables from PDFs
- Validate PDF output before success

## Preferred tools

- `reportlab`
- `pypdf`
- `pdfplumber`
- `weasyprint` for HTML-based PDF generation
- `qpdf` or Poppler tools for validation and conversion

## Workflow

1. Determine whether the user wants to create, merge, split, or extract from a PDF.
2. Use the appropriate library for the task.
3. Validate the output PDF is readable and structurally valid.
4. Save output in a project `outputs/` folder.

## Good practices

- Keep page sizes consistent and intentional.
- Use PDF generation libraries that are stable and available.
- Avoid overwriting user-provided PDFs without confirmation.
- For forms or scanned documents, validate with OCR or extraction as required.

## Validation

```bash
pdftotext input.pdf -
```

or

```bash
qpdf --check input.pdf
```

If the PDF was generated from HTML or text, render and inspect it where necessary.

## Example prompt

> Generate a clean one-page invoice PDF with company name, line items, and totals.
