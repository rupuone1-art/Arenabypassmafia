# -*- coding: utf-8 -*-
"""T1 (SEC-01) — لا يجوز لأي مسار في الفهرس أن يخرج من مجلد المهارات.

الثغرة نُفِّذت فعلاً على v0.1.0: "..".. جعلت qawa use يقرأ /etc/hostname.
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

from qawa.index import IndexError as QawaIndexError, load_index

REAL_SKILLS = str(Path(__file__).resolve().parents[1] / "skills")


def index_with(path, root=None, name="x"):
    d = tempfile.mkdtemp()
    p = Path(d) / "i.json"
    p.write_text(json.dumps({"version": 1, "default": {"skill": name},
                             "skills": [{"name": name, "path": path}]},
                            ensure_ascii=False), encoding="utf-8")
    return str(p)


class TestTraversalRejected(unittest.TestCase):
    def test_deep_dotdot_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(index_with("../../../../etc/passwd"), REAL_SKILLS)

    def test_absolute_path_outside_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(index_with("/etc/passwd"), REAL_SKILLS)

    def test_dotdot_in_the_middle_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(index_with("brainstorming/../../../../etc/passwd"), REAL_SKILLS)

    def test_single_dotdot_that_stays_inside_is_ok(self):
        # a/../b يبقى داخل المجلد — لا يجوز رفضه
        idx = load_index(index_with("brainstorming/../brainstorming/SKILL.md"), REAL_SKILLS)
        self.assertTrue(idx.skills[0].exists())

    def test_valid_relative_path_accepted(self):
        idx = load_index(index_with("brainstorming/SKILL.md"), REAL_SKILLS)
        self.assertTrue(str(idx.skills[0].path_obj).startswith(REAL_SKILLS))

    def test_nested_valid_path_accepted(self):
        idx = load_index(index_with("brainstorming/SKILL.md"), REAL_SKILLS)
        self.assertTrue(idx.skills[0].exists())


class TestSymlinks(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.root = Path(self.dir.name) / "skills"
        self.root.mkdir()
        (self.root / "good.md").write_text("safe", encoding="utf-8")
        self.outside = Path(self.dir.name) / "secret.txt"
        self.outside.write_text("SECRET", encoding="utf-8")

    def test_symlink_escaping_the_root_rejected(self):
        target = self.root / "linked.md"
        try:
            target.symlink_to(self.outside)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks unsupported here")
        with self.assertRaises(QawaIndexError):
            load_index(index_with("linked.md"), str(self.root))

    def test_symlink_staying_inside_accepted(self):
        target = self.root / "inner.md"
        try:
            target.symlink_to(self.root / "good.md")
        except (OSError, NotImplementedError):
            self.skipTest("symlinks unsupported here")
        idx = load_index(index_with("inner.md"), str(self.root))
        self.assertTrue(idx.skills[0].exists())

    def test_skills_root_itself_is_a_symlink(self):
        link = Path(self.dir.name) / "skills-link"
        try:
            link.symlink_to(self.root, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks unsupported here")
        idx = load_index(index_with("good.md"), str(link))
        self.assertTrue(idx.skills[0].exists())


class TestBeforeAnyRead(unittest.TestCase):
    def test_escaping_path_is_rejected_not_read(self):
        captured = []
        real = Path.read_text

        def spy(self_, *a, **k):
            captured.append(str(self_))
            return real(self_, *a, **k)

        Path.read_text = spy
        try:
            with self.assertRaises(QawaIndexError):
                load_index(index_with("../../../../etc/passwd"), REAL_SKILLS)
        finally:
            Path.read_text = real
        self.assertFalse(any("passwd" in c for c in captured),
                         "تمت قراءة ملف خارج مجلد المهارات قبل الرفض")


class TestCrossPlatformComparison(unittest.TestCase):
    def test_comparison_uses_normcase(self):
        src = Path("src/qawa/index.py").read_text(encoding="utf-8")
        self.assertIn("normcase", src,
                      "Windows غير حسّاس لحالة الأحرف — المقارنة يجب أن تستخدم normcase")


if __name__ == "__main__":
    unittest.main()
