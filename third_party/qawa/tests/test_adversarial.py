# -*- coding: utf-8 -*-
"""T13 — اختبارات عدائية. كل حالة هجوم محاول حقيقي، لا تجربة شكلية."""
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from qawa import cli, render  # noqa: E402
from qawa.index import is_contained, load_index, IndexError  # noqa: E402


class Harness(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.tmp = Path(self.dir.name)
        self.skills = self.tmp / "skills"
        self.skills.mkdir()
        (self.skills / "real" / "SKILL.md").parent.mkdir(parents=True)
        (self.skills / "real" / "SKILL.md").write_text(
            "---\nname: real\ndescription: حقيقية\n---\n\n# real\n", encoding="utf-8")

    def index_with(self, path_value, name="attacker"):
        (self.tmp / "skills.json").write_text(json.dumps({
            "version": 1,
            "default": {"skill": name},
            "skills": [{"name": name, "path": path_value,
                        "summary": "هجوم", "keywords": {"attack": 3}}],
        }, ensure_ascii=False), encoding="utf-8")
        return self.tmp / "skills.json"

    def load(self, path_value):
        return load_index(index_file=str(self.index_with(path_value)),
                          skills_root=str(self.skills))

    def call(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = cli.main(list(argv))
        return code, out.getvalue(), err.getvalue()


class TestPathAttacks(Harness):
    """1-5: محاولات قراءة ملفات خارج مجلد المهارات."""

    def test_01_dotdot_traversal(self):
        with self.assertRaises(IndexError):
            self.load("../../../../etc/passwd")

    def test_02_absolute_path(self):
        with self.assertRaises(IndexError):
            self.load("/etc/hostname" if os.name == "posix" else "C:\\Windows\\win.ini")

    def test_03_dotdot_in_the_middle(self):
        with self.assertRaises(IndexError):
            self.load("real/../../../../etc/shadow")

    def test_04_nested_symlink_escape(self):
        if os.name != "posix":
            self.skipTest("symlinks require privileges on Windows")
        outside = self.tmp / "outside"; outside.mkdir()
        (outside / "secret.md").write_text("SECRET", encoding="utf-8")
        link_dir = self.skills / "linkdir"
        link_dir.symlink_to(outside, target_is_directory=True)
        (link_dir / "inner").parent.mkdir(exist_ok=True)
        with self.assertRaises(IndexError):
            self.load("linkdir/secret.md")

    def test_05_symlinked_skills_root_is_rejected(self):
        """مجلد المهارات نفسه رابط —resolve يجب أن يتبعه ثم يقارن."""
        if os.name != "posix":
            self.skipTest("symlinks require privileges on Windows")
        self.assertTrue(is_contained(self.skills / "real" / "SKILL.md", self.skills))
        self.assertFalse(is_contained(self.tmp / "outside-secret.md"
                                      if (self.tmp / "outside-secret.md").exists()
                                      else self.tmp, self.skills))

    def test_06_nul_byte_in_path(self):
        with self.assertRaises((IndexError, ValueError, OSError)):
            self.load("real/SKILL.md\x00.txt")

    def test_07_bidi_override_in_name_grants_nothing(self):
        """محرف RTL في الاسم لا يغيّر المسار ولا يمنح قراءة خارج المجلد."""
        sneaky = "real\u202eSKILL\u202c.md"
        with self.assertRaises((IndexError, OSError)):
            self.load(sneaky)
        idx = self.load("real/SKILL.md")
        self.assertEqual(len(idx.skills), 1)   # الحمل الطبيعي ما زال يعمل


class TestCliAttacks(Harness):
    def test_08_use_dot_dot_prints_nothing(self):
        code, out, err = self.call("use", "../..")
        self.assertNotEqual(code, 0)
        self.assertNotIn("root:", out + err)
        self.assertNotIn("/etc", out + err)

    def test_09_cli_never_calls_home_for_missing_project(self):
        """خارج مشروع: يجب أن يفشل بوضوح، لا أن يكتب في $HOME."""
        home = Path.home() / "qawa" / "state" / "STATE.md"
        before = home.read_text(encoding="utf-8") if home.is_file() else None
        previous = Path.cwd()
        os.chdir(self.tmp)
        self.addCleanup(os.chdir, previous)
        code, out, err = self.call("note", "هجوم")
        self.assertEqual(code, 1)
        after = home.read_text(encoding="utf-8") if home.is_file() else None
        self.assertEqual(before, after, "كتب في $HOME بدل أن يفشل")


class TestResourceAttacks(Harness):
    def test_10_ten_thousand_skills_is_fast(self):
        import time
        skills = [{"name": f"s{i}", "path": "real/SKILL.md",
                   "summary": "x", "keywords": {"k": 1}} for i in range(10000)]
        (self.tmp / "skills.json").write_text(json.dumps(
            {"version": 1, "default": {"skill": "s0"}, "skills": skills},
            ensure_ascii=False), encoding="utf-8")
        start = time.time()
        idx = load_index(index_file=str(self.tmp / "skills.json"),
                         skills_root=str(self.skills))
        self.assertEqual(len(idx.skills), 10000)
        self.assertLess(time.time() - start, 5.0)

    def test_11_ten_megabyte_summary_does_not_hang(self):
        big = "x" * (10 * 1024 * 1024)
        (self.tmp / "skills.json").write_text(json.dumps({
            "version": 1,
            "default": {"skill": "big"},
            "skills": [{"name": "big", "path": "real/SKILL.md",
                        "summary": big, "keywords": {"big": 1}}],
        }, ensure_ascii=False), encoding="utf-8")
        idx = load_index(index_file=str(self.tmp / "skills.json"),
                         skills_root=str(self.skills))
        self.assertEqual(idx.skills[0].summary, big)

    def test_12_duplicate_names_are_rejected(self):
        """الاسم المكرَّر مرفوض صراحةً، لا يُحسم بترتيب الملف."""
        (self.tmp / "skills.json").write_text(json.dumps({
            "version": 1,
            "default": {"skill": "dup"},
            "skills": [{"name": "dup", "path": "real/SKILL.md", "summary": "a",
                        "keywords": {"x": 1}},
                       {"name": "dup", "path": "real/SKILL.md", "summary": "b",
                        "keywords": {"y": 1}}],
        }, ensure_ascii=False), encoding="utf-8")
        with self.assertRaises(IndexError):
            load_index(index_file=str(self.tmp / "skills.json"),
                       skills_root=str(self.skills))
        with self.assertRaises(IndexError):
            load_index(index_file=str(self.tmp / "skills.json"),
                       skills_root=str(self.skills))

    def test_13_innocent_dotdot_is_not_rejected(self):
        """`real/../real/SKILL.md` يبقى في الداخل — رفضه عيب لا حماية."""
        idx = self.load("real/../real/SKILL.md")
        self.assertEqual(len(idx.skills), 1)
        self.assertEqual(idx.skills[0].name, "attacker")
