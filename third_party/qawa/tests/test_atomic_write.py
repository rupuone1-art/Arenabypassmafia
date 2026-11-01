# -*- coding: utf-8 -*-
"""T5 (BUG-04a) — السجل هو آخر ما يجوز فقدانه، فلا يُكتب بـ write_text مباشرة."""
import os
import re
import signal
import subprocess
import sys
import tempfile
import textwrap
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from qawa import state as st  # noqa: E402

LINE = re.compile(r"^- \[\d{4}-\d{2}-\d{2}\] .+$")


class AtomicTestCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.state = str(Path(self.dir.name) / "STATE.md")

    def lines(self):
        return [l for l in Path(self.state).read_text(encoding="utf-8").splitlines()
                if l.startswith("- [")]


class TestSequentialWrites(AtomicTestCase):
    def test_two_hundred_writes_lose_nothing(self):
        for i in range(200):
            st.note(f"entry {i}", self.state)
        self.assertEqual(len(self.lines()), 200)

    def test_every_line_is_well_formed(self):
        for i in range(50):
            st.note(f"مهمة {i}", self.state)
        for line in self.lines():
            self.assertRegex(line, LINE)

    def test_mode_survives_repeated_notes(self):
        st.set_mode("full", self.state)
        for i in range(30):
            st.note(f"x {i}", self.state)
        self.assertEqual(st.get_mode(self.state), "full")


class TestInterruptedWrite(AtomicTestCase):
    WRITER = textwrap.dedent("""
        import sys, time
        sys.path.insert(0, {src!r})
        from qawa import state as st
        while True:
            st.note("ملاحظة أثناء الكتابة المتكررة", {state!r})
    """)

    def test_kill_mid_write_leaves_a_usable_ledger(self):
        src = str(Path(__file__).resolve().parents[1] / "src")
        code = self.WRITER.format(src=src, state=self.state)
        script = Path(self.dir.name) / "writer.py"
        script.write_text(code, encoding="utf-8")

        proc = subprocess.Popen([sys.executable, str(script)],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.6)
        proc.send_signal(signal.SIGKILL)
        proc.wait()

        text = Path(self.state).read_text(encoding="utf-8")
        self.assertTrue(text.strip(), "السجل فارغ بعد القتل — كارثة")
        for line in self.lines():
            self.assertRegex(line, LINE, f"سطر تالف بعد القتل: {line!r}")

    def test_no_temp_files_left_behind(self):
        for i in range(20):
            st.note(f"entry {i}", self.state)
            st.set_mode("full" if i % 2 else "fast", self.state)
        leftovers = [p.name for p in Path(self.dir.name).iterdir()
                     if ".tmp" in p.name or p.name.endswith("~")]
        self.assertEqual(leftovers, [])


class TestAtomicHelper(AtomicTestCase):
    def test_helper_replaces_in_place(self):
        target = Path(self.state)
        target.write_text("قديم", encoding="utf-8")
        st._atomic_write(target, "جديد")
        self.assertEqual(target.read_text(encoding="utf-8"), "جديد")

    def test_helper_cleans_up_on_failure(self):
        target = Path(self.state)
        with self.assertRaises(Exception):
            st._atomic_write(Path(self.dir.name) / "missing-dir" / "x.md", "نص")
        leftovers = [p.name for p in Path(self.dir.name).iterdir() if ".tmp" in p.name]
        self.assertEqual(leftovers, [])

    def test_implementation_uses_os_replace(self):
        src = Path("src/qawa/state.py").read_text(encoding="utf-8")
        self.assertIn("os.replace", src)


if __name__ == "__main__":
    unittest.main()
