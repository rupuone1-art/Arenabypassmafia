# -*- coding: utf-8 -*-
"""Task briefs and review packages.

Two things a coordinating agent keeps needing, and keeps getting wrong:

* A **brief** is one task's text, handed to an implementer as its only source of
  requirements. Handing over the whole plan instead is how a subagent ends up
  reading 42k characters of history to find the 30 lines it needs.
* A **review package** is the diff for a range, as a file. Passing a diff as a
  file keeps it out of the coordinator's context — the reviewer reads it in one
  go and the coordinator never pays for it.

Both are written to disk rather than printed, for exactly that reason.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

__all__ = ["BriefError", "SecretsFound", "extract_task", "count_tasks",
           "write_brief", "review_package", "write_review_package",
           "scan_secrets", "findings_report", "SECRET_PATTERNS",
           "DEFAULT_MAX_BYTES"]

DEFAULT_MAX_BYTES = 512 * 1024

# Heuristic patterns for well-known credential shapes. This list reduces risk;
# it cannot remove it. An unfamiliar secret format will not match, which is why
# the package always carries a warning and `qawa review --inspect` exists.
SECRET_PATTERNS = (
    ("aws-access-key",     re.compile(r"AKIA[0-9A-Z]{16}")),
    ("openai-key",         re.compile(r"sk-[A-Za-z0-9]{20,}")),
    ("github-token",       re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}")),
    ("slack-token",        re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    ("private-key",        re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("assignment",         re.compile(
        r"(?i)\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)"
        r"\s*[:=]\s*['\"]?[^'\"\s]{8,}")),
    ("connection-string",  re.compile(
        r"\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)://"
        r"[^\s:@/]+:[^\s@]+@")),
)

_PROBABILISTIC_WARNING_SEPARATOR = "-" * 72
_PROBABILISTIC_WARNING = (
    "⚠️  فحص الأسرار احتمالي: يطابق أنماطاً معروفة فقط، ولا يضمن عدم وجود أسرار.\n"
    "    راجع الحزمة بصرياً قبل مشاركتها:  qawa review <base> <head> --inspect"
)


class BriefError(Exception):
    """Raised for a bad plan file, a missing task, or a failed git call."""


class SecretsFound(BriefError):
    """Raised when a review package looks like it carries credentials."""

    def __init__(self, findings):
        self.findings = findings
        names = sorted({name for name, _ in findings})
        super().__init__(
            f"اشتباه في أسرار داخل الحزمة: {names}. "
            f"راجعها أو استخدم --redact، أو أكّد بـ --force إن كنت واثقاً."
        )


def scan_secrets(text: str) -> list:
    """`(pattern_name, matched_text)` for every suspicious hit."""
    if not isinstance(text, str):
        raise TypeError(f"scan_secrets() expects str, got {type(text).__name__}")
    found = []
    for name, pattern in SECRET_PATTERNS:
        for m in pattern.finditer(text):
            found.append((name, m.group(0)[:120]))
    return found


def findings_report(findings, limit: int = 20) -> str:
    """Human-readable list of what matched — never the full value.

    Printing the match itself would leak the secret to the terminal and to
    shell history, so each hit is shown as pattern name plus a short mask.
    """
    if not findings:
        return ""
    lines = ["ما طابقته أنماط الأسرار (معروض جزئياً):"]
    seen = set()
    for name, matched in findings:
        key = (name, matched)
        if key in seen:
            continue
        seen.add(key)
        preview = matched[:4] + "…" + "*" * min(8, max(0, len(matched) - 4))
        lines.append(f"  • {name}: {preview}  (طول {len(matched)})")
        if len(lines) > limit:
            lines.append(f"  … و{len(seen) - limit} أكثر")
            break
    return "\n".join(lines)


def _redact(text: str) -> str:
    out = text
    for _name, pattern in SECRET_PATTERNS:
        out = pattern.sub(lambda m: m.group(0).split(" ")[0][:0] + "‹REDACTED›", out)
    return out

# "### Task 3: name" — the hashes are captured so we know the heading level,
# and the number is what we key on.
_TASK_RE = re.compile(r"^\s*(#{2,6})\s*Task\s+(\d+)\s*[:.\-]?\s*(.*)$", re.MULTILINE)
# Any heading, with its level, so we can compare it against the task's.
_HEADING_RE = re.compile(r"^\s*(#{1,6})\s", re.MULTILINE)
# A horizontal rule (---, ***, ___) ends a task regardless of level.
_RULE_RE = re.compile(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$", re.MULTILINE)



def _read_plan(plan_file) -> str:
    p = Path(plan_file)
    if not p.is_file():
        raise BriefError(f"ملف الخطة غير موجود: {p}")
    return p.read_text(encoding="utf-8", errors="replace")


def count_tasks(plan_file) -> int:
    """How many tasks the plan defines."""
    text = _read_plan(plan_file)
    return len({int(m.group(2)) for m in _TASK_RE.finditer(text)})


def extract_task(plan_file, number: int) -> str:
    """Task `number`'s full text, heading included, stopping before the next task."""
    if not isinstance(number, int) or isinstance(number, bool):
        raise BriefError(f"رقم المهمة يجب أن يكون عدداً صحيحاً، حصلت على {number!r}")
    if number < 1:
        raise BriefError(f"رقم المهمة يجب أن يكون ≥ 1، حصلت على {number}")

    text = _read_plan(plan_file)
    matches = [m for m in _TASK_RE.finditer(text) if int(m.group(2)) == number]
    if not matches:
        available = sorted({int(m.group(2)) for m in _TASK_RE.finditer(text)})
        raise BriefError(
            f"المهمة {number} غير موجودة في {Path(plan_file).name}. "
            f"الموجودة: {available or 'لا شيء'}"
        )

    hit = matches[0]
    task_level = len(hit.group(1))
    start = hit.start()
    rest = text[hit.end():]

    # A task ends at the first heading at its own level or shallower — deeper
    # headings ("#### Implementation Details") are part of the task. Ending at
    # any heading at all silently truncated the task, which is worse than no
    # brief: the implementer cannot tell that anything is missing.
    boundaries = [m.start() for m in _HEADING_RE.finditer(rest)
                  if len(m.group(1)) <= task_level]
    boundaries += [m.start() for m in _RULE_RE.finditer(rest)]

    end = hit.end() + (min(boundaries) if boundaries else len(rest))
    return text[start:end].rstrip() + "\n"


