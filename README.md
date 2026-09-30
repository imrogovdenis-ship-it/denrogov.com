# denrogov.com

Production-сайт Дениса Рогова. Сейчас это статический экспорт Tilda, который
собирается в Docker-образ и отдаётся nginx. Целевой стек следующей версии —
Astro со статической генерацией; решение и ограничения зафиксированы в
[`docs/adr/0001-site-platform.md`](docs/adr/0001-site-platform.md).

## Локальный запуск

Нужен Docker.

```bash
docker build \
  --build-arg UMAMI_WEBSITE_ID=00000000-0000-0000-0000-000000000000 \
  -t denrogov-local .
docker run --rm -p 8080:80 denrogov-local
```

Сайт откроется на <http://localhost:8080>. `UMAMI_WEBSITE_ID` не является
секретом; для локальной проверки можно использовать UUID-заглушку. Без аргумента
образ тоже собирается, но Umami в HTML не добавляется.

Во время сборки автоматически:

- добавляется `lang="ru"` в Tilda HTML;
- проставляются canonical URL пяти booking-страниц;
- подключаются мобильные стили статей;
- при наличии `UMAMI_WEBSITE_ID` добавляется Umami;
- служебные и исходные файлы удаляются из webroot.

## Проверки

Pull request и push в `main` запускают `.github/workflows/site.yml`: образ
собирается, стартует во временном контейнере, после чего проверяются health,
security headers, Umami, `lang`, canonical и мобильный CSS.

## Production

Production размещён в Coolify. План переключения, обязательные проверки
платёжных URL и откат описаны в
[`docs/deployment.md`](docs/deployment.md).

После добавления GitHub secret `COOLIFY_WEBHOOK_URL` успешный push в `main`
автоматически вызывает deployment webhook Coolify. Пока secret отсутствует,
workflow оставляет предупреждение и не меняет production.
