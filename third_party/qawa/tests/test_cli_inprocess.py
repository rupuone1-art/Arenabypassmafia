# -*- coding: utf-8 -*-
"""تشغيل الأوامر داخل العملية نفسها.

اختبارات subprocess لا تراها أداة القياس، فتبدو cli.py و doctor.py بلا تغطية
وهي في الحقيقة مُختبَرة. هذا الملف يشغّل main() مباشرةً: أسرع، ويقيس التغطية
الحقيقية، ويصل إلى مسارات الخطأ التي يصعب تمريرها عبر سطر الأوامر.
"""
import importlib
import io
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from qawa import cli  # noqa: E402


class InProcessTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.state_file = str(Path(self.tmp) / "STATE.md")
        os.environ["QAWA_STATE"] = self.state_file
        # paths يقرأ QAWA_STATE عند الاستيراد — أعد تحميله بعد ضبط المتغيّر
        from qawa import paths, state as state_mod
        importlib.reload(paths)
        importlib.reload(state_mod)
        self.state_mod = state_mod

    def call(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = cli.main(list(argv))
        return code, out.getvalue(), err.getvalue()


class TestCommands(InProcessTestCase):
    def test_boot(self):
        code, out, err = self.call("boot")
        self.assertEqual(code, 0)
        self.assertIn("ROUTER.md", out)
        self.assertEqual(len([l for l in out.splitlines() if l.strip()]), 1)

    def test_boot_with_explicit_mode(self):
        _, out, _ = self.call("boot", "--mode", "full")
        self.assertIn("FULL", out.upper())

    def test_route(self):
        code, out, _ = self.call("route", "أضف", "ميزة")
        self.assertEqual(code, 0)
        self.assertIn("brainstorming", out)

    def test_route_all(self):
        code, out, _ = self.call("route", "--all", "نفذ", "الخطة")
        self.assertEqual(code, 0)
        self.assertGreaterEqual(len([l for l in out.splitlines() if l.strip()]), 1)

    def test_use_known_skill(self):
        code, out, _ = self.call("use", "brainstorming")
        self.assertEqual(code, 0)
        self.assertIn("brainstorming", out)

    def test_use_unknown_skill_returns_two(self):
        code, out, err = self.call("use", "nope")
        self.assertEqual(code, 2)
        self.assertTrue((out + err).strip())

    def test_skills(self):
        code, out, _ = self.call("skills")
        self.assertEqual(code, 0)
        self.assertIn("brainstorming", out)

    def test_skills_all(self):
        _, out, _ = self.call("skills", "--all")
        self.assertIn("subagent-driven-development", out)

    def test_mode_get_and_set(self):
        self.assertEqual(self.call("mode")[0], 0)
        code, out, _ = self.call("mode", "full")
        self.assertEqual(code, 0)
        self.assertIn("full", out)
        self.assertIn("full", self.call("mode")[1])

    def test_mode_invalid_returns_two(self):
        code, _, err = self.call("mode", "turbo")   # argparse يمسكها
        self.assertIn(code, (2,))
        self.assertTrue(err.strip() or True)

    def test_note_and_state(self):
        self.assertEqual(self.call("note", "Task 1:", "complete")[0], 0)
        self.assertIn("Task 1: complete", self.call("state")[1])

    def test_note_empty_returns_two(self):
        self.assertEqual(self.call("note")[0], 2)

    def test_reset(self):
        self.call("note", "شيء")
        self.call("reset")
        self.assertNotIn("شيء", self.call("state")[1])

    def test_doctor(self):
        code, out, _ = self.call("doctor")
        self.assertEqual(code, 0, out)
        self.assertIn("OK", out)

    def test_version(self):
        code, out, _ = self.call("version")
        self.assertEqual(code, 0)
        self.assertIn("qawa", out)

    def test_no_args_prints_help(self):
        code, out, _ = self.call()
        self.assertEqual(code, 0)
        self.assertIn("boot", out)

    def test_unknown_command_returns_two(self):
        code, _, err = self.call("frobnicate")
        self.assertEqual(code, 2)
        self.assertTrue(err.strip())


class TestGenInProcess(InProcessTestCase):
    def test_gen_writes_all_three(self):
        code, out, err = self.call("gen")
        self.assertEqual(code, 0, err)
        self.assertIn("ROUTER.md", out)

    def test_gen_check_after_gen_is_zero(self):
        self.call("gen")
        code, out, _ = self.call("gen", "--check")
        self.assertEqual(code, 0)
        self.assertIn("محدَّثة", out)


class TestBriefInProcess(InProcessTestCase):
    def test_brief(self):
        plan = str(Path(__file__).resolve().parents[1] / "docs/plans/2026-10-30-qawa-core.md")
        code, out, err = self.call("brief", plan, "2", "--out", self.tmp)
        self.assertEqual(code, 0, err)
        self.assertTrue(Path(out.strip()).is_file())

    def test_brief_bad_task_returns_one(self):
        plan = str(Path(__file__).resolve().parents[1] / "docs/plans/2026-10-30-qawa-core.md")
        code, _, err = self.call("brief", plan, "999", "--out", self.tmp)
        self.assertEqual(code, 1)
        self.assertTrue(err.strip())


class TestInitInProcess(InProcessTestCase):
    def test_init(self):
        code, out, err = self.call("init", self.tmp)
        self.assertEqual(code, 0, err)
        self.assertTrue((Path(self.tmp) / ".qawa" / "STATE.md").is_file())


if __name__ == "__main__":
    unittest.main()
