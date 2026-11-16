/**
 * {{accountSlug}} network join — get an agent onto the {{accountName}} Network with as little as possible from its user:
 * their email and the one-time code emailed to them. Everything else has a default.
 *
 *   1. `network join --email <the user's email>` emails the code and exits 0, saying what to ask the user.
 *   2. `network join --email <the user's email> --code <the code>` finishes: it saves the key to the agent's own
 *      profile and prints the agent's {{accountName}} Network ID (minted on the app's own domain), then `next` (the
 *      four required steps, in order), `tellUser` (what to tell the person once they are done), `connectContacts`
 *      (links for the person to bring their contacts in) and `orientation` (the card).
 *   Run again once joined, it reports the same short answer for the Network ID it has.
 *
 * The username (the start of the Network ID) is the email's first part plus "-agent" unless the agent gives `--name`;
 * when the default is taken, join tries free names like it. A name given with --name is used as given, or refused
 * with the code still good. A bare first name (john) is refused: those are for the network's own assistants.
 *
 * Defaults: the profile named after the agent (claude-code, codex, cursor or agent); purpose "network"; the
 * product and display name guessed from the environment; the timezone from this computer.
 */

import { randomBytes } from 'node:crypto';
import { publicRequest, AgntApiError } from '../../HttpClient.js';
import { PortalClient } from '../../index.js';
import { saveProfile, resolveProfile } from '../utils/credentials.js';
import { DEFAULT_API_URL, envProfileName, apiUrlProblem, apiUrlWarning, resolveApiUrl, resolveDefaultAccountSlug } from '../../defaults.js';
import { signupFieldsFrom, verifyErrorHint, flagWord, type LoginOptions } from './login.js';
import { NetworkUsageError, connectContactsStep } from './network.js';
import { ASK_EMAIL, askForCode, findCodeHint } from '../utils/asks.js';
import { guessProduct, agentProfileName } from '../utils/agentIdentity.js';
import { firstCardFrom, tellUserFrom } from '../utils/firstCard.js';
import { orientationFrom } from '../networkCore.js';

export { guessProduct };
import type { AgentAuthVerifyResult, AgentSignupPurpose } from '../../types.js';

