# -*- coding: utf-8 -*-
import unittest
from qawa.index import load_index, IndexError as QawaIndexError
from qawa.router import route, RouteResult


class TestRoute(unittest.TestCase):
    def test_build_request_routes_to_brainstorming(self):
        self.assertEqual(route("أضف ميزة المفضلة").skill, "brainstorming")

    def test_exception_routes_to_debugging(self):
        self.assertEqual(route("الكود يرمي exception وقت الـ deploy").skill,
                         "systematic-debugging")

    def test_arabic_fail_word_routes_to_debugging(self):
        self.assertEqual(route("الاختبارات تفشل بعد الـ merge").skill,
                         "systematic-debugging")

    def test_diacritics_do_not_change_routing(self):
        plain = route("اضف ميزة").skill
        vocalized = route("أَضِف مِيزةً").skill
        self.assertEqual(plain, vocalized)

    def test_plan_request(self):
        self.assertEqual(route("اكتب خطة لتقسيم الـ monolith").skill, "writing-plans")

    def test_verify_request(self):
        self.assertEqual(route("تأكد أن الاختبارات فعلاً تمر").skill,
                         "verification-before-completion")

    def test_merge_request(self):
        self.assertEqual(route("ادمج الفرع وافتح PR").skill,
                         "finishing-a-development-branch")

    def test_unknown_text_falls_back_to_default_with_zero_score(self):
        r = route("مرحبا")
        self.assertEqual(r.skill, "brainstorming")
        self.assertEqual(r.score, 0)
        self.assertTrue(r.is_default)

    def test_latin_keyword_does_not_match_longer_word(self):
        # 'add' must not fire inside 'address'; the result must be the
        # no-match default, not a scored hit.
        r = route("explain this address parsing")
        self.assertTrue(r.is_default)
        self.assertEqual(r.score, 0)
        self.assertNotIn("add", r.matched)

    def test_result_carries_path_and_summary(self):
        r = route("أضف ميزة")
        self.assertTrue(r.path.endswith("SKILL.md"))
        self.assertTrue(r.summary)

    def test_route_is_deterministic(self):
        self.assertEqual(route("نفذ الخطة"), route("نفذ الخطة"))


class TestIndex(unittest.TestCase):
    def test_loads_every_available_skill(self):
        idx = load_index()
        self.assertGreaterEqual(len(idx.routable), 10)

    def test_every_routable_skill_file_exists(self):
        idx = load_index()
        for s in idx.routable:
            self.assertTrue(s.path_obj.exists(), f"missing {s.path_obj}")

    def test_unavailable_skills_are_not_routable(self):
        idx = load_index()
        names = {s.name for s in idx.routable}
        self.assertNotIn("subagent-driven-development", names)
        self.assertNotIn("dispatching-parallel-agents", names)

    def test_duplicate_names_rejected(self):
        import json, tempfile, os
        from qawa.index import load_index
        bad = {"version": 1, "default": {"skill": "a"},
               "skills": [{"name": "a", "path": "brainstorming/SKILL.md", "keywords": {}},
                          {"name": "a", "path": "writing-plans/SKILL.md", "keywords": {}}]}
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                         encoding="utf-8") as fh:
            json.dump(bad, fh)
            tmp = fh.name
        try:
            with self.assertRaises(QawaIndexError):
                load_index(tmp)
        finally:
            os.unlink(tmp)

    def test_malformed_json_rejected(self):
        import tempfile, os
        from qawa.index import load_index
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                         encoding="utf-8") as fh:
            fh.write("{ not json")
            tmp = fh.name
        try:
            with self.assertRaises(QawaIndexError):
                load_index(tmp)
        finally:
            os.unlink(tmp)

    def test_missing_index_file_rejected(self):
        from qawa.index import load_index
        with self.assertRaises(QawaIndexError):
            load_index("/nonexistent/_index.json")


if __name__ == "__main__":
    unittest.main()
