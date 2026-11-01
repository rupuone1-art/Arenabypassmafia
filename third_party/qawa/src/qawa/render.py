# -*- coding: utf-8 -*-
"""Generate the agent-facing files from the index.

ROUTER.md, BOOTSTRAP.md and AGENTS.md are **outputs**, not sources. They exist
because an agent reads Markdown more reliably than it runs a command, but they
are derived from `skills/_index.json` so the two can never drift.

`render.is_current()` lets `qawa gen --check` tell you when a hand-edit or an
index change has made the generated files stale.
"""
from __future__ import annotations

from pathlib import Path

from . import paths

__all__ = ["render_router", "render_bootstrap", "render_agents",
           "is_current", "write_all", "expected_files", "stale_generated"]

_STAMP_START = "<!-- qawa:generated"
_STAMP_END = "-->"


def _stamp(idx) -> str:
    names = ",".join(sorted(s.name for s in idx.skills))
    return f"{_STAMP_START} v{idx.version} skills={names} {_STAMP_END}"


def render_router(idx) -> str:
    """The file an agent reads instead of a Skill tool."""
    lines = [
        _stamp(idx),
        "",
        "# qawa — الموجّه (اقرأه، ثم حمّل المهارة المطلوبة فقط)",
        "",
        "> بديل أداة `Skill`. لا تقرأ كل المهارات — اقرأ هذا الملف، ثم ملف المهارة الواحدة",
        "> التي تنطبق. كل المهارات معاً ≈ 29 ألف توكن؛ هذا الملف ≈ 1.4 ألف.",
        "",
        "## ترتيب الأولوية",
        "",
        "عند التعارض، هذا هو الترتيب — ولا تتجاوزه مهارة:",
        "",
        "1. تعليمات المستخدم الصريحة",
        "2. قيود بيئة التنفيذ (لا subagent، لا Skill tool، لا شبكة)",
        "3. المهارة المنطبقة",
        "4. حكمك الهندسي",
        "",
        "## القاعدة (غير قابلة للتفاوض)",
        "",
        "**قبل أي إجراء** — بما فيه أسئلة التوضيح وقراءة الملفات — طابق الطلب مع",
        "الجدول أدناه واقرأ ملف المهارة.",
        "إن انطبقت مهارة **فعلاً**، فهي التزام ما دامت منطبقة — ثم قل:",
        "«استخدام مهارة X من أجل Y».",
        "",
        "لا تُخضع لمهارة: طلباً لا علاقة له بها، أو تغييراً أصغر من دورتها، أو",
        "أمراً صريحاً من المستخدم يعارضها.",
        "",
        "## الوضع (MODE)",
        "",
        "| | `FAST` (تغيير بسيط، نموذج، سكربت) | `FULL` (ميزة، مشروع، repo فريق) |",
        "|---|---|---|",
        "| 1 | — | `brainstorming` ← مستند تصميم |",
        "| 2 | — | `using-git-worktrees` |",
        "| 3 | — | `writing-plans` ← خطة مهام |",
        "| 4 | `test-driven-development` | `executing-plans` + `test-driven-development` |",
        "| 5 | `verification-before-completion` | `requesting-code-review` ثم `verification-before-completion` |",
        "| 6 | — | `finishing-a-development-branch` |",
        "",
        "**ترقية تلقائية:** إن اتضح أن العمل أكبر من المتوقع، توقّف، قل ذلك، وانتقل إلى `FULL`.",
        "",
        "## جدول المهارات",
        "",
        "| المهارة | متى تُستخدم | المسار |",
        "|---|---|---|",
    ]

    for s in idx.routable:
        lines.append(f"| `{s.name}` | {s.summary} | `{s.path}` |")

    lines += [
        "",
        "لا تعرف أيها ينطبق؟ شغّل: `qawa route \"<الطلب>\"`",
        "",
        "## فروق هذه البيئة عن Claude Code (مهم)",
        "",
        "1. **لا أداة subagent.** مهارات `subagent-driven-development` و",
        "   `dispatching-parallel-agents` معزولة في `skills-unavailable/` — لا تستعملها،",
        "   ولا تختلق إرسالاً لمهارة فرعية. البديل: `executing-plans` (تنفيذ داخلي).",
        "   عندما تطلب مهارة مراجعاً مستقلاً، اقرأ `executing-plans/code-reviewer.md`",
        "   ونفّذ المراجعة بنفسك، ثم سجّل: `Final review: self-review (no subagent tool)`.",
        "2. **لا أداة `Skill`.** حمّل المهارة بقراءة ملفها من المسار في الجدول أعلاه.",
        "3. **لا `TodoWrite`.** السجل في ملف هو الذاكرة. الذاكرة بين الجلسات = ملفات فقط.",
        "4. **كل جلسة جديدة تبدأ من الصفر.** اقرأ السجل (`.qawa/STATE.md`) أولاً إن وُجد.",
        "",
        "## السجل (الذاكرة العابرة للجلسات) — إلزامي",
        "",
        "حدّثه **بعد كل مهمة**، لا في النهاية: `qawa note \"<سطر>\"`.",
        "",
        "```",
        "Task <N>: complete (commits <base7>..<head7>, review clean)",
        "Ruling: <ما قررته> — <لماذا> — <تكلفته إن كان خطأ>",
        "```",
        "",
        "بدون سجل، أي انقطاع يعني إعادة تنفيذ عمل منجز. هذا أغلى فشل معروف.",
        "",
        "## بوابة «لا تكذب بالنجاح»",
        "",
        "- لا تقل «تم» قبل تشغيل أمر تحقّق حقيقي ورؤية نتيجته.",
        "- لا تكتب كوداً قبل اختبار فاشل (إلا سكربت تجريبي معلن أنه throwaway).",
        "- إن كتبت كوداً قبل اختباره: احذفه وابدأ من الاختبار.",
        "",
        "## الرفيق البصري (visual companion)",
        "",
        "يعمل، لكن المنفذ لا يظهر تلقائياً كمعاينة في البيئات السحابية. البديل الموثوق:",
        "ملف HTML ثابت داخل مساحة العمل. ولمنع تحميل الشعار من موقع المصدر:",
        "`SUPERPOWERS_DISABLE_TELEMETRY=1`.",
    ]
    return "\n".join(lines) + "\n"


