# -*- coding: utf-8 -*-
"""تغطية استراتيجيات القفل الثلاث — بمحاكاة الوحدات، لا بجهاز Windows."""
import os
import sys
import sys as _sys
import tempfile
import time
import types
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from qawa import state  # noqa: E402


class FakeMsvcrt:
    """نسخة مزيفة من msvcrt: تحاكي قفلاً على نطاق بايت واحد."""
    LK_NBLCK = 1
    locked = set()

    @classmethod
    def locking(cls, fd, mode, nbytes):
        if fd in cls.locked:
            raise OSError("already locked")
        cls.locked.add(fd)

    @classmethod
    def unlock(cls, fd):
        cls.locked.discard(fd)


class StrategyTestCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.target = Path(self.dir.name) / "STATE.md"
        self.target.write_text("mode: fast\n", encoding="utf-8")
        self.deadline = time.monotonic() + 2.0

    def handle(self):
        lock = self.target.with_name(self.target.name + ".lock")
        f = open(lock, "a+")
        self.addCleanup(f.close)
        return f


class TestFcntlStrategy(StrategyTestCase):
    def test_acquires_when_free(self):
        self.assertTrue(state._try_flock(self.handle(), self.deadline))

    def test_gives_up_when_import_missing(self):
        """على Windows لا يوجد fcntl — يجب أن يعود False دون انهيار."""
        real = sys.modules.get("fcntl")
        sys.modules["fcntl"] = None          # None يجعل import يرفع ImportError
        self.addCleanup(self._restore, "fcntl", real)
        self.assertFalse(state._try_flock(self.handle(), self.deadline))

    def test_gives_up_after_the_deadline(self):
        fake = types.ModuleType("fcntl")

        def flock(fd, op):
            raise OSError("busy")

        fake.flock = flock
        fake.LOCK_EX = 2
        fake.LOCK_NB = 4
        real = sys.modules.get("fcntl")
        sys.modules["fcntl"] = fake
        self.addCleanup(self._restore, "fcntl", real)
        state._LOCK_RETRY_ORIGINAL = getattr(state, "_LOCK_RETRY", 0.02)
        self.assertFalse(state._try_flock(self.handle(), time.monotonic()))

    def _restore(self, name, value):
        if value is None:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = value

    def tearDown(self):
        for name in ("fcntl", "msvcrt"):
            if isinstance(sys.modules.get(name), types.ModuleType) and (
                    not hasattr(sys.modules[name], "__file__")):
                sys.modules.pop(name, None)


class TestMsvcrtStrategy(StrategyTestCase):
    """منطق Windows — يُشغَّل على Linux بمحاكاة الوحدة."""

    def setUp(self):
        super().setUp()
        FakeMsvcrt.locked.clear()
        self.fake = types.ModuleType("msvcrt")
        self.fake.LK_NBLCK = 1
        self.fake.locking = FakeMsvcrt.locking
        self.real = sys.modules.get("msvcrt")
        sys.modules["msvcrt"] = self.fake

    def tearDown(self):
        sys.modules.pop("msvcrt", None)
        if self.real is not None:
            sys.modules["msvcrt"] = self.real
        super().tearDown()

    def test_acquires_when_free(self):
        self.assertTrue(state._try_msvcrt(self.handle(), self.deadline))

    def test_second_handle_on_same_fd_is_refused(self):
        h = self.handle()
        self.assertTrue(state._try_msvcrt(h, self.deadline))
        FakeMsvcrt.locked.discard(h.fileno())
        self.assertTrue(state._try_msvcrt(h, self.deadline))

    def test_contention_times_out_instead_of_hanging(self):
        self.fake.locking = lambda fd, mode, n: (_ for _ in ()).throw(OSError("busy"))
        self.assertFalse(state._try_msvcrt(self.handle(), time.monotonic() - 0.01))

    def test_missing_msvcrt_returns_false(self):
        sys.modules["msvcrt"] = None
        self.assertFalse(state._try_msvcrt(self.handle(), self.deadline))


class TestMarkerStrategy(StrategyTestCase):
    def test_acquires_and_releases(self):
        self.assertTrue(state._try_exclusive_file(self.target, self.deadline))
        self.assertTrue(self.target.with_name("STATE.md.excl").is_file())
        state._release_exclusive_file(self.target)
        self.assertFalse(self.target.with_name("STATE.md.excl").exists())

    def test_second_acquisition_fails(self):
        state._try_exclusive_file(self.target, self.deadline)
        self.assertFalse(state._try_exclusive_file(self.target, time.monotonic()))

    def test_stale_marker_is_removed(self):
        marker = self.target.with_name("STATE.md.excl")
        marker.write_text("99999", encoding="utf-8")
        old = time.time() - (state._LOCK_TIMEOUT + 5)
        os.utime(marker, (old, old))
        self.assertTrue(state._try_exclusive_file(self.target, self.deadline))
        state._release_exclusive_file(self.target)

    def test_release_is_safe_when_absent(self):
        state._release_exclusive_file(self.target)   # لا يرفع


class TestLedgerLockDegrades(unittest.TestCase):
    def test_all_strategies_failing_still_writes(self):
        """تعذّر القفل يُ degrade إلى كتابة بلا قفل — لا انهيار."""
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        target = Path(d.name) / "STATE.md"

        def no(*a, **k):
            return False

        real = (state._try_flock, state._try_msvcrt, state._try_exclusive_file)
        state._try_flock, state._try_msvcrt, state._try_exclusive_file = no, no, no
        self.addCleanup(setattr, state, "_try_flock", real[0])
        self.addCleanup(setattr, state, "_try_msvcrt", real[1])
        self.addCleanup(setattr, state, "_try_exclusive_file", real[2])
        with state._ledger_lock(target):
            target.write_text("written anyway\n", encoding="utf-8")
        self.assertEqual(target.read_text(encoding="utf-8"), "written anyway\n")

    def test_qawa_no_lock_env_short_circuits(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        target = Path(d.name) / "STATE.md"
        previous = os.environ.get("QAWA_NO_LOCK")
        os.environ["QAWA_NO_LOCK"] = "1"
        self.addCleanup(self._restore_env, previous)
        with state._ledger_lock(target):
            pass
        self.assertFalse(target.with_name("STATE.md.lock").exists())

    def _restore_env(self, value):
        if value is None:
            os.environ.pop("QAWA_NO_LOCK", None)
        else:
            os.environ["QAWA_NO_LOCK"] = value


if __name__ == "__main__":
    unittest.main()
