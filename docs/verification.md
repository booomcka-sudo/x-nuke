# Фактические проверки

19.10.2026, Windows. Сборки запускаются bundled Node.js 24.19.0; TypeScript 5.9.3, Vite 6.4.1, React 19.2, Fastify 5.6.2. Зависимости зафиксированы в pnpm-lock.yaml. В системе также есть Node 20.10, поэтому некоторые вызовы pnpm показывают engine warning; для эксплуатации нужен Node 22+ согласно package.json.

Проверено:

- `tsc --noEmit -p tsconfig.json`: успешно, strict.
- `eslint .`: успешно.
- `vitest run`: успешно, логика scoring/отсутствующих компонентов/знаменателя, пагинация DEMO, проверка требований Smart Money, пароль scrypt, непрозрачные токены, сообщения без произвольного proxy, реальные адаптеры на контролируемых HTTP ответах.
- `playwright test`: 2 теста успешно. Chromium проверил Shadow DOM, Scan/Close, системный маршрут, сообщение без установленного расширения, предварительный отчёт, категории и источники, повторное открытие, viewport 375 px. Второй тест использует явный mock канала расширения; это не полный тест реального backend.
- `tsc -p tsconfig.server.json`: API и worker скомпилированы.
- Vite + esbuild: сборка успешна. Production manifest проверен с тестовым HTTPS origin `https://api.example.invalid`; итоговая поставляемая папка пересобрана для `http://localhost:3000`, с локальными fixture-хостами только в dev manifest.
- `node scripts/check-manifest.mjs`: MV3, минимальные permissions, наличие файлов, отсутствие ключей провайдеров, отсутствие unsafe-eval — успешно.
- ZIP сформирован из готовой папки расширения.

Не выполнено:

Дополнительная проверка готовности Railway: исправлено подключение BullMQ/ioredis. REDIS_URL теперь явно преобразуется в host, port, username/password, db и TLS; произвольное поле url в объекте RedisOptions не использовалось ioredis. Два регрессионных теста проверяют фактические параметры клиента для внутреннего Railway hostname и TLS. После исправления: 16 тестов успешно, один инфраструктурный тест пропущен; strict typecheck, lint и компиляция API/worker успешны. `pnpm@10.18.3 install --lockfile-only --frozen-lockfile --ignore-scripts` также выполнен успешно. Docker Engine при повторной проверке не ответил; проверка остановлена.

- Полный интеграционный тест API → Redis/BullMQ → worker → PostgreSQL. Docker Desktop был запущен, но Engine вернул HTTP 500 на `/info`; до этого pipe отсутствовал. Docker build/Compose и запуск миграций на реальной БД вследствие этого не проверены.
- `tests/integration.test.ts` пропущен по умолчанию. Он проверяет реальные login/refresh/logout, чужие отчёты (404), общий job для двух пользователей, сохранённые edges/checkpoint и итог. Для запуска поднимите DEMO Compose, задайте DATABASE_URL и `RUN_INTEGRATION=true`, выполните `pnpm test`. Пользователи теста удаляются, общий публичный анализ остаётся в БД.
- Прерывание реального worker во время страницы и восстановление после рестарта требуют работающей инфраструктуры; атомарный page checkpoint реализован, но такой fault-injection не выполнен.
- LIVE запросы с оплаченной учётной записью X и Helius не выполнены: ключей нет. Endpoint проверены по официальным ссылкам в providers.md, transport протестирован на контролируемых ответах.
- Railway deployment и Chrome Web Store публикация не выполнены. Фактического Railway origin нет; production сборку нужно выполнить по railway.md.

Скриншоты интерфейса: artifacts/panel-desktop.png и artifacts/panel-mobile.png. Они показывают fixture с синтетическими данными.
