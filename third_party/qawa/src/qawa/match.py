# -*- coding: utf-8 -*-
"""Normalization + tokenization used by qawa's router.

The router has to match Arabic keywords against Arabic user input. Arabic
spelling is not stable: diacritics appear and disappear, and alef/ya/ta have
several interchangeable shapes. Matching raw text would miss most of it, so
everything is folded to one canonical form first.

Folding is deliberately lossy and one-directional — it exists only to compare
text. It is never used to rewrite what the user sees.
"""
from __future__ import annotations

import re
import unicodedata

__all__ = ["normalize", "tokenize"]

# Diacritics are dropped outright; tatweel (kashida) is pure visual padding.
_DROP = set("ًٌٍَُِّْٰـؘؙؐؑؒؓؔؕؖؗ")

# Letters folded onto a canonical base so variant spellings compare equal.
_FOLD = {
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",      # alef with hamza / madda / wasla
    "ى": "ي",                                     # alef maqsura -> ya
    "ة": "ه",                                     # ta marbuta -> ha
    "ؤ": "و",                                     # hamza on waw
    "ئ": "ي",                                     # hamza on ya
    "ء": "ا",                                     # bare hamza -> alef
    "ڤ": "ف", "ک": "ك", "گ": "ك", "ي": "ي",
}

# Arabic-Indic and Extended Arabic-Indic digits -> ASCII.
_DIGITS = {
    **{chr(0x0660 + i): str(i) for i in range(10)},   # ٠١٢…
    **{chr(0x06F0 + i): str(i) for i in range(10)},   # ۰۱۲… (Persian/Urdu)
}

_TABLE = {ord(ch): None for ch in _DROP}
_TABLE.update({ord(k): v for k, v in _FOLD.items()})
_TABLE.update({ord(k): v for k, v in _DIGITS.items()})

# Split on anything that is not a letter, digit, underscore or dash.
_SPLIT = re.compile(r"[^\w\-]+", re.UNICODE)


def normalize(text: str) -> str:
    """Fold `text` to a canonical comparison form.

    Removes diacritics and tatweel, unifies Arabic letter variants and digits,
    strips non-spacing marks, lowercases Latin, and collapses whitespace.
    """
    if not isinstance(text, str):
        raise TypeError(f"normalize() expects str, got {type(text).__name__}")

    # NFKC first so presentation forms (e.g. ﻻ) become ordinary sequences.
    folded = unicodedata.normalize("NFKC", text).translate(_TABLE)
    # Drop any remaining combining marks the table did not cover.
    folded = "".join(ch for ch in folded if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", folded).strip().lower()


def tokenize(text: str) -> list:
    """Split `text` into normalized, non-empty tokens."""
    if not isinstance(text, str):
        raise TypeError(f"tokenize() expects str, got {type(text).__name__}")
    return [tok for tok in _SPLIT.split(normalize(text)) if tok]
