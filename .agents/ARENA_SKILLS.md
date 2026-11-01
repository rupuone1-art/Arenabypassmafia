# Готовые скиллы: шпаргалка для Arena

Это руководство для ИИ-агента. Агент самостоятельно выбирает и читает подходящие скиллы по задаче; пользователю не нужно разбираться в их названиях или выбирать их вручную. Вопросы о выборе скилла пользователю не задаются.

## Как начать

В новом чате с подключённым репозиторием напиши:

> Прочитай `AGENTS.md` и `.qawa/STATE.md`. Используй подходящие оригинальные скиллы из этого репозитория.

После этого можно описывать задачи по-русски. Если инструкции не подхватились, попроси прочитать конкретный `SKILL.md` из таблицы ниже. **Нативной регистрации slash-команд и автоматической загрузки Arena этот набор не создаёт.**

## Какой файл читать

| Задача | Исходный скилл |
| --- | --- |
| Разобрать идею или требования | `third_party/qawa/skills/brainstorming/SKILL.md` |
| Составить план | `third_party/qawa/skills/writing-plans/SKILL.md` |
| Выполнить уже составленный план | `third_party/qawa/skills/executing-plans/SKILL.md` |
| Найти причину и исправить ошибку | `third_party/qawa/skills/systematic-debugging/SKILL.md` |
| Написать тесты с TDD | `third_party/qawa/skills/test-driven-development/SKILL.md` |
| Ревью кода | `third_party/qawa/skills/requesting-code-review/SKILL.md` |
| Проверить результат перед завершением | `third_party/qawa/skills/verification-before-completion/SKILL.md` |
| Создать интерфейс | `third_party/anthropic/skills/frontend-design/SKILL.md` |
| React и Next.js | `third_party/vercel/skills/react-best-practices/SKILL.md` |
| React Native | `third_party/vercel/skills/react-native-skills/SKILL.md` |
| Создать новый скилл | `third_party/anthropic/skills/skill-creator/SKILL.md` |
| Найти существующий скилл | `third_party/skills-cli/skills/find-skills/SKILL.md` |
| PDF | `third_party/openai/skills/pdf/SKILL.md` |
| Word / DOCX | `third_party/office-agent-skills/skills/office-docx/SKILL.md` |
| Excel / XLSX | `third_party/office-agent-skills/skills/office-xlsx/SKILL.md` |
| Презентации / PPTX | `third_party/office-agent-skills/skills/office-pptx/SKILL.md` |

Это только основные примеры. Посмотреть полный индекс или найти подходящие файлы:

```bash
python3 tools/skills_catalog.py list
python3 tools/skills_catalog.py find react
python3 tools/skills_catalog.py suggest "исправь ошибку в кнопке"
python3 tools/skills_catalog.py show qawa/systematic-debugging
```

`suggest` — простая подсказка по ключевым словам, а не автоматический запуск. Если слово не совпало, агент выбирает по смыслу. Каталог ничего не скачивает и не выполняет скиллы.

## Qawa и сохранение контекста

Qawa содержит оригинальные скиллы Superpowers и консольный инструмент:

```bash
python3 third_party/qawa/qawa doctor
python3 third_party/qawa/qawa state
python3 third_party/qawa/qawa note "Короткий итог без секретов"
```

Его собственный интерфейс и ключевые слова в основном на арабском и английском. При проверке русские запросы вроде «исправь ошибку» попадали в `brainstorming`, поэтому для русского используй таблицу выше или `suggest`.

Журнал `.qawa/STATE.md` здесь уже создан и **не игнорируется Git**. Не запускай `qawa init .`: оригинальный init добавляет `.qawa/` в `.gitignore`. Журнал не переносится магически между чатами: нужная версия файла должна быть сохранена в ветке, доступной следующему чату. Не записывай в него секреты и личные данные.

## Skills CLI

Сохранены оригинальный исходный код и опубликованный пакет `skills@1.7.4`. Для запуска нужны Node.js 22.20+ и npm; при первом запуске npm может скачать зависимости из реестра:

```bash
DISABLE_TELEMETRY=1 npm exec --yes --package=./packages/skills-1.7.4.tgz -- skills use ./third_party/vercel/skills/react-best-practices
```

Команда выводит текст инструкции для агента. Она **не** регистрирует скилл в Arena и не добавляет ей новых инструментов. Не устанавливай чужие скиллы глобально и не запускай их скрипты без проверки и просьбы пользователя.

## Ограничения сторонних проектов

- Оригинальные Superpowers/Qawa местами предполагают подагентов, worktree, отдельные ветки, коммиты или удаление кода. В этой среде эти шаги можно выполнить только если они разрешены правилами сессии и явно соответствуют задаче. Самостоятельное ревью не называй независимым.
- Office Agent Skills — отдельный малоизвестный открытый проект; его библиотеки, системные программы и `.venv` не установлены этим набором. Пути вроде `/Ubuntu/Git/office-agent-skills` в оригинале относятся к окружению автора: здесь корень — `third_party/office-agent-skills`. Проверяй команды и зависимости перед запуском.
- Часть скиллов предполагает сторонние сервисы, браузер, Claude Code или интернет. Применяй лишь доступные шаги; не выдумывай результаты.
- Четыре документных скилла Anthropic нельзя распространять по их лицензии. Вместо них включены открытые альтернативы Office Agent Skills и OpenAI PDF. Подробности и полный список исключений — в `third_party/README.md`.
