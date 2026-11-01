# -*- coding: utf-8 -*-
"""Where qawa keeps its files.

Everything resolves relative to the package root, so `qawa` works from any
directory and from any copy of the checkout — no install step, no cwd guessing.
"""
from __future__ import annotations

import os
from pathlib import Path

__all__ = [
    "root", "skills_dir", "unavailable_dir", "index_path", "bootstrap_dir",
    "templates_dir", "state_path", "set_state_path", "find_project_root",
]

# src/qawa/paths.py -> parents[0]=qawa(pkg), [1]=src, [2]=<root>
_ROOT = Path(__file__).resolve().parents[2]

# Overridable so tests and `qawa init` can point elsewhere.
_STATE_OVERRIDE = os.environ.get("QAWA_STATE")


def root() -> Path:
    """The qawa checkout root (the directory containing skills/ and qawa)."""
    return _ROOT


def skills_dir() -> Path:
    return _ROOT / "skills"


def unavailable_dir() -> Path:
    return _ROOT / "skills-unavailable"


def index_path() -> Path:
    return skills_dir() / "_index.json"


def bootstrap_dir() -> Path:
    return _ROOT / "bootstrap"


def templates_dir() -> Path:
    return _ROOT / "templates"


def find_project_root(start=None):
    """The directory that owns the current work: nearest ancestor holding
    `.qawa/` or `.git`, searching upward from `start` (default: cwd).

    Returns None when neither marker exists. The search stops at the home
    directory on the way up, so a stray marker deep in a home tree cannot
    silently claim unrelated work.
    """
    here = Path(start).resolve() if start else Path.cwd().resolve()
    home = Path.home().resolve()

    for candidate in (here, *here.parents):
        if (candidate / ".qawa").is_dir() or (candidate / ".git").exists():
            return candidate
        if candidate == home or candidate == candidate.parent:
            break
    return None


def state_path():
    """The ledger for the current project, or None when there is no project.

    There is deliberately no global fallback. Two un-initialised directories
    used to resolve to the same shared ledger inside the qawa checkout, which
    quietly interleaved the progress of unrelated projects — the exact loss the
    ledger exists to prevent. Requiring `qawa init` is louder, and honest.

    None is a signal, not an error: callers decide whether to fail loudly
    (write commands) or explain gently (`qawa state`).
    """
    if _STATE_OVERRIDE:
        return Path(_STATE_OVERRIDE)
    root = find_project_root()
    if root is None:
        return None
    return root / ".qawa" / "STATE.md"


def set_state_path(path) -> Path:
    """Point the ledger somewhere specific (`qawa init`, tests).

    Passing None clears the override and returns to the normal lookup.
    """
    global _STATE_OVERRIDE
    if path is None:
        _STATE_OVERRIDE = None
        os.environ.pop("QAWA_STATE", None)
        return None
    _STATE_OVERRIDE = str(Path(path).expanduser().resolve())
    return Path(_STATE_OVERRIDE)
