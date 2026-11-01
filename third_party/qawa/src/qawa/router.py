# -*- coding: utf-8 -*-
"""Pick the skill that applies to a request.

This is qawa's stand-in for the `Skill` tool: instead of a host feature that
lists skills and loads one, we score keywords and hand back a single file path.

Matching rules, in order of how much they matter:

* Arabic keywords are matched as **substrings** of the folded query. Arabic
  morphology means a keyword rarely arrives as a whole token.
* Multi-word keywords ("لا يعمل", "pull request") are **substrings** too —
  folding normalizes the spacing between words.
* Latin keywords match a **whole token**, or (when at least 4 characters) a
  token **prefix**. Prefix matching is why "test" finds "tests"; the 4-character
  floor is why "add" does not fire inside "address".

Scores are summed per skill. No match at all is not an error — it falls back to
the default skill with `score == 0`, because starting from intent is always safe.
"""
from __future__ import annotations

from dataclasses import dataclass

from . import paths
from .index import Skill, SkillIndex, load_index
from .match import normalize, tokenize

__all__ = ["RouteResult", "route", "route_all"]

_LATIN_PREFIX_FLOOR = 4


@dataclass(frozen=True)
class RouteResult:
    skill: str
    score: int
    path: str
    summary: str
    is_default: bool
    matched: tuple = ()

    @property
    def skill_obj(self):
        return self._skill

    def __str__(self) -> str:
        if self.is_default:
            return f"{self.skill} (افتراضي — لا كلمة مفتاحية مطابقة)"
        hits = ", ".join(self.matched)
        return f"{self.skill}  [score {self.score}: {hits}]"


def _score(skill: Skill, query: str, tokens: list) -> tuple:
    total = 0
    hits = []
    for kw, weight in skill.keywords.items():
        folded = normalize(kw)
        if not folded:
            continue
        hit = False
        if " " in folded or any("\u0600" <= ch <= "\u06ff" for ch in folded):
            hit = folded in query
        else:
            hit = any(
                t == folded
                or (len(folded) >= _LATIN_PREFIX_FLOOR and t.startswith(folded))
                for t in tokens
            )
        if hit:
            total += weight
            hits.append(kw)
    return total, tuple(hits)


def route_all(text: str, idx: SkillIndex = None) -> list:
    """Every routable skill with a non-zero score, best first."""
    idx = idx or load_index()
    query = normalize(text)
    tokens = tokenize(text)

    scored = []
    for skill in idx.routable:
        score, hits = _score(skill, query, tokens)
        if score:
            scored.append((score, skill, hits))

    # Highest score first; ties break on name so the answer never wobbles.
    scored.sort(key=lambda item: (-item[0], item[1].name))

    results = []
    for score, skill, hits in scored:
        r = RouteResult(
            skill=skill.name,
            score=score,
            path=str(skill.path_obj),
            summary=skill.summary,
            is_default=False,
            matched=hits,
        )
        object.__setattr__(r, "_skill", skill)
        results.append(r)
    return results


def route(text: str, idx: SkillIndex = None) -> RouteResult:
    """The single best skill for `text`, falling back to the default."""
    idx = idx or load_index()
    hits = route_all(text, idx)
    if hits:
        return hits[0]

    fallback = idx.get(idx.default_skill)
    result = RouteResult(
        skill=fallback.name,
        score=0,
        path=str(fallback.path_obj),
        summary=fallback.summary,
        is_default=True,
    )
    object.__setattr__(result, "_skill", fallback)
    return result


def _self_check() -> None:
    """`python -m qawa.router` — quick sanity printout."""
    import sys
    for sample in [
        "أضف ميزة المفضلة",
        "الكود يرمي exception وقت الـ deploy",
        "اكتب خطة لتقسيم الـ monolith",
        "تأكد أن الاختبارات فعلاً تمر",
        "مرحبا",
    ]:
        r = route(sample)
        print(f"{sample!r:45} -> {r}")


if __name__ == "__main__":  # pragma: no cover
    _self_check()
