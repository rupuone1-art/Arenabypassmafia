---
name: office-xlsx
description: Generate, edit, validate, and inspect Excel .xlsx workbooks, including formulas, charts, and formatting.
---

# Office XLSX Skill

Use this skill whenever the user wants to create or modify an Excel workbook.

## Responsibilities

- Create `.xlsx` files from scratch
- Add sheets, rows, tables, and formulas
- Apply headers and formatting
- Add basic charts when requested
- Validate workbook structure and formula behavior

## Preferred tools

- `openpyxl`
- `pandas`
- `matplotlib` for chart generation if needed
- `LibreOffice` for formula recalculation and validation

## Workflow

1. Determine the workbook structure and sheet names.
2. Create the workbook with clear header rows.
3. Insert formulas only when appropriate and ensure they are valid.
4. Add formatting for readability.
5. Validate the workbook and confirm it saves correctly.

## Good practices

- Freeze the header row when useful.
- Use clear titles and consistent column names.
- Keep formulas explicit and understandable.
- Do not create invalid references.
- Save generated files under `outputs/`.

## Validation

When formulas are present, attempt to recalculate or render via LibreOffice.

```bash
soffice --headless --convert-to pdf output.xlsx
```

For workbook validation, check the file exists and can be opened by a compatible library.

## Example prompt

> Create a Q1 sales workbook with month, units, revenue, and a chart.