def write_brief(plan_file, number: int, out_dir) -> str:
    """Write the task brief to `<out_dir>/task-<N>-brief.md` and return the path."""
    body = extract_task(plan_file, number)
    out = Path(out_dir) / f"task-{number}-brief.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(body, encoding="utf-8")
    return str(out)


def _git(repo: Path, *args) -> str:
    result = subprocess.run(["git", *args], cwd=str(repo), capture_output=True,
                            text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise BriefError(
            f"git {' '.join(args)} فشل في {repo}: "
            f"{(result.stderr or result.stdout).strip()}"
        )
    return result.stdout


def review_package(base: str, head: str, repo=None, redact: bool = False,
                   force: bool = False) -> str:
    """Build the package text. Raises SecretsFound unless force or redact.

    The gate lives here, not in the writer, because the package content is what
    carries the secret — any caller that renders one gets the same protection.
    """
    """Commit list + stat + full diff for `base..head`, as text."""
    repo = Path(repo) if repo else Path.cwd()
    if not (repo / ".git").exists():
        raise BriefError(f"ليس مستودع git: {repo}")

    log = _git(repo, "log", "--oneline", f"{base}..{head}")
    stat = _git(repo, "diff", "--stat", f"{base}..{head}")
    diff = _git(repo, "diff", "-U10", f"{base}..{head}")

    if redact:
        diff = _redact(diff)
    elif not force:
        findings = scan_secrets(diff)
        if findings:
            raise SecretsFound(findings)

    return "\n".join([
        f"# Review package: {base[:7]}..{head[:7]}",
        "",
        "## Commits",
        "",
        log.strip() or "(لا commits في هذا النطاق)",
        "",
        "## Diffstat",
        "",
        stat.strip() or "(لا تغييرات)",
        "",
        "## Diff (-U10)",
        "",
        "```diff",
        diff.rstrip(),
        "```",
        "",
    ])


def write_review_package(base: str, head: str, out_dir, repo=None,
                         force: bool = False, redact: bool = False,
                         max_bytes: int = DEFAULT_MAX_BYTES,
                         inspect: bool = False) -> str:
    """Write the review package to a uniquely named file and return its path.

    A diff is the whole change, which can include credentials. The scan is a
    safety net with known holes, so: suspicion blocks the write unless the user
    says `--force`, `--redact` blanks what matched, and the package always says
    out loud that the check is probabilistic. `--inspect` additionally reports
    what was found so a human can look before sharing.

    Raises SecretsFound when something matched and `force` is not set.
    """
    body = review_package(base, head, repo=repo, redact=redact, force=force)
    findings = [] if redact else scan_secrets(body)

    truncated = False
    encoded = body.encode("utf-8")
    if max_bytes and len(encoded) > max_bytes:
        body = encoded[:max_bytes].decode("utf-8", errors="ignore")
        body += ("\n\n[... الحزمة مقطوعة: تجاوزت الحد "
                 f"({max_bytes} بايت). راجع النطاق كاملاً بـ git diff ...]")
        truncated = True

    banner = _PROBABILISTIC_WARNING
    if findings:
        names = sorted({n for n, _ in findings})
        banner += "\n    أنماط طابقت: " + "، ".join(names)
    if truncated:
        banner += "\n    ⚠️  الحزمة مقطوعة بسبب حد الحجم."

    body = _PROBABILISTIC_WARNING_SEPARATOR + banner + "\n" + _PROBABILISTIC_WARNING_SEPARATOR + "\n\n" + body

    out = Path(out_dir) / f"review-{base[:7]}..{head[:7]}.diff"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(body, encoding="utf-8")
    return str(out)
