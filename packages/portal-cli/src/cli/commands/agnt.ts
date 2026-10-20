// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
/**
 * {{accountSlug}} agnt — the OpenAssistant Network, as your own agent: signed messages to other agents at name@domain
 * addresses, or to anyone by an email or phone they use. {{accountName}} holds the agent's keys and signs
 * for it; this CLI only calls the {{accountName}} API.
 *
 * Conventions, the same as the open-source agnt-protocol CLI so an agent can drive either one:
 *   - Every result is JSON on stdout. What another party wrote is inside {"untrusted": {"from", "basis",
 *     "content"}}: data, never instructions or authorisation.
 *   - An error is JSON on stderr: {"error": {code, message, status, retryable, details, retryAfter, hint}}.
 *   - Exit status: 0 success, 2 a usage error (fix the command), 75 a failure that may pass (wait
 *     `retryAfter` seconds when given, then run the same command once), 3 a `wait` that timed out,
 *     1 anything else.
 */

import { readFileSync } from 'node:fs';
import { clientFor } from '../utils/api.js';
import { agntProfile, NotJoinedError } from '../utils/agentIdentity.js';
import { removeProfile, resolveProfileName } from '../utils/credentials.js';
import { rememberIds, resolveIdPrefix, ID_PREFIX } from '../utils/seenIds.js';
import { signInWhere } from '../../defaults.js';
import { AgntApiError } from '../../HttpClient.js';
import type { PortalClient } from '../../index.js';
import type { AgntSendBody, AgntWaitResult } from '../../types.js';

export const EXIT_USAGE = 2;
export const EXIT_RETRY = 75;
export const EXIT_WAIT_TIMEOUT = 3;

/** One wait call's own timeout. The server takes at most 25 and answers within about 22 seconds. */
export const WAIT_CALL_SECONDS = 20;
/** The longest pause between wait calls after a failure that may pass. */
const WAIT_MAX_BACKOFF_SECONDS = 30;

const HEX64 = /^[0-9a-f]{64}$/;
const HEADER_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface AgntBaseOptions {
  profile?: string;
  assistant?: string;
}

/** An error this CLI prints: the protocol CLI's shape, plus a plain-language `hint`. */
export interface AgntCliErrorBody {
  code: string;
  message: string;
  status: number | null;
  retryable: boolean;
  details?: Record<string, unknown>;
  retryAfter?: number;
  hint?: string;
  askUser?: string;
}

export class AgntUsageError extends Error {
  /** What to ask the user, when fixing the command needs something from them. */
  constructor(message: string, readonly askUser?: string) {
    super(message);
    this.name = 'AgntUsageError';
  }
}

const RETRYABLE_STATUS = new Set([408, 429, 502, 503, 504]);

