# -*- coding: utf-8 -*-
"""The ledger — qawa's memory across sessions.

A coding agent's conversation does not survive a new session, and does not
survive context compaction intact. Anything not written to a file is gone. So
the ledger is not bookkeeping, it is the recovery path: after an interruption
the agent reads this file and learns what already shipped.

Format is deliberately plain Markdown — readable by a human, editable by hand,
diffable in git, and cheap for an agent to parse:

    MODE: fast

    ## Ledger
    - [2026-10-30] Task 1: complete (commits fcb8619..71318d4, review clean)

Reading must never fail. A missing, empty, or corrupt ledger returns defaults
rather than raising — a tool that crashes while you are trying to recover is
worse than no tool.
"""
from __future__ import annotations

import contextlib
import os
import re
import time
from datetime import date
from pathlib import Path

from . import paths

__all__ = ["MODES", "DEFAULT_MODE", "get_mode", "set_mode", "note",
           "ledger", "reset", "path", "read", "NoProjectError"]

NO_PROJECT_HINT = (
    "لا يوجد مشروع مُهيَّأ هنا. شغّل:  qawa init .\n"
    "أو حدّد سجلاً صراحةً:  QAWA_STATE=/path/to/STATE.md"
)


class NoProjectError(Exception):
    """Raised when a write needs a ledger but no project root was found."""

MODES = ("fast", "full")
DEFAULT_MODE = "fast"

_HEADER = "# qawa state\n\nMODE: {mode}\n\n## Ledger\n"
_MODE_RE = re.compile(r"^MODE:\s*(\S+)\s*$", re.MULTILINE)
_LEDGER_RE = re.compile(r"^-\s*\[(\d{4}-\d{2}-\d{2})\]\s*(.*)$", re.MULTILINE)


def path(state_file=None) -> Path:
    """Which ledger file we are using. Raises NoProjectError if there is none."""
    if state_file:
        return Path(state_file)
    found = paths.state_path()
    if found is None:
        raise NoProjectError(NO_PROJECT_HINT)
    return Path(found)


def _read_text(target: Path) -> str:
    """Read the ledger, tolerating a missing or undecodable file."""
    try:
        return target.read_text(encoding="utf-8", errors="replace")
    except (FileNotFoundError, NotADirectoryError, IsADirectoryError, PermissionError):
        return ""


_LOCK_TIMEOUT = 10.0
_LOCK_RETRY = 0.02


def _try_flock(handle, deadline) -> bool:
    try:
        import fcntl
    except ImportError:
        return False
    while True:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except OSError:
            if time.monotonic() >= deadline:
                return False
            time.sleep(_LOCK_RETRY)


def _try_msvcrt(handle, deadline) -> bool:
    try:
        import msvcrt
    except ImportError:
        return False
    while True:
        try:
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            return True
        except OSError:
            if time.monotonic() >= deadline:
                return False
            time.sleep(_LOCK_RETRY)


def _try_exclusive_file(target: Path, deadline) -> bool:
    """Last resort for platforms with neither fcntl nor msvcrt.

    A lock file older than the timeout is treated as orphaned and removed —
    a process killed while holding the lock must not wedge qawa forever.
    """
    marker = target.with_name(target.name + ".excl")
    while True:
        try:
            fd = os.open(str(marker), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode())
            os.close(fd)
            return True
        except FileExistsError:
            try:
                age = time.time() - marker.stat().st_mtime
                if age > _LOCK_TIMEOUT:
                    marker.unlink(missing_ok=True)
                    continue
            except OSError:
                pass
            if time.monotonic() >= deadline:
                return False
            time.sleep(_LOCK_RETRY)
        except OSError:
            return False


def _release_exclusive_file(target: Path) -> None:
    try:
        target.with_name(target.name + ".excl").unlink()
    except OSError:
        pass


