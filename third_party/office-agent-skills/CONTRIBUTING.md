# Development

The project intentionally keeps the core implementation dependency-light and platform-neutral.

## Local checks

```bash
python scripts/check-dependencies.py
python examples/office_report_demo.py --output-dir outputs/demo
python scripts/validate-office-file.py outputs/demo/report.docx
python scripts/validate-office-file.py outputs/demo/report.xlsx
python scripts/validate-office-file.py outputs/demo/report.pdf
```

## Contribution rules

- Keep skill instructions original and vendor-neutral.
- Do not add proprietary skill files or copied vendor documentation.
- Keep setup instructions valid on Linux, macOS, and Windows.
- Add a validation step for new output formats.
- Avoid executing arbitrary shell commands from user-provided document content.
- Update `NOTICE` and third-party documentation when dependencies change.
