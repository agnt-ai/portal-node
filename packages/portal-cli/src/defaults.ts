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
/** The app's own web address, hydrated from --portal-url; anything but an https URL means none was given. */
export const DEFAULT_PORTAL_URL = '{{portalUrl}}';

/**
 * The API a new sign-in or saved key talks to: AGNT_API_URL when set (for example a test environment),
 * else DEFAULT_API_URL. A profile keeps the URL it was saved with, so later commands follow it.
 */
export function resolveApiUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.AGNT_API_URL?.trim() || DEFAULT_API_URL;
}

// Exported so it can be unit-tested against literal fixture strings — the
// module-level constants above get rewritten by hydration (including in
// CI, which always hydrates with dummy values before running tests), so a
// test can't rely on DEFAULT_ACCOUNT_SLUG itself still being the placeholder.
export function isHydrated(value: string): boolean {
  return !value.startsWith('{{');
}

/** The app's web address, or undefined when the build was not given one. */
export function resolvePortalUrl(value: string = DEFAULT_PORTAL_URL): string | undefined {
  return /^https:\/\/\S+$/.test(value) ? value : undefined;
}

/** Where a person goes to use their account: "at <portal URL>", or "to <app name>" when the build has no URL. */
export function signInWhere(portal: string | null = resolvePortalUrl() ?? null): string {
  return portal ? `at ${portal}` : 'to {{accountName}}';
}

export function resolveDefaultAccountSlug(): string | undefined {
  return isHydrated(DEFAULT_ACCOUNT_SLUG) ? DEFAULT_ACCOUNT_SLUG : undefined;
}

export function resolveDefaultAccountName(): string | undefined {
  return isHydrated(DEFAULT_ACCOUNT_NAME) ? DEFAULT_ACCOUNT_NAME : undefined;
}