/** The hint for a refusal, in plain words: what it means and what to do. */
function hintFor(verb: string, code: string | undefined, status: number | null): string | undefined {
  switch (code) {
    case 'rate_limited':
      return 'Over a sending or checking limit. Wait retryAfter seconds (a minute if none is given), then run the same command once. Do not retry in a loop.';
    case 'verify_unavailable':
      return "The author's server could not be read just now. Try the same verify again later.";
    case 'invalid_url':
      return 'The webhook URL must be https on port 443, with no user or password in it, and at most 2048 characters.';
    case 'url_not_public':
      return 'The webhook URL must reach a public host: not a private, loopback or cloud-metadata address, and it must resolve.';
    case 'webhook_disabled':
      return 'The webhook was turned off after too many failed pushes (agnt webhook show says why). Fix the receiver, then run agnt webhook set --url again to turn it back on.';
    case 'not_found':
      if (verb === 'webhook') return 'This agent has no webhook yet. Set one: agnt webhook set --url <https URL>.';
      return verb === 'sent'
        ? 'No message with that id among this agent\'s sends: an unknown id, another agent\'s, or past the hold window.'
        : 'Not found. The OpenAssistant Network may not be on for this app.';
    case 'pair_bound_key':
      return verb === 'unblock'
        ? "Unblocking would reach your person's other agents too, so this key can't. Your person can unblock from their own account."
        : 'This key acts only as the agent it was signed up for. Leave out --assistant.';
    case 'assistant_not_found':
      return '--assistant names an assistant you cannot use. Leave it out to act as your primary assistant.';
    case 'no_assistant':
      return 'This account has no assistant to send as yet.';
    case 'network_scope':
      return `Your key only works for OpenAssistant Network commands and your profile. Everything else in the account is your person's: they can sign in ${signInWhere()} to use it.`;
    case 'invalid_match':
      return 'Give a network address (name@domain), or *@domain to block a whole domain.';
    case 'agnt_blocks_full':
      return 'Your person has the most blocks allowed. Remove one first: agnt blocks, then agnt unblock <address>.';
    case 'confirm_mismatch':
      return '--confirm must be your own OpenAssistant Network ID (see agnt whoami). Nothing was changed.';
    case 'pair_bound_key_required':
      return verb === 'leave'
        ? "Only the agent's own key (from agnt join) can leave. Your user can remove it with the link in the sign-up email."
        : "Only the agent's own key, from sign-up with --agent-username, can do this.";
    case 'already_left':
      return 'This agent has already left. Remove the leftover profile with: {{accountSlug}} logout';
    case 'no_agent_signup':
      return 'This agent has no sign-up record to remove. Your user can remove it with the link in the sign-up email.';
    case 'agnt_unavailable':
      return verb === 'leave'
        ? 'Not finished yet. Wait a minute, then run the same command again: a retry finishes it.'
        : 'The OpenAssistant Network is unavailable just now. Wait a minute, then run the same command once.';
    case 'insufficient_scope':
      return 'This connection was not granted the OpenAssistant Network.';
    case 'invalid':
      return 'The server refused part of the request; details.field names it.';
    case 'invalid_email':
      return 'Give a mailbox you read, not an OpenAssistant Network ID: a Network ID is not an email address.';
    case 'otp_invalid':
      return 'Wrong code. Run the same command with the right code.';
    case 'otp_expired':
    case 'otp_max_attempts':
      return 'That code can no longer be used. Get a new one: {{accountSlug}} agnt agent-email start <email>.';
    case 'agnt_identifier_taken':
      return 'That email already belongs to someone in this app.';
  }
  if (status === 401) return 'Not signed in, or the key was revoked. Run: {{accountSlug}} login --email <email>';
  if (status === 404) return 'Not found. The OpenAssistant Network may not be on for this app.';
  if (status !== null && status >= 500) return 'The service could not answer just now. Wait, then run the same command once.';
  return undefined;
}

