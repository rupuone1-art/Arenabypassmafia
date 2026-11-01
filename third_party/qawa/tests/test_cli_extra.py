# -*- coding: utf-8 -*-
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QAWA = str(ROOT / "qawa")


def run(*args, cwd=None, env=None):
    e = dict(os.environ, PYTHONIOENCODING="utf-8")
    if env:
        e.update(env)
    return subprocess.run([sys.executable, QAWA, *args], capture_output=True,
                          text=True, encoding="utf-8", env=e, cwd=cwd or str(ROOT))


class TestInitCli(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)

    def test_init_creates_scaffolding(self):
        r = run("init", self.dir.name)
        self.assertEqual(r.returncode, 0, r.stderr)
        base = Path(self.dir.name)
        self.assertTrue((base / ".qawa" / "STATE.md").is_file())
        self.assertTrue((base / "AGENTS.md").is_file())
        self.assertTrue((base / "docs" / "superpowers" / "plans").is_dir())

    def test_init_writes_gitignore_entries(self):
        run("init", self.dir.name)
        text = (Path(self.dir.name) / ".gitignore").read_text(encoding="utf-8")
        for entry in [".qawa/", ".worktrees/"]:
            self.assertIn(entry, text)

    def test_init_is_idempotent(self):
        run("init", self.dir.name)
        first = (Path(self.dir.name) / ".gitignore").read_text(encoding="utf-8")
        r = run("init", self.dir.name)
        self.assertEqual(r.returncode, 0)
        second = (Path(self.dir.name) / ".gitignore").read_text(encoding="utf-8")
        self.assertEqual(first, second)

    def test_init_preserves_existing_gitignore(self):
        base = Path(self.dir.name)
        (base / ".gitignore").write_text("node_modules/\n", encoding="utf-8")
        run("init", self.dir.name)
        text = (base / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("node_modules/", text)
        self.assertIn(".qawa/", text)

    def test_init_on_missing_dir_fails(self):
        r = run("init", "/nonexistent/zzz")
        self.assertNotEqual(r.returncode, 0)


class TestBriefCli(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)

    def test_brief_prints_a_path(self):
        r = run("brief", str(ROOT / "docs/plans/2026-10-30-qawa-core.md"), "3",
                "--out", self.dir.name)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(Path(r.stdout.strip()).is_file())

    def test_brief_missing_task_fails_loudly(self):
        r = run("brief", str(ROOT / "docs/plans/2026-10-30-qawa-core.md"), "999",
                "--out", self.dir.name)
        self.assertNotEqual(r.returncode, 0)
        self.assertTrue((r.stdout + r.stderr).strip())

    def test_review_prints_a_path(self):
        # لا نفترض أن مجلد التوزيع مستودع git — قد يُفكّ من zip بلا .git
        repo = Path(self.dir.name) / "repo"
        repo.mkdir()
        for args in (["init", "-q", "-b", "main", "."],
                     ["config", "user.email", "t@e.com"],
                     ["config", "user.name", "T"],
                     ["add", "-A"], ["commit", "-qm", "base"]):
            (repo / "a.py").write_text("x = 1\n", encoding="utf-8")
            subprocess.run(["git", *args], cwd=repo, check=False,
                           capture_output=True)
        (repo / "a.py").write_text("x = 2\n", encoding="utf-8")
        subprocess.run(["git", "add", "-A"], cwd=repo, check=True, capture_output=True)
        subprocess.run(["git", "commit", "-qm", "work"], cwd=repo, check=True,
                       capture_output=True)

        r = run("review", "HEAD~1", "HEAD", "--out", self.dir.name, cwd=str(repo))
        self.assertEqual(r.returncode, 0, r.stderr)
        out = Path(r.stdout.strip())
        self.assertTrue(out.is_file())
        self.assertGreater(out.stat().st_size, 50)

    def test_review_outside_a_repo_fails_loudly(self):
        r = run("review", "HEAD~1", "HEAD", "--out", self.dir.name,
                cwd=self.dir.name)
        self.assertNotEqual(r.returncode, 0)
        self.assertTrue((r.stdout + r.stderr).strip())


class TestLedgerAcrossSessions(unittest.TestCase):
    """السيناريو الذي وُجد qawa من أجله: انقطاع ثم استرجاع."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.state = str(Path(self.dir.name) / "STATE.md")

    def test_progress_survives_a_new_process(self):
        run("note", "Task 1: complete (commits aaa1111..bbb2222, review clean)",
            env={"QAWA_STATE": self.state})
        run("note", "Task 2: complete (commits bbb2222..ccc3333, review clean)",
            env={"QAWA_STATE": self.state})
        later = run("state", env={"QAWA_STATE": self.state}).stdout
        self.assertIn("Task 1: complete", later)
        self.assertIn("Task 2: complete", later)
        self.assertIn("ccc3333", later)

    def test_mode_survives_a_new_process(self):
        run("mode", "full", env={"QAWA_STATE": self.state})
        self.assertIn("full", run("mode", env={"QAWA_STATE": self.state}).stdout)


if __name__ == "__main__":
    unittest.main()
