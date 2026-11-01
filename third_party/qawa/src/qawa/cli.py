# -*- coding: utf-8 -*-
"""The `qawa` command line.

One entry point, no subcommands that need a running service, and no network.
Every command prints something a human can paste into an agent chat or read in a
terminal. Failure is loud: non-zero exit plus a message, never an empty success.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from . import __version__, doctor as doctor_mod
from . import index as index_mod
from . import paths
from . import brief as brief_mod
from . import render as render_mod
from . import state as state_mod
from .router import route, route_all

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_USAGE = 2
EXIT_SECRETS = 3   # اشتباه في أسرار — رمز مميّز ليمكن التعامل معه برمجياً
EXIT_NO_PROJECT = 1

MODES = state_mod.MODES


def _out(text: str = "") -> None:
    print(text)


def _err(text: str) -> None:
    print(text, file=sys.stderr)


def _load():
    try:
        return index_mod.load_index()
    except index_mod.IndexError as exc:
        _err(f"خطأ في فهرس المهارات: {exc}")
        raise SystemExit(EXIT_ERROR)


# --------------------------------------------------------------------------- #
# commands
# --------------------------------------------------------------------------- #
def cmd_boot(args) -> int:
    """The one line that replaces Superpowers' SessionStart hook.

    Works with or without an initialised project: the whole point of `boot` is
    to print a line you can paste anywhere, and requiring a project first would
    make it useless in exactly the place it is meant to help. The mode simply
    falls back to `fast` when no ledger exists yet.
    """
    try:
        mode = args.mode or state_mod.get_mode()
    except (state_mod.NoProjectError, OSError):
        mode = "fast"
    router = paths.bootstrap_dir() / "ROUTER.md"
    line = f"اقرأ {router} ونفّذ ما يلزم. الوضع: {mode.upper()}"
    _out(line)
    return EXIT_OK


def cmd_route(args) -> int:
    idx = _load()
    text = " ".join(args.text)
    if args.all:
        results = route_all(text, idx)
        if not results:
            results = [route(text, idx)]
        for r in results:
            _out(str(r))
        return EXIT_OK
    r = route(text, idx)
    _out(str(r))
    if args.path:
        _out(r.path)
    return EXIT_OK


def cmd_use(args) -> int:
    idx = _load()
    if not idx.has(args.name):
        _err(f"لا توجد مهارة باسم {args.name!r}.")
        suggestions = idx.search(args.name)
        if suggestions:
            _err("هل تقصد: " + ", ".join(suggestions) + "؟")
        _err("جرّب: qawa skills")
        return EXIT_USAGE
    skill = idx.get(args.name)
    _out(str(skill.path_obj) if args.path else skill.path_obj.read_text(encoding="utf-8"))
    return EXIT_OK


def cmd_skills(args) -> int:
    idx = _load()
    width = max(len(s.name) for s in idx.skills)
    _out("المهارات المتاحة:")
    for s in idx.routable:
        _out(f"  {s.name:<{width}}  {s.summary}")
    if args.all:
        _out("")
        _out("معزولة — تحتاج أداة subagent غير موجودة في هذه البيئة:")
        for item in idx.unavailable:
            _out(f"  {item.get('name', '?'):<{width}}  {item.get('reason', '')}")
    return EXIT_OK


def cmd_mode(args) -> int:
    if args.mode is None:
        _out(state_mod.get_mode())
        return EXIT_OK
    try:
        _out(state_mod.set_mode(args.mode))
    except state_mod.NoProjectError as exc:
        _err(str(exc))
        return EXIT_NO_PROJECT
    except ValueError as exc:
        _err(str(exc))
        return EXIT_USAGE
    return EXIT_OK


def cmd_state(args) -> int:
    try:
        state_mod.path()
    except state_mod.NoProjectError as exc:
        _err(str(exc))
        return EXIT_NO_PROJECT
    _out(state_mod.read())
    return EXIT_OK


def cmd_note(args) -> int:
    text = " ".join(args.text).strip()
    if not text:
        _err("note يحتاج نصاً: qawa note \"Task 3: complete\"")
        return EXIT_USAGE
    try:
        state_mod.note(text)
    except state_mod.NoProjectError as exc:
        _err(str(exc))
        return EXIT_NO_PROJECT
    _out("✓ أُضيف للسجل")
    return EXIT_OK


def cmd_reset(args) -> int:
    try:
        target = state_mod.reset()
    except state_mod.NoProjectError as exc:
        _err(str(exc))
        return EXIT_NO_PROJECT
    _out(f"✓ أُعيدت تهيئة السجل: {target}")
    return EXIT_OK


def cmd_brief(args) -> int:
    """استخرج مهمة واحدة من خطة إلى ملف — مصدر المتطلبات الوحيد."""
    try:
        out = brief_mod.write_brief(args.plan, args.number, out_dir=args.out or ".")
    except brief_mod.BriefError as exc:
        _err(str(exc))
        return EXIT_ERROR
    _out(str(Path(out).resolve()))
    return EXIT_OK


def cmd_review(args) -> int:
    """حزمة مراجعة (commits + stat + diff) كملف — لا تدخل سياقك."""
    try:
        if getattr(args, "inspect", False) and not args.base:
            _err("--inspect يحتاج نطاقاً: qawa review <base> <head> --inspect")
            return EXIT_USAGE
        out = brief_mod.write_review_package(
            args.base, args.head, out_dir=args.out,
            force=args.force, redact=args.redact,
            max_bytes=args.max_bytes, inspect=getattr(args, "inspect", False),
        )
    except brief_mod.SecretsFound as exc:
        _err(str(exc))
        if getattr(args, "inspect", False):
            _err(brief_mod.findings_report(exc.findings))
        else:
            _err("لمشاهدة ما طابق: أضف --inspect")
        _err(brief_mod._PROBABILISTIC_WARNING)
        _err("احتمالاتك: --redact (يحجب ما طابق) | --inspect (يراجع) | "
             "--force (تأكيد صريح بمسؤوليتك)")
        return EXIT_SECRETS           # 3 — المشرف يستطيع التعامل معه برمجياً
    except brief_mod.BriefError as exc:
        _err(str(exc))
        return EXIT_ERROR
    _out(str(Path(out).resolve()))
    return EXIT_OK


def cmd_init(args) -> int:
    """هيّئ مشروعاً: .qawa/، AGENTS.md، مجلدات التوثيق، إضافات .gitignore."""
    try:
        created = init_project(args.dir)
    except OSError as exc:
        _err(f"تعذّر التهيئة: {exc}")
        return EXIT_ERROR
    for item in created:
        _out(f"✓ {item}")
    _out("")
    _out("الخطوة التالية: qawa boot")
    return EXIT_OK


def cmd_gen(args) -> int:
    """توليد ROUTER.md / BOOTSTRAP.md / AGENTS.md من الفهرس."""
    idx = _load()
    if args.check:
        stale = render_mod.stale_generated(idx)
        if not stale:
            _out("✓ كل الملفات المولَّدة محدَّثة: " + "، ".join(
                render_mod.expected_files(idx)))
            return EXIT_OK
        for label in stale:
            _err(f"الملف المولَّد قديم أو مفقود: {label}")
        _err("شغّل: qawa gen")
        return EXIT_ERROR

    written = render_mod.write_all(idx)
    for label, path in written.items():
        _out(f"✓ {label:<10} {path}")
    return EXIT_OK


def cmd_doctor(args) -> int:
    return doctor_mod.run(out=_out, err=_err)


def cmd_version(args) -> int:
    _out(f"qawa {__version__}")
    return EXIT_OK


def init_project(target) -> list:
    """Create the per-project scaffolding. Idempotent: safe to run twice."""
    root = Path(target).expanduser().resolve()
    if not root.is_dir():
        raise OSError(f"المجلد غير موجود: {root}")

    created = []
    for rel in (".qawa", "docs/superpowers/specs", "docs/superpowers/plans"):
        d = root / rel
        if not d.is_dir():
            d.mkdir(parents=True)
            created.append(f"{rel}/")

    state_file = root / ".qawa" / "STATE.md"
    if not state_file.exists():
        state_file.parent.mkdir(parents=True, exist_ok=True)
        state_file.write_text(state_mod._HEADER.format(mode=state_mod.DEFAULT_MODE),
                              encoding="utf-8")
        created.append(".qawa/STATE.md")

    router_src = paths.bootstrap_dir() / "ROUTER.md"
    router_dst = root / ".qawa" / "ROUTER.md"
    if router_src.is_file() and not router_dst.exists():
        router_dst.parent.mkdir(parents=True, exist_ok=True)
        router_dst.write_text(router_src.read_text(encoding="utf-8"), encoding="utf-8")
        created.append(".qawa/ROUTER.md")

    agents = root / "AGENTS.md"
    if not agents.exists():
        agents.write_text(render_mod.render_agents(index_mod.load_index()),
                          encoding="utf-8")
        created.append("AGENTS.md")

    gitignore = root / ".gitignore"
    entries = [".qawa/", ".worktrees/", "__pycache__/", "*.pyc"]
    existing = gitignore.read_text(encoding="utf-8").splitlines() if gitignore.is_file() else []
    missing = [e for e in entries if e not in existing]
    if missing:
        prefix = "" if not existing or existing[-1] == "" else "\n"
        gitignore.write_text(
            "\n".join(existing) + prefix + "\n".join(missing) + "\n", encoding="utf-8")
        created.append(f".gitignore (+{len(missing)})")

    return created


# --------------------------------------------------------------------------- #
# parser
# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="qawa",
        description="qawa (قوى) — منهجية Superpowers بلا hooks ولا Skill tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "البدء السريع:\n"
            "  qawa boot                 سطر واحد تلصقه أول كل جلسة\n"
            "  qawa route \"أضف ميزة\"      أي مهارة تنطبق؟\n"
            "  qawa use brainstorming    اقرأ المهارة\n"
            "  qawa note \"Task 1: done\"  سجّل التقدّم بعد كل مهمة\n"
            "  qawa gen                 أعد توليد ROUTER.md بعد تعديل الفهرس\n"
        ),
    )
    p.add_argument("--version", action="version", version=f"qawa {__version__}")
    sub = p.add_subparsers(dest="command")

    sp = sub.add_parser("boot", help="سطر البداية (بديل الـ SessionStart hook)")
    sp.add_argument("--mode", choices=MODES, help="تجاوز الوضع المحفوظ")
    sp.set_defaults(func=cmd_boot)

    sp = sub.add_parser("route", help="أي مهارة تنطبق على هذا الطلب؟")
    sp.add_argument("text", nargs="+")
    sp.add_argument("--path", action="store_true", help="اطبع مسار ملف المهارة")
    sp.add_argument("--all", action="store_true", help="اعرض كل المرشحين مرتّبين")
    sp.set_defaults(func=cmd_route)

    sp = sub.add_parser("use", help="اطبع محتوى مهارة")
    sp.add_argument("name")
    sp.add_argument("--path", action="store_true", help="المسار فقط")
    sp.set_defaults(func=cmd_use)

    sp = sub.add_parser("skills", help="فهرس المهارات")
    sp.add_argument("--all", action="store_true", help="أضف المعزولة")
    sp.set_defaults(func=cmd_skills)

    sp = sub.add_parser("mode", help=f"الوضع ({'/'.join(MODES)})")
    sp.add_argument("mode", nargs="?", choices=MODES)
    sp.set_defaults(func=cmd_mode)

    sp = sub.add_parser("state", help="اطبع السجل")
    sp.set_defaults(func=cmd_state)

    sp = sub.add_parser("note", help="أضف سطراً للسجل")
    sp.add_argument("text", nargs="*")
    sp.set_defaults(func=cmd_note)

    sp = sub.add_parser("reset", help="أعد تهيئة السجل")
    sp.set_defaults(func=cmd_reset)

    sp = sub.add_parser("brief", help="استخرج مهمة من خطة إلى ملف")
    sp.add_argument("plan")
    sp.add_argument("number", type=int)
    sp.add_argument("--out", help="مجلد الإخراج")
    sp.set_defaults(func=cmd_brief)

    sp = sub.add_parser("review", help="حزمة مراجعة لنطاق commits")
    sp.add_argument("base")
    sp.add_argument("head", nargs="?", default="HEAD")
    sp.add_argument("--out", help="مجلد الإخراج")
    sp.add_argument("--redact", action="store_true",
                    help="احجب ما طابقته أنماط الأسرار بدل منع الحزمة")
    sp.add_argument("--inspect", action="store_true",
                    help="اعرض ما طابق قبل الكتابة (مراجعة بشرية)")
    sp.add_argument("--max-bytes", type=int,
                    default=brief_mod.DEFAULT_MAX_BYTES,
                    help="حد حجم الحزمة (افتراضي 512KiB)؛ 0 = بلا حد")
    sp.add_argument("--force", action="store_true",
                    help="تأكيد صريح: اكتب الحزمة رغم الاشتباه")
    sp.set_defaults(func=cmd_review)

    sp = sub.add_parser("init", help="هيّئ مشروعاً لاستخدام qawa")
    sp.add_argument("dir", nargs="?", default=".")
    sp.set_defaults(func=cmd_init)

    sp = sub.add_parser("gen", help="ولّد ملفات الوكيل من الفهرس")
    sp.add_argument("--check", action="store_true",
                    help="تحقّق فقط: هل الموجّه محدّث؟")
    sp.set_defaults(func=cmd_gen)

    sp = sub.add_parser("doctor", help="فحص البيئة والتبعيات")
    sp.set_defaults(func=cmd_doctor)

    sp = sub.add_parser("version", help="رقم الإصدار")
    sp.set_defaults(func=cmd_version)

    return p


def main(argv=None) -> int:
    if sys.version_info >= (3, 7):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError, OSError):
            pass

    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:  # argparse exits on --help and on bad usage
        return int(exc.code or 0)

    if not getattr(args, "command", None):
        parser.print_help()
        return EXIT_OK

    try:
        return args.func(args)
    except SystemExit as exc:
        return int(exc.code or 0)
    except BrokenPipeError:  # `qawa use x | head`
        return EXIT_OK
    except KeyboardInterrupt:
        _err("")
        return 130
