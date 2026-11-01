# Styling and branded templates

The toolkit supports three generation modes:

1. **Scratch:** create a new file using a theme in `styles/`.
2. **Template:** populate a user-owned DOCX/XLSX/PPTX/PDF template.
3. **Edit:** change selected content while preserving unrelated formatting.

Use `skills/office-branding/SKILL.md` for routing and safety rules.

## Themes

Themes are JSON files so every supported runtime can read them without an extra YAML dependency. Copy `styles/default.json` and change colors, fonts, page size, and spreadsheet settings.

## DOCX placeholder example

Create a template containing `{{company_name}}`, then run:

```bash
.venv/bin/python scripts/replace-docx-placeholders.py \
  templates/report.docx \
  outputs/report.docx \
  --value company_name="Example Corporation" \
  --value report_date="2026-09-22"
```

The first implementation handles body paragraphs and table-cell paragraphs. It does not yet safely rewrite headers, footers, text boxes, or every placeholder split across Word runs; render and inspect the result.

## XLSX cell mapping example

Create `data.json`:

```json
{"Inputs!B2": "Example Corporation", "Inputs!B3": "2026-09-22"}
```

Then run:

```bash
.venv/bin/python scripts/populate-xlsx-template.py \
  templates/budget.xlsx data.json outputs/budget.xlsx
```

The script preserves `.xlsm` VBA content when loading with `keep_vba=True`, but always test macros and formulas in the target Office application.

## PPTX and PDF templates

PPTX template population should use an explicit, format-specific implementation and render every slide. PDF templates should preferably be fillable forms or use a controlled overlay. Do not blindly replace arbitrary PDF text.

Never commit confidential templates, logos, customer data, or credentials.
