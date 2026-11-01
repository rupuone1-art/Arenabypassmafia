# -*- coding: utf-8 -*-
import os
import tempfile
import unittest
from pathlib import Path

from qawa import state


class StateTestCase(unittest.TestCase):
    def setUp(self):
        fd, self.tmp = tempfile.mkstemp(suffix=".md")
        os.close(fd)
        Path(self.tmp).unlink()          # يبدأ من العدم
        self.addCleanup(lambda: Path(self.tmp).unlink(missing_ok=True))


class TestMode(StateTestCase):
    def test_default_is_fast(self):
        self.assertEqual(state.get_mode(self.tmp), "fast")

    def test_set_and_get_full(self):
        state.set_mode("full", self.tmp)
        self.assertEqual(state.get_mode(self.tmp), "full")

    def test_mode_is_case_insensitive(self):
        state.set_mode("FULL", self.tmp)
        self.assertEqual(state.get_mode(self.tmp), "full")

    def test_invalid_mode_rejected(self):
        with self.assertRaises(ValueError):
            state.set_mode("turbo", self.tmp)

    def test_mode_survives_notes(self):
        state.set_mode("full", self.tmp)
        state.note("Task 1: complete", self.tmp)
        self.assertEqual(state.get_mode(self.tmp), "full")


class TestNote(StateTestCase):
    def test_first_note_creates_file_with_header(self):
        state.note("Task 1: complete", self.tmp)
        text = Path(self.tmp).read_text(encoding="utf-8")
        self.assertIn("MODE:", text)
        self.assertIn("Task 1: complete", text)

    def test_note_is_dated(self):
        state.note("hello", self.tmp)
        self.assertRegex(Path(self.tmp).read_text(encoding="utf-8"),
                         r"- \[\d{4}-\d{2}-\d{2}\] hello")

    def test_notes_accumulate_in_order(self):
        state.note("one", self.tmp)
        state.note("two", self.tmp)
        lines = state.ledger(self.tmp)
        self.assertEqual(lines, ["one", "two"])

    def test_ledger_empty_when_no_notes(self):
        self.assertEqual(state.ledger(self.tmp), [])

    def test_blank_note_rejected(self):
        with self.assertRaises(ValueError):
            state.note("   ", self.tmp)


class TestCorruption(StateTestCase):
    def test_corrupt_file_does_not_crash(self):
        Path(self.tmp).write_text("\x00\x01 not markdown \xff", encoding="utf-8", errors="replace")
        self.assertEqual(state.get_mode(self.tmp), "fast")

    def test_no_mode_line_defaults_to_fast(self):
        Path(self.tmp).write_text("# خربشة\n- [2026-01-01] شيء\n", encoding="utf-8")
        self.assertEqual(state.get_mode(self.tmp), "fast")

    def test_unknown_mode_line_defaults_to_fast(self):
        Path(self.tmp).write_text("MODE: banana\n", encoding="utf-8")
        self.assertEqual(state.get_mode(self.tmp), "fast")

    def test_state_file_is_utf8(self):
        state.note("مهمة عربية", self.tmp)
        self.assertIn("مهمة عربية", Path(self.tmp).read_text(encoding="utf-8"))


class TestReset(StateTestCase):
    def test_reset_clears_ledger_and_keeps_fast(self):
        state.note("one", self.tmp)
        state.set_mode("full", self.tmp)
        state.reset(self.tmp)
        self.assertEqual(state.ledger(self.tmp), [])
        self.assertEqual(state.get_mode(self.tmp), "fast")


if __name__ == "__main__":
    unittest.main()