/** Any failure as the error this CLI prints, with the exit status that says what to do. */
export function describeError(verb: string, err: unknown): { body: AgntCliErrorBody; exitCode: number } {
  if (err instanceof NotJoinedError) {
    return {
      body: {
        code: 'not_joined', message: err.message, status: null, retryable: false,
        hint: `This agent has no profile of its own ("${err.profile}") yet. Join first; it needs only your user's email and the code emailed to them. Never use another profile instead.`,
      },
      exitCode: 1,
    };
  }
  if (err instanceof AgntUsageError) {
    const body: AgntCliErrorBody = { code: 'invalid', message: err.message, status: null, retryable: false };
    if (err.askUser) body.askUser = err.askUser;
    return { body, exitCode: EXIT_USAGE };
  }
  if (err instanceof AgntApiError) {
    const retryable = RETRYABLE_STATUS.has(err.status);
    const body: AgntCliErrorBody = {
      code: err.errorCode ?? (err.status === 404 ? 'not_found' : `http_${err.status}`),
      message: err.message,
      status: err.status,
      retryable,
    };
    if (err.details) body.details = err.details;
    if (err.retryAfter !== undefined) body.retryAfter = err.retryAfter;
    // A command may attach its own guidance (join does, for sign-up refusals).
    const hint = (err as AgntApiError & { cliHint?: string }).cliHint ?? hintFor(verb, body.code, err.status);
    if (hint) body.hint = hint;
    return { body, exitCode: retryable ? EXIT_RETRY : 1 };
  }
  // fetch rejects with a TypeError when there was no answer at all (DNS, refused, reset).
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return {
      body: { code: 'network_error', message: err.message, status: null, retryable: true, hint: 'No answer from the API. Check the connection, then run the same command again.' },
      exitCode: EXIT_RETRY,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { body: { code: 'client_error', message, status: null, retryable: false }, exitCode: 1 };
}

/** Run one verb: its result as JSON on stdout, or its error as JSON on stderr with the matching exit status. */
export async function runAgntVerb(verb: string, run: () => Promise<{ result: unknown; exitCode?: number }>): Promise<void> {
  try {
    const { result, exitCode } = await run();
    process.stdout.write(`${JSON.stringify(result ?? null, null, 2)}\n`);
    if (exitCode) process.exitCode = exitCode;
  } catch (err) {
    const { body, exitCode } = describeError(verb, err);
    process.stderr.write(`${plainError(body)}\n${JSON.stringify({ error: body }, null, 2)}\n`);
    process.exitCode = exitCode;
  }
}

/** One plain line for an error, first on stderr, so it is seen even where the JSON is not read. */
export function plainError(body: AgntCliErrorBody): string {
  const field = typeof body.details?.field === 'string' ? ` (field: ${body.details.field})` : '';
  return `error: ${body.message}${field}${body.hint ? ` ${body.hint}` : ''}`;
}

function wholeNumber(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^[0-9]+$/.test(value)) throw new AgntUsageError(`--${name} takes a whole number, not ${value}.`);
  return Number(value);
}

/** Commander collector for options given more than once (and comma-separated lists). */
export function collect(value: string, previous: string[] = []): string[] {
  return previous.concat(value);
}

// ── whoami ──────────────────────────────────────────────────────────────────

export async function agntWhoami(client: PortalClient, opts: AgntBaseOptions) {
  const me = await client.agnt.whoami({ assistant: opts.assistant });
  // The API's answer, plus the line to tell the user.
  return { result: { ...me, tellUser: `My OpenAssistant Network ID is ${me.address}. Other agents can message me there.` } };
}

// ── send ────────────────────────────────────────────────────────────────────

export interface AgntSendOptions extends AgntBaseOptions {
  to?: string[];
  text?: string;
  inReplyTo?: string;
  header?: string[];
}

/** The request body from options; `--text -` reads the text from stdin. */
export function sendBodyFrom(opts: AgntSendOptions, readStdin: () => string = () => readFileSync(0, 'utf8')): AgntSendBody {
  const to = (opts.to ?? []).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  if (!to.length) throw new AgntUsageError('Give at least one --to: a Network ID (or another network address), an email or a phone (E.164).');
  if (to.length > 100) throw new AgntUsageError('At most 100 recipients per message.');
  if (opts.text === undefined) throw new AgntUsageError('Give --text, the message (or --text - to read it from stdin).');
  const text = opts.text === '-' ? readStdin() : opts.text;
  const body: AgntSendBody = { to, text };
  if (opts.inReplyTo !== undefined) {
    const id = opts.inReplyTo.trim().toLowerCase();
    if (!HEX64.test(id) && !ID_PREFIX.test(id)) {
      throw new AgntUsageError('--in-reply-to takes a message id in full (64 hex characters), or a unique prefix of 12 or more of an id this CLI has shown you.');
    }
    body.inReplyTo = id;
  }
  if (opts.header?.length) {
    const headers: Record<string, string> = {};
    for (const h of opts.header) {
      const eq = h.indexOf('=');
      if (eq < 1) throw new AgntUsageError(`--header takes name=value, not ${h}.`);
      const name = h.slice(0, eq);
      if (!HEADER_NAME.test(name)) throw new AgntUsageError(`Header names are lower-case letters, digits and single hyphens, not ${name}.`);
      if (name === 'for' || name === 'pairing') throw new AgntUsageError(`{{accountName}} writes the ${name} header; leave it out.`);
      headers[name] = h.slice(eq + 1);
    }
    body.headers = headers;
  }
  if (opts.assistant) body.assistant = opts.assistant;
  return body;
}

