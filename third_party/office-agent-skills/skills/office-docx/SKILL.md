---
name: office-docx
description: Generate, edit, validate, and review Microsoft Word .docx files using local Python and document tooling.
---

# Office DOCX Skill

Use this skill whenever the user wants to create, edit, or inspect a Word document.

## Responsibilities

- Create `.docx` files from scratch
- Edit existing `.docx` documents
- Preserve basic structure and formatting
- Validate file integrity before declaring completion

## Preferred tools

Use the project environment Python first:

- Linux/macOS: `.venv/bin/python`
- Windows: `.venv\Scripts\python.exe`

Preferred libraries:
- `python-docx`
- `docx` (Node.js package for more direct document generation)
- `pandoc` for conversion and content extraction
- `LibreOffice` for rendering and validation

## Workflow

1. Determine whether the user wants a new file or an edit to an existing file.
2. Build the document using Python or Node.js, depending on the task.
3. For unsupported advanced formatting, prefer a simpler, valid document structure.
4. Validate the `.docx` output by rendering to PDF or checking the file exists.
5. If editing XML or inner OOXML files, do so carefully and keep the package structure valid.

## Good practices

- Use headings and paragraphs intentionally.
- Use consistent fonts and spacing.
- Keep the document well-structured and readable.
- Avoid overwriting source files without user confirmation.
- Save outputs inside an `outputs/` folder.

## Validation

When relevant:

```bash
soffice --headless --convert-to pdf output.docx
```

or

```bash
pandoc -t markdown output.docx
```

Use these checks to confirm the file is valid and readable.

## Example prompt

> Create a 2-page Word report with title, summary, bullet list, and table.
