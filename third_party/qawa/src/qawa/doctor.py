# -*- coding: utf-8 -*-
"""Environment check.

Answers one question: will qawa actually work here? Separates what qawa needs
(Python 3.9+, its own files) from what only the *upstream* Superpowers repo needs
for its own development (rsync, yq, gh, shellcheck, shfmt). Conflating the two
makes a healthy install look broken.
"""
from __future__ import annotations

import os
import platform
import shutil
import sys

from . import index as index_mod
from . import paths
from . import state as state_mod

__all__ = ["run", "checks", "notices"]

REQUIRED_PYTHON = (3, 9)

# Tooling the upstream repo wants for *its* test suite, not for qawa to run.
UPSTREAM_TOOLS = ("rsync", "yq", "gh", "shellcheck", "shfmt")


def checks() -> list:
    """Every check as (label, ok, detail)."""
    root = paths.root()
    results = []

    results.append(("Python " + ".".join(str(v) for v in REQUIRED_PYTHON) + "+",
                    sys.version_info >= REQUIRED_PYTHON,
                    platform.python_version()))

    idx_path = paths.index_path()
    results.append(("فهرس المهارات _index.json", idx_path.is_file(), str(idx_path)))

    try:
        idx = index_mod.load_index()
        results.append(("تحميل الفهرس", True, f"{len(idx.routable)} مهارة قابلة للتوجيه"))
        missing = [s.name for s in idx.routable if not s.exists()]
        results.append(("ملفات المهارات موجودة", not missing,
                        "كلها موجودة" if not missing else f"ناقصة: {missing}"))
    except index_mod.IndexError as exc:
        results.append(("تحميل الفهرس", False, str(exc)))

    # Not being inside a project is a normal state, not a defect: you extract
    # qawa and run `doctor` before `init` exists. Only a project that exists but
    # is unusable is a failure, so the absence is reported as informational.
    root = paths.find_project_root()
    if root is None:
        results.append(("جذر المشروع", None, "غير مُهيَّأ (اختياري) — شغّل: qawa init"))
    else:
        results.append(("جذر المشروع", True, str(root)))

        # The ledger is the file that must never be lost, so check the
        # conditions it actually needs: a writable home, and a readable file.
        # (`state_file.parent.is_dir() or True` used to stand here — a check
        # that could never fail is worse than no check at all, because it
        # reports health while hiding the problem.)
        state_file = paths.state_path()
        ledger_dir = state_file.parent
        if ledger_dir.is_dir():
            can_write = os.access(str(ledger_dir), os.W_OK)
            results.append((
                "مجلد السجل قابل للكتابة", can_write,
                str(ledger_dir) if can_write else f"{ledger_dir} — صلاحية الكتابة مفقودة",
            ))
        else:
            can_create = os.access(str(ledger_dir.parent), os.W_OK)
            results.append((
                "مجلد السجل قابل للإنشاء", can_create,
                str(ledger_dir) if can_create else f"{ledger_dir} — لا يمكن إنشاؤه",
            ))

        if state_file.is_file():
            try:
                entries = state_mod.ledger(str(state_file))
                results.append(("قراءة السجل", True, f"{len(entries)} مدخلاً"))
            except Exception as exc:  # a corrupt ledger must be reported, not raised
                results.append(("قراءة السجل", False, f"تعذّر التحليل: {exc}"))

    results.append(("git", bool(shutil.which("git")), shutil.which("git") or "غير مثبت"))

    return results


def notices() -> list:
    """Generated files that are missing. Recoverable, so not a failure."""
    out = []
    router = paths.bootstrap_dir() / "ROUTER.md"
    if not router.is_file():
        out.append(f"الموجّه {router} غير موجود — شغّل: qawa gen")
    return out


def run(out=print, err=print) -> int:
    out(f"qawa doctor — الجذر: {paths.root()}")
    out("")

    rows = checks()
    width = max(len(label) for label, _, _ in rows)
    failed = 0
    for label, ok, detail in rows:
        mark = "OK  " if ok else (" -- " if ok is None else "FAIL")
        out(f"  [{mark}] {label:<{width}}  {detail}")
        if ok is False:
            failed += 1

    out("")
    out("أدوات يحتاجها مستودع Superpowers الأم لتطويره (لا يحتاجها qawa للتشغيل):")
    for tool in UPSTREAM_TOOLS:
        where = shutil.which(tool)
        out(f"  [{'OK  ' if where else ' -- '}] {tool:<{width}}  {where or 'غير مثبت (اختياري)'}")

    missing = notices()
    if missing:
        out("")
        out("تنبيهات (غير قاتلة):")
        for line in missing:
            out(f"  [!] {line}")

    if failed:
        out("")
        out(f"النتيجة: {failed} فحص فاشل — عالجها قبل الاستعمال.")
    else:
        out("")
        out("النتيجة: كل الفحوص الأساسية ناجحة.")
    return 1 if failed else 0