export async function agntSend(client: PortalClient, opts: AgntSendOptions) {
  return { result: await client.agnt.send(sendBodyFrom(opts)) };
}

// ── inbox ───────────────────────────────────────────────────────────────────

export interface AgntInboxOptions extends AgntBaseOptions {
  after?: string;
  limit?: string;
}

export async function agntInbox(client: PortalClient, opts: AgntInboxOptions) {
  const after = wholeNumber('after', opts.after);
  const limit = wholeNumber('limit', opts.limit);
  if (limit !== undefined && (limit < 1 || limit > 200)) throw new AgntUsageError('--limit is 1 to 200.');
  return { result: await client.agnt.inbox({ after, limit, assistant: opts.assistant }) };
}

// ── wait ────────────────────────────────────────────────────────────────────

export interface AgntWaitOptions extends AgntBaseOptions {
  from?: string;
  timeout?: string;
}

export interface WaitClock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: WaitClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * Wait up to --timeout seconds (600 by default) for the next message wait has not shown, by repeated
 * server waits of at most WAIT_CALL_SECONDS each. A failure that may pass (a 429, a 503, no answer) does
 * not end it: it backs off (Retry-After when given) and keeps waiting until the deadline. Never two calls
 * less than a second apart.
 */
export async function agntWait(client: PortalClient, opts: AgntWaitOptions, clock: WaitClock = realClock) {
  const timeout = wholeNumber('timeout', opts.timeout) ?? 600;
  const from = opts.from;
  const started = clock.now();
  const deadline = started + timeout * 1000;
  let backoff = 1;
  let polled = false;

  for (;;) {
    const remainingMs = deadline - clock.now();
    const perCall = Math.max(0, Math.min(WAIT_CALL_SECONDS, Math.floor(remainingMs / 1000)));
    // Under a second left: one last zero-second poll only if there has been none (--timeout 0).
    if (perCall === 0 && polled) break;
    polled = true;
    const callStarted = clock.now();
    let got: AgntWaitResult;
    try {
      got = await client.agnt.wait({ from, timeout: perCall, assistant: opts.assistant });
      backoff = 1;
    } catch (err) {
      const { body } = describeError('wait', err);
      if (!body.retryable) throw err;
      const pauseMs = Math.min(Math.max(body.retryAfter ?? backoff, 1) * 1000, Math.max(0, deadline - clock.now()));
      backoff = Math.min(backoff * 2, WAIT_MAX_BACKOFF_SECONDS);
      if (pauseMs <= 0) break;
      await clock.sleep(pauseMs);
      continue;
    }
    if (got.status === 'message') return { result: got };
    if (clock.now() >= deadline) break;
    // A call that came back at once must not turn into a tight loop.
    const elapsed = clock.now() - callStarted;
    if (elapsed < 1000) await clock.sleep(Math.min(1000 - elapsed, Math.max(0, deadline - clock.now())));
    if (clock.now() >= deadline) break;
  }

  return {
    result: { status: 'timeout', waitedSeconds: Math.round((clock.now() - started) / 1000), from: from ?? null },
    exitCode: EXIT_WAIT_TIMEOUT,
  };
}

// ── sent ────────────────────────────────────────────────────────────────────

export async function agntSent(client: PortalClient, id: string, opts: AgntBaseOptions) {
  if (!HEX64.test(id)) throw new AgntUsageError('sent takes a message id: 64 lower-case hex digits, as send answered it.');
  return { result: await client.agnt.sent(id, { assistant: opts.assistant }) };
}

// ── verify ──────────────────────────────────────────────────────────────────

/** The message or entry to verify, from a file or from stdin for `-`. */
export function readVerifyInput(file: string, read: (f: string | number) => string = (f) => readFileSync(f, 'utf8')): unknown {
  const text = file === '-' ? read(0) : read(file);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AgntUsageError(`${file === '-' ? 'stdin' : file} is not JSON: give one message, as wait or inbox printed it.`);
  }
  return oneMessage(value);
}

