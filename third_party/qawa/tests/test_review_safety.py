# -*- coding: utf-8 -*-
"""T10 (BUG-08) — حزمة المراجعة تحمل diff المشروع كاملاً؛ قد يحمل أسراره."""
import subprocess
import sys
import tempfile
import time
import io
import os
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from qawa import brief  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


class RepoTestCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.repo = Path(self.dir.name)
        self._g("init", "-q", "-b", "main", ".")
        self._g("config", "user.email", "t@e.com")
        self._g("config", "user.name", "T")
        (self.repo / "f.txt").write_text("old\n", encoding="utf-8")
        self._g("add", "-A"); self._g("commit", "-qm", "base")
        self.base = self._out("rev-parse", "HEAD")

    def _g(self, *args):
        subprocess.run(["git", *args], cwd=self.repo, check=True, capture_output=True)

    def _out(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, check=True,
                              capture_output=True, text=True).stdout.strip()

    def commit(self, content):
        (self.repo / "f.txt").write_text(content, encoding="utf-8")
        self._g("add", "-A"); self._g("commit", "-qm", "work")
        return self._out("rev-parse", "HEAD")


class TestSecretDetection(RepoTestCase):
    def test_aws_key_blocks_the_package(self):
        head = self.commit("key = AKIAIOSFODNN7EXAMPLE\n")
        with self.assertRaises(brief.SecretsFound):
            brief.review_package(self.base, head, repo=self.repo)

    def test_openai_key_blocks(self):
        head = self.commit("k = sk-abcdefghijklmnopqrstuvwxyz123456\n")
        with self.assertRaises(brief.SecretsFound):
            brief.review_package(self.base, head, repo=self.repo)

    def test_private_key_blocks(self):
        head = self.commit("-----BEGIN RSA PRIVATE KEY-----\nMIIE\n")
        with self.assertRaises(brief.SecretsFound):
            brief.review_package(self.base, head, repo=self.repo)

    def test_connection_string_blocks(self):
        head = self.commit("url = postgres://user:hunter2@db.example.com/app\n")
        with self.assertRaises(brief.SecretsFound):
            brief.review_package(self.base, head, repo=self.repo)

    def test_force_writes_with_warning(self):
        head = self.commit("key = AKIAIOSFODNN7EXAMPLE\n")
        path = brief.write_review_package(self.base, head, out_dir=self.dir.name,
                                          repo=self.repo, force=True)
        text = Path(path).read_text(encoding="utf-8")
        self.assertIn("AKIAIOSFODNN7EXAMPLE", text)   # مكتوب كما هو — بقرار صريح
        self.assertIn("احتمالي", text)                # مع التحذير الإلزامي

    def test_redact_removes_the_value(self):
        head = self.commit("key = AKIAIOSFODNN7EXAMPLE\n")
        path = brief.write_review_package(self.base, head, out_dir=self.dir.name,
                                          repo=self.repo, force=True, redact=True)
        text = Path(path).read_text(encoding="utf-8")
        self.assertNotIn("AKIAIOSFODNN7EXAMPLE", text)
        self.assertIn("REDACTED", text)

    def test_clean_diff_writes_normally(self):
        head = self.commit("x = 2\n")
        path = brief.write_review_package(self.base, head, out_dir=self.dir.name,
                                          repo=self.repo)
        self.assertTrue(Path(path).is_file())

    def test_no_false_positive_on_plain_text(self):
        head = self.commit("note = this is an ordinary sentence about passwords in general\n")
        path = brief.write_review_package(self.base, head, out_dir=self.dir.name,
                                          repo=self.repo)
        self.assertTrue(Path(path).is_file())

    def test_warning_is_probabilistic_by_wording(self):
        head = self.commit("x = 2\n")
        path = brief.write_review_package(self.base, head, out_dir=self.dir.name,
                                          repo=self.repo)
        text = Path(path).read_text(encoding="utf-8")
        self.assertIn("احتمالي", text)


class TestSizeLimit(RepoTestCase):
    def test_oversized_package_is_truncated_and_says_so(self):
        head = self.commit("\n".join(f"line {i} = {i}" for i in range(4000)))
        path = brief.write_review_package(self.base, head, out_dir=self.dir.name,
                                          repo=self.repo, max_bytes=4000)
        text = Path(path).read_text(encoding="utf-8")
        self.assertIn("مقطوع", text)
        self.assertLess(Path(path).stat().st_size, 20000)


