# Развёртывание Railway

Создайте один Project и четыре сервиса: PostgreSQL, Redis, API, worker. Для API и worker подключите репозиторий. Если репозиторий содержит внешнюю папку `x-nuke`, укажите Root Directory `/x-nuke` у обоих; Docker build context обязан включать apps, packages и lockfile. Внутри самостоятельного репозитория Root Directory `/`.

API: Config file path `/x-nuke/deploy/railway.api.json` для вложенного проекта (или `/deploy/railway.api.json` для самостоятельного). Dockerfile path задаётся относительно корня сборки. Worker аналогично использует `railway.worker.json`. При отличающейся обработке путей Railway проверьте Build logs: `COPY package.json pnpm-lock.yaml` должен находить файлы.

API Variables: DATABASE_URL = `${{Postgres.DATABASE_URL}}`, REDIS_URL = `${{Redis.REDIS_URL}}`; используйте внутренние URL Railway, а не публичный TCP proxy. JWT_SECRET — длинная случайная строка. Остальные переменные скопируйте из `.env.example`. У worker те же переменные провайдеров, БД, Redis и лимитов. PORT задаёт Railway, API слушает `0.0.0.0`. Секреты не добавляйте в git и не передавайте расширению.

Только API получает публичный HTTPS домен. Worker не имеет домена. В настройках worker отключите Serverless/App Sleeping; он должен постоянно обрабатывать очередь. Redis должен сохранять данные и использовать `noeviction`. PostgreSQL и Redis — с постоянными volumes/backups.

API pre-deploy запускает `pnpm db:migrate`, один раз перед запуском deployment. SQL-миграция защищена транзакцией и advisory lock. Миграции не запускаются при Docker build и на worker. Readiness `/health/ready` проверяет PostgreSQL и Redis. Liveness `/health/live` проверяет процесс API. Worker пишет структурированные события `completed` и `worker_error`; проверьте их в Logs после тестового скана. SIGTERM завершает текущую работу и закрывает подключения.

Первый пользователь: через защищённый Railway SSH/консоль контейнера API задайте ADMIN_EMAIL и ADMIN_PASSWORD и выполните `pnpm user:create`. Команда требует серверный доступ; публичной регистрации нет. Пароль минимум 12 символов, scrypt, случайная соль. Сразу удалите временную переменную ADMIN_PASSWORD. Access token действует 15 минут, refresh — 30 дней с атомарной ротацией и отзывом при logout.

```powershell
$env:VITE_API_ORIGIN='https://YOUR-ACTUAL-API.up.railway.app'
pnpm --filter @xn/extension build
pnpm zip
```

Production manifest разрешает только этот API origin, x.com и twitter.com для content script. Не публикуйте сборку с вымышленным origin. Установите папку `apps/extension/dist` через Load unpacked. Для Chrome Web Store загрузите `artifacts/x-nuke-extension.zip`, подготовьте описание, privacy policy, изображения магазина и декларацию обработки публичных профилей. Одобрение магазина и фактическое развёртывание Railway не выполняются автоматически этим проектом.

После deployment: проверьте оба health endpoint, создайте пользователя, войдите в Settings, выполните DEMO Scan и проверьте обновление processed/pages и report. Переключайте LIVE после проверки API entitlement; DEMO-кеш отделён ключом от LIVE. Если Redis недоступен, API может вернуть 503 после сохранения scan request; reconciliation восстановит очередь после подключения.
