# Подтверждённые API

Проверено по официальной документации 19.10.2026. Адаптеры не обещают доступ к endpoint без соответствующих прав аккаунта.

- X lookup: https://docs.x.com/x-api/users/get-user-by-username — GET `https://api.x.com/2/users/by/username/{username}`, Bearer token, public_metrics/description/protected.
- Followers: https://docs.x.com/x-api/users/get-followers — GET `/2/users/{id}/followers`, `max_results` 1–1000, `pagination_token`, `meta.next_token`. В MVP страницы по 50.
- Posts: https://docs.x.com/x-api/users/get-posts — GET `/2/users/{id}/tweets`, `max_results` 5–100, public_metrics. В MVP 10 постов; нет приватных impressions.
- Limits: https://docs.x.com/x-api/fundamentals/rate-limits — 429, endpoint-specific access/limits; учитываются Retry-After и x-rate-limit-reset. Временные ошибки — до пяти попыток с backoff/jitter.
- Helius: https://www.helius.dev/docs/api-reference/rpc/http/getbalance — JSON-RPC `getBalance`, mainnet.helius-rpc.com с api-key.
- https://www.helius.dev/docs/api-reference/rpc/http/getsignaturesforaddress — `getSignaturesForAddress`, до 1000, before signature, в MVP 50; не включает всю активность связанных token accounts.
- https://www.helius.dev/docs/api-reference/rpc/http/gettokenaccountsbyowner — текущие SPL token accounts с jsonParsed. Token-2022 пока не обогащается.
- DexScreener: https://docs.dexscreener.com/api/reference — GET `/token-pairs/v1/{chainId}/{tokenAddress}`, лимит документации 300 rpm, без исторических цен. Адаптер предоставлен, автоматический поиск токенов по имени профиля намеренно отсутствует.

Внешние ответы X типизированы адаптером; пользовательские сообщения и API payload проверяет Zod. Solana возвращает первичный payload и явные null для неподтверждённых финансовых метрик. Импортированные метки должны иметь проверяемое публичное доказательство, а не совпадение ника.