class TestPerformance(unittest.TestCase):
    def test_scan_of_one_megabyte_is_fast(self):
        blob = ("-" + "x" * 79 + "\n+key = AKIAIOSFODNN7EXAMPLE\n") * 12000
        start = time.time()
        findings = brief.scan_secrets(blob)
        self.assertLess(time.time() - start, 1.0)
        self.assertTrue(findings)


class TestScanFunction(unittest.TestCase):
    def test_returns_pattern_names(self):
        found = brief.scan_secrets("token = ghp_abcdefghijklmnopqrstuvwxyz0123456789")
        self.assertTrue(found)
        self.assertTrue(all(isinstance(f, tuple) and len(f) == 2 for f in found))

    def test_empty_text_has_no_findings(self):
        self.assertEqual(brief.scan_secrets(""), [])

    def test_innocent_text_has_no_findings(self):
        self.assertEqual(brief.scan_secrets("def add(a, b):\n    return a + b\n"), [])


class TestCliExitCode(RepoTestCase):
    """رمز خروج مميّز (3) ليمكن للمشرف التعامل معه برمجياً."""

    def call(self, *argv):
        """نفّذ داخل المستودع المؤقت: الأمر يقرأ الـ repo من مجلد العمل."""
        from qawa import cli
        out, err = io.StringIO(), io.StringIO()
        from contextlib import redirect_stderr, redirect_stdout
        previous = Path.cwd()
        os.chdir(self.repo)
        self.addCleanup(os.chdir, previous)
        with redirect_stdout(out), redirect_stderr(err):
            code = cli.main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def test_exit_three_on_suspected_secret(self):
        head = self.commit("k = sk-abcdefghijklmnopqrstuvwxyz999999\n")
        code, out, err = self.call("review", self.base, head,
                                   "--out", self.dir.name)
        self.assertEqual(code, 3, out + err)
        self.assertIn("سرار", err)

    def test_redact_exits_zero(self):
        head = self.commit("k = sk-abcdefghijklmnopqrstuvwxyz999999\n")
        code, out, err = self.call("review", self.base, head,
                                   "--out", self.dir.name, "--redact")
        self.assertEqual(code, 0, out + err)

    def test_clean_diff_exits_zero(self):
        head = self.commit("x = 2\n")
        code, out, err = self.call("review", self.base, head,
                                   "--out", self.dir.name)
        self.assertEqual(code, 0, out + err)

    def test_warning_reaches_the_user(self):
        head = self.commit("k = sk-abcdefghijklmnopqrstuvwxyz999999\n")
        _code, _out, err = self.call("review", self.base, head,
                                     "--out", self.dir.name)
        self.assertIn("احتمالي", err)


class TestInspect(unittest.TestCase):
    def test_report_masks_the_value(self):
        report = brief.findings_report(brief.scan_secrets("k = AKIAIOSFODNN7EXAMPLE"))
        self.assertIn("aws-access-key", report)
        self.assertNotIn("AKIAIOSFODNN7EXAMPLE", report, "التقرير سرّب السر كاملاً")

    def test_report_of_nothing_is_empty(self):
        self.assertEqual(brief.findings_report([]), "")

    def test_cli_prints_report_when_asked(self):
        import os
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            repo = Path(d)
            for cmd in (["init", "-q", "-b", "main", "."],
                        ["config", "user.email", "t@e.com"],
                        ["config", "user.name", "T"]):
                __import__("subprocess").run(["git", *cmd], cwd=repo, check=True,
                                             capture_output=True)
            (repo / "f.txt").write_text("old\n", encoding="utf-8")
            __import__("subprocess").run(["git", "add", "-A"], cwd=repo, check=True)
            __import__("subprocess").run(["git", "commit", "-qm", "base"], cwd=repo,
                                         check=True, capture_output=True)
            (repo / "f.txt").write_text("k = sk-abcdefghijklmnopqrstuvwxyz999999\n",
                                        encoding="utf-8")
            __import__("subprocess").run(["git", "add", "-A"], cwd=repo, check=True)
            __import__("subprocess").run(["git", "commit", "-qm", "w"], cwd=repo,
                                         check=True, capture_output=True)
            import io
            from contextlib import redirect_stderr, redirect_stdout
            from qawa import cli
            previous = Path.cwd(); os.chdir(repo)
            try:
                out, err = io.StringIO(), io.StringIO()
                with redirect_stdout(out), redirect_stderr(err):
                    code = cli.main(["review", "HEAD~1", "HEAD", "--out", d,
                                     "--inspect"])
            finally:
                os.chdir(previous)
            self.assertEqual(code, 3)
            self.assertIn("openai-key", err.getvalue())
            self.assertNotIn("sk-abcdefghijklmnopqrstuvwxyz999999", err.getvalue())
