import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

let fakeHome: string;

vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    homedir: () => fakeHome
  };
});

describe('credentials', () => {
  beforeEach(async () => {
    fakeHome = await mkdtemp(join(tmpdir(), 'portal-cli-test-'));
    vi.resetModules();
    delete process.env.AGNT_CLI_PROFILE;
  });

  afterEach(async () => {
    await rm(fakeHome, { recursive: true, force: true });
  });

  it('resolveProfileName: explicit name wins over env var and persisted default', async () => {
    const { resolveProfileName, saveProfile } = await import('./credentials.js');
    await saveProfile('first', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_x' }); // becomes the persisted default
    process.env.AGNT_CLI_PROFILE = 'staging';
    expect(await resolveProfileName('explicit')).toBe('explicit');
  });

  it('resolveProfileName: falls back to AGNT_CLI_PROFILE env var, then the literal "default"', async () => {
    const { resolveProfileName } = await import('./credentials.js');
    expect(await resolveProfileName()).toBe('default');
    process.env.AGNT_CLI_PROFILE = 'staging';
    expect(await resolveProfileName()).toBe('staging');
  });

  it('resolveProfile throws a helpful error when no credentials file exists yet', async () => {
    const { resolveProfile } = await import('./credentials.js');
    await expect(resolveProfile('default')).rejects.toThrow(/No profile "default" found/);
  });

  it('saveProfile then resolveProfile round-trips apiUrl/apiKey/apiKeyId/account', async () => {
    const { saveProfile, resolveProfile } = await import('./credentials.js');
    await saveProfile('default', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_abc', apiKeyId: 'key_1', account: 'openassistant' });

    const profile = await resolveProfile('default');
    expect(profile).toEqual({ apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_abc', apiKeyId: 'key_1', account: 'openassistant' });
  });

  it('supports multiple named profiles in the same file without clobbering each other', async () => {
    const { saveProfile, resolveProfile, listProfileNames } = await import('./credentials.js');
    await saveProfile('default', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_one' });
    await saveProfile('staging', { apiUrl: 'https://staging-api.agnt.ai', apiKey: 'ak_live_two' });

    expect(await resolveProfile('default')).toMatchObject({ apiKey: 'ak_live_one' });
    expect(await resolveProfile('staging')).toMatchObject({ apiKey: 'ak_live_two' });
    expect((await listProfileNames()).sort()).toEqual(['default', 'staging']);
  });

  it('overwriting an existing profile updates only that profile', async () => {
    const { saveProfile, resolveProfile } = await import('./credentials.js');
    await saveProfile('default', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_old' });
    await saveProfile('other', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_other' });
    await saveProfile('default', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_new' });

    expect(await resolveProfile('default')).toMatchObject({ apiKey: 'ak_live_new' });
    expect(await resolveProfile('other')).toMatchObject({ apiKey: 'ak_live_other' });
  });

  it('writes the credentials file with mode 0o600 (owner read/write only)', async () => {
    const { saveProfile, resolveCredentialsFilePath } = await import('./credentials.js');
    await saveProfile('default', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_abc' });

    const { stat } = await import('fs/promises');
    const fileStat = await stat(await resolveCredentialsFilePath());
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it('a profile missing apiKey is treated as not found', async () => {
    const { saveProfile, resolveProfile } = await import('./credentials.js');
    await saveProfile('default', { apiUrl: 'https://api.agnt.ai', apiKey: '' });
    await expect(resolveProfile('default')).rejects.toThrow(/No profile "default" found/);
  });

  describe('persisted default profile', () => {
    it('the first-ever saved profile becomes the default automatically, whatever it is named', async () => {
      const { saveProfile, getDefaultProfileName, resolveProfileName } = await import('./credentials.js');
      await saveProfile('work', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_work' });

      expect(await getDefaultProfileName()).toBe('work');
      expect(await resolveProfileName()).toBe('work'); // no --profile, no env var
    });

    it('a second saved profile does NOT change the persisted default', async () => {
      const { saveProfile, getDefaultProfileName } = await import('./credentials.js');
      await saveProfile('work', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_work' });
      await saveProfile('personal', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_personal' });

      expect(await getDefaultProfileName()).toBe('work');
    });

    it('profiles use switches the persisted default to an existing profile', async () => {
      const { saveProfile, setDefaultProfileName, getDefaultProfileName, resolveProfileName } = await import('./credentials.js');
      await saveProfile('work', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_work' });
      await saveProfile('personal', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_personal' });

      await setDefaultProfileName('personal');

      expect(await getDefaultProfileName()).toBe('personal');
      expect(await resolveProfileName()).toBe('personal');
    });

    it('setDefaultProfileName rejects a profile name that does not exist', async () => {
      const { saveProfile, setDefaultProfileName } = await import('./credentials.js');
      await saveProfile('work', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_work' });

      await expect(setDefaultProfileName('nonexistent')).rejects.toThrow(/No profile "nonexistent" found/);
    });
  });

  describe('removeProfile', () => {
    it('removes the named profile, leaving others intact', async () => {
      const { saveProfile, removeProfile, listProfileNames, resolveProfile } = await import('./credentials.js');
      await saveProfile('work', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_work' });
      await saveProfile('personal', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_personal' });

      await removeProfile('work');

      expect(await listProfileNames()).toEqual(['personal']);
      await expect(resolveProfile('work')).rejects.toThrow(/No profile "work" found/);
    });

    it('clears the persisted default pointer when the removed profile was the default', async () => {
      const { saveProfile, removeProfile, getDefaultProfileName } = await import('./credentials.js');
      await saveProfile('work', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_work' }); // becomes default

      await removeProfile('work');

      expect(await getDefaultProfileName()).toBeUndefined();
    });

    it('leaves the persisted default pointer alone when removing a different profile', async () => {
      const { saveProfile, removeProfile, getDefaultProfileName } = await import('./credentials.js');
      await saveProfile('work', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_work' }); // default
      await saveProfile('personal', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_personal' });

      await removeProfile('personal');

      expect(await getDefaultProfileName()).toBe('work');
    });

    it('is a no-op when the named profile does not exist', async () => {
      const { removeProfile, listProfileNames } = await import('./credentials.js');
      await expect(removeProfile('ghost')).resolves.toBeUndefined();
      expect(await listProfileNames()).toEqual([]);
    });
  });

  describe('listProfiles', () => {
    it('includes apiUrl/account but never apiKey', async () => {
      const { saveProfile, listProfiles } = await import('./credentials.js');
      await saveProfile('default', { apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_secret', account: 'openassistant' });

      const profiles = await listProfiles();
      expect(profiles).toEqual([{ name: 'default', apiUrl: 'https://api.agnt.ai', account: 'openassistant' }]);
      expect(JSON.stringify(profiles)).not.toContain('ak_live_secret');
    });
  });
});
