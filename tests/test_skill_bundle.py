"""Проверяет сохранённые upstream-файлы и адаптер Arena без сети."""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "tools/skills_catalog.py"
QAWA = ROOT / "third_party/qawa/qawa"


def run_python(script: Path, *args: str, extra_env: dict = None) -> subprocess.CompletedProcess:
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        [sys.executable, "-B", str(script), *args],
        cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", check=False,
    )


class CatalogTests(unittest.TestCase):
    def test_lists_real_skills_with_sources(self) -> None:
        result = run_python(CATALOG, "list")
        self.assertEqual(result.returncode, 0, result.stderr)
        for skill in (
            "qawa/systematic-debugging", "superpowers/writing-plans",
            "anthropic/frontend-design", "vercel/react-best-practices",
            "skills-cli/find-skills", "office/office-pptx", "openai/pdf",
        ):
            with self.subTest(skill=skill):
                self.assertIn(skill, result.stdout)
        self.assertIn("включая копии", result.stdout)
        self.assertIn("подагенты", result.stdout)

    def test_show_returns_upstream_file_and_rejects_unknown_paths(self) -> None:
        result = run_python(CATALOG, "show", "qawa/systematic-debugging")
        expected = (ROOT / "third_party/qawa/skills/systematic-debugging/SKILL.md").read_text(encoding="utf-8")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, expected)
        for value in ("../../.git/config", "qawa/../../AGENTS.md", "unknown/skill"):
            with self.subTest(value=value):
                result = run_python(CATALOG, "show", value)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("[core]", result.stdout)

    def test_russian_suggestions_and_no_fake_default(self) -> None:
        cases = (
            ("исправь ошибку в кнопке", "qawa/systematic-debugging"),
            ("составь план проекта", "qawa/writing-plans"),
            ("сделай интерфейс на React", "anthropic/frontend-design"),
            ("сделай интерфейс на React", "vercel/react-best-practices"),
            ("сделай презентацию в PPTX", "office/office-pptx"),
            ("открой PDF", "openai/pdf"),
        )
        for task, skill in cases:
            with self.subTest(task=task, skill=skill):
                result = run_python(CATALOG, "suggest", task)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(skill, result.stdout)
        result = run_python(CATALOG, "suggest", "привет")
        self.assertIn("ничего не найдено", result.stdout.lower())
        self.assertNotIn("brainstorming", result.stdout)

    def test_find_and_documented_skill_paths(self) -> None:
        result = run_python(CATALOG, "find", "react")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("vercel/react-best-practices", result.stdout)
        guide = (ROOT / ".agents/ARENA_SKILLS.md").read_text(encoding="utf-8")
        paths = re.findall(r"`(third_party/[^`\n]+/SKILL\.md)`", guide)
        self.assertGreaterEqual(len(paths), 10)
        for path in paths:
            with self.subTest(path=path):
                self.assertTrue((ROOT / path).is_file())
        self.assertFalse((ROOT / ".agents/skills").exists(), "Старый самодельный набор не должен смешиваться с оригиналами")


class ProvenanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.lock = json.loads((ROOT / "upstream-lock.json").read_text(encoding="utf-8"))

    def test_locked_sources_and_original_file_counts(self) -> None:
        names = {source["name"] for source in self.lock["sources"]}
        self.assertEqual(names, {"qawa", "superpowers", "anthropic", "vercel-agent-skills", "skills-cli", "office-agent-skills", "openai-pdf"})
        for source in self.lock["sources"]:
            with self.subTest(source=source["name"]):
                self.assertRegex(source["commit"], r"^[0-9a-f]{40}$")
                base = ROOT / source["path"]
                files = [p for p in base.rglob("*") if p.is_file() and not p.is_symlink()]
                self.assertEqual(len(files), source["vendored_files"])
                self.assertFalse(any(p.is_symlink() for p in base.rglob("*")))

    def test_all_vendored_checksums(self) -> None:
        manifest = ROOT / "vendor-checksums.sha256"
        seen = set()
        for line in manifest.read_text(encoding="utf-8").splitlines():
            digest, relative = line.split("  ", 1)
            path = (ROOT / relative).resolve()
            self.assertTrue(path.is_relative_to(ROOT), relative)
            self.assertTrue(path.is_file(), relative)
            self.assertNotIn(relative, seen)
            seen.add(relative)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest, relative)
        expected = {self.lock["skills_cli_release"]["path"]}
        for source in self.lock["sources"]:
            expected.update(
                p.relative_to(ROOT).as_posix()
                for p in (ROOT / source["path"]).rglob("*")
                if p.is_file() and not p.is_symlink()
            )
        self.assertEqual(seen, expected)

    def test_licensed_and_restricted_skills(self) -> None:
        anthropic = ROOT / "third_party/anthropic/skills"
        included = list(anthropic.iterdir())
        self.assertEqual(len(included), 14)
        for skill in included:
            with self.subTest(skill=skill.name):
                self.assertIn("Apache License", (skill / "LICENSE.txt").read_text(encoding="utf-8"))
                self.assertTrue((skill / "SKILL.md").is_file())
        for name in ("docx", "pdf", "pptx", "xlsx", "doc-coauthoring"):
            self.assertFalse((anthropic / name).exists())
        for name in ("composition-patterns", "react-best-practices", "react-native-skills", "react-view-transitions"):
            content = (ROOT / f"third_party/vercel/skills/{name}/SKILL.md").read_text(encoding="utf-8")
            self.assertRegex(content, r"(?m)^license:\s*MIT\s*$")
        self.assertTrue((ROOT / "third_party/office-agent-skills/LICENSE").is_file())
        self.assertIn("Apache License", (ROOT / "third_party/openai/skills/pdf/LICENSE.txt").read_text(encoding="utf-8"))

    def test_original_npm_release_and_integrity(self) -> None:
        release = self.lock["skills_cli_release"]
        package = ROOT / release["path"]
        data = package.read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest(), release["sha256"])
        digest = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode("ascii")
        self.assertEqual(digest, release["integrity"])
        with tarfile.open(package) as archive:
            package_json = json.load(archive.extractfile("package/package.json"))
            self.assertEqual(package_json["version"], release["version"])
            self.assertIsNotNone(archive.getmember("package/bin/cli.mjs"))
            self.assertIsNotNone(archive.getmember("package/dist/cli.mjs"))


class QawaTests(unittest.TestCase):
    def test_original_cli_and_russian_fallback_are_explained(self) -> None:
        result = run_python(QAWA, "version")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("qawa 0.1.0", result.stdout)
        english = run_python(QAWA, "route", "fix the error")
        self.assertEqual(english.returncode, 0, english.stderr)
        self.assertIn("systematic-debugging", english.stdout)
        russian = run_python(QAWA, "route", "исправь ошибку")
        self.assertEqual(russian.returncode, 0, russian.stderr)
        self.assertIn("brainstorming", russian.stdout)
        guide = (ROOT / ".agents/ARENA_SKILLS.md").read_text(encoding="utf-8")
        self.assertIn("русские запросы", guide)

    def test_ledger_roundtrip_uses_an_isolated_file(self) -> None:
        before = (ROOT / ".qawa/STATE.md").read_bytes()
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "STATE.md"
            env = {"QAWA_STATE": str(state)}
            note = run_python(QAWA, "note", "Тестовая запись без секретов", extra_env=env)
            self.assertEqual(note.returncode, 0, note.stderr)
            read = run_python(QAWA, "state", extra_env=env)
            self.assertEqual(read.returncode, 0, read.stderr)
            self.assertIn("Тестовая запись без секретов", read.stdout)
        self.assertEqual((ROOT / ".qawa/STATE.md").read_bytes(), before)

    @unittest.skipUnless(shutil.which("git"), "git не установлен")
    def test_ledger_is_not_ignored_but_lock_is(self) -> None:
        def ignored(path: str) -> int:
            return subprocess.run(
                ["git", "check-ignore", "--no-index", "-q", path],
                cwd=ROOT, capture_output=True, check=False,
            ).returncode
        self.assertEqual(ignored(".qawa/STATE.md"), 1)
        self.assertEqual(ignored(".qawa/STATE.md.lock"), 0)
        for path in (".env", ".env.local", "project/.env", "project/.env.production"):
            with self.subTest(path=path):
                self.assertEqual(ignored(path), 0)
        self.assertEqual(ignored("project/.env.example"), 1)

    def test_bootstrap_explains_persistence_and_capability_limits(self) -> None:
        agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn(".qawa/STATE.md", agents)
        self.assertIn(".agents/ARENA_SKILLS.md", agents)
        self.assertIn("Самостоятельно выбирай", agents)
        self.assertIn("Не проси пользователя выбирать скилл", agents)
        self.assertIn("Не запускай `qawa init .`", agents)
        self.assertIn("не встроенные плагины Arena", readme)
        self.assertIn("выбранной ветке", readme)


if __name__ == "__main__":
    unittest.main()
