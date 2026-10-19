# Проверка версии 0.2

19.10.2026. Локально: Windows, Node.js 24, отдельный PostgreSQL 16 на порту 55439. Production target Node.js 22.

Проверено локально:
- TypeScript strict и ESLint;
- 21 unit-тест: scoring и отсутствующие данные, знаменатель/округление, Smart Money, маршруты, провайдерные ответы/429, scrypt, фиксированные сообщения, явные единицы финансовых метрик и параметры ioredis;
- 10 интеграционных тестов с настоящим PostgreSQL: вход, атомарная ротация refresh token/logout, чужие отчёты, восстановление без нового запроса, общая задача для двух пользователей, стабильный X ID, Quick → Deep checkpoint, сбой после сохранённой страницы, повторная доставка, sample_limit, недоступная/пустая/закрытая аудитория, отсутствующий профиль, stale cache, лимит повторов и квоты;
- два Playwright UI-теста: Shadow DOM, Scan/Close, системный маршрут, отсутствие установленного расширения, категории/источники, повторное открытие, маленький экран;
- production сборки API/worker, Vite/esbuild, manifest и ZIP.

Полная CI-проверка .github/workflows/ci.yml использует PostgreSQL 16, Redis 7, реальные API и BullMQ worker, HTTP API, установленное MV3-расширение Chromium и Docker build обоих образов. Все эти этапы прошли успешно: https://github.com/booomcka-sudo/x-nuke/actions/runs/39183543654 (коммит b2c153a). В установленном расширении проверены вход, Quick Scan, продолжение Deep Scan, report и повторное открытие без увеличения количества запросов.

Локальный Docker не отвечает. PostgreSQL для тестов запущен в artifacts/pg-data и не использует существующую базу пользователя.

Ранее развернутый API: /health/live и /health/ready — 200, DEMO; /v1/me без токена — 401. Новый /v1/status показывает mode, готовность первого аккаунта, наличие ключей и heartbeat worker; значения секретов не возвращаются.

LIVE-доступ X и обогащение Helius требуют рабочих ключей Railway. Наличие ключа не подтверждает entitlement. API и worker должны иметь одинаковый DEMO_MODE. DEMO не подменяет отсутствие LIVE-данных. Ограничения расчётов — README.md.
