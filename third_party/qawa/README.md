<p align="center">
  <strong>🌐 Languages:</strong>
  <a href="README.md"><strong>English</strong></a> •
  <a href="README.ar.md">العربية</a> •
  <a href="README.fr.md">Français</a> •
  <a href="README.es.md">Español</a>
</p>

# qawa — قوى

**The [Superpowers](https://github.com/obra/superpowers) methodology, without the harness it assumes.**

Superpowers is an excellent skill library: TDD, design-before-code, review, verification. But its entire machinery hangs on three host features — a `SessionStart` hook, a `Skill` tool, and `subagent` tools. Many environments (including **Arena.ai Agent Mode**) have none of them, so the tool goes silent: nothing triggers it, nothing reminds the agent of it.

**qawa keeps the methodology and replaces the machinery with things that exist everywhere: plain files, one line a human can paste, and a CLI.**

```console
$ qawa boot
Read /path/to/qawa/bootstrap/ROUTER.md and do what's needed. Mode: FAST
```

That's all you need. Paste that line at the start of every session, the agent reads the router and loads the right skill.

---

## Why qawa, not Superpowers as-is?

|  | Superpowers on Claude Code | Superpowers on Arena | **qawa** |
|---|---|---|---|
| Auto-triggered | ✅ `SessionStart` hook | ❌ No hooks | ⚠️ One line from you |
| Load one skill | ✅ `Skill` tool | ❌ | ✅ `qawa use` |
| Independent review per task | ✅ subagent | ❌ | ❌ (declared self-review) |
| Memory across sessions | ⚠️ via `compact` | ❌ | ✅ File-based ledger |
| Startup cost | ~3k tokens | ~35k tokens (load all) | **~1.4k tokens** |
| Dependencies | Host-dependent | Host-dependent | **Python 3.9+ only** |

Router: **1,425 tokens** vs **28,859** for loading all skills — **20× savings** (measured 68× in production: 1.1k vs 75k).

---

## Installation

No installation needed. Copy the folder and run:

```bash
git clone https://github.com/supermorkat/qawa-arena.git qawa
cd qawa && ./qawa version
```

Or add to your PATH:

```bash
export PATH="$PATH:/path/to/qawa"
qawa doctor
```

**Only requirement: Python 3.9+.** No `pip install`, no dependencies, no network.

Check your environment:

```bash
qawa doctor
# [OK] Python 3.9+ — 3.13.16
# [OK] Skill index _index.json
# [OK] Skill files exist
# [OK] git
```

---

## Usage

```bash
qawa boot                      # The line you paste at the start of every session
qawa route "add favorites feature"  # Which skill applies?
qawa use brainstorming          # Read the skill
qawa skills --all               # Index (+ unavailable)
qawa note "Task 3: complete"    # Log progress after each task
qawa state                      # Where are we?
qawa mode full                  # Switch mode
qawa brief plan.md 3            # Extract one task to a file
qawa review HEAD~3 HEAD         # Review package (commits+stat+diff) as a file
qawa init ./my-project          # Bootstrap a project
qawa gen                        # Regenerate agent files after index edit
qawa doctor                     # Environment check
```

### In your project

```bash
qawa init ./my-project     # Creates .qawa/, AGENTS.md, docs/, .gitignore entries
```

`AGENTS.md` at the project root is the safety net: even if you forget to mention qawa, the agent sees it and reads the rules.

### Two modes

|  | `FAST` (default) | `FULL` |
|---|---|---|
| For | Small change, prototype, script | Feature, project, team repo |
| Path | TDD + verification only | Design → worktree → plan → execute → review → finish |

**Auto-upgrade:** If the work grows, the agent stops, says so, and switches to `FULL`.

---

## The Ledger — Most Important Habit

Memory across sessions is **files only**. Update the ledger after each task, not at the end:

```bash
qawa note "Task 3: complete (commits fcb8619..832591b, review clean)"
qawa note "Ruling: Numbers are normalized by default — searching ٢٠٢٦ must find 2026"
```

Without a ledger, any interruption (new session, context compaction) means **redoing completed work** — the most expensive known failure, documented by Superpowers itself.

---

## Architecture

```
qawa/
├── qawa                    # Entry point — no install needed
├── src/qawa/
│   ├── match.py            # Arabic/Latin normalization for matching
│   ├── index.py            # Reads & validates skills/_index.json
│   ├── router.py           # Weighted matching (replaces Skill tool)
│   ├── state.py            # Crash-resistant ledger
│   ├── render.py           # Generates ROUTER/BOOTSTRAP/AGENTS
│   ├── brief.py            # Task brief + review package
│   ├── doctor.py           # Environment check
│   └── cli.py
├── skills/                 # Verbatim Superpowers skills (MIT)
│   └── _index.json         # qawa data: keywords & weights ← source of truth
├── skills-unavailable/     # Skills needing subagent (intentionally isolated)
├── bootstrap/              # ROUTER.md, BOOTSTRAP.md  ← generated
├── AGENTS.md               # ← generated
├── templates/              # Design & plan templates
└── tests/                  # 347 tests
```

**Governing design rule:** Original skills in `skills/` are **never modified**. All overrides stay in `skills/_index.json` and `bootstrap/ROUTER.md`. Updating from upstream = re-copy `skills/` then `qawa gen`.

### How routing works

| Keyword type | Rule | Why |
|---|---|---|
| Arabic | Substring of normalized text | Morphology prevents exact word match |
| Multi-word (`does not work`) | Substring of normalized text | Normalization unifies spaces |
| Latin (≥4 chars) | Exact word or prefix | `test` finds `tests` |
| Latin (<4 chars) | Exact match only | `add` must not fire inside `address` |

No match at all → default `brainstorming` with `score = 0`. Starting from intent is always safe.

---

## Development

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -t .     # 347 tests
PYTHONPATH=src python3 -m coverage run --source=src/qawa -m unittest discover -s tests -t .
python3 -m coverage report -m                                  # 95%
```

This project was built with the methodology it carries: design → plan → TDD (red-green-refactor) → review → finish. Docs in `docs/`.

Two real bugs TDD caught during construction:

1. **Wrong test expectation** — wrote `normalize("  أضف ميزة  ") == "اضف ميزة"` but taa marbuta folds to haa. The test was cementing the bug, not the code.
2. **`is_current` compared only timestamp** — any manual edit to ROUTER.md would survive `qawa gen` then vanish on next generation. Now compares full file.

---

## Platform Support

| Area | Method | Status |
|---|---|---|
| Ledger locking | `fcntl.flock` on POSIX, `msvcrt.locking` on Windows, `O_CREAT|O_EXCL` marker fallback | Designed; tested on Linux |
| Atomic write | Sibling temp file + `os.replace` | Tested on Linux; atomic on both platforms |
| Path containment | `Path.resolve()` then `os.path.normcase` | Tested on Linux; designed for Windows |
| Conditional imports | `fcntl`/`msvcrt` inside functions, not at module level | Verified |
| File encoding | Explicit `encoding="utf-8"` everywhere | Tested |

See [`docs/PLATFORM_SUPPORT.md`](docs/PLATFORM_SUPPORT.md) for full details and known gaps.

---

## Limitations — What qawa does NOT do

- **No parallel review.** `subagent-driven-development` (independent reviewer per task) is isolated in `skills-unavailable/` because it needs the subagent tool. The alternative here is a **declared** self-review, not a silent one. For true independent review, use Claude Code.
- **Nothing runs automatically.** No hooks in these environments. The first line is on you.
- **Visual companion is manual.** The preview server doesn't auto-appear in cloud environments; the alternative is a static HTML file. To prevent logo loading from upstream: `SUPERPOWERS_DISABLE_TELEMETRY=1`.

---

## Verified for Agent Arena

Tested in Arena.ai Agent Mode (Python 3.13, Linux):

- **347 tests passed** (2 skipped — Windows-only)
- **Router:** ~1.1k tokens vs ~75k for all skills (68× savings)
- **Ledger:** Concurrent writes preserved, atomic writes, no data loss
- **Security:** Path containment + secret scanning in review packages
- **Arabic:** Full normalization (diacritics, alef variants, taa marbuta)

See the [full test report](docs/PLATFORM_SUPPORT.md) for details.

---

## License

- **qawa**: MIT — see [`LICENSE`](LICENSE).
- **`skills/` & `skills-unavailable/`**: Verbatim copy of [obra/superpowers](https://github.com/obra/superpowers) by Jesse Vincent and Prime Radiant, also MIT. Intentionally unmodified.

---

> **qawa** = قوى (Arabic for "powers"). Same word, no assumptions about the host.
