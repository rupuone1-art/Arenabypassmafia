#!/usr/bin/env python3
"""Read-only index of the vendored upstream skills; not a skills runtime."""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

ROOT = Path(__file__).resolve().parent.parent
SOURCES: Tuple[Tuple[str, str], ...] = (
    ("qawa", "third_party/qawa/skills"),
    ("qawa-unavailable", "third_party/qawa/skills-unavailable"),
    ("superpowers", "third_party/superpowers/skills"),
    ("anthropic", "third_party/anthropic/skills"),
    ("vercel", "third_party/vercel/skills"),
    ("skills-cli", "third_party/skills-cli/skills"),
    ("office", "third_party/office-agent-skills/skills"),
    ("openai", "third_party/openai/skills"),
)

# Suggestions only. The actual instructions remain in the original SKILL.md files.
ROUTES: Tuple[Tuple[Tuple[str, ...], str], ...] = (
    (("ошиб", "баг", "сбой", "слом", "не работает", "падает", "bug", "error", "debug", "crash", "traceback"), "qawa/systematic-debugging"),
    (("план", "этап", "roadmap", "plan"), "qawa/writing-plans"),
    (("тест", "покрыт", "test", "tdd"), "qawa/test-driven-development"),
    (("ревью", "review", "проверь код", "проверить код"), "qawa/requesting-code-review"),
    (("интерфейс", "дизайн", "верстк", "вёрстк", "frontend", "ui"), "anthropic/frontend-design"),
    (("react native", "react-native"), "vercel/react-native-skills"),
    (("react", "next.js", "nextjs"), "vercel/react-best-practices"),
    (("pdf", "пдф"), "openai/pdf"),
    (("docx", "word", "ворд"), "office/office-docx"),
    (("xlsx", "excel", "эксель", "таблиц"), "office/office-xlsx"),
    (("pptx", "презентац", "powerpoint"), "office/office-pptx"),
    (("новый скилл", "создай скилл", "создать скилл", "new skill", "create skill"), "anthropic/skill-creator"),
    (("найди скилл", "поиск скиллов", "find skills"), "skills-cli/find-skills"),
)


@dataclass(frozen=True)
class Skill:
    id: str
    path: Path
    description: str
    note: str


def _metadata(path: Path) -> str:
    """Return a short description without claiming to parse all YAML."""
    text = path.read_text(encoding="utf-8")
    parts = text.split("---", 2)
    if len(parts) != 3 or parts[0].strip():
        return ""
    for line in parts[1].splitlines():
        if line.startswith("description:"):
            value = line.partition(":")[2].strip()
            if value in ("|", ">", "|-", ">-"):
                return ""
            return value.strip("\"'")
    return ""


def skills() -> Dict[str, Skill]:
    found: Dict[str, Skill] = {}
    for source, relative in SOURCES:
        directory = ROOT / relative
        if not directory.is_dir() or directory.is_symlink():
            raise OSError(f"Не найдена папка набора: {relative}")
        for skill_file in sorted(directory.glob("*/SKILL.md")):
            if skill_file.is_symlink() or skill_file.parent.is_symlink():
                raise OSError(f"Символическая ссылка в каталоге: {skill_file}")
            if not skill_file.resolve().is_relative_to(ROOT):
                raise OSError(f"Путь скилла вне репозитория: {skill_file}")
            name = skill_file.parent.name
            skill_id = f"{source}/{name}"
            if source == "qawa-unavailable" or name in ("dispatching-parallel-agents", "subagent-driven-development"):
                note = "нужны настоящие подагенты; в этой среде может быть недоступен"
            elif name == "using-git-worktrees":
                note = "создание веток и worktree подчиняется правилам текущей сессии"
            else:
                note = ""
            found[skill_id] = Skill(skill_id, skill_file, _metadata(skill_file), note)
    return found


def _matches(text: str, keyword: str) -> bool:
    if re.fullmatch(r"[a-z0-9]+", keyword):
        return bool(re.search(r"(?<![a-z0-9])" + re.escape(keyword) + r"(?![a-z0-9])", text))
    return keyword in text


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Каталог оригинальных скиллов в репозитории")
    sub = parser.add_subparsers(dest="command")
    sub.add_parser("list", help="показать все оригинальные скиллы и пути")
    show = sub.add_parser("show", help="показать оригинальный SKILL.md")
    show.add_argument("id", help="например qawa/systematic-debugging")
    search = sub.add_parser("find", help="найти текст в имени или описании")
    search.add_argument("query", help="текст поиска")
    suggest = sub.add_parser("suggest", help="предложить скиллы для задачи, в том числе на русском")
    suggest.add_argument("task", nargs="+", help="описание задачи")
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        index = skills()
        if args.command in (None, "list"):
            print(f"Оригинальных файлов SKILL.md: {len(index)} (включая копии в Qawa и Superpowers).")
            for skill in index.values():
                print(f"{skill.id:<46} {skill.path.relative_to(ROOT)}")
                if skill.note:
                    print(f"  ! {skill.note}")
            return 0
        if args.command == "show":
            if args.id not in index:
                print("Неизвестный скилл. Посмотри список командой list.", file=sys.stderr)
                return 1
            print(index[args.id].path.read_text(encoding="utf-8"), end="")
            return 0
        if args.command == "find":
            query = args.query.casefold().replace("ё", "е").strip()
            matches = [s for s in index.values() if query and query in f"{s.id} {s.description}".casefold().replace("ё", "е")]
            if not matches:
                print("Ничего не найдено. Попробуй другое слово или list.")
            for skill in matches:
                print(f"{skill.id:<46} {skill.path.relative_to(ROOT)}")
            return 0
        if args.command == "suggest":
            text = " ".join(args.task).casefold().replace("ё", "е")
            matched: List[str] = []
            for keywords, skill_id in ROUTES:
                if any(_matches(text, kw.casefold().replace("ё", "е")) for kw in keywords):
                    if skill_id not in index:
                        raise OSError(f"В каталоге отсутствует скилл {skill_id}")
                    if skill_id not in matched:
                        matched.append(skill_id)
            if not matched:
                print("По ключевым словам ничего не найдено; агент может выбрать скилл по смыслу из list.")
                return 0
            print("Возможные скиллы (это подсказка, не автоматический запуск):")
            for skill_id in matched:
                skill = index[skill_id]
                print(f"  {skill.id:<44} {skill.path.relative_to(ROOT)}")
                if skill.note:
                    print(f"    ! {skill.note}")
            return 0
        return 1
    except (OSError, UnicodeError) as exc:
        print(f"Ошибка каталога: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
