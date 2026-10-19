# X Nuke — Alpha Scanner

Закрытый MVP: Chrome/Opera MV3, React в Shadow DOM, Fastify, PostgreSQL/Drizzle и Redis/BullMQ. Интерфейс английский, инструкции русские.

## Использование

1. Установите apps/extension/dist через режим разработчика в chrome://extensions или opera://extensions → Load unpacked.
2. Откройте Settings & sign in. Здесь проверяются API, режим, worker, наличие провайдеров и первого аккаунта.
3. Войдите email и паролем X Nuke. Cookies и пароль X не используются.
4. На профиле x.com или twitter.com нажмите Scan. Quick Scan обрабатывает профиль и первую страницу аудитории.
5. Start Deep Scan продолжает сохранённый cursor. Можно сразу выбрать Deep Scan в popup.
6. Закрытие панели прекращает polling; повторное открытие восстанавливает скан без нового запроса и расхода квоты.
7. View Full Report показывает формулу, аудиторию, публичные кошельки и источники; доступны Export JSON и Print.

DEMO явно обозначен и содержит синтетические данные. Ошибка LIVE не подменяется демонстрационным результатом.

## Railway

Для API и worker Root Directory /, ветка main.

| Сервис | Config File Path | Домен |
|---|---|---|
| API | /railway.json | Публичный HTTPS |
| worker | /deploy/railway.worker.json | Не нужен |
| Postgres | База Railway | Не нужен |
| Redis | База Railway | Не нужен |

Конфиги выбирают Dockerfile. Build/Start overrides оставьте пустыми. У worker отключите Serverless/App Sleeping. Redis должен сохранять данные и использовать noeviction.

В Variables обоих приложений:

    DATABASE_URL=${{Postgres.DATABASE_URL}}
    REDIS_URL=${{Redis.REDIS_URL}}
    JWT_SECRET=случайная_строка_минимум_32_символа
    DEMO_MODE=true

Имена сервисов в reference variables должны совпадать с фактическими. Остальные лимиты — в .env.example.

### Первый аккаунт

В Variables API добавьте ADMIN_EMAIL и ADMIN_PASSWORD (12+ символов). Pre-deploy выполняет миграции и защищённую CLI bootstrap-команду. Она создаёт только первого пользователя под advisory lock и не меняет существующие пароли. После создания удалите ADMIN_PASSWORD.

Для ручного создания пользователя в SSH-контейнере API: pnpm user:create. Используются ADMIN_EMAIL и ADMIN_PASSWORD серверного окружения. Открытой регистрации нет. Пароль хешируется scrypt, access token действует 15 минут, refresh token ротируется и отзывается при logout.

### LIVE

У API и worker должны совпадать DEMO_MODE=false, X_PROVIDER=official, X_API_BEARER_TOKEN и необходимые ключи провайдеров.

X_API_BEARER_TOKEN — Bearer Token приложения X, НЕ Consumer Key Secret. Нужны разрешения user lookup, followers и user posts. Наличие токена не гарантирует endpoint entitlement. 401/403/429 и отсутствующие поля диагностируются явно.

HELIUS_API_KEY нужен для балансов известных публично подтверждённых кошельков. Баланс и входящие переводы не считаются прибылью. DexScreener-адаптер предоставляет текущие token pairs Solana, без исторических цен. BIRDEYE_API_KEY зарезервирован, не используется.

### Расширение

Node.js 22+, pnpm 10.18.3, PowerShell:

    pnpm install --frozen-lockfile
    $env:VITE_API_ORIGIN='https://ВАШ-API.up.railway.app'
    pnpm --filter @xn/extension build
    pnpm zip

Результаты: apps/extension/dist и artifacts/x-nuke-extension.zip. Production manifest разрешает только заданный API origin и content scripts X. Ключи провайдеров остаются на сервере.

## Локально

    Copy-Item .env.example .env
    pnpm install --frozen-lockfile
    docker compose up -d --build
    pnpm --filter @xn/extension build:dev

Задайте JWT_SECRET в .env; создайте пользователя через серверную CLI. Для локального профиля запустите pnpm --filter @xn/extension dev и откройте http://localhost:5173/solbuilder с установленной dev-сборкой.

