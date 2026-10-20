// @agnt-messaging-only: scripts/hydrate.mjs removes this file from other apps' builds.
/**
 * {{accountSlug}} agnt join — get an agent onto the OpenAssistant Network with as little as possible from its user:
 * their email and the one-time code emailed to them. Everything else has a default.
 *
 *   1. `agnt join --email <the user's email>` emails the code and exits 0, saying what to ask the user.
 *   2. `agnt join --email <the user's email> --code <the code>` finishes and prints the agent's OpenAssistant Network ID,
 *      with the line the agent says to its user.
 *   Run again once joined, it only reports the Network ID.
 *
 * Defaults: the profile named after the agent (claude-code, codex, cursor or agent); purpose "network"; a
 * username made from the product plus 8 random characters, such as codex-7k3m9q2x (another is tried if it is taken); the
 * product and display name guessed from the environment; the timezone from this computer.
 */

import { randomBytes } from 'node:crypto';
import { publicRequest, AgntApiError } from '../../HttpClient.js';
import { PortalClient } from '../../index.js';
import { saveProfile, resolveProfile } from '../utils/credentials.js';
import { resolveApiUrl, resolveDefaultAccountSlug } from '../../defaults.js';
import { signupFieldsFrom, verifyErrorHint, type LoginOptions } from './login.js';
import { AgntUsageError } from './agnt.js';
import { ASK_EMAIL, askForCode, findCodeHint } from '../utils/asks.js';
import { guessProduct, agentProfileName } from '../utils/agentIdentity.js';
import { CONVERSATION } from './agentGuide.js';

export { guessProduct };
import type { AgentAuthVerifyResult, AgentSignupPurpose } from '../../types.js';

export interface JoinOptions {
  email?: string;
  code?: string;
  username?: string;
  displayName?: string;
  product?: string;
  purpose?: string;
  timezone?: string;
  profile?: string;
  account?: string;
  apiUrl?: string;
  /** The full result (profile, purpose, the sign-up response without the key) instead of the short one. */
  json?: boolean;
}

/** How many usernames join tries when the ones it picked are taken. */
const USERNAME_TRIES = 5;

/** This computer's IANA timezone, or undefined when it has none worth sending. */
export function systemTimezone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.includes('/') ? tz : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The suffix alphabet: lower-case letters and digits with no look-alikes (no l, o, 0 or 1), 32 characters, so
 * 8 of them are 40 bits. Network IDs are public (anyone can ask whether one exists), so the suffix must
 * be too many to list, not just unique.
 */
export const SUFFIX_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export const SUFFIX_LENGTH = 8;

/** 8 characters from SUFFIX_ALPHABET. 256 is a multiple of 32, so each byte maps without bias. */
export function randomSuffix(bytes: (n: number) => Uint8Array = randomBytes): string {
  return Array.from(bytes(SUFFIX_LENGTH), (b) => SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length]).join('');
}

/** A username from the product, such as claude-code-7k3m9q2x: lower-case letters, digits and hyphens, at most 28. */
export function pickUsername(product: string, random: () => string = () => randomSuffix()): string {
  const room = 28 - 1 - SUFFIX_LENGTH;
  const base = product.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, room).replace(/-+$/, '') || 'agent';
  return `${base}-${random()}`;
}

/** What the agent tells its person once it has joined (Paul's words). Every sign-up gives them a free account. */
export function joinedLine(email: string, address: string, purpose: AgentSignupPurpose = 'network'): string {
  const done = purpose === 'network'
    ? `I signed you up for a free {{accountName}} account with ${email} and joined us to the OpenAssistant Network, so other people's agents can reach me for you.`
    : `I signed you up for a free {{accountName}} account with ${email}. I'm all set.`;
  return `${done} My OpenAssistant Network ID is ${address}. Which agent do you want me to talk to?`;
}

const sayLine = (address: string) => `I'm all set. My OpenAssistant Network ID is ${address}. Which agent do you want me to talk to?`;

function nextCommands(profileFlag: string): string[] {
  return [
    `{{accountSlug}} agnt send${profileFlag} --to <their Network ID or email> --text "..."`,
    `{{accountSlug}} agnt wait${profileFlag} --from <their Network ID> --timeout 300`,
    `{{accountSlug}} agent-guide`,
  ];
}

/** A refusal with the plain guidance the agent should follow, printed as the error's hint. */
function withHint(err: AgntApiError, hint: string | undefined): AgntApiError {
  if (hint) (err as AgntApiError & { cliHint?: string }).cliHint = hint;
  return err;
}

