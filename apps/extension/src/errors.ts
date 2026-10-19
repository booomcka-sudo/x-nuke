const messages:Record<string,string>={
 database_migrations_required:'Database setup is incomplete. Configure API pre-deploy: pnpm db:migrate && pnpm user:bootstrap, then redeploy.',
 unauthorized:'Sign in to X Nuke to scan this profile.',invalid_session:'Your session expired. Please sign in again.',invalid_credentials:'Email or password is incorrect.',
 daily_quota_exceeded:'Your daily scan budget is exhausted. Try again tomorrow (UTC).',rate_limited:'The provider is rate limited. Background retries are scheduled automatically.',
 provider_access_denied:'Your X API account does not have access to this endpoint.',missing_x_api_key:'The server administrator must configure X_API_BEARER_TOKEN for LIVE mode.',
 profile_not_found:'This profile could not be found.',worker_mode_mismatch:'API and worker must use the same DEMO_MODE setting.',deep_scan_failed:'Deep Scan failed. The preliminary result is still available.',
 service_unavailable:'The backend is temporarily unavailable. Your saved scan will resume when services recover.',scan_not_found:'This scan is unavailable for the current account.',
 provider_unreachable:'The data provider did not respond. The server will retry.',processing_error:'The scan could not finish. Retry or contact the server administrator.',
};
export function explainError(value:unknown){const text=value instanceof Error?value.message:String(value);return messages[text]??text;}
