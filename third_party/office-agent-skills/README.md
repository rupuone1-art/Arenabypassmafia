# Office Agent Skills

The recommended Antigravity integration is now a single unified skill:

```text
skills/office-agent/SKILL.md
```

Install it globally:

```bash
mkdir -p ~/.gemini/skills/office-agent
cp skills/office-agent/SKILL.md ~/.gemini/skills/office-agent/SKILL.md
```

Keep the repository and its virtual environment at:

```text
/Ubuntu/Git/office-agent-skills
```

The skill uses:

```text
/Ubuntu/Git/office-agent-skills/.venv/bin/python
```

For another location, edit the runtime path in the copied skill or tell the agent the actual repository root. The repository itself remains necessary because the skill calls its scripts and reads its styles/templates.

The separate skills remain available for agents that prefer per-format routing, but they are no longer required for the unified Antigravity setup.
