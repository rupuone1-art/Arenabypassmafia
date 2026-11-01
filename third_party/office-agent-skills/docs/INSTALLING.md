# Installing the office skills in agent CLIs

This repository supports multiple integration styles. The skills are portable instructions; the setup scripts install the local document-generation dependencies.

## Claude Code

From a Claude Code session, add the repository as a local plugin marketplace:

```text
/plugin marketplace add /absolute/path/to/office-agent-skills
```

Then install the plugin:

```text
/plugin install office-agent-skills@office-agent-skills-marketplace
```

For a GitHub checkout, use the repository URL or clone it first, depending on the Claude Code version you use. Restart the session after installation if the skills do not appear immediately.

The plugin manifest is in `.claude-plugin/plugin.json`, and the skills are in `skills/`.

## GitHub Copilot CLI

The repository includes a root `plugin.json` and a marketplace manifest for Copilot CLI.

Install from a local checkout:

```bash
copilot plugin install /absolute/path/to/office-agent-skills
copilot plugin list
```

Or register the GitHub repository as a marketplace and install the plugin using the marketplace name shown by your CLI:

```bash
copilot plugin marketplace add Harshuqt/office-agent-skills
copilot plugin marketplace list
copilot plugin marketplace browse office-agent-skills-marketplace
copilot plugin install office-agent-skills@office-agent-skills-marketplace
```

The exact marketplace command may depend on the Copilot CLI release. Run `copilot plugin --help` if a command differs.

## Codex and Antigravity

Use the portable project-local skill layout. Copy the skill directories into the agent project:

```bash
mkdir -p .agents/skills
cp -R skills/office-docx skills/office-xlsx skills/office-pptx skills/office-pdf .agents/skills/
```

On Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force .agents\skills | Out-Null
Copy-Item -Recurse skills\office-docx,skills\office-xlsx,skills\office-pptx,skills\office-pdf .agents\skills\
```

Open the destination project as the agent workspace. Keep `AGENTS.md` in the project root or copy its office-document rules into the workspace instructions.

## Install dependencies

Plugin installation registers instructions; it does not install Python, Node.js, LibreOffice, Pandoc, Poppler, or qpdf automatically. Run the platform setup script separately:

```bash
./scripts/setup-linux.sh   # Linux
./scripts/setup-macos.sh   # macOS
```

Windows PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\setup-windows.ps1
```

Always review setup scripts before executing them. They install packages and may use `sudo` or `winget`.

## What plugins do

A plugin is a distributable package of agent components. In this project, it packages the four office skills and metadata so a compatible CLI can discover and install them. The plugin does not replace the document libraries and does not itself provide an MCP server.

## Updating

After changing a local plugin checkout, reinstall it because compatible CLIs may cache plugin components:

```bash
copilot plugin install /absolute/path/to/office-agent-skills
```

For Claude Code, reinstall or update the plugin through its plugin commands.

## Security and permissions

Do not make a plugin silently execute arbitrary commands from user documents. Dependency installation should remain an explicit user action. Agents should write outputs only to approved workspaces and should validate generated files before returning them.
