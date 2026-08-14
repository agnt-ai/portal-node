/**
 * Profile-based credentials — ~/.{{accountSlug}}/credentials
 *
 * AWS-CLI-style named profiles, mirroring @agnt-sdk/studio's
 * ~/.agnt/credentials — a separate file/namespace per account (not a single
 * shared ~/.agnt-portal/credentials) since this repo is a generic template:
 * a user could have more than one of these CLIs installed at once (e.g. this
 * account's and a different AGNT account's), each built from the same
 * source with a different {{accountSlug}} baked in — they must not collide
 * on the same credentials file.
 *
 *   [default]
 *   apiUrl = https://api.agnt.ai
 *   apiKey = ak_live_...
 *   apiKeyId = 651f...
 *   account = {{accountSlug}}
 *
 * A sibling ~/.{{accountSlug}}/config file (JSON) tracks which profile is
 * the persisted default — the first profile ever created (via `login` or
 * `configure`) becomes the default automatically; `profiles use <name>`
 * changes it later. This is separate from the *name* "default": a user's
 * very first profile is the default pointer's target even if they named it
 * something else with --profile.
 */

export interface Profile {
  apiUrl: string;
  apiKey: string;
  apiKeyId?: string;
  account?: string;
}

const PROFILE_FIELDS = ['apiUrl', 'apiKey', 'apiKeyId', 'account'] as const;

function accountDir(homedir: string, join: (...parts: string[]) => string): string {
  return join(homedir, '.{{accountSlug}}');
}

function credentialsPath(homedir: string, join: (...parts: string[]) => string): string {
  return join(accountDir(homedir, join), 'credentials');
}

function configPath(homedir: string, join: (...parts: string[]) => string): string {
  return join(accountDir(homedir, join), 'config');
}

/**
 * Exported so tests can assert against the real (possibly hydrated) path
 * rather than hardcoding the directory name — a test fixture with a
 * hardcoded '.{{accountSlug}}' literal would silently stop matching the
 * moment this file gets hydrated to a real account slug.
 */
export async function resolveCredentialsFilePath(): Promise<string> {
  const { homedir } = await import('os');
  const { join } = await import('path');
  return credentialsPath(homedir(), join);
}

function parseCredentials(raw: string): Record<string, Profile> {
  const profiles: Record<string, Profile> = {};
  let current: string | null = null;

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const section = /^\[(.+)\]$/.exec(line);
    if (section) {
      current = section[1].trim();
      profiles[current] = profiles[current] ?? { apiUrl: '', apiKey: '' };
      continue;
    }

    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (kv && current) {
      const key = kv[1].trim();
      const value = kv[2].trim();
      if ((PROFILE_FIELDS as readonly string[]).includes(key)) {
        (profiles[current] as any)[key] = value;
      }
    }
  }

  return profiles;
}

function serializeCredentials(profiles: Record<string, Profile>): string {
  return Object.entries(profiles)
    .map(([name, profile]) => {
      const lines = [`[${name}]`, `apiUrl = ${profile.apiUrl}`, `apiKey = ${profile.apiKey}`];
      if (profile.apiKeyId) lines.push(`apiKeyId = ${profile.apiKeyId}`);
      if (profile.account) lines.push(`account = ${profile.account}`);
      return lines.join('\n') + '\n';
    })
    .join('\n');
}

async function readAllProfiles(): Promise<Record<string, Profile>> {
  const { homedir } = await import('os');
  const { join } = await import('path');
  const { readFile } = await import('fs/promises');

  const path = credentialsPath(homedir(), join);
  try {
    const raw = await readFile(path, 'utf-8');
    return parseCredentials(raw);
  } catch (err: any) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeAllProfiles(profiles: Record<string, Profile>): Promise<void> {
  const { homedir } = await import('os');
  const { join, dirname } = await import('path');
  const { mkdir, writeFile, chmod } = await import('fs/promises');

  const path = credentialsPath(homedir(), join);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeCredentials(profiles), { encoding: 'utf-8', mode: 0o600 });
  await chmod(path, 0o600);
}

interface LocalConfig {
  defaultProfile?: string;
}

