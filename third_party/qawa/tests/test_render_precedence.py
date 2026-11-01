# -*- coding: utf-8 -*-
"""T11 (BUG-09) — المهارة التزام، لكن ليس فوق تعليمات المستخدم ولا حكم الوكيل."""
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from qawa import render  # noqa: E402
from qawa.index import load_index  # noqa: E402


class TestPrecedenceBlock(unittest.TestCase):
    def setUp(self):
        self.idx = load_index()
        self.router = render.render_router(self.idx)
        self.agents = render.render_agents(self.idx)

    def test_router_states_precedence(self):
        for text in (self.router, self.agents):
            self.assertIn("ترتيب الأولوية", text, "لا يوجد ترتيب أولوية صريح")

    def test_user_instructions_rank_first(self):
        for text in (self.router, self.agents):
            self.assertIn("تعليمات المستخدم", text)
            self.assertIn("المهارة المنطبقة", text)

    def test_precedence_precedes_the_rule(self):
        i_order = self.router.index("ترتيب الأولوية")
        i_rule = self.router.index("غير قابلة للتفاوض")
        self.assertLess(i_order, i_rule)

    def test_no_absolute_commitment_wording(self):
        for text in (self.router, self.agents):
            self.assertNotIn("لا خيار", text,
                             "عبارة «التزام، لا خيار» تعلّق حكم الوكيل")

    def test_environment_constraints_mentioned(self):
        self.assertIn("قيود بيئة التنفيذ", self.router)

    def test_rule_softened(self):
        self.assertIn("ما دامت منطبقة", self.router)

    def test_generated_files_carry_the_block(self):
        router_file = ROOT / "bootstrap" / "ROUTER.md"
        agents_file = ROOT / "AGENTS.md"
        for f in (router_file, agents_file):
            self.assertIn("ترتيب الأولوية", f.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