DEMO-сценарии: solbuilder — обычный профиль; notfound — не найден; private — закрытый; noaccess — нет доступа к аудитории; empty — пустая выборка; ratelimit — 429; deepfail — ошибка после первой страницы с сохранением предварительного результата.

## Проверки

    pnpm typecheck
    pnpm lint
    pnpm test
    pnpm build
    pnpm test:e2e
    node scripts/check-manifest.mjs

pnpm build компилирует API и worker; pnpm start и pnpm start:worker запускают их. pnpm build:all также собирает расширение и требует VITE_API_ORIGIN.

Для PostgreSQL-тестов создайте отдельную локальную базу x_nuke_test:

    $env:TEST_DATABASE_URL='postgres://USER:PASSWORD@127.0.0.1:5432/x_nuke_test'
    pnpm test:db

Runner запрещает другое имя и удалённый host. Тесты очищают выделенную тестовую базу. CI в .github/workflows/ci.yml проверяет PostgreSQL 16, Redis 7, реальные API/worker, установленное MV3-расширение и Docker build обоих образов. Фактические результаты — docs/verification.md.

## Формула и доказательства

Версия heuristic-2. Веса: Smart Money 30%, Crypto KOLs 20%, Engagement 15%, Track Record 15%, Audience Authenticity 10%, Network Overlap 10%.

- Smart Money: подтверждённый кошелёк и метод связи, confidence ≥0.8, положительный realized PnL, период, достаточная история и минимум 10 закрытых сделок.
- Crypto KOLs: публичная метка либо crypto-биография и ≥10 000 подписчиков.
- Audience Authenticity — явно обозначенный proxy полноты публичного профиля: не проверка личности и не определение ботов.
- Track Record и Network Overlap остаются null без независимых доказательств.
- Score появляется при двух доступных компонентах и сумме весов ≥40; доступные веса перенормируются. Иначе Insufficient data.
- Coverage — проверенная доля аудитории; confidence — отдельная эвристика качества данных, а не статистическая вероятность.
- Одна основная категория аккаунта; Unknown входит в знаменатель. Отображаемые проценты распределяются до 0.1%, суммой 100.0%.
- Total Follower Reach — сумма подписчиков проверенных аккаунтов с возможными повторами. Unique и Alpha Reach недоступны без графа пересечений.
- Wallet report разделяет realized/unrealized PnL, комиссии, период и закрытые сделки. Неизвестные значения — null с причиной. В LIVE PnL поступает только из проверенного импорта, а не из балансов.

Импорт публичных меток: pnpm labels:import path/to/verified-labels.json, только защищённая серверная CLI с доступом к БД. Формат Label — packages/shared/src/index.ts. Администратор проверяет URL доказательства, время, метод и историю; совпадение ника/аватара не даёт владение. docs/labels.example.json пуст намеренно.

## Надёжность и ограничения

PostgreSQL хранит cursor, поколения задач, стабильный X ID, edges, snapshots, результаты и события. Страница и результат сохраняются одной транзакцией; повторная доставка защищена advisory lock. BullMQ jobId — SHA-256. Несколько пользователей используют общий публичный анализ с отдельными запросами и проверкой прав.

Сбой Redis не теряет сохранённый запрос: reconciliation восстановит очередь. При 429 учитываются Retry-After, backoff и jitter; максимум пять попыток. Бюджеты ограничивают аккаунты, страницы, активную длительность, wallet enrichment, concurrency и дневные запросы. Время проверяется между вызовами: текущий запрос может занять до 12 дополнительных секунд.

sample_limit не означает анализ всей аудитории. Нет скрытых endpoint, cookies, обхода X, удалённого JS или фиктивного прогресса. Недостаток тарифа, истории цен, wallet labels или пересечений показывается как ограничение. Ручная пауза/отмена и автоматическая retention-политика не входят в MVP. Публикация в Chrome Web Store требует отдельной отправки, privacy policy и материалов листинга.

Подробности: docs/railway.md и docs/providers.md.
