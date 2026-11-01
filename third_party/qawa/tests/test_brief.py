# -*- coding: utf-8 -*-
import subprocess
import tempfile
import unittest
from pathlib import Path

from qawa import brief

PLAN = """# Feature Plan

> header

**Goal:** شيء

## Global Constraints

- stdlib فقط

---

### Task 1: الأول

**Files:**
- Create: `a.py`

- [ ] **Step 1: اكتب الاختبار**
- [ ] **Step 2: شغّله**

### Task 2: الثاني

**Files:**
- Modify: `b.py`

- [ ] **Step 1: نفّذ**

نص لاحق للمهمة 2.

### Task 3: الثالث

- [ ] **Step 1: Commit**
"""


class TestExtractTask(unittest.TestCase):
    def setUp(self):
        fd, self.tmp = tempfile.mkstemp(suffix=".md")
        import os
        os.close(fd)
        Path(self.tmp).write_text(PLAN, encoding="utf-8")
        self.addCleanup(lambda: Path(self.tmp).unlink(missing_ok=True))

    def test_extracts_task_body_without_the_next_task(self):
        body = brief.extract_task(self.tmp, 2)
        self.assertIn("الثاني", body)
        self.assertNotIn("الثالث", body)

    def test_extracts_steps(self):
        self.assertIn("Step 1: نفّذ", brief.extract_task(self.tmp, 2))

    def test_includes_trailing_prose(self):
        self.assertIn("نص لاحق", brief.extract_task(self.tmp, 2))

    def test_task_one(self):
        body = brief.extract_task(self.tmp, 1)
        self.assertIn("الأول", body)
        self.assertNotIn("الثاني", body)

    def test_missing_task_raises(self):
        with self.assertRaises(brief.BriefError) as ctx:
            brief.extract_task(self.tmp, 99)
        self.assertIn("99", str(ctx.exception))

    def test_task_number_must_be_positive(self):
        with self.assertRaises(brief.BriefError):
            brief.extract_task(self.tmp, 0)

    def test_missing_plan_file_raises(self):
        with self.assertRaises(brief.BriefError):
            brief.extract_task("/nonexistent/plan.md", 1)

    def test_counts_tasks(self):
        self.assertEqual(brief.count_tasks(self.tmp), 3)

    def test_heading_kept_in_output(self):
        self.assertIn("### Task 2", brief.extract_task(self.tmp, 2))


class TestWriteBrief(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        p = Path(self.dir.name) / "plan.md"
        p.write_text(PLAN, encoding="utf-8")
        self.plan = str(p)

    def test_writes_a_file_and_returns_its_path(self):
        out = brief.write_brief(self.plan, 2, out_dir=self.dir.name)
        self.assertTrue(Path(out).is_file())
        self.assertIn("task-2-brief", Path(out).name)

    def test_written_file_holds_the_task(self):
        out = brief.write_brief(self.plan, 1, out_dir=self.dir.name)
        self.assertIn("الأول", Path(out).read_text(encoding="utf-8"))


class TestReviewPackage(unittest.TestCase):
    """حزمة المراجعة تحتاج repo حقيقياً — نبني واحداً مؤقتاً."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.repo = Path(self.dir.name)
        self._git("init", "-q", "-b", "main", ".")
        self._git("config", "user.email", "t@e.com")
        self._git("config", "user.name", "T")
        (self.repo / "a.py").write_text("x = 1\n", encoding="utf-8")
        self._git("add", "-A")
        self._git("commit", "-qm", "base")
        self.base = self._git_out("rev-parse", "HEAD")
        (self.repo / "a.py").write_text("x = 2\n", encoding="utf-8")
        (self.repo / "b.py").write_text("y = 1\n", encoding="utf-8")
        self._git("add", "-A")
        self._git("commit", "-qm", "feature work")
        self.head = self._git_out("rev-parse", "HEAD")

    def _git(self, *args):
        subprocess.run(["git", *args], cwd=self.repo, check=True,
                       capture_output=True)

    def _git_out(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, check=True,
                              capture_output=True, text=True).stdout.strip()

    def test_package_contains_commit_list(self):
        pkg = brief.review_package(self.base, self.head, repo=self.repo)
        self.assertIn("feature work", pkg)

    def test_package_contains_stat(self):
        pkg = brief.review_package(self.base, self.head, repo=self.repo)
        self.assertIn("a.py", pkg)
        self.assertIn("b.py", pkg)

    def test_package_contains_the_diff(self):
        pkg = brief.review_package(self.base, self.head, repo=self.repo)
        self.assertIn("-x = 1", pkg)
        self.assertIn("+x = 2", pkg)

    def test_names_the_range(self):
        pkg = brief.review_package(self.base, self.head, repo=self.repo)
        self.assertIn(self.base[:7], pkg)
        self.assertIn(self.head[:7], pkg)

    def test_write_package_returns_path(self):
        out = brief.write_review_package(self.base, self.head,
                                         out_dir=self.dir.name, repo=self.repo)
        self.assertTrue(Path(out).is_file())
        self.assertGreater(Path(out).stat().st_size, 100)

    def test_not_a_git_repo_raises(self):
        with self.assertRaises(brief.BriefError):
            brief.review_package(self.base, self.head,
                                 repo=Path(tempfile.gettempdir()))


if __name__ == "__main__":
    unittest.main()
