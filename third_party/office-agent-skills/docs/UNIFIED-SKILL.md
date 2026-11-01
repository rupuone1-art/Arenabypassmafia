# Unified skill installation

The repository now provides one combined skill:

```text
skills/office-agent/SKILL.md
```

It replaces the need to install the separate office skill folders for Antigravity users.

## Antigravity global skill installation

Copy the unified skill into Antigravity's global skills directory:

```bash
mkdir -p ~/.gemini/skills/office-agent
cp skills/office-agent/SKILL.md ~/.gemini/skills/office-agent/SKILL.md
```

If your Antigravity installation uses a different skills directory, copy the same `SKILL.md` into that directory instead.

The skill is only the agent instruction. The document libraries and system tools remain in the repository virtual environment. Keep the repository at a stable path and set the path in the skill if it differs from:

```text
/Ubuntu/Git/office-agent-skills
```

The runtime interpreter is:

```text
/Ubuntu/Git/office-agent-skills/.venv/bin/python
```

After copying the skill, restart or reload Antigravity so it indexes the new skill.

## Recommended layout

```text
~/.gemini/skills/office-agent/SKILL.md
/Ubuntu/Git/office-agent-skills/.venv/
/Ubuntu/Git/office-agent-skills/scripts/
/Ubuntu/Git/office-agent-skills/styles/
/Ubuntu/Git/office-agent-skills/templates/
```

Do not copy only the skill and delete the repository: the skill references the repository scripts, themes, templates, and virtual environment.

## Test prompt

```text
Use the office-agent skill. Create outputs/test/report.docx with a title,
summary, bullet list, and table. Use the office-agent-skills virtual environment,
validate the output, and report the exact path.
```