def render_bootstrap(idx, router_path, mode: str = "fast") -> str:
    """The single line a human pastes at the start of a session."""
    return f"اقرأ {router_path} ونفّذ ما يلزم. الوضع: {str(mode).upper()}"


def render_agents(idx) -> str:
    """The AGENTS.md copy dropped into a project root."""
    names = ", ".join(f"`{s.name}`" for s in idx.routable)
    lines = [
        _stamp(idx),
        "",
        "# AGENTS.md — انسخ هذا الملف إلى جذر أي مشروع",
        "",
        "> حتى لو نسيتَ ذكر qawa في أول رسالة، الوكيل يرى هذا الملف في المشروع.",
        "",
        "## قبل أي إجراء",
        "",
        "حمّل المهارة المطابقة — الموجّه في `.qawa/ROUTER.md` داخل هذا المشروع",
        "(ينسخه `qawa init`)، أو اسأل qawa مباشرة:",
        "",
        "```",
        "qawa boot              # السطر الجاهز للصقه في المحادثة",
        "qawa route \"<الطلب>\"     # أي مهارة تنطبق؟",
        "qawa use <name>        # اقرأ المهارة",
        "```",
        "",
        "## ترتيب الأولوية",
        "",
        "1. تعليمات المستخدم الصريحة",
        "2. قيود بيئة التنفيذ (لا subagent، لا Skill tool، لا شبكة)",
        "3. المهارة المنطبقة",
        "4. حكمك الهندسي",
        "",
        "القاعدة: **مهارة منطبقة فعلاً = التزام ما دامت منطبقة** — قبل أسئلة التوضيح،",
        "ودون أن تتغلب على تعليمات المستخدم ولا على حكمك.",
        "",
        "## بيئة التنفيذ",
        "",
        "- لا أداة `Skill` → اقرأ ملف المهارة.",
        "- لا أداة subagent → نفّذ داخلياً عبر `executing-plans`. لا تختلق إرسالاً.",
        "- لا `TodoWrite` → السجل في `.qawa/STATE.md` هو الذاكرة.",
        "",
        "## الوضع",
        "",
        "`MODE: FAST` لتغيير بسيط (TDD + تحقق فقط).",
        "`MODE: FULL` لميزة (تصميم ← worktree ← خطة ← تنفيذ ← مراجعة ← إنهاء).",
        "رتّقِ تلقائياً من FAST إلى FULL إن كبر العمل.",
        "",
        "## اتفاقيات هذا المستودع",
        "",
        "- التصاميم: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`",
        "- الخطط: `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`",
        "- السجل وبيانات العمل: `.qawa/` (مضاف إلى `.gitignore`)",
        "- worktrees: `.worktrees/` (مضاف إلى `.gitignore`)",
        "",
        "## المهارات المتاحة",
        "",
        names,
        "",
        "## بوابة الجودة",
        "",
        "- لا كود بدون اختبار فاشل أولاً.",
        "- لا «تم» قبل تشغيل أمر تحقق حقيقي ورؤية النتيجة.",
        "- لا تدمج ولا تدفع دون طلب صريح.",
    ]
    return "\n".join(lines) + "\n"


