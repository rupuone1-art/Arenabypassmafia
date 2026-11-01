# -*- coding: utf-8 -*-
"""T9 (BUG-07) — qawa gen يولّد ثلاثة ملفات؛ --check يجب أن يفحصها كلها."""
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from qawa import cli, render  # noqa: E402
from qawa.index import load_index  # noqa: E402


class TestStaleCoversAllThree(unittest.TestCase):
    """المنطق يُفحص على مجلد مؤقت — بلا عبث بملفات المستودع."""

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.dir.cleanup)
        self.root = Path(self.dir.name)
        self.idx = load_index()
        self.files = render.write_all(self.idx, root=str(self.root))

    def path_of(self, label):
        return self.files[label]

    def test_nothing_stale_right_after_generation(self):
        self.assertEqual(render.stale_generated(self.idx, root=str(self.root)), [])

    def test_edited_router_detected(self):
        p = self.path_of("ROUTER.md")
        p.write_text(p.read_text(encoding="utf-8") + "\n<!-- تعديل -->\n", encoding="utf-8")
        self.assertIn("ROUTER.md", render.stale_generated(self.idx, root=str(self.root)))

    def test_edited_agents_detected(self):
        p = self.path_of("AGENTS.md")
        p.write_text(p.read_text(encoding="utf-8") + "\n<!-- تعديل -->\n", encoding="utf-8")
        self.assertIn("AGENTS.md", render.stale_generated(self.idx, root=str(self.root)))

    def test_edited_bootstrap_detected(self):
        p = self.path_of("BOOTSTRAP.md")
        p.write_text(p.read_text(encoding="utf-8") + "\n<!-- تعديل -->\n", encoding="utf-8")
        self.assertIn("BOOTSTRAP.md", render.stale_generated(self.idx, root=str(self.root)))

    def test_deleted_file_detected(self):
        self.path_of("AGENTS.md").unlink()
        self.assertIn("AGENTS.md", render.stale_generated(self.idx, root=str(self.root)))

    def test_single_byte_change_detected(self):
        p = self.path_of("ROUTER.md")
        text = p.read_text(encoding="utf-8")
        p.write_text(text.replace("qawa —", "qawa –"), encoding="utf-8")
        self.assertIn("ROUTER.md", render.stale_generated(self.idx, root=str(self.root)))


class TestCliCheck(unittest.TestCase):
    """الأمر نفسه، على الجذر الحقيقي، مع استعادة الحالة."""

    def call(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = cli.main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def setUp(self):
        self.addCleanup(cli.main, ["gen"])

    def test_check_passes_after_gen(self):
        self.call("gen")
        code, out, err = self.call("gen", "--check")
        self.assertEqual(code, 0, out + err)

    def test_check_fails_and_names_the_file(self):
        self.call("gen")
        agents = ROOT / "AGENTS.md"
        original = agents.read_text(encoding="utf-8")
        try:
            agents.write_text(original + "\n<!-- تعديل يدوي -->\n", encoding="utf-8")
            code, out, err = self.call("gen", "--check")
            self.assertEqual(code, 1)
            self.assertIn("AGENTS", out + err)
        finally:
            agents.write_text(original, encoding="utf-8")

    def test_check_never_writes(self):
        self.call("gen")
        before = {p.name: p.read_text(encoding="utf-8")
                  for p in [ROOT / "AGENTS.md", ROOT / "bootstrap" / "ROUTER.md"]}
        self.call("gen", "--check")
        after = {p.name: p.read_text(encoding="utf-8")
                 for p in [ROOT / "AGENTS.md", ROOT / "bootstrap" / "ROUTER.md"]}
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
