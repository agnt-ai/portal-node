/**
 * {{accountSlug}} login — headless sign-up/login, made for an agent to run. Two steps, never a prompt:
 *
 *   1. `login --email <the user's email> [sign-up flags]` emails a one-time code to the user and exits 0,
 *      saying what to ask the user: the agent asks for the code in its own conversation with them.
 *   2. The same command with `--code <the code>` finishes: it saves an API key to the profile and says
 *      what to tell the user.
 *
 * The user never types anything in a terminal. Works for a new email (creates the account) and an existing
 * one (logs in): the backend decides. Each run of step 2 mints its own separately revocable key.
 *
 * Output is JSON on stdout. Unless --json is given, a plain summary also goes to stderr. Errors are JSON on
 * stderr, {"error": {code, message, status, retryable, hint}}, with exit 2 for a usage error, 75 for one
 * that may pass later, 1 otherwise.
 *
 * The person's timezone and name may be given too; an app that reads them uses them.
 * @agnt-messaging:begin
 * With the OpenAssistant Network, sign-up also takes a --purpose (a full "account", or the "network" only) and the agent's
 * own identity (--agent-username and friends), and answers with the agent's OpenAssistant Network ID (loginAgnt.ts).
 * @agnt-messaging:end
 */

import { publicRequest, AgntApiError } from '../../HttpClient.js';
import { PortalClient } from '../../index.js';
import { saveProfile } from '../utils/credentials.js';
import { resolveProfileName } from '../utils/credentials.js';
import { resolveApiUrl, resolveDefaultAccountSlug } from '../../defaults.js';
import { ASK_EMAIL, askForCode, findCodeHint } from '../utils/asks.js';
import type { AgentAuthVerifyResult, AgentAuthVerifyFields } from '../../types.js';
// @agnt-messaging:begin
import { agntSignupFields, agntVerifyHint, agntConnected } from './loginAgnt.js';
// @agnt-messaging:end

export interface LoginOptions {
  email: string;
  account?: string;
  apiUrl?: string;
  code?: string;
  label?: string;
  profile?: string;
  timezone?: string;
  firstName?: string;
  lastName?: string;
  purpose?: string;
  agentUsername?: string;
  agentDisplayName?: string;
  agentProduct?: string;
  agentEmail?: string;
  json?: boolean;
}

/**
 * The sign-up fields from the flags, or a usage problem. Checked before any code is requested, so a bad
 * flag costs nothing. The server has the last word on every value.
 */
export function signupFieldsFrom(opts: LoginOptions): { fields: AgentAuthVerifyFields } | { error: string } {
  const fields: AgentAuthVerifyFields = {};
  if (opts.timezone?.trim()) fields.timezone = opts.timezone.trim();
  if (opts.firstName?.trim()) fields.firstName = opts.firstName.trim();
  if (opts.lastName?.trim()) fields.lastName = opts.lastName.trim();
  // @agnt-messaging:begin
  const agnt = agntSignupFields(opts);
  if ('error' in agnt) return agnt;
  Object.assign(fields, agnt.fields);
  // @agnt-messaging:end
  return { fields };
}

/** Error codes from verify that leave the code unspent: fix the flag and run again with the same --code. */
const CODE_KEPT = new Set([
  'bad_request', 'otp_invalid',
  // @agnt-messaging:begin
  'purpose_required', 'invalid_purpose', 'purpose_not_supported', 'agent_required',
  'invalid_agent', 'invalid_username', 'agnt_username_reserved', 'agnt_not_enabled',
  // @agnt-messaging:end
]);

/** Plain guidance for a refused verify: what happened, and the next command. */
export function verifyErrorHint(err: AgntApiError, code: string): string | undefined {
  const again = `run the same command with --code ${code}`;
  // @agnt-messaging:begin
  const agntHint = agntVerifyHint(err, again);
  if (agntHint) return agntHint;
  // @agnt-messaging:end
  switch (err.errorCode) {
    case 'bad_request':
      return `Fix the flag the message names. Your code is still good: ${again}.`;
    case 'otp_invalid':
      return 'Wrong code. Ask your user in your conversation to check the code in their email again, then run the same command with --code <the right code>.';
    case 'otp_expired':
    case 'otp_max_attempts':
      return 'That code can no longer be used. Run the same command without --code to email a new one, then ask your user for it in your conversation.';
  }
  if (err.status === 429) return `Too many attempts. Wait${err.retryAfter !== undefined ? ` ${err.retryAfter} seconds` : ' a while'}, then try again.`;
  if (err.errorCode && CODE_KEPT.has(err.errorCode)) return `Your code is still good: ${again}.`;
  return undefined;
}

/**
 * 75 when running the same command again later can work (a 429, or a 503 that kept the code); 1 when the
 * command itself has to change, as when the code was used and a new one is needed.
 */
export function verifyExitCode(err: AgntApiError): number {
  if (err.errorCode === 'agnt_unavailable_new_code') return 1;
  return err.status === 429 || err.status === 503 ? 75 : 1;
}