async function readConfig(): Promise<LocalConfig> {
  const { homedir } = await import('os');
  const { join } = await import('path');
  const { readFile } = await import('fs/promises');

  const path = configPath(homedir(), join);
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch (err: any) {
    if (err.code === 'ENOENT') return {};
    return {};
  }
}

async function writeConfig(config: LocalConfig): Promise<void> {
  const { homedir } = await import('os');
  const { join, dirname } = await import('path');
  const { mkdir, writeFile } = await import('fs/promises');

  const path = configPath(homedir(), join);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/** The persisted default profile name, if one has been set (via first login, or `profiles use`). */
export async function getDefaultProfileName(): Promise<string | undefined> {
  const config = await readConfig();
  return config.defaultProfile;
}

/** Change which profile is the persisted default — must already exist. */
export async function setDefaultProfileName(name: string): Promise<void> {
  const profiles = await readAllProfiles();
  if (!profiles[name]) {
    throw new Error(`No profile "${name}" found. Run: {{accountSlug}} profiles list`);
  }
  await writeConfig({ ...(await readConfig()), defaultProfile: name });
}

/**
 * Resolve which profile to use: explicit name > AGNT_CLI_PROFILE env var >
 * persisted default (set by the first-ever login/configure, or `profiles
 * use`) > the literal string 'default' as a last resort (e.g. nothing has
 * ever been saved yet, so resolveProfile's own not-found error is what
 * actually surfaces).
 */
export async function resolveProfileName(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  if (process.env.AGNT_CLI_PROFILE) return process.env.AGNT_CLI_PROFILE;
  const persisted = await getDefaultProfileName();
  return persisted || 'default';
}

/**
 * Load one profile's credentials. Throws a plain Error with a message
 * pointing at `{{accountSlug}} login` when the file or the named profile is missing.
 */
export async function resolveProfile(explicitName?: string): Promise<Profile> {
  const name = await resolveProfileName(explicitName);
  const profiles = await readAllProfiles();
  const profile = profiles[name];

  if (!profile || !profile.apiKey) {
    throw new Error(
      `No profile "${name}" found in ~/.{{accountSlug}}/credentials. Run: {{accountSlug}} login --email you@example.com`
    );
  }

  return profile;
}

/**
 * Write (or overwrite) one named profile, creating ~/.{{accountSlug}}/credentials if absent.
 * Written with mode 0o600 from creation — this file holds a live bearer token.
 *
 * If this is the first profile ever saved (no default set yet), it
 * automatically becomes the persisted default — "first login is the
 * default profile" — regardless of what name it was saved under.
 */
export async function saveProfile(name: string, profile: Profile): Promise<void> {
  const profiles = await readAllProfiles();
  const hadNoProfilesYet = Object.keys(profiles).length === 0;

  profiles[name] = profile;
  await writeAllProfiles(profiles);

  if (hadNoProfilesYet && !(await getDefaultProfileName())) {
    await writeConfig({ ...(await readConfig()), defaultProfile: name });
  }
}

/**
 * Remove a profile locally. Does NOT revoke it server-side — callers (e.g.
 * the `logout` command) should call the API first while the key is still
 * valid, then remove it here. If the removed profile was the persisted
 * default, the pointer is cleared (falls back to the literal 'default'
 * name next time, same as a fresh install).
 */
export async function removeProfile(name: string): Promise<void> {
  const profiles = await readAllProfiles();
  if (!profiles[name]) return;

  delete profiles[name];
  await writeAllProfiles(profiles);

  const config = await readConfig();
  if (config.defaultProfile === name) {
    const { defaultProfile, ...rest } = config;
    await writeConfig(rest);
  }
}

export async function listProfileNames(): Promise<string[]> {
  const profiles = await readAllProfiles();
  return Object.keys(profiles);
}

export interface ProfileSummary {
  name: string;
  apiUrl: string;
  account?: string;
}

/** Like listProfileNames(), but includes apiUrl/account for display — apiKey is deliberately omitted. */
export async function listProfiles(): Promise<ProfileSummary[]> {
  const profiles = await readAllProfiles();
  return Object.entries(profiles).map(([name, profile]) => ({
    name,
    apiUrl: profile.apiUrl,
    account: profile.account
  }));
}
