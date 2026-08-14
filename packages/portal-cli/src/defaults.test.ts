import { describe, it, expect } from 'vitest';
import {
  DEFAULT_API_URL,
  DEFAULT_ACCOUNT_SLUG,
  DEFAULT_ACCOUNT_NAME,
  isHydrated,
  resolveDefaultAccountSlug,
  resolveDefaultAccountName
} from './defaults.js';

describe('defaults', () => {
  it('has a fixed default API URL', () => {
    expect(DEFAULT_API_URL).toBe('https://api.agnt.ai');
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
