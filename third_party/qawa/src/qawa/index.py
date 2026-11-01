# -*- coding: utf-8 -*-
"""The skill index: which skills exist, what they are for, how to find them.

The index is data (`skills/_index.json`), not code. That is deliberate: adding a
skill must never mean editing Python, and the router table and ROUTER.md are both
generated from this one file so they can never disagree.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from . import paths

__all__ = ["Skill", "SkillIndex", "IndexError", "load_index", "is_contained"]


def is_contained(candidate, root) -> bool:
    """True when `candidate` — after resolving symlinks — stays under `root`.

    `..` segments, absolute paths, and symlinks can all point outside the skills
    directory while still naming a file that exists. Existence is not safety: a
    crafted index could name `/etc/passwd` and `qawa use` would have printed it.
    Resolution happens before any read, and `normcase` is applied because
    Windows paths are case-insensitive.

    Accepts `str` or `Path` on either side: callers across the codebase hold
    both, and silently comparing a string against a Path is an easy mistake.
    """
    candidate = Path(candidate)
    root = Path(root)
    try:
        root_r = root.resolve()
        cand_r = candidate.resolve()
    except (OSError, RuntimeError):
        return False

    root_n = os.path.normcase(str(root_r))
    cand_n = os.path.normcase(str(cand_r))
    if cand_n == root_n:
        return True
    try:
        return os.path.normcase(str(cand_r)).startswith(root_n + os.sep)
    except (OSError, ValueError):
        return False

_ARABIC_RANGES = (
    ("\u0600", "\u06ff"),   # Arabic
    ("\u0750", "\u077f"),   # Arabic Supplement
    ("\ufb50", "\ufdff"),   # Arabic Presentation Forms-A
)


class IndexError(Exception):
    """Raised when the index file is missing, malformed, or inconsistent."""


def _is_arabic(text: str) -> bool:
    return any(lo <= ch <= hi for ch in text for lo, hi in _ARABIC_RANGES)


@dataclass(frozen=True)
class Skill:
    name: str
    path: str
    summary: str
    keywords: dict = field(default_factory=dict)
    routable: bool = True
    _skills_root: Path = field(default=None, compare=False, repr=False)

    @property
    def path_obj(self) -> Path:
        assert self._skills_root is not None, "Skill was built without a root"
        return self._skills_root / self.path

    def exists(self) -> bool:
        return self._skills_root is not None and self.path_obj.is_file()

    def arabic_keywords(self) -> list:
        return [k for k in self.keywords if _is_arabic(k)]

    def latin_keywords(self) -> list:
        return [k for k in self.keywords if not _is_arabic(k)]


@dataclass(frozen=True)
class SkillIndex:
    skills: tuple
    default_skill: str
    default_note: str = ""
    unavailable: tuple = ()
    version: int = 1

    @property
    def routable(self) -> list:
        return [s for s in self.skills if s.routable]

    def get(self, name: str) -> Skill:
        for s in self.skills:
            if s.name == name:
                return s
        raise IndexError(
            f"no skill named {name!r}. Known: "
            + ", ".join(sorted(s.name for s in self.skills))
        )

    def has(self, name: str) -> bool:
        return any(s.name == name for s in self.skills)

    def search(self, name: str) -> list:
        """Close matches, for 'did you mean?' on a typo."""
        import difflib
        names = [s.name for s in self.skills]
        return difflib.get_close_matches(name, names, n=3, cutoff=0.5)


def _text(entry: dict, field: str, label: str) -> str:
    """A required-or-optional string field, with the type checked explicitly.

    Checking types by hand rather than letting a TypeError escape matters here:
    a malformed index is the user's first and only diagnostic, and
    "unsupported operand type(s) for /" tells them nothing about which field
    in which JSON file is wrong.
    """
    value = entry.get(field)
    if value is None:
        raise IndexError(f"skill {label}: missing {field!r}")
    if isinstance(value, bool) or not isinstance(value, str):
        raise IndexError(
            f"skill {label}: {field!r} must be a string, got {type(value).__name__}"
        )
    if not value.strip():
        raise IndexError(f"skill {label}: {field!r} must not be empty")
    return value


def _build(entry: dict, skills_root: Path) -> Skill:
    if not isinstance(entry, dict):
        raise IndexError(
            f"each entry in 'skills' must be an object, got {type(entry).__name__}: {entry!r}"
        )

    # 'name' may not be known yet, so fall back to the position for the label.
    raw_name = entry.get("name")
    label = raw_name if isinstance(raw_name, str) and raw_name.strip() else "(unnamed)"

    name = _text(entry, "name", label)
    path = _text(entry, "path", name)

    summary = entry.get("summary", "")
    if summary is None:
        summary = ""
    if not isinstance(summary, str):
        raise IndexError(
            f"skill {name!r}: 'summary' must be a string, got {type(summary).__name__}"
        )

    routable = entry.get("routable", True)
    if not isinstance(routable, bool):
        raise IndexError(
            f"skill {name!r}: 'routable' must be true or false, got {type(routable).__name__}"
        )

    keywords = entry.get("keywords") or {}
    if not isinstance(keywords, dict):
        raise IndexError(
            f"skill {name!r}: 'keywords' must be an object, got {type(keywords).__name__}"
        )
    # bool is a subclass of int in Python, so `isinstance(True, int)` is True —
    # without the explicit exclusion a typo'd `true` becomes a silent weight of 1.
    def _bad_weight(v) -> bool:
        return isinstance(v, bool) or not isinstance(v, int) or v <= 0

    bad = sorted(k for k, v in keywords.items() if _bad_weight(v))
    if bad:
        raise IndexError(
            f"skill {name!r}: weights must be positive integers; "
            f"offending keywords: {bad}"
        )

    return Skill(
        name=name,
        path=path,
        summary=summary,
        keywords=keywords,
        routable=routable,
        _skills_root=skills_root,
    )


def load_index(index_file=None, skills_root=None) -> SkillIndex:
    """Read and validate skills/_index.json."""
    index_file = Path(index_file) if index_file else paths.index_path()
    skills_root = Path(skills_root) if skills_root else paths.skills_dir()

    if not index_file.is_file():
        raise IndexError(f"skill index not found: {index_file}")
    try:
        raw = json.loads(index_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise IndexError(f"{index_file} is not valid JSON: {exc}") from exc

    if not isinstance(raw, dict):
        raise IndexError(
            f"{index_file}: the index must be a JSON object, got {type(raw).__name__}"
        )

    entries = raw.get("skills")
    if not isinstance(entries, list) or not entries:
        raise IndexError(f"{index_file}: 'skills' must be a non-empty list")

    skills = [_build(e, skills_root) for e in entries]

    seen = set()
    for s in skills:
        if s.name in seen:
            raise IndexError(f"duplicate skill name in index: {s.name!r}")
        seen.add(s.name)

    default = raw.get("default") or {}
    default_skill = default.get("skill") or "brainstorming"
    if default_skill not in seen:
        raise IndexError(f"default skill {default_skill!r} is not in the index")

    escaping = sorted(
        s.name for s in skills
        if not is_contained(s.path_obj, skills_root)
    )
    if escaping:
        raise IndexError(
            f"skill paths escape the skills directory {skills_root}: {escaping}"
        )

    missing = sorted(s.name for s in skills if s.routable and not s.exists())
    if missing:
        raise IndexError(
            f"index names skills whose files are missing from {skills_root}: {missing}"
        )

    return SkillIndex(
        skills=tuple(skills),
        default_skill=default_skill,
        default_note=default.get("note", ""),
        unavailable=tuple(raw.get("unavailable") or ()),
        version=int(raw.get("version", 1)),
    )
