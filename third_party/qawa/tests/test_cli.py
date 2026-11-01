# -*- coding: utf-8 -*-
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QAWA = str(ROOT / "qawa")


def run(*args, env=None, cwd=None):
    e = dict(os.environ)
    e["PYTHONIOENCODING"] = "utf-8"
    if env:
        e.update(env)
    return subprocess.run([sys.executable, QAWA, *args],
                          capture_output=True, text=True, encoding="utf-8",
                          env=e, cwd=cwd or str(ROOT))


class CliTestCase(unittest.TestCase):
    def setUp(self):
        fd, self.tmp = tempfile.mkstemp(suffix=".md")
        os.close(fd)
        Path(self.tmp).unlink()
        self.env = {"QAWA_STATE": self.tmp}
        self.addCleanup(lambda: Path(self.tmp).unlink(missing_ok=True))


class TestBasics(CliTestCase):
    def test_version(self):
        r = run("version")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertRegex(r.stdout, r"\d+\.\d+\.\d+")

    def test_help(self):
        r = run("--help")
        self.assertEqual(r.returncode, 0)
        for cmd in ["boot", "route", "use", "skills", "mode", "state", "note", "doctor"]:
            self.assertIn(cmd, r.stdout)

    def test_no_args_shows_help(self):
        r = run()
        self.assertEqual(r.returncode, 0)
        self.assertIn("boot", r.stdout)

    def test_unknown_command_exits_nonzero(self):
        r = run("frobnicate")
        self.assertNotEqual(r.returncode, 0)
        self.assertTrue(r.stdout or r.stderr)


class TestBoot(CliTestCase):
    def test_boot_prints_a_single_actionable_line(self):
        r = run("boot")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(len([l for l in r.stdout.splitlines() if l.strip()]), 1)

    def test_boot_names_the_router_file(self):
        r = run("boot")
        self.assertIn("ROUTER.md", r.stdout)

    def test_boot_carries_current_mode(self):
        run("mode", "full", env=self.env)
        self.assertIn("FULL", run("boot", env=self.env).stdout.upper())


class TestRoute(CliTestCase):
    def test_routes_build_request(self):
        r = run("route", "أضف ميزة المفضلة")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("brainstorming", r.stdout)

    def test_routes_debug_request(self):
        self.assertIn("systematic-debugging",
                      run("route", "الكود يرمي exception").stdout)

    def test_reports_default_when_nothing_matches(self):
        out = run("route", "مرحبا").stdout
        self.assertIn("brainstorming", out)
        self.assertIn("افتراضي", out)

    def test_route_needs_an_argument(self):
        self.assertNotEqual(run("route").returncode, 0)


class TestUse(CliTestCase):
    def test_prints_skill_body(self):
        r = run("use", "test-driven-development")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("test-driven-development", r.stdout)
        self.assertGreater(len(r.stdout), 2000)

    def test_path_flag_prints_path_only(self):
        r = run("use", "brainstorming", "--path")
        self.assertEqual(r.returncode, 0)
        self.assertTrue(Path(r.stdout.strip()).is_file())

    def test_unknown_skill_exits_2_and_suggests(self):
        r = run("use", "brainstroming")          # typo مقصود
        self.assertEqual(r.returncode, 2)
        self.assertIn("brainstorming", r.stdout + r.stderr)

    def test_missing_argument_exits_nonzero(self):
        self.assertNotEqual(run("use").returncode, 0)


class TestSkills(CliTestCase):
    def test_lists_routable_skills(self):
        r = run("skills")
        self.assertEqual(r.returncode, 0)
        for name in ["brainstorming", "test-driven-development", "writing-plans"]:
            self.assertIn(name, r.stdout)

    def test_hides_unavailable_by_default(self):
        self.assertNotIn("subagent-driven-development", run("skills").stdout)

    def test_all_flag_shows_unavailable(self):
        self.assertIn("subagent-driven-development", run("skills", "--all").stdout)


class TestModeAndState(CliTestCase):
    def test_mode_round_trip(self):
        self.assertIn("fast", run("mode", env=self.env).stdout)
        run("mode", "full", env=self.env)
        self.assertIn("full", run("mode", env=self.env).stdout)

    def test_bad_mode_exits_nonzero(self):
        self.assertNotEqual(run("mode", "turbo", env=self.env).returncode, 0)

    def test_note_then_state(self):
        run("note", "Task 1: complete", env=self.env)
        self.assertIn("Task 1: complete", run("state", env=self.env).stdout)

    def test_note_needs_text(self):
        self.assertNotEqual(run("note", env=self.env).returncode, 0)

    def test_reset_clears(self):
        run("note", "شيء", env=self.env)
        run("reset", env=self.env)
        self.assertNotIn("شيء", run("state", env=self.env).stdout)


class TestDoctor(CliTestCase):
    def test_doctor_exits_zero_when_healthy(self):
        r = run("doctor")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertIn("OK", r.stdout)

    def test_doctor_reports_python_version(self):
        self.assertIn("Python", run("doctor").stdout)


class TestRunsFromAnywhere(CliTestCase):
    def test_works_from_another_directory(self):
        r = run("version", cwd=tempfile.gettempdir())
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertRegex(r.stdout, r"\d+\.\d+\.\d+")


if __name__ == "__main__":
    unittest.main()
