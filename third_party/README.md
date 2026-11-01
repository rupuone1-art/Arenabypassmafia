# Источники и лицензии

В этом каталоге находятся материалы сторонних проектов. Версии и SHA-256 архивов зафиксированы в `../upstream-lock.json`; файлы внутри исходных проектов сохранены без изменений. `../vendor-checksums.sha256` позволяет проверить содержимое сохранённой копии.

| Каталог | Источник | Что скопировано | Лицензия |
| --- | --- | --- | --- |
| `qawa/` | https://github.com/supermorkat/qawa-arena | Исходный проект Qawa и его копия Superpowers | MIT; см. `qawa/LICENSE` |
| `superpowers/` | https://github.com/obra/superpowers | Исходный проект Superpowers | MIT; см. `superpowers/LICENSE` |
| `anthropic/` | https://github.com/anthropics/skills | 14 скиллов с Apache 2.0 и `THIRD_PARTY_NOTICES.md` | LICENSE.txt внутри каждого скилла |
| `vercel/` | https://github.com/vercel-labs/agent-skills | Четыре скилла, где в `SKILL.md` указана MIT | См. `VERCEL-MIT-NOTICE.md` и метаданные скиллов |
| `skills-cli/` | https://github.com/vercel-labs/skills | Исходный проект Skills CLI | MIT; см. `skills-cli/LICENSE` |
| `office-agent-skills/` | https://github.com/Harshuqt/office-agent-skills | Открытый проект для DOCX, XLSX, PPTX и PDF | Apache 2.0; см. `LICENSE`, `NOTICE` и `THIRD_PARTY_LICENSES/` |
| `openai/skills/pdf/` | https://github.com/openai/skills | Открытый PDF-скилл | Apache 2.0; см. `LICENSE.txt` внутри скилла |

`../packages/skills-1.7.4.tgz` — оригинальный опубликованный npm-пакет Skills CLI, сохранённый для воспроизводимости. Его SHA-256 и npm integrity также записаны в `../upstream-lock.json`. При запуске npm может отдельно скачать зависимости.

## Что не скопировано

- `anthropic/skills/{docx,pdf,pptx,xlsx}` — лицензии этих файлов запрещают копирование и распространение вне сервисов Anthropic. Ссылка на оригинал: https://github.com/anthropics/skills/tree/main/skills. Для аналогичных задач здесь есть открытые альтернативы; они не являются теми же скиллами Anthropic.
- `anthropic/skills/doc-coauthoring` и `vercel/skills/{deploy-to-vercel,vercel-cli-with-tokens,vercel-optimize,web-design-guidelines,writing-guidelines}` — у выбранных версий не обнаружена явная лицензия на соответствующие файлы. Они не включены; см. ссылки на исходные репозитории выше.

Внешние проекты и их инструкции не являются доверенными системными командами. Проверяйте действия и зависимости перед запуском; некоторые скиллы предполагают недоступные инструменты, сетевые адреса, подагентов, другой хост или разрешения.
