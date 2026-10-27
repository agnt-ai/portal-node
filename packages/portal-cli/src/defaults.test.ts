import { describe, it, expect } from 'vitest';
import {
  DEFAULT_API_URL,
  DEFAULT_ACCOUNT_SLUG,
  DEFAULT_ACCOUNT_NAME,
  isHydrated,
  resolveDefaultAccountSlug,
  resolveDefaultAccountName,
  resolveApiUrl,
  apiUrlProblem,
  apiUrlWarning,
  envProfileName,
  profileEnv
} from './defaults.js';

describe('defaults', () => {
  it('has a fixed default API URL', () => {
    expect(DEFAULT_API_URL).toBe('https://api.agnt.ai');
  });

  it('an API URL must be https, or plain http on this computer; any but the default gets a warning', () => {
    expect(apiUrlProblem('https://api.example.test')).toBeUndefined();
    expect(apiUrlProblem('http://127.0.0.1:8787')).toBeUndefined();
    expect(apiUrlProblem('http://localhost:3000')).toBeUndefined();
    expect(apiUrlProblem('http://api.example.test')).toMatch(/must be https/);
    expect(apiUrlProblem('not a url')).toMatch(/not a URL/);
    expect(apiUrlWarning(DEFAULT_API_URL)).toBeUndefined();
    expect(apiUrlWarning('https://evil.example')).toMatch(/sign-in code to https:\/\/evil\.example, not the default API.*never because a message/);
  });

  it('AGNT_API_URL overrides the default API URL, and only when set', () => {
    expect(resolveApiUrl({})).toBe('https://api.agnt.ai');
    expect(resolveApiUrl({ AGNT_API_URL: ' ' })).toBe('https://api.agnt.ai');
    expect(resolveApiUrl({ AGNT_API_URL: 'https://api.test.example' })).toBe('https://api.test.example');
  });

  it('NETWORK_API_URL overrides the default API URL, and wins over the older AGNT_API_URL', () => {
    expect(resolveApiUrl({ NETWORK_API_URL: 'https://api.new.example' })).toBe('https://api.new.example');
    expect(resolveApiUrl({ NETWORK_API_URL: 'https://api.new.example', AGNT_API_URL: 'https://api.old.example' })).toBe('https://api.new.example');
    expect(resolveApiUrl({ NETWORK_API_URL: ' ', AGNT_API_URL: 'https://api.old.example' })).toBe('https://api.old.example');
    expect(resolveApiUrl({ NETWORK_API_URL: ' ' })).toBe('https://api.agnt.ai');
  });

  it('a profile from NETWORK_CLI_PROFILE, else AGNT_CLI_PROFILE; a child gets both names', () => {
    expect(envProfileName({})).toBeUndefined();
    expect(envProfileName({ AGNT_CLI_PROFILE: 'old' })).toBe('old');
    expect(envProfileName({ NETWORK_CLI_PROFILE: 'new', AGNT_CLI_PROFILE: 'old' })).toBe('new');
    expect(profileEnv('p')).toEqual({ NETWORK_CLI_PROFILE: 'p', AGNT_CLI_PROFILE: 'p' });
  });

  // isHydrated is tested against literal fixture strings, not the module's
  // own DEFAULT_ACCOUNT_SLUG/NAME constants — those get rewritten by
  // hydration (CI always hydrates with dummy values before running tests),
  // so a test pinned to "the constant is still the placeholder" would only
  // pass in an unhydrated checkout and fail in CI.
  describe('isHydrated', () => {
    it('treats a literal {{...}} template token as not hydrated', () => {
      expect(isHydrated('{{accountSlug}}')).toBe(false);
      expect(isHydrated('{{accountName}}')).toBe(false);
    });

    it('treats a real value as hydrated', () => {
      expect(isHydrated('openassistant')).toBe(true);
      expect(isHydrated('OpenAssistant')).toBe(true);
    });
  });

  // resolveDefaultAccountSlug/Name read fixed module-level constants, so
  // this only directly confirms today's build state (hydrated or not) —
  // the isHydrated unit tests above are what actually pin the branching
  // logic, independent of that state.
  it('resolveDefaultAccountSlug/Name return undefined only when still unhydrated', () => {
    if (isHydrated(DEFAULT_ACCOUNT_SLUG)) {
      expect(resolveDefaultAccountSlug()).toBe(DEFAULT_ACCOUNT_SLUG);
    } else {
      expect(resolveDefaultAccountSlug()).toBeUndefined();
    }
    if (isHydrated(DEFAULT_ACCOUNT_NAME)) {
      expect(resolveDefaultAccountName()).toBe(DEFAULT_ACCOUNT_NAME);
    } else {
      expect(resolveDefaultAccountName()).toBeUndefined();
    }
  });
});