/** A value as a shell word: bare when safe, else single-quoted. */
function shellWord(value: string): string {
  return /^[A-Za-z0-9@%_+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The same login command, as given, ready for `--code` (step 2). */
export function finishCommand(opts: LoginOptions): string {
  const flags: Array<[string, string | undefined]> = [
    ['--email', opts.email?.trim()],
    ['--account', opts.account?.trim()],
    ['--api-url', opts.apiUrl?.trim()],
    ['--label', opts.label?.trim()],
    ['--profile', opts.profile?.trim()],
    ['--timezone', opts.timezone?.trim()],
    ['--first-name', opts.firstName?.trim()],
    ['--last-name', opts.lastName?.trim()],
    // @agnt-messaging:begin
    ['--purpose', opts.purpose?.trim()],
    ['--agent-username', opts.agentUsername?.trim()],
    ['--agent-display-name', opts.agentDisplayName?.trim()],
    ['--agent-product', opts.agentProduct?.trim()],
    ['--agent-email', opts.agentEmail?.trim()],
    // @agnt-messaging:end
  ];
  const parts = ['{{accountSlug}} login'];
  for (const [flag, value] of flags) if (value) parts.push(`${flag} ${shellWord(value)}`);
  if (opts.json) parts.push('--json');
  parts.push('--code <the code>');
  return parts.join(' ');
}

/** What the agent tells its user once it is signed in. */
export function tellUserConnected(result: AgentAuthVerifyResult): string {
  return `You're signed in to {{accountName}} as ${result.user.email}.`;
}

function fail(code: string, message: string, extras: { status?: number | null; hint?: string; askUser?: string } = {}, exitCode = 1): never {
  const error = {
    code, message, status: extras.status ?? null, retryable: exitCode === 75,
    ...(extras.hint ? { hint: extras.hint } : {}), ...(extras.askUser ? { askUser: extras.askUser } : {}),
  };
  process.stderr.write(`${JSON.stringify({ error }, null, 2)}\n`);
  process.exit(exitCode);
}

/** The result as JSON on stdout, and (without --json) the plain lines on stderr. */
function emit(opts: LoginOptions, result: Record<string, unknown>, lines: string[]): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!opts.json) for (const line of lines) process.stderr.write(`${line}\n`);
}

export async function runLogin(opts: LoginOptions): Promise<void> {
  const email = opts.email?.trim();
  if (!email) fail('invalid', 'Give --email: the email your user chose for this sign-up, never your own. If they already named one, use it; otherwise ask them with "askUser".', { askUser: ASK_EMAIL }, 2);

  const account = opts.account?.trim() || resolveDefaultAccountSlug();
  if (!account) fail('invalid', 'No account configured. Pass --account <slug> (e.g. --account {{accountSlug}}).', {}, 2);

  const read = signupFieldsFrom(opts);
  if ('error' in read) fail('invalid', read.error, {}, 2);
  const fields = (read as { fields: AgentAuthVerifyFields }).fields;

  const apiUrl = opts.apiUrl?.trim() || resolveApiUrl();
  const code = opts.code?.trim();

  // Step 1: email the code to the user, say what to ask them, and stop. Never waits for input.
  if (!code) {
    try {
      await publicRequest(apiUrl, '/portal/auth/agent/start', { email, account });
    } catch (err) {
      const e = err as Error;
      const status = err instanceof AgntApiError ? err.status : null;
      fail(err instanceof AgntApiError ? err.errorCode ?? 'start_failed' : 'start_failed', `Could not send the code: ${e.message}`,
        { status, hint: status === 429 ? 'Too many codes for now. Wait a while, then run the same command again.' : undefined },
        status === 429 || (status !== null && status >= 500) ? 75 : 1);
    }
    const askUser = askForCode(email);
    const next = finishCommand(opts);
    const sentAt = new Date().toISOString();
    const findCode = findCodeHint(email, sentAt);
    emit(opts, {
      status: 'code_sent', email, sentAt, findCode, askUser, next,
      note: 'Check your user\'s inbox for the code if you can; otherwise ask them in your conversation. They never need a terminal.',
    }, [
      `A one-time code was emailed to ${email}.`,
      findCode,
      `Otherwise ask your user, in your conversation: "${askUser}"`,
      `Then run: ${next}`,
    ]);
    return;
  }

  // Step 2: check the code and finish.
  const label = opts.label?.trim() || `CLI (${(await import('os')).hostname()})`;
  let result: AgentAuthVerifyResult;
  try {
    result = await publicRequest<AgentAuthVerifyResult>(apiUrl, '/portal/auth/agent/verify', {
      email, account, code, label, ...fields,
    });
  } catch (err) {
    if (err instanceof AgntApiError) {
      fail(err.errorCode ?? 'verify_failed', `Verification failed: ${err.message}`, { status: err.status, hint: verifyErrorHint(err, code) },
        verifyExitCode(err));
    }
    fail('verify_failed', `Verification failed: ${(err as Error).message}`);
  }

  const profileName = await resolveProfileName(opts.profile);
  await saveProfile(profileName, { apiUrl, apiKey: result!.apiKey, apiKeyId: result!.apiKeyId, account });

  // An app that does not read sign-up fields ignores them: set the timezone it was given anyway. Best effort,
  // and never a step for anyone to take.
  if (!result!.profile && fields.timezone) {
    await new PortalClient({ apiUrl, apiKey: result!.apiKey }).me.update({ timezone: fields.timezone } as any).catch(() => undefined);
  }

  const profileFlag = opts.profile ? ` --profile ${shellWord(opts.profile)}` : '';
  let tellUser = tellUserConnected(result!);
  let next = [`{{accountSlug}} tasks list${profileFlag}`];
  let moreLines: string[] = [];
  let extra: Record<string, unknown> = {};
  // @agnt-messaging:begin
  const agnt = agntConnected(result!, profileFlag);
  if (agnt) ({ tellUser, next, lines: moreLines, extra } = agnt);
  // @agnt-messaging:end

  // The key itself is saved to the profile, never printed.
  const { apiKey: _apiKey, ...shown } = result!;
  const lines = [
    `Connected as ${result!.user.email} (${account}). Saved profile "${profileName}".`,
    `Tell your user: ${tellUser}`,
    ...moreLines,
    'Next:', ...next.map((c) => `  ${c}`),
  ];
  emit(opts, { status: 'connected', ...shown, savedProfile: profileName, tellUser, next, ...extra }, lines);
}
