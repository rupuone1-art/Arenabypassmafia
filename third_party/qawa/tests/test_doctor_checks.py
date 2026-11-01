# -*- coding: utf-8 -*-
"""T8 (BUG-06) — doctor أداة تشخيص؛ الفحص الذي ينجح دائماً أسوأ من غيابه."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from qawa import doctor  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
QAWA = str(ROOT / "qawa")
IS_ROOT = (os.geteuid() == 0) if hasattr(os, "geteuid") else False


def code_without_comments(text: str) -> str:
    """الأسطر البرمجية فقط — تعليق يشرح العيب ليس عيباً."""
    return "\n".join(l for l in text.splitlines()
                      if not l.lstrip().startswith("#"))


class TestNoVacuousChecks(unittest.TestCase):
    def test_no_or_true_in_source(self):
        src = code_without_comments(Path("src/qawa/doctor.py").read_text(encoding="utf-8"))
        self.assertNotIn("or True", src, "شرط دائم التحقق في doctor")

    def test_no_or_true_anywhere(self):
        for name in Path("src/qawa").glob("*.py"):
            src = code_without_comments(name.read_text(encoding="utf-8"))
            self.assertNotIn("or True", src, f"شرط دائم التحقق في {name.name}")

    def test_the_guard_itself_works(self):
        self.assertNotIn("or True", code_without_comments("# or True\nx = 1\n"))
        self.assertIn("or True", code_without_comments("y = a or True\n"))


class TestLedgerChecks(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.base = Path(self.dir.name)

    def run_doctor(self, cwd):
        e = dict(os.environ, PYTHONIOENCODING="utf-8")
        e.pop("QAWA_STATE", None)
        return subprocess.run([sys.executable, QAWA, "doctor"], capture_output=True,
                              text=True, encoding="utf-8", env=e, cwd=str(cwd))

    def test_inside_a_project_all_core_checks_pass(self):
        proj = self.base / "proj"; (proj / ".qawa").mkdir(parents=True)
        r = self.run_doctor(proj)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("OK", r.stdout)

    @unittest.skipIf(IS_ROOT, "root يتجاوز صلاحيات الملفات")
    def test_unwritable_ledger_dir_reports_failure(self):
        proj = self.base / "proj"
        ledger = proj / ".qawa"; ledger.mkdir(parents=True)
        os.chmod(ledger, 0o500)
        self.addCleanup(os.chmod, ledger, 0o700)
        r = self.run_doctor(proj)
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("FAIL", r.stdout + r.stderr)

    def test_corrupt_ledger_is_reported_not_crashed(self):
        proj = self.base / "proj"
        (proj / ".qawa").mkdir(parents=True)
        (proj / ".qawa" / "STATE.md").write_text("\x00\xff garbage \x01", encoding="utf-8",
                                                 errors="replace")
        r = self.run_doctor(proj)
        self.assertNotIn("Traceback", r.stdout + r.stderr)

    def test_outside_a_project_reports_no_root(self):
        orphan = self.base / "orphan"; orphan.mkdir()
        r = self.run_doctor(orphan)
        self.assertNotIn("Traceback", r.stdout + r.stderr)


class TestChecksStructure(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.cwd = os.getcwd()
        (Path(self.dir.name) / ".qawa").mkdir()
        os.chdir(Path(self.dir.name))
        self.addCleanup(os.chdir, self.cwd)

    def test_checks_are_triples(self):
        for row in doctor.checks():
            self.assertEqual(len(row), 3, f"صف فحص غير سليم: {row}")

    def test_every_check_has_a_detail(self):
        for label, ok, detail in doctor.checks():
            self.assertTrue(str(detail).strip(), f"فحص بلا تفصيل: {label}")

    def test_boolean_flags_are_real(self):
        self.assertIsInstance(doctor.checks()[0][1], bool)


if __name__ == "__main__":
    unittest.main()