def _bootstrap_file(idx, router_path) -> str:
    # Mode is deliberately not baked in: BOOTSTRAP.md is a generated file that
    # `gen --check` compares byte for byte, and the live mode changes as the
    # user works. `qawa boot` prints the line with the current mode instead.
    return (
        "# سطر واحد — الصقه في أول رسالة من كل جلسة\n\n"
        "في مشروع هيّأته بـ `qawa init`:\n\n```\n"
        f"{render_bootstrap(idx, router_path, 'fast')}\n```\n\n"
        "بدّل `FAST` إلى `FULL` عندما يتجاوز العمل «تغييراً بسيطاً».\n"
        "خارج مشروع مُهيَّأ، شغّل `qawa boot` ليطبع السطر بمسار مطلق صحيح.\n"
    )


def expected_files(idx, root=None) -> dict:
    """Every generated file as {label: (path, content)}.

    One source for both writing and checking, so `gen` and `gen --check` can
    never disagree about what "current" means.
    """
    from .index import load_index

    idx = idx or load_index()
    root = Path(root) if root else paths.root()
    boot = root / "bootstrap"
    router = boot / "ROUTER.md"
    return {
        "ROUTER.md": (router, render_router(idx)),
        "BOOTSTRAP.md": (boot / "BOOTSTRAP.md", _bootstrap_file(idx, ".qawa/ROUTER.md")),
        "AGENTS.md": (root / "AGENTS.md", render_agents(idx)),
    }


def stale_generated(idx=None, root=None) -> list:
    """Labels of generated files that are missing or hand-edited.

    Checking all three matters because together they are the agent's entire
    instruction set; verifying one while the other two drift gives the same
    false confidence as verifying none.
    """
    return [
        label for label, (path, content) in expected_files(idx, root).items()
        if not path.is_file()
        or path.read_text(encoding="utf-8", errors="replace") != content
    ]


def is_current(path, idx) -> bool:
    """True when `path` is byte-for-byte what the index generates now.

    Comparing the whole file, not just the stamp, is what catches a hand edit:
    someone fixes one line by hand, it survives the next `qawa gen`, and the fix
    silently disappears. An exact comparison refuses to bless that file.
    """
    p = Path(path)
    if not p.is_file():
        return False
    try:
        return p.read_text(encoding="utf-8") == render_router(idx)
    except OSError:
        return False


def write_all(idx=None, root=None) -> dict:
    """Write ROUTER.md, BOOTSTRAP.md and AGENTS.md. Returns {label: path}."""
    written = {}
    for label, (path, content) in expected_files(idx, root).items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        written[label] = path
    return written
