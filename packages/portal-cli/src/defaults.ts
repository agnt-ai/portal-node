/**
 * Build-time defaults.
 *
 * DEFAULT_ACCOUNT_SLUG / DEFAULT_ACCOUNT_NAME are hydrated by the per-account
 * CircleCI publish pipeline (see /.circleci/config.yml at the repo root),
 * which walks this repo replacing the {{accountSlug}} / {{accountName}}
 * tokens before `npm run build`. A standalone build (this repo checked out
 * and built directly, not via the pipeline) keeps the literal placeholder
 * text below, which the resolve* functions below treat as "no default" so
 * --account is required instead of silently pointing at a template string.
 */
export const DEFAULT_ACCOUNT_SLUG = '{{accountSlug}}';
export const DEFAULT_ACCOUNT_NAME = '{{accountName}}';
export const DEFAULT_API_URL = 'https://api.agnt.ai';

// Exported so it can be unit-tested against literal fixture strings — the
// module-level constants above get rewritten by hydration (including in
// CI, which always hydrates with dummy values before running tests), so a
// test can't rely on DEFAULT_ACCOUNT_SLUG itself still being the placeholder.
export function isHydrated(value: string): boolean {
  return !value.startsWith('{{');
}

export function resolveDefaultAccountSlug(): string | undefined {
  return isHydrated(DEFAULT_ACCOUNT_SLUG) ? DEFAULT_ACCOUNT_SLUG : undefined;
}

export function resolveDefaultAccountName(): string | undefined {
  return isHydrated(DEFAULT_ACCOUNT_NAME) ? DEFAULT_ACCOUNT_NAME : undefined;
}
