/**
 * {{accountSlug}} logout — revoke a profile's API key server-side (best-effort)
 * and remove it from ~/.{{accountSlug}}/credentials.
 *
 * Usage:
 *   {{accountSlug}} logout                  # the active profile
 *   {{accountSlug}} logout --profile work
 */

import { HttpClient, AgntApiError } from '../../HttpClient.js';
import { resolveProfileName, resolveProfile, removeProfile } from '../utils/credentials.js';

export interface LogoutOptions {
  profile?: string;
}

export async function runLogout(opts: LogoutOptions): Promise<void> {
  const name = await resolveProfileName(opts.profile);

  let profile;
  try {
    profile = await resolveProfile(name);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  if (profile!.apiKeyId) {
    try {
      const http = new HttpClient(profile!.apiUrl, profile!.apiKey);
      await http.post(`/api-keys/${profile!.apiKeyId}/revoke`);
      console.log(`Revoked API key for profile "${name}".`);
    } catch (err) {
      // Non-fatal — the key may already be revoked/deleted server-side, or
      // the server may be unreachable. Still remove the local profile so a
      // dead credential doesn't linger, but tell the user in case the key
      // is actually still live and needs manual revocation.
      const message = err instanceof AgntApiError ? err.message : (err as Error).message;
      console.warn(`Could not revoke the API key server-side (${message}) — removing it locally anyway.`);
    }
  } else {
    console.warn(`Profile "${name}" has no known key id (likely set up via \`configure\`) — removing it locally only. Revoke it from the account dashboard if needed.`);
  }

  await removeProfile(name);
  console.log(`Removed profile "${name}" from ~/.{{accountSlug}}/credentials.`);
}
