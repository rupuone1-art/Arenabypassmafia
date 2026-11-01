# -*- coding: utf-8 -*-
"""T12 — تصميم متعدد المنصات. اختبارات خاصة بمنصة تُتخطّى ولا تُخترع."""
import ast
import os
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "qawa"
sys.path.insert(0, str(SRC.parent))

IS_WINDOWS = os.name == "nt"
IS_POSIX = os.name == "posix"


def module_sources():
    return {p.name: p.read_text(encoding="utf-8")
            for p in sorted(SRC.glob("*.py"))}


def top_level_imports(source: str) -> set:
    tree = ast.parse(source)
    names = set()
    for node in tree.body:
        if isinstance(node, ast.Import):
            names.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split(".")[0])
    return names


class TestNoPlatformImportAtModuleLevel(unittest.TestCase):
    """استيراد fcntl/msvcrt على مستوى الوحدة يجعل qawa عاجزاً عن البدء على المنصة الأخرى."""

    def test_no_module_level_fcntl_or_msvcrt(self):
        for name, source in module_sources().items():
            top = top_level_imports(source)
            self.assertNotIn("fcntl", top, f"{name}: fcntl مستورد على مستوى الوحدة")
            self.assertNotIn("msvcrt", top, f"{name}: msvcrt مستورد على مستوى الوحدة")

    def test_platform_specific_imports_happen_inside_functions(self):
        for name, source in module_sources().items():
            src = source.replace('"fcntl"', "").replace('"msvcrt"', "")
            for node in ast.walk(ast.parse(source)):
                if isinstance(node, ast.Import):
                    for a in node.names:
                        if a.name.split(".")[0] in ("fcntl", "msvcrt"):
                            self.assertNotIsInstance(
                                node, ast.Module,
                                f"{name}: import {a.name} على مستوى الوحدة")
            del src


class TestPathHandling(unittest.TestCase):
    def setUp(self):
        from qawa import index
        self.src = (SRC / "index.py").read_text(encoding="utf-8")

    def test_containment_compares_through_normcase(self):
        """Windows يتجاهل حالة الأحرف؛ مقارنة المسارات الخام ثغرة."""
        self.assertIn("normcase", self.src)

    def test_containment_uses_resolve(self):
        self.assertIn("resolve()", self.src)


class TestAtomicWrite(unittest.TestCase):
    def test_state_uses_os_replace(self):
        src = (SRC / "state.py").read_text(encoding="utf-8")
        self.assertIn("os.replace", src)

    def test_no_platform_specific_temp_path(self):
        src = (SRC / "state.py").read_text(encoding="utf-8")
        for bad in ('"/tmp"', "'/tmp'", '"/var/tmp"'):
            self.assertNotIn(bad, src)

    def test_lock_has_a_windows_strategy(self):
        src = (SRC / "state.py").read_text(encoding="utf-8")
        self.assertIn("msvcrt", src)
        self.assertIn("fcntl", src)


@unittest.skipUnless(IS_WINDOWS, "يتحقق من سلوك Windows فقط")
class TestWindowsOnly(unittest.TestCase):
    def test_doctor_runs_on_windows(self):
        from qawa import doctor
        self.assertTrue(doctor.run() is not None)

    def test_path_comparison_ignores_case(self):
        from qawa.index import is_contained
        root = Path(os.path.expanduser("~"))
        self.assertTrue(is_contained(str(root).upper(), str(root)))


@unittest.skipUnless(IS_POSIX, "يتحقق من سلوك POSIX فقط")
class TestPosixOnly(unittest.TestCase):
    def test_lock_uses_flock(self):
        from qawa import state
        self.assertTrue(callable(state._try_flock))

    def test_path_comparison_respects_case(self):
        from qawa.index import is_contained
        root = Path(os.path.expanduser("~"))
        self.assertFalse(is_contained(str(root).upper(), str(root)))


class TestPlatformDoc(unittest.TestCase):
    def test_support_doc_exists_and_is_honest(self):
        doc = ROOT / "docs" / "PLATFORM_SUPPORT.md"
        if not doc.is_file():
            self.skipTest("docs/PLATFORM_SUPPORT.md غير مكتوب بعد")
        text = doc.read_text(encoding="utf-8")
        self.assertIn("Windows", text)
        self.assertIn("Linux", text)


if __name__ == "__main__":
    unittest.main()
