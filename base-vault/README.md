# База Дениса Рогова

Это Obsidian-compatible vault для публичной базы знаний на `denrogov.com/base/`.

Правило публикации:
- заметка появляется на сайте только если во frontmatter стоит `published: true`;
- черновики можно хранить рядом с `published: false` или без frontmatter;
- raw markdown не попадает в Docker image: `base-vault/` добавлен в `.dockerignore`.

Рекомендуемые категории:
- `china` — Китай;
- `tech` — технологии;
- `ai` — AI;
- `business` — бизнес;
- `notes` — заметки.
