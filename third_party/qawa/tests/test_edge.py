# -*- coding: utf-8 -*-
"""مسارات الخطأ والحواف — حيث تسكن العيوب الحقيقية."""
import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from qawa import doctor, index as index_mod, paths, render, router  # noqa: E402
from qawa.index import IndexError  # noqa: E402
from qawa.match import normalize, tokenize  # noqa: E402


def tmpdir():
    d = tempfile.TemporaryDirectory()
    return d, d.name


class TestPaths(unittest.TestCase):
    def test_all_paths_are_under_root(self):
        root = paths.root()
        for p in [paths.skills_dir(), paths.unavailable_dir(),
                  paths.index_path(), paths.bootstrap_dir(), paths.templates_dir()]:
            self.assertTrue(Path(p).is_absolute())
            self.assertEqual(Path(p).parts[:len(root.parts)], root.parts,
                             f"{p} ليس تحت {root}")

    def test_set_state_path_none_clears_override(self):
        d, name = tmpdir()
        paths.set_state_path(Path(name) / "S.md")
        paths.set_state_path(None)
        self.assertNotEqual(paths.state_path(), Path(name) / "S.md")

    def test_set_state_path(self):
        paths.set_state_path(None)
        d, name = tmpdir()
        target = paths.set_state_path(Path(name) / "S.md")
        self.addCleanup(lambda: os.environ.pop("QAWA_STATE", None))
        self.assertEqual(target, Path(name) / "S.md")

    def test_state_prefers_project_dot_qawa(self):
        paths.set_state_path(None)          # ألغِ أي تجاوز من اختبار سابق
        d, name = tmpdir()
        (Path(name) / ".qawa").mkdir()
        local = Path(name) / ".qawa" / "STATE.md"
        local.write_text("x", encoding="utf-8")
        cwd = os.getcwd()
        os.chdir(name)
        try:
            self.assertEqual(paths.state_path(), local)
        finally:
            os.chdir(cwd)


class TestIndexValidation(unittest.TestCase):
    def _write(self, obj):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        p = Path(d.name) / "i.json"
        p.write_text(json.dumps(obj) if not isinstance(obj, str) else obj,
                     encoding="utf-8")
        return str(p)

    def test_skill_without_name(self):
        p = self._write({"skills": [{"path": "a/SKILL.md"}]})
        with self.assertRaises(IndexError):
            index_mod.load_index(p)

    def test_skill_without_path(self):
        p = self._write({"skills": [{"name": "a"}]})
        with self.assertRaises(IndexError):
            index_mod.load_index(p)

    def test_keywords_not_an_object(self):
        p = self._write({"skills": [{"name": "a", "path": "b/SKILL.md",
                                     "keywords": ["x"]}]})
        with self.assertRaises(IndexError):
            index_mod.load_index(p)

    def test_non_integer_weight(self):
        p = self._write({"skills": [{"name": "a", "path": "b/SKILL.md",
                                     "keywords": {"x": "heavy"}}]})
        with self.assertRaises(IndexError):
            index_mod.load_index(p)

    def test_default_skill_not_in_index(self):
        p = self._write({"default": {"skill": "ghost"},
                         "skills": [{"name": "a", "path": "b/SKILL.md"}]})
        with self.assertRaises(IndexError):
            index_mod.load_index(p)

    def test_empty_skills_list(self):
        p = self._write({"skills": []})
        with self.assertRaises(IndexError):
            index_mod.load_index(p)

    def test_named_skill_file_missing(self):
        p = self._write({"skills": [{"name": "ghost", "path": "ghost/SKILL.md"}]})
        with self.assertRaises(IndexError):
            index_mod.load_index(p)

    def test_get_unknown_name_raises(self):
        idx = index_mod.load_index()
        with self.assertRaises(IndexError):
            idx.get("nope")

    def test_search_returns_close_matches(self):
        idx = index_mod.load_index()
        self.assertIn("brainstorming", idx.search("brainstroming"))

    def test_is_arabic_helper(self):
        self.assertTrue(index_mod._is_arabic("ميزة"))
        self.assertFalse(index_mod._is_arabic("feature"))


class TestRouterEdge(unittest.TestCase):
    def test_skill_obj_property(self):
        r = router.route("أضف ميزة")
        self.assertIsNotNone(r.skill_obj)
        self.assertEqual(r.skill_obj.name, r.skill)

    def test_str_of_a_hit(self):
        self.assertIn("score", str(router.route("أضف ميزة")))

    def test_str_of_default(self):
        self.assertIn("افتراضي", str(router.route("مرحبا")))

    def test_route_all_empty_returns_empty_list(self):
        self.assertEqual(router.route_all("مرحبا كيف حالك"), [])

    def test_multiword_latin_keyword(self):
        self.assertEqual(router.route("open a pull request").skill,
                         "finishing-a-development-branch")

    def test_arabic_multiword_phrase(self):
        self.assertEqual(router.route("الكود لا يعمل").skill,
                         "systematic-debugging")

    def test_ties_are_broken_deterministically(self):
        self.assertEqual(router.route("نفذ الخطة"), router.route("نفذ الخطة"))


class TestMatchEdge(unittest.TestCase):
    def test_normalize_rejects_non_string(self):
        with self.assertRaises(TypeError):
            normalize(None)

    def test_tokenize_rejects_non_string(self):
        with self.assertRaises(TypeError):
            tokenize(42)

    def test_normalize_handles_nfc_and_nfkc_forms(self):
        # ﻻ (presentation form) يجب أن تُطوى إلى لا
        self.assertEqual(normalize("ﻻ"), normalize("لا"))

    def test_normalize_persian_digits(self):
        self.assertEqual(normalize("۲۰۲۶"), "2026")


class TestDoctorFailurePaths(unittest.TestCase):
    def test_reports_a_broken_index(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        bad = Path(d.name) / "i.json"
        bad.write_text("{ nope", encoding="utf-8")
        orig = index_mod.load_index

        def broken(*a, **k):
            raise IndexError("مكسور عن قصد")
        index_mod.load_index = broken
        self.addCleanup(setattr, index_mod, "load_index", orig)

        out = io.StringIO()
        code = doctor.run(out=out.write, err=lambda s: None)
        self.assertEqual(code, 1)
        self.assertIn("FAIL", out.getvalue())

    def test_notices_lists_missing_router(self):
        idx = index_mod.load_index()
        with tempfile.TemporaryDirectory() as d:
            orig = paths.bootstrap_dir
            paths.bootstrap_dir = lambda: Path(d) / "nope"
            try:
                self.assertTrue(doctor.notices())
            finally:
                paths.bootstrap_dir = orig


class TestRenderWriteAll(unittest.TestCase):
    def test_write_all_creates_three_files(self):
        idx = index_mod.load_index()
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        written = render.write_all(idx, root=d.name)
        self.assertEqual(len(written), 3)
        self.assertEqual(set(written), {"ROUTER.md", "BOOTSTRAP.md", "AGENTS.md"})
        for p in written.values():
            self.assertTrue(Path(p).is_file())
        self.assertIn("ROUTER.md",
                      Path(written["BOOTSTRAP.md"]).read_text(encoding="utf-8"))
        self.assertEqual(render.stale_generated(idx, root=d.name), [])


if __name__ == "__main__":
    unittest.main()
