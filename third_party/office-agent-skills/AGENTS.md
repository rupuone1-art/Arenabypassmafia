# Project Agent Instructions

Use `skills/office-agent/SKILL.md` as the primary unified office-document workflow.

It covers DOCX, XLSX, PPTX, PDF, themes, branded templates, rendering, and validation.

Use the separate format-specific skills only when a host agent explicitly requires them:

- `skills/office-docx/SKILL.md`
- `skills/office-xlsx/SKILL.md`
- `skills/office-pptx/SKILL.md`
- `skills/office-pdf/SKILL.md`

Always use the repository virtual environment:

- Linux/macOS: `.venv/bin/python`
- Windows: `.venv\\Scripts\\python.exe`

Never fall back silently to system Python. Save generated files under `outputs/`, never overwrite source templates, and validate outputs before reporting success.