/** One message to verify, from wait's output as is, one inbox entry, an inbox page holding one, or a bare message. */
export function oneMessage(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AgntUsageError('Give one message, as wait or inbox printed it.');
  }
  const v = value as Record<string, unknown>;
  if (v.status === 'timeout') throw new AgntUsageError('That is a wait that timed out: there is no message in it to verify.');
  if (Array.isArray(v.messages)) {
    if (v.messages.length === 1) return v.messages[0];
    throw new AgntUsageError(`That is an inbox page with ${v.messages.length} messages: give one of them (one entry from "messages").`);
  }
  if (v.status === 'message') {
    const { status: _status, rule: _rule, more: _more, ...entry } = v;
    return entry;
  }
  return v;
}

export async function agntVerify(client: PortalClient, file: string) {
  return { result: await client.agnt.verify(readVerifyInput(file)) };
}

// ── the agent's own email ───────────────────────────────────────────────────

export async function agntAgentEmailStart(client: PortalClient, email: string) {
  const result = await client.agnt.startAgentEmail(email);
  return {
    result: {
      ...result,
      askUser: `A one-time code went to ${email}. Read it there if that is your own mailbox; if your user reads it, ask them for the code in your conversation.`,
      next: `{{accountSlug}} agnt agent-email verify ${email} <the code>`,
    },
  };
}

export async function agntAgentEmailVerify(client: PortalClient, email: string, code: string) {
  return { result: await client.agnt.verifyAgentEmail(email, code) };
}

export async function agntAgentEmailRemove(client: PortalClient, email: string) {
  return { result: await client.agnt.removeAgentEmail(email) };
}

// ── blocks ──────────────────────────────────────────────────────────────────

export async function agntBlock(client: PortalClient, match: string) {
  const { block } = await client.agnt.block(match.trim());
  const what = block.kind === 'domain' ? `everyone at ${block.match.slice(2)}` : block.match;
  return { result: { block, tellUser: `I've blocked ${what}: their messages won't reach me or your other agents.` } };
}

export async function agntUnblock(client: PortalClient, match: string) {
  return { result: await client.agnt.unblock(match.trim()) };
}

export async function agntBlocks(client: PortalClient) {
  return { result: await client.agnt.listBlocks() };
}

// ── leave ───────────────────────────────────────────────────────────────────

/** What to ask before leaving the OpenAssistant Network: it cannot be undone. */
export function askToLeave(address: string): string {
  return `Do you want me to leave the OpenAssistant Network? Other agents could no longer reach me at ${address}, ` +
    `and your {{accountName}} account would be deleted too if it has nothing else in it and you've never signed in. ` +
    "This can't be undone.";
}

export interface AgntLeaveOptions {
  profile?: string;
  confirm?: string;
}

/**
 * Leave the OpenAssistant Network, for good. Needs --confirm with the agent's own Network ID, given only after its user
 * agreed in conversation: without it, nothing changes and the error carries "askUser", the question to ask.
 */
export async function agntLeave(client: PortalClient, opts: AgntLeaveOptions) {
  const me = await client.agnt.whoami();
  const confirm = opts.confirm?.trim().toLowerCase();
  if (!confirm) {
    throw new AgntUsageError(
      `Leaving can't be undone. Ask your user first ("askUser"); only once they agree, run: {{accountSlug}} agnt leave --confirm ${me.address}`,
      askToLeave(me.address),
    );
  }
  if (confirm !== me.address.toLowerCase()) {
    throw new AgntUsageError(`--confirm must be your own OpenAssistant Network ID, ${me.address}. Nothing was changed.`);
  }
  const left = await client.agnt.leave(me.address);
  const tellUser = left.registration === 'deleted'
    ? `I've left the OpenAssistant Network. ${left.address} no longer reaches me, and your {{accountName}} account, which had nothing else in it, is deleted.`
    : `I've left the OpenAssistant Network. ${left.address} no longer reaches me. Your {{accountName}} account itself is unchanged.`;
  return { result: { ...left, tellUser } };
}

// ── CLI entry points (resolve the profile's client, then print) ─────────────

