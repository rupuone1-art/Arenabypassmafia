# -*- coding: utf-8 -*-
"""فروع الخطأ والرفض — ما يجب أن يحدث عند المدخلات السيئة، لا عند السليمة."""
import io
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from qawa import cli, doctor, render, router, state  # noqa: E402


class CliTestCase(unittest.TestCase):
    def call(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            try:
                code = cli.main(list(argv))
            except SystemExit as exc:
                code = int(exc.code or 0)
        return code, out.getvalue(), err.getvalue()


class TestUse(CliTestCase):
    def test_unknown_skill_suggests(self):
        code, out, err = self.call("use", "brainstroming")
        self.assertEqual(code, cli.EXIT_USAGE)
        self.assertIn("هل تقصد", err)

    def test_unknown_skill_with_no_suggestion_lists(self):
        code, out, err = self.call("use", "zzzzzzzzzz")
        self.assertEqual(code, cli.EXIT_USAGE)
        self.assertIn("qawa skills", err)

    def test_path_flag_prints_the_path(self):
        code, out, err = self.call("use", "brainstorming", "--path")
        self.assertEqual(code, 0)
        self.assertIn("SKILL.md", out)

    def test_route_all_with_no_match_falls_back(self):
        code, out, err = self.call("route", "--all", "zzz qqq")
        self.assertEqual(code, 0)
        self.assertTrue(out.strip())


class TestStateCommands(CliTestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.orphan = Path(self.dir.name)
        self.previous = Path.cwd()
        os.chdir(self.orphan)
        self.addCleanup(os.chdir, self.previous)

    def test_mode_outside_a_project(self):
        code, out, err = self.call("mode", "full")
        self.assertEqual(code, cli.EXIT_NO_PROJECT)

    def test_mode_rejects_an_unknown_value(self):
        home = tempfile.TemporaryDirectory()
        self.addCleanup(home.cleanup)
        os.chdir(home.name)
        self.call("init", home.name)
        code, out, err = self.call("mode", "turbo")
        self.assertEqual(code, cli.EXIT_USAGE)

    def test_state_outside_a_project(self):
        code, out, err = self.call("state")
        self.assertEqual(code, cli.EXIT_NO_PROJECT)

    def test_reset_outside_a_project(self):
        code, out, err = self.call("reset")
        self.assertEqual(code, cli.EXIT_NO_PROJECT)

    def test_note_outside_a_project(self):
        code, out, err = self.call("note", "x")
        self.assertEqual(code, cli.EXIT_NO_PROJECT)


class TestInitAndReviewErrors(CliTestCase):
    def test_init_on_a_missing_directory(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        missing = Path(d.name) / "nope" / "deeper"
        code, out, err = self.call("init", str(missing))
        self.assertEqual(code, cli.EXIT_ERROR)
        self.assertIn("المجلد غير موجود", err)

    def test_review_with_a_bad_revision(self):
        code, out, err = self.call("review", "not-a-rev", "HEAD")
        self.assertNotEqual(code, 0)

    def test_keyboard_interrupt_exits_130(self):
        """Ctrl+C رمز خروجه 130 — ليمكن للمشرف التفريق بينه وبين الفشل."""
        real = cli.cmd_use
        cli.cmd_use = lambda args: (_ for _ in ()).throw(KeyboardInterrupt())
        self.addCleanup(setattr, cli, "cmd_use", real)
        err = io.StringIO()
        with redirect_stderr(err):
            code = cli.main(["use", "brainstorming"])
        self.assertEqual(code, 130)


class TestStateInternals(unittest.TestCase):
    def test_read_without_a_project_returns_an_explanation(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        previous = Path.cwd()
        os.chdir(d.name)
        self.addCleanup(os.chdir, previous)
        self.assertIn("لا يوجد مشروع", state.read())

    def test_atomic_write_cleans_up_on_failure(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        target = Path(d.name) / "STATE.md"

        class Boom(Exception):
            pass

        real_replace = os.replace
        os.replace = lambda a, b: (_ for _ in ()).throw(Boom())
        self.addCleanup(setattr, os, "replace", real_replace)
        with self.assertRaises(Boom):
            state._atomic_write(target, "x")
        self.assertEqual(list(Path(d.name).iterdir()), [])  # لا بقايا .tmp

    def test_atomic_write_tolerates_a_filesystem_without_fsync(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        target = Path(d.name) / "STATE.md"
        real_fsync = os.fsync
        os.fsync = lambda fd: (_ for _ in ()).throw(OSError("no fsync"))
        self.addCleanup(setattr, os, "fsync", real_fsync)
        state._atomic_write(target, "ok\n")
        self.assertEqual(target.read_text(encoding="utf-8"), "ok\n")

    def test_ledger_lock_survives_an_unopenable_lock_file(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        target = Path(d.name) / "STATE.md"
        real_open = open

        def refusing_open(path, *a, **k):
            if str(path).endswith(".lock"):
                raise OSError("locked out")
            return real_open(path, *a, **k)

        import builtins
        builtins.open = refusing_open
        self.addCleanup(setattr, builtins, "open", real_open)
        with state._ledger_lock(target):
            target.write_text("degraded\n", encoding="utf-8")
        self.assertEqual(target.read_text(encoding="utf-8"), "degraded\n")

    def test_ensure_parent_ignores_an_uncreatable_parent(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        blocked = Path(d.name) / "file.txt"
        blocked.write_text("x", encoding="utf-8")
        state._ensure_parent(blocked / "sub" / "STATE.md")  # لا يرفع


class TestDoctorBranches(unittest.TestCase):
    def test_outside_a_project_reports_it(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        previous = Path.cwd()
        os.chdir(d.name)
        self.addCleanup(os.chdir, previous)
        results = doctor.checks()
        names = [name for name, ok, _ in results]
        self.assertIn("جذر المشروع", names)
        self.assertFalse(dict((n, ok) for n, ok, _ in results)["جذر المشروع"])

    def test_corrupt_ledger_is_reported_not_raised(self):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        root = Path(d.name)
        (root / ".qawa").mkdir()
        state_file = root / ".qawa" / "STATE.md"
        state_file.write_text("\x00\x01not a ledger\n", encoding="utf-8")
        previous = Path.cwd()
        os.chdir(root)
        self.addCleanup(os.chdir, previous)
        results = doctor.checks()
        ledger_checks = [r for r in results if "السجل" in r[0]]
        self.assertTrue(ledger_checks)
        self.assertTrue(all(ok for _n, ok, _d in ledger_checks))


class TestRenderAndRouter(unittest.TestCase):
    def test_is_current_false_when_path_is_a_directory(self):
        from qawa.index import load_index
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        as_dir = Path(d.name) / "ROUTER.md"
        as_dir.mkdir()
        self.assertFalse(render.is_current(as_dir, load_index()))

    def test_router_self_check_runs(self):
        out = io.StringIO()
        previous = sys.stdout
        sys.stdout = out
        self.addCleanup(setattr, sys, "stdout", previous)
        try:
            router._self_check()
        finally:
            sys.stdout = previous
        self.assertIn("->", out.getvalue())


if __name__ == "__main__":
    unittest.main()


class TestWorksWithoutAProject(unittest.TestCase):
    """qawa تُستخرج من zip قبل أي qawa init — لا يجوز أن تنهار."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        previous = Path.cwd()
        os.chdir(self.dir.name)
        self.addCleanup(os.chdir, previous)

    def test_boot_prints_a_line_outside_a_project(self):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = cli.main(["boot"])
        self.assertEqual(code, 0, err.getvalue())
        self.assertIn("ROUTER.md", out.getvalue())
        self.assertIn("FAST", out.getvalue())

    def test_boot_honours_an_explicit_mode_outside_a_project(self):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            cli.main(["boot", "--mode", "full"])
        self.assertIn("FULL", out.getvalue())

    def test_doctor_exits_zero_outside_a_project(self):
        """ليس كونك خارج مشروعاً عيباً في qawa."""
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = cli.main(["doctor"])
        self.assertEqual(code, 0, out.getvalue())
        self.assertIn("اختياري", out.getvalue())

    def test_doctor_marks_uninitialized_as_informational(self):
        row = dict((n, ok) for n, ok, _d in doctor.checks())["جذر المشروع"]
        self.assertIsNone(row)   # None = معلومة، لا نجاح ولا فشل
