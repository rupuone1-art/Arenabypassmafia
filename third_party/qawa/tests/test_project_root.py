# -*- coding: utf-8 -*-
"""T4 (BUG-03) — لا يجوز لمشروعين أن يتشاركا سجلاً ضمنياً."""
import importlib
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

ROOT = Path(__file__).resolve().parents[1]
QAWA = str(ROOT / "qawa")


def fresh_paths():
    """paths.py يقرأ QAWA_STATE عند الاستيراد — أعد تحميله بعد كل تغيير بيئة."""
    from qawa import paths
    importlib.reload(paths)
    return paths


class TestFindProjectRoot(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.base = Path(self.dir.name)

    def test_finds_dot_qawa(self):
        d = self.base / "proj"; (d / ".qawa").mkdir(parents=True)
        from qawa import paths
        self.assertEqual(paths.find_project_root(d), d.resolve())

    def test_finds_dot_git(self):
        d = self.base / "repo"; (d / ".git").mkdir(parents=True)
        from qawa import paths
        self.assertEqual(paths.find_project_root(d), d.resolve())

    def test_ascends_to_parent(self):
        d = self.base / "repo"; (d / ".git").mkdir(parents=True)
        deep = d / "a" / "b" / "c"; deep.mkdir(parents=True)
        from qawa import paths
        self.assertEqual(paths.find_project_root(deep), d.resolve())

    def test_returns_none_when_no_root(self):
        d = self.base / "orphan"; d.mkdir()
        from qawa import paths
        self.assertIsNone(paths.find_project_root(d))

    def test_does_not_ascend_past_home(self):
        from qawa import paths
        deep = Path.home() / "zzz-no-root-here"
        self.assertIsNone(paths.find_project_root(deep))


class TestStateIsolation(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.base = Path(self.dir.name)
        os.environ.pop("QAWA_STATE", None)

    def test_two_uninitialised_dirs_do_not_share_a_ledger(self):
        a = self.base / "A"; b = self.base / "B"
        (a / ".qawa").mkdir(parents=True); (b / ".qawa").mkdir(parents=True)
        paths = fresh_paths()
        from qawa import state as st
        importlib.reload(st)
        cwd = os.getcwd()
        try:
            os.chdir(a); st.note("عمل في A"); pa = st.path()
            os.chdir(b); st.note("عمل في B"); pb = st.path()
        finally:
            os.chdir(cwd)
        self.assertNotEqual(pa, pb)
        self.assertIn("عمل في A", pa.read_text(encoding="utf-8"))
        self.assertNotIn("عمل في A", pb.read_text(encoding="utf-8"))

    def test_no_implicit_global_ledger(self):
        orphan = self.base / "orphan"; orphan.mkdir()
        paths = fresh_paths()
        cwd = os.getcwd()
        try:
            os.chdir(orphan)
            self.assertIsNone(paths.state_path())
        finally:
            os.chdir(cwd)


class TestNoProjectError(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.orphan = Path(self.dir.name) / "orphan"; self.orphan.mkdir()

    def run_qawa(self, *args):
        e = dict(os.environ, PYTHONIOENCODING="utf-8")
        e.pop("QAWA_STATE", None)
        return subprocess.run([sys.executable, QAWA, *args], capture_output=True,
                              text=True, encoding="utf-8", env=e, cwd=str(self.orphan))

    def test_note_outside_a_project_fails_with_guidance(self):
        r = self.run_qawa("note", "شيء")
        self.assertEqual(r.returncode, 1)
        self.assertIn("qawa init", r.stdout + r.stderr)

    def test_state_outside_a_project_explains(self):
        r = self.run_qawa("state")
        self.assertEqual(r.returncode, 1)
        self.assertIn("init", (r.stdout + r.stderr).lower())

    def test_doctor_does_not_crash_outside_a_project(self):
        r = self.run_qawa("doctor")
        self.assertIn(r.returncode, (0, 1))
        self.assertNotIn("Traceback", r.stdout + r.stderr)


class TestOverrideStillWins(unittest.TestCase):
    def test_qawa_state_env_overrides(self):
        target = Path(tempfile.mkdtemp()) / "S.md"
        os.environ["QAWA_STATE"] = str(target)
        self.addCleanup(os.environ.pop, "QAWA_STATE", None)
        paths = fresh_paths()
        self.assertEqual(paths.state_path(), target)


if __name__ == "__main__":
    unittest.main()
