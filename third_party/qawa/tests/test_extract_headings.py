# -*- coding: utf-8 -*-
"""T7 (BUG-05) — استخراج المهام يجب أن يكون واعياً بمستوى العنوان."""
import tempfile
import unittest
from pathlib import Path

from qawa import brief


def plan(text) -> str:
    d = tempfile.mkdtemp()
    p = Path(d) / "p.md"
    p.write_text(text, encoding="utf-8")
    return str(p)


class TestNestedHeadings(unittest.TestCase):
    def test_h4_inside_task_is_kept(self):
        p = plan("""### Task 1: الأولى

مقدمة.

#### Implementation Details

تفاصيل مهمة.

### Task 2: الثانية
محتوى.
""")
        body = brief.extract_task(p, 1)
        self.assertIn("تفاصيل مهمة", body)
        self.assertIn("#### Implementation Details", body)
        self.assertNotIn("الثانية", body)

    def test_h5_inside_task_is_kept(self):
        p = plan("""### Task 1: الأولى

##### Notes

ملاحظة داخلية.

### Task 2: الثانية
""")
        self.assertIn("ملاحظة داخلية", brief.extract_task(p, 1))

    def test_same_level_heading_ends_the_task(self):
        p = plan("""### Task 1: الأولى
محتوى 1

### Task 2: الثانية
محتوى 2
""")
        body = brief.extract_task(p, 1)
        self.assertIn("محتوى 1", body)
        self.assertNotIn("محتوى 2", body)


class TestDifferentTaskLevels(unittest.TestCase):
    def test_h2_tasks(self):
        p = plan("""## Task 1: الأولى
محتوى 1

## Task 2: الثانية
محتوى 2
""")
        body = brief.extract_task(p, 1)
        self.assertIn("محتوى 1", body)
        self.assertNotIn("محتوى 2", body)

    def test_h4_tasks_with_h5_inside(self):
        p = plan("""#### Task 1: الأولى

##### فرعي
داخلي

#### Task 2: الثانية
""")
        body = brief.extract_task(p, 1)
        self.assertIn("داخلي", body)
        self.assertNotIn("الثانية", body)

    def test_higher_level_heading_ends_the_task(self):
        p = plan("""### Task 1: الأولى
محتوى

## قسم جديد
""")
        self.assertNotIn("قسم جديد", brief.extract_task(p, 1))


class TestBoundaries(unittest.TestCase):
    def test_last_task_to_end_of_file(self):
        p = plan("""### Task 1: الأولى
أ

### Task 2: الأخيرة
ب
سطر أخير
""")
        body = brief.extract_task(p, 2)
        self.assertIn("سطر أخير", body)

    def test_horizontal_rule_ends_the_task(self):
        p = plan("""### Task 1: الأولى
محتوى

---

### Task 2: الثانية
""")
        self.assertNotIn("الثانية", brief.extract_task(p, 1))

    def test_heading_kept_in_output(self):
        p = plan("### Task 3: الثالثة\nمحتوى\n")
        self.assertIn("### Task 3", brief.extract_task(p, 3))


class TestErrors(unittest.TestCase):
    def test_missing_task_lists_available(self):
        p = plan("### Task 1: أ\n### Task 2: ب\n")
        with self.assertRaises(brief.BriefError) as ctx:
            brief.extract_task(p, 7)
        self.assertIn("7", str(ctx.exception))
        self.assertIn("[1, 2]", str(ctx.exception))

    def test_count_tasks(self):
        self.assertEqual(brief.count_tasks(plan(
            "### Task 1: أ\n#### فرعي\n### Task 2: ب\n")), 2)


if __name__ == "__main__":
    unittest.main()