@contextlib.contextmanager
def _ledger_lock(target: Path):
    """Serialise writers to one ledger across processes.

    Reading, modifying and writing the ledger is not atomic on its own: two
    processes can both read the old text and each write their own version, and
    one entry silently disappears. Measured before this existed: 2 notes lost
    out of 30 concurrent appends.

    Three strategies, because the good one is platform-specific:
    `fcntl.flock` on POSIX, `msvcrt.locking` on Windows, and an exclusive
    marker file elsewhere. Imports are function-local on purpose — importing
    `fcntl` at module scope breaks Windows outright.

    Losing the lock degrades to unlocked writes. A dropped note is recoverable;
    a tool that refuses to record progress is not.
    """
    if os.environ.get("QAWA_NO_LOCK"):
        yield
        return

    lock_path = target.with_name(target.name + ".lock")
    deadline = time.monotonic() + _LOCK_TIMEOUT
    acquired = None
    try:
        with open(lock_path, "a+") as handle:
            for strategy in (_try_flock, _try_msvcrt):
                if strategy(handle, deadline):
                    acquired = strategy
                    break
            if acquired is None and _try_exclusive_file(target, deadline):
                acquired = _try_exclusive_file
            try:
                yield
            finally:
                if acquired is _try_exclusive_file:
                    _release_exclusive_file(target)
    except OSError:
        yield


def _atomic_write(target: Path, text: str) -> None:
    """Replace `target` with `text` atomically.

    The ledger is the one file that must never be lost, so it must not be
    written the naive way — `write_text` truncates first, and any interruption
    between truncation and the new bytes leaves a half-written history. Writing
    to a sibling temp file and renaming into place means a reader sees either
    the old file or the new one, never a mixture.

    `os.replace` is atomic on POSIX and Windows alike. The temp file is removed
    on every failure path, including a crash mid-write.
    """
    tmp = target.with_name(target.name + f".tmp{os.getpid()}")
    try:
        with open(tmp, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            try:
                os.fsync(handle.fileno())
            except OSError:  # not every filesystem supports fsync
                pass
        os.replace(tmp, target)
    except BaseException:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise


def _ensure_parent(target: Path) -> None:
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass


def get_mode(state_file=None) -> str:
    """The current mode, defaulting to `fast` when unset or unreadable."""
    text = _read_text(path(state_file))
    match = _MODE_RE.search(text)
    if not match:
        return DEFAULT_MODE
    value = match.group(1).strip().lower()
    return value if value in MODES else DEFAULT_MODE


def set_mode(mode: str, state_file=None) -> str:
    """Persist the mode, creating the ledger file if needed."""
    value = str(mode).strip().lower()
    if value not in MODES:
        raise ValueError(f"mode must be one of {MODES}, got {mode!r}")

    target = path(state_file)
    _ensure_parent(target)
    with _ledger_lock(target):
        text = _read_text(target)
        if _MODE_RE.search(text):
            new_text = _MODE_RE.sub(f"MODE: {value}", text, count=1)
        else:
            new_text = (text.rstrip() + "\n\n" if text.strip() else "") + f"MODE: {value}\n"
        _atomic_write(target, new_text)
    return value


def note(line: str, state_file=None) -> str:
    """Append a dated line to the ledger. Refuses blank entries."""
    content = str(line).strip()
    if not content:
        raise ValueError("note() needs a non-empty line")

    target = path(state_file)
    _ensure_parent(target)
    with _ledger_lock(target):
        text = _read_text(target)
        if not text.strip():
            text = _HEADER.format(mode=get_mode(target))
        elif not text.endswith("\n"):
            text += "\n"
        entry = f"- [{date.today().isoformat()}] {content}\n"
        _atomic_write(target, text + entry)
    return entry.strip()


def ledger(state_file=None) -> list:
    """Ledger entries, oldest first, without their dates."""
    text = _read_text(path(state_file))
    return [m.group(2).strip() for m in _LEDGER_RE.finditer(text) if m.group(2).strip()]


def reset(state_file=None) -> Path:
    """Start the ledger over, keeping `fast` as the mode."""
    target = path(state_file)
    _ensure_parent(target)
    _atomic_write(target, _HEADER.format(mode=DEFAULT_MODE))
    return target


def read(state_file=None) -> str:
    """The whole ledger file, or an explanation of why there isn't one."""
    try:
        target = path(state_file)
    except NoProjectError as exc:
        return str(exc)
    text = _read_text(target)
    return text if text.strip() else f"(لا يوجد سجل بعد — {target})"
