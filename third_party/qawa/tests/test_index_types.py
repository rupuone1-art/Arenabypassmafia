# -*- coding: utf-8 -*-
"""T2 — تحقّق صريح من أنواع الفهرس.

المطلوب: كل مدخل تالف يُنتج IndexError برسالة تذكر الحقل المُعيب،
لا AttributeError ولا TypeError. رسالة الفهرس التالف هي واجهة المستخدم
الوحيدة عند الخطأ.
"""
import json
import tempfile
import unittest
from pathlib import Path

from qawa.index import IndexError as QawaIndexError, load_index

REAL_SKILLS = str(Path(__file__).resolve().parents[1] / "skills")


def write(obj) -> str:
    d = tempfile.mkdtemp()
    p = Path(d) / "i.json"
    p.write_text(json.dumps(obj, ensure_ascii=False)
                 if not isinstance(obj, str) else obj, encoding="utf-8")
    return str(p)


class TestRootType(unittest.TestCase):
    def test_root_as_list_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(write(["not", "an", "object"]))

    def test_root_as_string_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(write("just a string"))

    def test_root_as_number_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(write(42))


class TestSkillEntryType(unittest.TestCase):
    def test_entry_as_string_rejected(self):
        p = write({"default": {"skill": "a"},
                   "skills": ["just-a-string"]})
        with self.assertRaises(QawaIndexError):
            load_index(p)

    def test_entry_as_list_rejected(self):
        p = write({"default": {"skill": "a"},
                   "skills": [["a", "b"]]})
        with self.assertRaises(QawaIndexError):
            load_index(p)

    def test_entry_as_none_rejected(self):
        p = write({"default": {"skill": "a"}, "skills": [None]})
        with self.assertRaises(QawaIndexError):
            load_index(p)


class TestFieldTypes(unittest.TestCase):
    def _one(self, entry):
        return write({"default": {"skill": "a"},
                      "skills": [dict({"path": "brainstorming/SKILL.md"}, **entry)]})

    def test_name_as_int_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._one({"name": 123}), REAL_SKILLS)

    def test_name_as_none_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._one({"name": None}), REAL_SKILLS)

    def test_name_empty_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._one({"name": "   "}), REAL_SKILLS)

    def test_path_as_int_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._one({"name": "a", "path": 123}), REAL_SKILLS)

    def test_path_empty_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._one({"name": "a", "path": ""}), REAL_SKILLS)

    def test_summary_as_list_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._one({"name": "a", "summary": ["x"]}), REAL_SKILLS)

    def test_routable_as_string_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._one({"name": "a", "routable": "yes"}), REAL_SKILLS)


class TestErrorMessages(unittest.TestCase):
    def test_message_names_the_bad_field(self):
        p = write({"default": {"skill": "a"}, "skills": [{"name": "a", "path": 7}]})
        with self.assertRaises(QawaIndexError) as ctx:
            load_index(p)
        self.assertIn("path", str(ctx.exception).lower())


class TestNoRegression(unittest.TestCase):
    def test_real_index_still_loads(self):
        idx = load_index()
        self.assertGreaterEqual(len(idx.routable), 10)

    def test_valid_entry_with_all_fields_optional(self):
        p = write({"default": {"skill": "a"},
                   "skills": [{"name": "a", "path": "brainstorming/SKILL.md"}]})
        idx = load_index(p, REAL_SKILLS)
        self.assertEqual(idx.skills[0].summary, "")
        self.assertTrue(idx.skills[0].routable)


if __name__ == "__main__":
    unittest.main()


class TestWeightValidation(unittest.TestCase):
    """T3 — الأوزان: bool صنف فرعي من int في Python، فيُقبل خطأً."""

    def _idx(self, keywords):
        return write({"default": {"skill": "a"},
                      "skills": [{"name": "a", "path": "brainstorming/SKILL.md",
                                  "keywords": keywords}]})

    def test_negative_weight_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._idx({"x": -5}), REAL_SKILLS)

    def test_zero_weight_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._idx({"x": 0}), REAL_SKILLS)

    def test_true_as_weight_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._idx({"x": True}), REAL_SKILLS)

    def test_false_as_weight_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._idx({"x": False}), REAL_SKILLS)

    def test_float_weight_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._idx({"x": 1.5}), REAL_SKILLS)

    def test_string_weight_rejected(self):
        with self.assertRaises(QawaIndexError):
            load_index(self._idx({"x": "5"}), REAL_SKILLS)

    def test_weight_one_accepted(self):
        idx = load_index(self._idx({"x": 1}), REAL_SKILLS)
        self.assertEqual(idx.skills[0].keywords, {"x": 1})

    def test_large_weight_accepted(self):
        idx = load_index(self._idx({"x": 100}), REAL_SKILLS)
        self.assertEqual(idx.skills[0].keywords["x"], 100)

    def test_message_names_the_keyword(self):
        with self.assertRaises(QawaIndexError) as ctx:
            load_index(self._idx({"secret-key": -1}), REAL_SKILLS)
        self.assertIn("secret-key", str(ctx.exception))