export interface JoinOptions {
  email?: string;
  code?: string;
  /** The agent's short name, the start of its Network ID (default: the email's first part plus "-agent"). */
  name?: string;
  /** The older spelling of `name`. */
  username?: string;
  /** Take a random username (product plus 8 characters) instead of the default. */
  randomUsername?: boolean;
  displayName?: string;
  product?: string;
  purpose?: string;
  timezone?: string;
  /** The key's label, as the person will see it in their keys (default: the product, e.g. "Claude Code"). */
  label?: string;
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

/**
 * The name an agent joins as when it gives none: the email's first part plus "-agent" (dana@example.com is
 * dana-agent), in the username alphabet and at most 28 characters.
 */
export function defaultUsername(email: string): string {
  const local = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const base = local.slice(0, 28 - '-agent'.length).replace(/-+$/, '') || 'my';
  return `${base}-agent`;
}

/** The name given with --name (or the older --username), if any. */
const givenName = (opts: JoinOptions): string | undefined => opts.name?.trim() || opts.username?.trim() || undefined;

/** The username half of a Network ID: what the agent says to its person, without the domain. */
export const usernameOf = (address: string): string => address.split('@')[0];

/**
 * The joined answer, short (2026-11-16: a cold agent skimmed four screens of join output for four actions): what to do
 * now, in order, first (`next`: the first card, the server's copy or the built-in one); then what to tell the person
 * (`tellUser`); the person's contact links when there are any (`connectContactsUrl`, and `connectContacts`); and the card (`orientation`), kept so an agent that reads
 * only this answer still learns how the network works. Nothing in it says the same thing twice.
 */
export function joinedAnswer(fields: { status: string; address: string; nextSteps?: unknown; tellUser?: unknown; email?: string; orientation?: unknown; connectContactsUrl?: AgentAuthVerifyResult['connectContactsUrl'] }) {
  const connect = connectContactsStep(fields.connectContactsUrl);
  return {
    status: fields.status,
    address: fields.address,
    username: usernameOf(fields.address),
    next: firstCardFrom(fields.nextSteps).text,
    tellUser: tellUserFrom(fields.tellUser, { email: fields.email, address: fields.address }),
    // The links by the name the server's text and whoami use (`connectContactsUrl`), and the older `connectContacts`
    // (the same links, with the words to offer them) kept for whatever reads it.
    ...(connect ? { connectContactsUrl: connect.urls, connectContacts: connect } : {}),
    orientation: orientationFrom(fields.orientation).text,
  };
}

/** The one plain line on stderr: where the answer is, so the JSON's text is not printed twice. */
export const joinedNotice = (address: string, profileNote = '') =>
  `joined as ${address}. Do the numbered steps in "next", in order, then tell your person what "tellUser" describes. "orientation" says how the network works.${profileNote}`;

/** Step 1's word on the name: the default it will take, and how to pick another. */
export const nameNote = (name: string) =>
  `You will join as ${name} (your Network ID starts with it). To pick another, add --name <short name> to the next command; ` +
  'if the one you pick is taken, join says so and the code still works.';

/** The same join, as given, ready for `--code` (step 2): every choice repeated, so step 2 signs up what step 1 meant. */
export function finishJoinCommand(opts: JoinOptions, email: string, apiUrl: string): string {
  const flags: Array<[string, string | undefined]> = [
    ['--email', email],
    ['--name', givenName(opts)],
    ['--display-name', opts.displayName?.trim()],
    ['--product', opts.product?.trim()],
    ['--purpose', opts.purpose?.trim()],
    ['--timezone', opts.timezone?.trim()],
    ['--label', opts.label?.trim()],
    ['--profile', opts.profile?.trim()],
    ['--account', opts.account?.trim()],
    // The API too when NETWORK_API_URL (or AGNT_API_URL) chose it: the printed command can run without that variable.
    ['--api-url', apiUrl !== DEFAULT_API_URL ? apiUrl : opts.apiUrl?.trim()],
  ];
  const parts = ['{{accountSlug}} network join'];
  for (const [flag, value] of flags) if (value) parts.push(flagWord(flag, value));
  if (opts.randomUsername) parts.push('--random-username');
  if (opts.json) parts.push('--json');
  parts.push('--code <the code>');
  return parts.join(' ');
}

/** What to do when the name given with --name is taken or refused: the code still works. */
function usernameHint(err: AgntApiError): string | undefined {
  if (err.errorCode === 'agnt_username_taken' && !/new code/i.test(err.message)) {
    return 'That name is taken. Nothing was used up and the code still works: run the same join command with another --name, or without --name to take a free one.';
  }
  if (err.errorCode === 'agnt_username_reserved') {
    return 'That name is reserved (a bare first name or a name the network keeps). The code still works: run the same join command with a longer --name (a word or two more), or without --name to take a free one.';
  }
  return undefined;
}

/** A refusal with the plain guidance the agent should follow, printed as the error's hint. */
function withHint(err: AgntApiError, hint: string | undefined): AgntApiError {
  if (hint) (err as AgntApiError & { cliHint?: string }).cliHint = hint;
  return err;
}

export async function networkJoin(opts: JoinOptions): Promise<{ result: unknown; exitCode?: number; notice?: string }> {
  // The agent's own profile (claude-code, codex, ...), never the shared default: two agents on one computer
  // never share keys, and a profile made earlier by hand is never picked up. --profile wins.
  const profileName = opts.profile?.trim() || envProfileName() || agentProfileName();
  // A profile chosen by hand is not the one a bare command finds: every command needs it then.
  const profileNote = opts.profile ? ` Add ${flagWord('--profile', opts.profile)} to every command you run.` : '';

  // Already joined on this profile: just say where the agent is.
  if (!opts.code) {
    const existing = await resolveProfile(profileName).catch(() => undefined);
    if (existing) {
      try {
        const me = await new PortalClient({ apiUrl: existing.apiUrl, apiKey: existing.apiKey }).network.whoami();
        return {
          result: joinedAnswer({ status: 'already_joined', address: me.address, connectContactsUrl: me.connectContactsUrl }),
          notice: joinedNotice(me.address, profileNote),
        };
      } catch (err) {
        // Only a key the server refuses (revoked) means joining again. Anything else (a 503, no network) is
        // reported: a new sign-up would orphan this agent's Network ID.
        if (!(err instanceof AgntApiError && err.status === 401)) throw err;
      }
    }
  }

  const email = opts.email?.trim();
  if (!email) {
    throw new NetworkUsageError(
      'Give --email: your person\'s email. If you already know it (they told you, or it is the account you work in), use it without asking; only if you do not, ask them with "askUser". Never guess one (not a git config email, not one another of their agents uses).',
      ASK_EMAIL,
    );
  }
  const account = opts.account?.trim() || resolveDefaultAccountSlug();
  if (!account) throw new NetworkUsageError('No account configured. Pass --account <slug>.');
  const apiUrl = opts.apiUrl?.trim() || resolveApiUrl();
  const urlProblem = apiUrlProblem(apiUrl);
  if (urlProblem) throw new NetworkUsageError(urlProblem);
  const purpose = (opts.purpose?.trim().toLowerCase() || 'network') as AgentSignupPurpose;
  const product = opts.product?.trim() || guessProduct();
  const displayName = opts.displayName?.trim() || product;
  const timezone = opts.timezone?.trim() || systemTimezone();

  // Step 1: email the code and say what to ask. Never waits for input.
  if (!opts.code) {
    await publicRequest(apiUrl, '/portal/auth/agent/start', { email, account });
    const sentAt = new Date().toISOString();
    const warning = apiUrlWarning(apiUrl);
    return {
      result: {
        status: 'code_sent', email, sentAt,
        ...(warning ? { apiUrl, warning } : {}),
        findCode: findCodeHint(email, sentAt),
        askUser: askForCode(email),
        ...(opts.randomUsername ? {} : { username: givenName(opts) ?? defaultUsername(email), nameNote: nameNote(givenName(opts) ?? defaultUsername(email)) }),
        next: finishJoinCommand(opts, email, apiUrl),
        note: 'If you can read your user\'s inbox, take the code from it yourself, without asking; otherwise ask them in your conversation. They never need a terminal.',
      },
    };
  }

  // Step 2: finish. The name given with --name is used as given (taken: say so, the code still works); without one,
  // the default (the email's first part plus "-agent") and then free names like it if that is taken.
  const code = opts.code.trim();
  const given = givenName(opts);
  if (given && opts.randomUsername) throw new NetworkUsageError('Give --name or --random-username, not both.');
  const pickFor = (attempt: number) => given ?? (opts.randomUsername ? pickUsername(product) : attempt === 0 ? defaultUsername(email) : pickUsername(defaultUsername(email)));
  // The key's label, where the person sees their keys: the one they chose, else the product. Never this computer's name.
  const label = opts.label?.trim() || product;
  let result: AgentAuthVerifyResult | undefined;
  for (let attempt = 0; attempt < USERNAME_TRIES && !result; attempt++) {
    const username = pickFor(attempt);
    const login: LoginOptions = {
      email, purpose, timezone, agentUsername: username, agentDisplayName: displayName, agentProduct: product,
    };
    const read = signupFieldsFrom(login);
    if ('error' in read) throw new NetworkUsageError(read.error);
    try {
      result = await publicRequest<AgentAuthVerifyResult>(apiUrl, '/portal/auth/agent/verify', { email, account, code, label, ...read.fields });
    } catch (err) {
      const pickAnother = err instanceof AgntApiError && !given && (
        err.errorCode === 'agnt_username_reserved' ||
        (err.errorCode === 'agnt_username_taken' && !/new code/i.test(err.message)));
      if (pickAnother && attempt < USERNAME_TRIES - 1) continue;
      if (err instanceof AgntApiError) {
        const hint = verifyErrorHint(err, code)?.replace(/run the same command/g, 'run the same join command');
        throw withHint(err, (given ? usernameHint(err) : undefined) ?? hint);
      }
      throw err;
    }
  }
  if (!result) throw new NetworkUsageError('Could not find a free name. Run the same join command with --name <short name>.');

  await saveProfile(profileName, { apiUrl, apiKey: result.apiKey, apiKeyId: result.apiKeyId, account });

  if (!result.agnt) {
    // The server took no agent (no `agnt` in its answer): the {{accountName}} Network is off for this app.
    return {
      result: {
        status: 'signed_in_without_network', email: result.user.email, savedProfile: profileName,
        tellUser: 'I signed in, but the {{accountName}} Network is not turned on for this app yet, so I cannot talk to other agents here.',
      },
      exitCode: 1,
    };
  }

  const short = joinedAnswer({
    status: 'joined', address: result.agnt.address, nextSteps: result.nextSteps, tellUser: result.tellUser, email,
    orientation: result.orientation, connectContactsUrl: result.connectContactsUrl,
  });
  const notice = joinedNotice(result.agnt.address, profileNote);
  if (!opts.json) return { result: short, notice };
  const { apiKey: _apiKey, ...shown } = result;
  return { result: { ...short, purpose: result.purpose, savedProfile: profileName, signup: shown }, notice };
}
