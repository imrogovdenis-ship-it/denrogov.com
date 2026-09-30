# Production deployment

## Обязательные настройки

- Coolify build argument `UMAMI_WEBSITE_ID` — ID сайта `DenRogov.com` в Umami.
- GitHub secret `COOLIFY_WEBHOOK_URL` — deployment webhook приложения Coolify.
- В Coolify должен сохраняться предыдущий рабочий image tag для отката.

## До изменения production

1. Убедиться, что GitHub workflow `Validate and deploy site` зелёный.
2. Зафиксировать текущий image tag и время последнего успешного deploy.
3. Проверить HTTP 200 и целевые переходы на `/`, `/ai-class`, `/registration`,
   `/booking`, `/booking/15`, `/booking/30`, `/booking/60`, `/booking/90`.
4. Выполнить тестовый платёжный сценарий до границы отправки платежа; не создавать
   реальный платёж без отдельного бизнес-решения.
5. Не менять DNS в рамках обычного application deploy.

## После deploy

1. Повторить smoke-test маршрутов и платёжного перехода.
2. Проверить security headers и отсутствие публичных служебных файлов.
3. Проверить realtime-визит Umami на обеих статьях.
4. Проверить viewport 390 px и 320 px без горизонтального overflow.
5. Проверить `lang="ru"` и canonical URL booking-страниц.
6. Просмотреть ошибки контейнера и CSP Report-Only в течение окна наблюдения.

## Откат

Вернуть предыдущий image tag в Coolify и выполнить redeploy. После отката снова
проверить основные маршруты и платёжный переход. DNS при application rollback не
трогать.
