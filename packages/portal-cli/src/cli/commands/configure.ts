/**
 * {{accountSlug}} configure — write a named profile to ~/.{{accountSlug}}/credentials
 * from an API key you already have (e.g. minted earlier by `{{accountSlug}} login`
 * on another machine, or issued from the account's dashboard).
 *
 * Usage:
 *   {{accountSlug}} configure --profile staging --api-url https://staging-api.agnt.ai --api-key ak_live_... --account {{accountSlug}}
 */

import { saveProfile } from '../utils/credentials.js';
import { resolveDefaultAccountSlug, DEFAULT_API_URL } from '../../defaults.js';

export interface ConfigureOptions {
  profile: string;
  apiUrl?: string;
  apiKey: string;
  account?: string;
}

export async function runConfigure(opts: ConfigureOptions): Promise<void> {
  if (!opts.apiKey?.trim()) {
    console.error('Usage: {{accountSlug}} configure --profile <name> --api-key <key> [--api-url <url>] [--account <slug>]');
    process.exit(1);
  }

  const apiUrl = opts.apiUrl?.trim() || DEFAULT_API_URL;
  const account = opts.account?.trim() || resolveDefaultAccountSlug();

  try {
    await saveProfile(opts.profile, { apiUrl, apiKey: opts.apiKey.trim(), account });
  } catch (err: any) {
    console.error(`Failed to save profile: ${err.message}`);
    process.exit(1);
  }

  console.log(`Saved profile "${opts.profile}" to ~/.{{accountSlug}}/credentials`);
}
