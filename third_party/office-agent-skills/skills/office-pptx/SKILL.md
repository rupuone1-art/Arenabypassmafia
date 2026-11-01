---
name: office-pptx
description: Generate, edit, validate, and inspect PowerPoint .pptx decks and presentation templates.
---

# Office PPTX Skill

Use this skill whenever the user wants to create or modify a presentation.

## Responsibilities

- Create `.pptx` presentations
- Add slides, titles, bullets, charts, and images
- Build simple decks from templates or from scratch
- Validate output before declaring success

## Preferred tools

- `pptxgenjs` (Node.js)
- `python-pptx` if needed
- `LibreOffice` for rendering and conversion
- `markitdown` or simple extraction for inspection

## Workflow

1. Determine slide count and layout.
2. Create slide content with a clear narrative flow.
3. Add design elements such as charts, icons, and simple color themes.
4. Validate final deck with a render or conversion step.
5. Save outputs in `outputs/`.

## Good practices

- Use simple layout structures.
- Keep titles readable and visually distinct.
- Use consistent spacing and alignment.
- Avoid overly complex or invalid XML structures.
- Validate slides before final output.

## Validation

When relevant:

```bash
soffice --headless --convert-to pdf output.pptx
```

or render slides to images after conversion.

## Example prompt

> Create a 5-slide company roadmap presentation with a title slide, metrics, timeline, and summary.