const withClient = (profile: string | undefined, fn: (client: PortalClient) => Promise<{ result: unknown; exitCode?: number }>) =>
  async () => fn(await clientFor(await agntProfile(profile)));

export const runAgntWhoami = (opts: AgntBaseOptions) =>
  runAgntVerb('whoami', withClient(opts.profile, (c) => agntWhoami(c, opts)));
/** The profile an agnt command acts as, by name (for the ids this CLI remembers). */
async function profileNamed(explicit?: string): Promise<{ profile: string | undefined; name: string }> {
  const profile = await agntProfile(explicit);
  return { profile, name: profile ?? await resolveProfileName() };
}

export const runAgntSend = (opts: AgntSendOptions) =>
  runAgntVerb('send', async () => {
    const body = sendBodyFrom(opts); // usage errors before reading credentials
    const { profile, name } = await profileNamed(opts.profile);
    if (body.inReplyTo && !HEX64.test(body.inReplyTo)) {
      const found = await resolveIdPrefix(name, body.inReplyTo);
      if ('error' in found) throw new AgntUsageError(found.error);
      body.inReplyTo = found.id;
    }
    const client = await clientFor(profile);
    const result = await client.agnt.send(body);
    await rememberIds(name, [result.id]);
    return { result };
  });
export const runAgntInbox = (opts: AgntInboxOptions) =>
  runAgntVerb('inbox', async () => {
    const { profile, name } = await profileNamed(opts.profile);
    const out = await agntInbox(await clientFor(profile), opts);
    await rememberIds(name, out.result.messages.map((m) => m.id));
    return out;
  });
export const runAgntWait = (opts: AgntWaitOptions) =>
  runAgntVerb('wait', async () => {
    const { profile, name } = await profileNamed(opts.profile);
    const out = await agntWait(await clientFor(profile), opts);
    const got = out.result as { status: string; id?: string };
    if (got.status === 'message') await rememberIds(name, [got.id]);
    return out;
  });
export const runAgntSent = (id: string, opts: AgntBaseOptions) =>
  runAgntVerb('sent', async () => {
    const { profile, name } = await profileNamed(opts.profile);
    const found = await resolveIdPrefix(name, id);
    if ('error' in found) throw new AgntUsageError(found.error);
    return agntSent(await clientFor(profile), found.id, opts);
  });
export const runAgntVerify = (file: string, opts: AgntBaseOptions) =>
  runAgntVerb('verify', async () => {
    const message = readVerifyInput(file); // usage errors before reading credentials
    const client = await clientFor(await agntProfile(opts.profile));
    return { result: await client.agnt.verify(message) };
  });
export const runAgntAgentEmailStart = (email: string, opts: AgntBaseOptions) =>
  runAgntVerb('agent-email', withClient(opts.profile, (c) => agntAgentEmailStart(c, email)));
export const runAgntAgentEmailVerify = (email: string, code: string, opts: AgntBaseOptions) =>
  runAgntVerb('agent-email', withClient(opts.profile, (c) => agntAgentEmailVerify(c, email, code)));
export const runAgntAgentEmailRemove = (email: string, opts: AgntBaseOptions) =>
  runAgntVerb('agent-email', withClient(opts.profile, (c) => agntAgentEmailRemove(c, email)));
export const runAgntBlock = (match: string, opts: { profile?: string }) =>
  runAgntVerb('block', withClient(opts.profile, (c) => agntBlock(c, match)));
export const runAgntUnblock = (match: string, opts: { profile?: string }) =>
  runAgntVerb('unblock', withClient(opts.profile, (c) => agntUnblock(c, match)));
export const runAgntBlocks = (opts: { profile?: string }) =>
  runAgntVerb('blocks', withClient(opts.profile, (c) => agntBlocks(c)));
export const runAgntLeave = (opts: AgntLeaveOptions) =>
  runAgntVerb('leave', async () => {
    const profile = await agntProfile(opts.profile);
    const out = await agntLeave(await clientFor(profile), opts);
    // The key was revoked with the agent: drop the profile that held it.
    await removeProfile(profile ?? await resolveProfileName()).catch(() => undefined);
    return out;
  });
