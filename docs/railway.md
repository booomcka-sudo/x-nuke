# Развёртывание Railway

Создайте один Project и четыре сервиса: PostgreSQL, Redis, API, worker. Для API и worker подключите репозиторий. Если репозиторий содержит внешнюю папку `x-nuke`, укажите Root Directory `/x-nuke` у обоих; Docker build context обязан включать apps, packages и lockfile. Внутри самостоятельного репозитория Root Directory `/`.

В опубликованном `booomcka-sudo/x-nuke` корень проекта уже является корнем репозитория. Для API оставьте Root Directory `/` и Config File Path `/railway.json`: этот файл автоматически выбирает Dockerfile API, миграции и readiness. Для worker обязательно выберите Config File Path `/deploy/railway.worker.json`, чтобы он запускал worker без API-миграций. Если в логах показан Railpack и `No start command detected`, используется старый коммит или конфигурация сервиса не подхватывает эти файлы. Проверьте ветку `main`, путь конфигурации и перезапустите deployment последнего коммита. Для API ожидается Docker-сборка `deploy/Dockerfile.api`, для worker — `deploy/Dockerfile.worker`; ручные Build/Start overrides не нужны.

Корневая команда `pnpm build` компилирует API и worker без расширения и без `VITE_API_ORIGIN`. `pnpm start` запускает API, `pnpm start:worker` — worker. Расширение собирается отдельно на компьютере пользователя; `pnpm build:all` собирает сервер и расширение и требует `VITE_API_ORIGIN`. Эти команды помогают при ручном запуске, но рекомендуемый Railway deployment использует Docker-конфигурации выше.

API: Config file path `/x-nuke/deploy/railway.api.json` для вложенного проекта (или `/deploy/railway.api.json` для самостоятельного). Dockerfile path задаётся относительно корня сборки. Worker аналогично использует `railway.worker.json`. При отличающейся обработке путей Railway проверьте Build logs: `COPY package.json pnpm-lock.yaml` должен находить файлы.

API Variables: DATABASE_URL = `${{Postgres.DATABASE_URL}}`, REDIS_URL = `${{Redis.REDIS_URL}}`; используйте внутренние URL Railway, а не публичный TCP proxy. JWT_SECRET — длинная случайная строка. Остальные переменные скопируйте из `.env.example`. У worker те же переменные провайдеров, БД, Redis и лимитов. PORT задаёт Railway, API слушает `0.0.0.0`. Секреты не добавляйте в git и не передавайте расширению.

Только API получает публичный HTTPS домен. Worker не имеет домена. В настройках worker отключите Serverless/App Sleeping; он должен постоянно обрабатывать очередь. Redis должен сохранять данные и использовать `noeviction`. PostgreSQL и Redis — с постоянными volumes/backups.

API pre-deploy запускает `pnpm deploy:prepare`. Этот package script последовательно выполняет миграции и `pnpm user:bootstrap`; ошибка миграций останавливает bootstrap. Если конфигурация сервиса перекрывает файл репозитория, укажите `pnpm deploy:prepare` вручную в Settings → Deploy → Pre-deploy Command. В логах должны появиться события `migrations_complete` и `first_account_bootstrap` со статусом `created`, `exists` либо `unconfigured`. Если виден только запуск `db:migrate`, проверьте deployment последнего коммита и команду pre-deploy. SQL-миграции 0001/0002 защищены транзакцией и advisory lock. Миграции не запускаются при Docker build и на worker. Readiness `/health/ready` проверяет версию схемы, основные таблицы и Redis. Liveness `/health/live` проверяет процесс API. `/v1/status` дополнительно показывает режим, наличие первого аккаунта, наличие ключей (без значений) и heartbeat worker. SIGTERM завершает текущую работу и закрывает подключения.

Первый пользователь: задайте ADMIN_EMAIL и ADMIN_PASSWORD (12+ символов) в Variables API и redeploy. Защищённая CLI bootstrap-команда создаёт только первый аккаунт и не изменяет существующие пароли. Дополнительных пользователей можно создавать в Railway SSH командой `pnpm user:create` с теми же переменными. Публичной регистрации нет. Пароль — scrypt со случайной солью. После создания удалите ADMIN_PASSWORD. Access token действует 15 минут, refresh — 30 дней с атомарной ротацией и отзывом при logout.

```powershell
$env:VITE_API_ORIGIN='https://YOUR-ACTUAL-API.up.railway.app'
pnpm --filter @xn/extension build
pnpm zip
```

Production manifest разрешает только этот API origin, x.com и twitter.com для content script. Не публикуйте сборку с вымышленным origin. Установите папку `apps/extension/dist` через Load unpacked. Для Chrome Web Store загрузите `artifacts/x-nuke-extension.zip`, подготовьте описание, privacy policy, изображения магазина и декларацию обработки публичных профилей. Одобрение магазина и фактическое развёртывание Railway не выполняются автоматически этим проектом.

После deployment: проверьте оба health endpoint и `/v1/status`, войдите в Settings, выполните Quick Scan → Start Deep Scan → View Full Report. Переключайте LIVE после проверки API entitlement; API и worker должны иметь одинаковый DEMO_MODE. DEMO-кеш отделён от LIVE. После сохранения scan request сбой постановки в Redis возвращает ID принятого запроса; reconciliation восстановит очередь. Если недоступна сама PostgreSQL, запрос отклоняется с 503.
