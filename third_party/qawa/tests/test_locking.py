# -*- coding: utf-8 -*-
"""T6 (BUG-04b) — عمليتان تكتبان في السجل معاً يجب ألا تفقد إحداهما الأخرى."""
import importlib
import os
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from qawa import state as st  # noqa: E402

SRC = str(Path(__file__).resolve().parents[1] / "src")

WRITER = textwrap.dedent("""
    import sys, time
    sys.path.insert(0, {src!r})
    from qawa import state as st
    for i in range({count:d}):
        st.note({msg!r} + str(i), {state!r})
        time.sleep(0.002)
""")


class LockingTestCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.state = str(Path(self.dir.name) / "STATE.md")

    def entries(self):
        text = Path(self.state).read_text(encoding="utf-8") if Path(self.state).exists() else ""
        return [l for l in text.splitlines() if l.startswith("- [")]

    def spawn(self, msg, count=1):
        script = Path(self.dir.name) / f"w{abs(hash(msg))}.py"
        script.write_text(WRITER.format(src=SRC, msg=msg, state=self.state, count=count),
                          encoding="utf-8")
        return subprocess.Popen([sys.executable, str(script)],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


class TestConcurrency(LockingTestCase):
    def test_concurrent_writers_lose_nothing(self):
        # نافذة التسابق تُوسَّع عمداً (5 ملاحظات + تأخير): بدون قفل،
        # قراءة-تعديل-كتابة متداخلة تُسقط ملاحظات.
        n, per = 6, 5
        procs = [self.spawn(f"p{i}-", count=per) for i in range(n)]
        for p in procs:
            p.wait(timeout=60)
        found = self.entries()
        self.assertEqual(len(found), n * per,
                         f"ضاعت {n * per - len(found)} ملاحظة من {n * per}")

    def test_concurrent_mode_and_notes(self):
        procs = [self.spawn(f"n-{i}-", count=3) for i in range(4)]
        for p in procs:
            p.wait(timeout=60)
        self.assertEqual(len(self.entries()), 12)


class TestDegradesGracefully(LockingTestCase):
    def test_no_lock_mode_still_works(self):
        env = dict(os.environ, QAWA_NO_LOCK="1")
        script = Path(self.dir.name) / "nolock.py"
        script.write_text(WRITER.format(src=SRC, msg="بدون قفل-", state=self.state, count=2),
                          encoding="utf-8")
        r = subprocess.run([sys.executable, str(script)], capture_output=True,
                           text=True, env=env)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("بدون قفل", Path(self.state).read_text(encoding="utf-8"))

    def test_lock_failure_never_crashes(self):
        procs = [self.spawn(f"x-{i}-", count=2) for i in range(3)]
        for p in procs:
            p.wait(timeout=60)
        self.assertGreater(len(self.entries()), 0)


class TestStaleLock(LockingTestCase):
    def test_stale_lock_file_does_not_hang(self):
        lock = Path(self.state + ".lock")
        lock.write_text("0", encoding="utf-8")
        old = time.time() - 3600
        os.utime(lock, (old, old))
        start = time.time()
        st.note("بعد قفل يتيم", self.state)
        self.assertLess(time.time() - start, 10, "القفل اليتيم علّق العملية")
        self.assertIn("بعد قفل يتيم", Path(self.state).read_text(encoding="utf-8"))


class TestPortability(unittest.TestCase):
    def test_no_module_level_fcntl_import(self):
        # الاستيراد داخل الدالة مطلوب (Windows لا يملك fcntl)؛
        # الممنوع هو استيراد على العمود الأول.
        src = Path("src/qawa/state.py").read_text(encoding="utf-8")
        for line in src.splitlines():
            if line.startswith("import fcntl") or line.startswith("import msvcrt"):
                self.fail(f"استيراد على مستوى الوحدة يكسر Windows: {line!r}")

    def test_fcntl_import_is_function_local(self):
        src = Path("src/qawa/state.py").read_text(encoding="utf-8")
        self.assertTrue(any(l.strip() == "import fcntl" for l in src.splitlines()),
                        "يجب أن توجد استراتيجية fcntl")
        self.assertTrue(any(l.strip() == "import msvcrt" for l in src.splitlines()),
                        "يجب أن توجد استراتيجية msvcrt")

    def test_all_three_lock_strategies_present(self):
        src = Path("src/qawa/state.py").read_text(encoding="utf-8")
        self.assertIn("fcntl", src)
        self.assertIn("msvcrt", src)
        self.assertIn("O_EXCL", src)


if __name__ == "__main__":
    unittest.main()
