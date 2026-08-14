import { resolveProfile } from './credentials.js';
import { PortalClient } from '../../index.js';

export async function clientFor(profileName?: string): Promise<PortalClient> {
  const profile = await resolveProfile(profileName);
  return new PortalClient({ apiUrl: profile.apiUrl, apiKey: profile.apiKey });
}
