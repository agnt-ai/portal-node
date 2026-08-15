/**
 * {{accountSlug}} login — headless signup/login for an agent.
 *
 * Works for both a brand-new email (creates the account) and an existing one
 * (logs in) — the backend decides which; this command doesn't need to know.
 * Repeatable: running it again (e.g. from a second agent/device) mints a new,
 * separately-labeled API key rather than reusing the first one, so each
 * agent/device gets its own revocable credential.
 *
 * Usage:
 *   {{accountSlug}} login --email you@example.com [--account {{accountSlug}}] [--label "my-laptop"]
 *   {{accountSlug}} login --email you@example.com --code 123456   # skip the prompt if you already have the code
 */

import { publicRequest, AgntApiError } from '../../HttpClient.js';
import { saveProfile } from '../utils/credentials.js';
import { resolveProfileName } from '../utils/credentials.js';
import { DEFAULT_API_URL, resolveDefaultAccountSlug } from '../../defaults.js';
import type { AgentAuthVerifyResult } from '../../types.js';

export interface LoginOptions {
  email: string;
  account?: string;
  apiUrl?: string;
  code?: string;
  label?: string;
  profile?: string;
}

async function promptForCode(): Promise<string> {
  const { createInterface } = await import('readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const code = await rl.question('Enter the verification code we emailed you: ');
    return code.trim();
  } finally {
    rl.close();
  }
}

export async function runLogin(opts: LoginOptions): Promise<void> {
  const email = opts.email?.trim();
  if (!email) {
    console.error('Usage: {{accountSlug}} login --email you@example.com [--account <slug>]');
    process.exit(1);
  }

  const account = opts.account?.trim() || resolveDefaultAccountSlug();
  if (!account) {
    console.error('No account configured. Pass --account <slug> (e.g. --account {{accountSlug}}).');
    process.exit(1);
  }

  const apiUrl = opts.apiUrl?.trim() || DEFAULT_API_URL;

  console.log(`Sending a verification code to ${email}...`);
  try {
    await publicRequest(apiUrl, '/portal/auth/agent/start', { email, account });
  } catch (err) {
    if (err instanceof AgntApiError) {
      console.error(`Failed to start login: ${err.message}`);
    } else {
      console.error(`Failed to start login: ${(err as Error).message}`);
    }
    process.exit(1);
  }

  const code = opts.code?.trim() || (await promptForCode());
  if (!code) {
    console.error('A verification code is required.');
    process.exit(1);
  }

  const label = opts.label?.trim() || `CLI (${(await import('os')).hostname()})`;

  let result: AgentAuthVerifyResult;
  try {
    result = await publicRequest<AgentAuthVerifyResult>(apiUrl, '/portal/auth/agent/verify', {
      email, account, code, label
    });
  } catch (err) {
    if (err instanceof AgntApiError) {
      console.error(`Verification failed: ${err.message}`);
    } else {
      console.error(`Verification failed: ${(err as Error).message}`);
    }
    process.exit(1);
  }

  const profileName = await resolveProfileName(opts.profile);
  await saveProfile(profileName, { apiUrl, apiKey: result!.apiKey, apiKeyId: result!.apiKeyId, account });

  console.log(`Connected as ${result!.user.email} (${account}).`);
  console.log(`Saved profile "${profileName}" to ~/.{{accountSlug}}/credentials.`);

  if (!result!.user.portalOnboarded) {
    console.log('');
    console.log('One more step before this account can be used: set a timezone and working hours.');
    console.log('Run: {{accountSlug}} onboard --timezone "America/New_York" --working-hours \'{"MO":[{"start":"09:00","end":"17:00"}]}\'');
    console.log('(every other command will fail with "onboarding_required" until this is done)');
    return;
  }

  console.log(`Try: {{accountSlug}} tasks list`);
}