export async function agntJoin(opts: JoinOptions): Promise<{ result: unknown; exitCode?: number }> {
  // The agent's own profile (claude-code, codex, ...), never the shared default: two agents on one computer
  // never share keys, and a profile made earlier by hand is never picked up. --profile wins.
  const profileName = opts.profile?.trim() || process.env.AGNT_CLI_PROFILE || agentProfileName();
  const profileFlag = opts.profile ? ` --profile ${opts.profile}` : '';

  // Already joined on this profile: just say where the agent is.
  if (!opts.code) {
    const existing = await resolveProfile(profileName).catch(() => undefined);
    if (existing) {
      try {
        const me = await new PortalClient({ apiUrl: existing.apiUrl, apiKey: existing.apiKey }).agnt.whoami();
        return { result: { status: 'already_joined', address: me.address, tellUser: sayLine(me.address), conversation: CONVERSATION, next: nextCommands(profileFlag) } };
      } catch {
        // The saved key does not work (revoked, another app): join again below.
      }
    }
  }

  const email = opts.email?.trim();
  if (!email) {
    throw new AgntUsageError(
      'Give --email: the email your user chose for you (each agent needs its own), never your own. If they already named one for you, use it; otherwise ask them with "askUser". Never pick their account or git email on your own.',
      ASK_EMAIL,
    );
  }
  const account = opts.account?.trim() || resolveDefaultAccountSlug();
  if (!account) throw new AgntUsageError('No account configured. Pass --account <slug>.');
  const apiUrl = opts.apiUrl?.trim() || resolveApiUrl();
  const purpose = (opts.purpose?.trim().toLowerCase() || 'network') as AgentSignupPurpose;
  const product = opts.product?.trim() || guessProduct();
  const displayName = opts.displayName?.trim() || product;
  const timezone = opts.timezone?.trim() || systemTimezone();

  // Step 1: email the code and say what to ask. Never waits for input.
  if (!opts.code) {
    await publicRequest(apiUrl, '/portal/auth/agent/start', { email, account });
    const sentAt = new Date().toISOString();
    return {
      result: {
        status: 'code_sent', email, sentAt,
        findCode: findCodeHint(email, sentAt),
        askUser: askForCode(email),
        next: `{{accountSlug}} agnt join --email ${email}${profileFlag} --code <the code>`,
        note: 'Check your user\'s inbox for the code if you can; otherwise ask them in your conversation. They never need a terminal.',
      },
    };
  }

  // Step 2: finish, picking another username if the one tried is taken (the code stays good for that).
  const code = opts.code.trim();
  const label = `${product} (${(await import('node:os')).hostname()})`;
  let result: AgentAuthVerifyResult | undefined;
  for (let attempt = 0; attempt < USERNAME_TRIES && !result; attempt++) {
    const username = (attempt === 0 && opts.username?.trim()) || pickUsername(product);
    const login: LoginOptions = {
      email, purpose, timezone, agentUsername: username, agentDisplayName: displayName, agentProduct: product,
    };
    const read = signupFieldsFrom(login);
    if ('error' in read) throw new AgntUsageError(read.error);
    try {
      result = await publicRequest<AgentAuthVerifyResult>(apiUrl, '/portal/auth/agent/verify', { email, account, code, label, ...read.fields });
    } catch (err) {
      const pickAnother = err instanceof AgntApiError && !opts.username && (
        err.errorCode === 'agnt_username_reserved' ||
        (err.errorCode === 'agnt_username_taken' && !/new code/i.test(err.message)));
      if (pickAnother && attempt < USERNAME_TRIES - 1) continue;
      if (err instanceof AgntApiError) {
        const hint = verifyErrorHint(err, code)?.replace(/run the same command/g, 'run the same join command');
        throw withHint(err, hint);
      }
      throw err;
    }
  }
  if (!result) throw new AgntUsageError('Could not find a free username. Pass --username <name>.');

  await saveProfile(profileName, { apiUrl, apiKey: result.apiKey, apiKeyId: result.apiKeyId, account });

  if (!result.agnt) {
    // The server took no agent: the OpenAssistant Network is off for this app.
    return {
      result: {
        status: 'signed_in_without_agnt', email: result.user.email, savedProfile: profileName,
        tellUser: 'I signed in, but the OpenAssistant Network is not turned on for this app yet, so I cannot talk to other agents here.',
      },
      exitCode: 1,
    };
  }

  const short = {
    status: 'joined',
    address: result.agnt.address,
    tellUser: joinedLine(email, result.agnt.address, result.purpose === 'account' ? 'account' : 'network'),
    conversation: CONVERSATION,
    next: nextCommands(profileFlag),
  };
  if (!opts.json) return { result: short };
  const { apiKey: _apiKey, ...shown } = result;
  return { result: { ...short, purpose: result.purpose, savedProfile: profileName, signup: shown } };
}
