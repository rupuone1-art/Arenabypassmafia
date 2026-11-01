# -*- coding: utf-8 -*-
import unittest
from qawa.match import normalize, tokenize


class TestNormalize(unittest.TestCase):
    def test_strips_diacritics(self):
        self.assertEqual(normalize("مُحَمَّد"), "محمد")

    def test_unifies_alef_variants(self):
        for ch in "أإآٱ":
            self.assertEqual(normalize(ch + "حمد"), normalize("احمد"))

    def test_ta_marbuta_and_alef_maqsura(self):
        self.assertEqual(normalize("مدرسة"), normalize("مدرسه"))
        self.assertEqual(normalize("مستشفى"), normalize("مستشفي"))

    def test_arabic_digits(self):
        self.assertEqual(normalize("٢٠٢٦"), "2026")

    def test_strips_tatweel(self):
        self.assertEqual(normalize("محــمد"), "محمد")

    def test_lowercases_latin(self):
        self.assertEqual(normalize("Exception"), "exception")

    def test_collapses_whitespace(self):
        self.assertEqual(normalize("  أضف   ميزة  "), "اضف ميزه")

    def test_idempotent(self):
        once = normalize("الأَحْمَد")
        self.assertEqual(normalize(once), once)

    def test_empty(self):
        self.assertEqual(normalize(""), "")


class TestTokenize(unittest.TestCase):
    def test_splits_on_whitespace_and_punct(self):
        self.assertEqual(tokenize("أضف ميزة، جديدة!"), ["اضف", "ميزه", "جديده"])

    def test_keeps_underscore_and_dash(self):
        self.assertEqual(tokenize("test_driven development"), ["test_driven", "development"])

    def test_empty(self):
        self.assertEqual(tokenize(""), [])


if __name__ == "__main__":
    unittest.main()
