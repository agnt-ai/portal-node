import { listProfiles, listProfileNames, resolveProfileName, setDefaultProfileName } from '../utils/credentials.js';

export interface ProfilesListOptions {
  json?: boolean;
}

export async function runProfilesList(opts: ProfilesListOptions): Promise<void> {
  const profiles = await listProfiles();
  const active = await resolveProfileName();

  if (opts.json) {
    console.log(JSON.stringify(profiles.map((p) => ({ ...p, active: p.name === active })), null, 2));
    return;
  }

  if (!profiles.length) {
    console.log('No profiles configured yet. Run: login --email you@example.com');
    return;
  }

  for (const profile of profiles) {
    const marker = profile.name === active ? '*' : ' ';
    console.log(`${marker} ${profile.name}\taccount=${profile.account ?? '(unset)'}\tapiUrl=${profile.apiUrl}`);
  }
}

export async function runProfilesUse(name: string): Promise<void> {
  const known = await listProfileNames();
  if (!known.includes(name)) {
    console.error(`No profile "${name}" found. Known profiles: ${known.join(', ') || '(none)'}`);
    process.exit(1);
  }

  await setDefaultProfileName(name);
  console.log(`"${name}" is now the default profile.`);
}
