# -*- coding: utf-8 -*-
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from qawa import render
from qawa.index import load_index

ROOT = Path(__file__).resolve().parents[1]
QAWA = str(ROOT / "qawa")


class TestRenderRouter(unittest.TestCase):
    def setUp(self):
        self.idx = load_index()

    def test_contains_every_routable_skill(self):
        md = render.render_router(self.idx)
        for s in self.idx.routable:
            self.assertIn(s.name, md)

    def test_contains_every_skill_path(self):
        md = render.render_router(self.idx)
        for s in self.idx.routable:
            self.assertIn(s.path, md)

    def test_states_the_no_subagent_override(self):
        md = render.render_router(self.idx)
        self.assertIn("subagent", md)
        self.assertIn("executing-plans", md)

    def test_states_the_no_skill_tool_override(self):
        md = render.render_router(self.idx)
        self.assertIn("Skill", md)

    def test_excludes_unavailable_skills_from_the_routing_table(self):
        # تُذكر في قسم التحذير (بوصفها ممنوعة)، لكن لا يجوز أن تظهر في جدول التوجيه
        table = [ln for ln in render.render_router(self.idx).splitlines()
                 if ln.startswith("| `")]
        for row in table:
            self.assertNotIn("subagent-driven-development", row)
            self.assertNotIn("dispatching-parallel-agents", row)
        self.assertEqual(len(table), len(self.idx.routable))

    def test_is_reproducible(self):
        self.assertEqual(render.render_router(self.idx), render.render_router(self.idx))

    def test_is_small(self):
        # البوابة كلها يجب أن تبقى رخيصة: أقل من 4k توكن ≈ 16KB
        self.assertLess(len(render.render_router(self.idx).encode("utf-8")), 16_000)


class TestRenderBootstrap(unittest.TestCase):
    def setUp(self):
        self.idx = load_index()

    def test_bootstrap_is_one_line(self):
        line = render.render_bootstrap(self.idx, router_path="/x/ROUTER.md", mode="fast")
        self.assertEqual(len(line.strip().splitlines()), 1)

    def test_bootstrap_names_router_and_mode(self):
        line = render.render_bootstrap(self.idx, router_path="/x/ROUTER.md", mode="full")
        self.assertIn("/x/ROUTER.md", line)
        self.assertIn("FULL", line.upper())

    def test_agents_mentions_mode_and_ledger(self):
        md = render.render_agents(self.idx)
        self.assertIn("MODE", md)
        self.assertIn("ROUTER.md", md)


class TestGenCheck(unittest.TestCase):
    def test_check_passes_on_a_freshly_written_file(self):
        idx = load_index()
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "ROUTER.md"
            p.write_text(render.render_router(idx), encoding="utf-8")
            self.assertTrue(render.is_current(p, idx))

    def test_check_fails_on_a_stale_file(self):
        idx = load_index()
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "ROUTER.md"
            p.write_text(render.render_router(idx) + "\n<!-- عدّل يدوياً -->\n",
                         encoding="utf-8")
            self.assertFalse(render.is_current(p, idx))

    def test_check_fails_when_missing(self):
        idx = load_index()
        self.assertFalse(render.is_current(Path("/nonexistent/ROUTER.md"), idx))


class TestGenCli(unittest.TestCase):
    def run_qawa(self, *args):
        e = dict(os.environ, PYTHONIOENCODING="utf-8")
        return subprocess.run([sys.executable, QAWA, *args], capture_output=True,
                              text=True, encoding="utf-8", env=e, cwd=str(ROOT))

    def test_gen_help_exists(self):
        self.assertIn("gen", self.run_qawa("--help").stdout)

    def test_gen_check_reports_status(self):
        r = self.run_qawa("gen", "--check")
        self.assertIn(r.returncode, (0, 1))
        self.assertTrue((r.stdout + r.stderr).strip())


if __name__ == "__main__":
    unittest.main()
