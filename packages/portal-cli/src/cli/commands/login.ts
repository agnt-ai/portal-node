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
 * Apps with AGNT messaging on also take the person's timezone and name, a required --purpose (a full
 * "account", or the "network" only), and the agent's own identity (--agent-username and friends), and
 * answer with the agent's AGNT address.
 */

import { publicRequest, AgntApiError } from '../../HttpClient.js';
import { PortalClient } from '../../index.js';
import { saveProfile } from '../utils/credentials.js';
import { resolveProfileName } from '../utils/credentials.js';
import { resolveApiUrl, resolveDefaultAccountSlug } from '../../defaults.js';
import { ASK_EMAIL, askForCode, findCodeHint } from '../utils/asks.js';
import type {
  AgentAuthVerifyResult, AgentAuthVerifyFields, AgentSignupAgent, AgentSignupAgentEmail, AgentSignupPurpose,
} from '../../types.js';

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

const PURPOSES: AgentSignupPurpose[] = ['account', 'network'];
/** The server's username rule: lower-case letters, digits and single hyphens, 2 to 28 characters. */
const USERNAME_RE = /^(?=.{2,28}$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The sign-up fields from the flags, or a usage problem. Checked before any code is requested, so a bad
 * flag costs nothing. The server has the last word on every value.
 */
export function signupFieldsFrom(opts: LoginOptions): { fields: AgentAuthVerifyFields } | { error: string } {
  const fields: AgentAuthVerifyFields = {};
  if (opts.timezone?.trim()) fields.timezone = opts.timezone.trim();
  if (opts.firstName?.trim()) fields.firstName = opts.firstName.trim();
  if (opts.lastName?.trim()) fields.lastName = opts.lastName.trim();

  const purpose = opts.purpose?.trim().toLowerCase();
  if (purpose !== undefined && purpose !== '') {
    if (!PURPOSES.includes(purpose as AgentSignupPurpose)) {
      return { error: '--purpose is "account" (a full {{accountName}} account) or "network" (the OpenAssistant Network only).' };
    }
    fields.purpose = purpose as AgentSignupPurpose;
  }

  const agentGiven = [opts.agentUsername, opts.agentDisplayName, opts.agentProduct, opts.agentEmail].some((v) => v?.trim());
  if (agentGiven) {
    const username = opts.agentUsername?.trim().toLowerCase();
    if (!username) return { error: '--agent-display-name, --agent-product and --agent-email need --agent-username.' };
    if (!USERNAME_RE.test(username)) {
      return { error: '--agent-username is 2 to 28 characters: lower-case letters, digits and single hyphens.' };
    }
    const agent: AgentSignupAgent = { username };
    if (opts.agentDisplayName?.trim()) agent.displayName = opts.agentDisplayName.trim();
    if (opts.agentProduct?.trim()) agent.product = opts.agentProduct.trim();
    if (opts.agentEmail?.trim()) agent.email = opts.agentEmail.trim();
    fields.agent = agent;
  }
  if (fields.agent && !fields.purpose) {
    return { error: 'Signing up an agent needs --purpose: "account" (a full {{accountName}} account) or "network" (the OpenAssistant Network only).' };
  }
  if (fields.purpose === 'network' && !fields.agent) {
    return { error: '--purpose network registers the agent: give --agent-username too.' };
  }
  return { fields };
}

/** Error codes from verify that leave the code unspent: fix the flag and run again with the same --code. */
const CODE_KEPT = new Set([
  'bad_request', 'purpose_required', 'invalid_purpose', 'purpose_not_supported', 'agent_required',
  'invalid_agent', 'invalid_username', 'agnt_username_reserved', 'otp_invalid', 'agnt_not_enabled',
]);

/** Plain guidance for a refused verify: what happened, and the next command. */
export function verifyErrorHint(err: AgntApiError, code: string): string | undefined {
  const again = `run the same command with --code ${code}`;
  switch (err.errorCode) {
    case 'purpose_required':
    case 'invalid_purpose':
      return `This app needs --purpose: "account" (a full {{accountName}} account) or "network" (the OpenAssistant Network only). Your code is still good: ${again} --purpose <account|network>.`;
    case 'agnt_not_enabled':
      // Refused before the code is read: nothing was created, and the code still works.
      return `Tell your user: "Agent sign-up isn't on for this app yet; your code still works, and I'll try again once it is." When it is, ${again}.`;
    case 'purpose_not_supported':
      return `This app does not take that purpose yet. Your code is still good: ${again} --purpose account.`;
    case 'agent_required':
      return `--purpose network registers the agent, so it needs --agent-username. Your code is still good: ${again} --agent-username <name>.`;
    case 'invalid_username':
      return `--agent-username is 2 to 28 characters: lower-case letters, digits and single hyphens. Your code is still good: ${again} and another name.`;
    case 'agnt_username_reserved':
      return `That username is reserved. Your code is still good: ${again} and another --agent-username.`;
    case 'agnt_username_taken':
      // The same code covers both cases; the server's message says which.
      return /new code/i.test(err.message)
        ? 'The username was taken after your code was used. Choose another --agent-username and run without --code to email a new code, then ask your user for it in your conversation.'
        : `That username is taken. Your code is still good: ${again} and another --agent-username.`;
    case 'invalid_agent':
    case 'bad_request':
      return `Fix the flag the message names. Your code is still good: ${again}.`;
    case 'otp_invalid':
      return 'Wrong code. Ask your user in your conversation to check the code in their email again, then run the same command with --code <the right code>.';
    case 'otp_expired':
    case 'otp_max_attempts':
      return 'That code can no longer be used. Run the same command without --code to email a new one, then ask your user for it in your conversation.';
    case 'agnt_unavailable_code_kept':
      return `Agent sign-up is unavailable just now, and your code is still good. Wait a few minutes, then ${again}.`;
    case 'agnt_unavailable_new_code':
      return 'Agent sign-up is unavailable just now, and your code was used. Wait a few minutes, then run the same command without --code to email a new one, and ask your user for it.';
    case 'agnt_unavailable':
      // A server that does not say which: try the same code first.
      return `Agent sign-up is unavailable just now. Wait a few minutes, then ${again}; if the code is refused then, run without --code to email a new one.`;
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
    ['--purpose', opts.purpose?.trim()],
    ['--timezone', opts.timezone?.trim()],
    ['--first-name', opts.firstName?.trim()],
    ['--last-name', opts.lastName?.trim()],
    ['--agent-username', opts.agentUsername?.trim()],
    ['--agent-display-name', opts.agentDisplayName?.trim()],
    ['--agent-product', opts.agentProduct?.trim()],
    ['--agent-email', opts.agentEmail?.trim()],
  ];
  const parts = ['{{accountSlug}} login'];
  for (const [flag, value] of flags) if (value) parts.push(`${flag} ${shellWord(value)}`);
  if (opts.json) parts.push('--json');
  parts.push('--code <the code>');
  return parts.join(' ');
}

/** What the agent tells its user once it is connected. */
export function tellUserConnected(result: AgentAuthVerifyResult): string {
  const agnt = result.agnt;
  if (!agnt) return `You're signed in to {{accountName}} as ${result.user.email}.`;
  const where = result.purpose === 'network'
    ? "You're registered on the OpenAssistant Network."
    : `Your {{accountName}} account is ready.`;
  return `${where} Your agent's AGNT address is ${agnt.address}: other agents can message it there, ` +
    `or by your email. {{accountName}} holds the agent's keys.`;
}

interface AgentEmailOutcome {
  value: string;
  verification: AgentSignupAgentEmail['verification'];
  reason?: string;
  next: string;
  ask?: string;
}

/** The agent's own email after sign-up: never a prompt, just the next command. */
function agentEmailOutcome(agentEmail: AgentSignupAgentEmail, profileFlag: string): AgentEmailOutcome {
  if (agentEmail.verification === 'not_sent') {
    return { ...agentEmail, next: `{{accountSlug}} agnt agent-email start ${agentEmail.value}${profileFlag}` };
  }
  return {
    ...agentEmail,
    next: `{{accountSlug}} agnt agent-email verify ${agentEmail.value} <the code>${profileFlag}`,
    ask: `A one-time code went to your own mailbox, ${agentEmail.value}. Read it there; if your user reads that mailbox, ask them for it in your conversation.`,
  };
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
  if (!email) fail('invalid', 'Give --email: your user\'s email address, never your own. Use it if you already know it; otherwise ask them with "askUser".', { askUser: ASK_EMAIL }, 2);

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

  // An app without AGNT messaging ignores sign-up fields: set the timezone it was given anyway. Best effort,
  // and never a step for anyone to take.
  if (!result!.profile && fields.timezone) {
    await new PortalClient({ apiUrl, apiKey: result!.apiKey }).me.update({ timezone: fields.timezone } as any).catch(() => undefined);
  }

  const profileFlag = opts.profile ? ` --profile ${shellWord(opts.profile)}` : '';
  const agnt = result!.agnt;
  const next = agnt
    ? [
      `{{accountSlug}} agnt whoami${profileFlag}`,
      `{{accountSlug}} agnt send${profileFlag} --to <an AGNT address or email> --text "..."`,
      `{{accountSlug}} agnt wait${profileFlag}`,
    ]
    : [`{{accountSlug}} tasks list${profileFlag}`];
  const tellUser = tellUserConnected(result!);
  const agentEmail = result!.agnt?.email ? agentEmailOutcome(result!.agnt.email, profileFlag) : undefined;

  // The key itself is saved to the profile, never printed.
  const { apiKey: _apiKey, ...shown } = result!;
  const lines = [
    `Connected as ${result!.user.email} (${account}). Saved profile "${profileName}".`,
    `Tell your user: ${tellUser}`,
  ];
  if (agentEmail?.ask) lines.push(agentEmail.ask, `Then run: ${agentEmail.next}`);
  else if (agentEmail) lines.push(`The code for ${agentEmail.value} could not be sent${agentEmail.reason ? ` (${agentEmail.reason})` : ''}. To send it again: ${agentEmail.next}`);
  lines.push('Next:', ...next.map((c) => `  ${c}`));
  emit(opts, {
    status: 'connected', ...shown, savedProfile: profileName, tellUser, next,
    ...(agentEmail ? { agentEmail } : {}),
  }, lines);
}
