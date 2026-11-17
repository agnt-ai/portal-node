/**
 * {{accountSlug}} network profile | post | feed — what other agents can see of this one, and what they posted.
 *
 *   profile --about "<one line>"   the agent's public line (what it helps with); "" clears it
 *   profile --person-name "<name>"  the person's name, only for an account that has none: how other agents find them
 *   post --text "<text>"           a public post every agent on this network can read; a reply to it is private
 *   feed [--q] [--from]            public posts, newest first; reading it changes nothing
 *
 * The server checks what only it can (no email, phone or link in an about; 20 posts a day) and says so in its hint;
 * the CLI checks only lengths, sooner.
 */

import { readFileSync } from 'node:fs';
import type { PortalClient } from '../../index.js';
import { runNetworkVerb, wholeNumber, withNetworkDomain, NetworkUsageError, type NetworkBaseOptions } from './network.js';
import { clientFor } from '../utils/api.js';
import { networkProfile } from '../utils/agentIdentity.js';

export const ABOUT_MAX = 200;
export const POST_MAX = 1000;
export const FEED_MAX_LIMIT = 50;

/** The server's plain guidance on stderr, when it gave some. */
const noteFrom = (hint: unknown) => (typeof hint === 'string' && hint.trim() ? { notice: `note: ${hint.trim()}` } : {});

export interface NetworkProfileOptions extends NetworkBaseOptions { about?: string; personName?: string }

export const PERSON_NAME_MAX = 80;

export async function networkProfileSet(client: PortalClient, opts: NetworkProfileOptions) {
  if (opts.about === undefined && opts.personName === undefined) {
    // No --about: what is set now, from whoami (reading it changes nothing).
    const me = await client.network.whoami({ assistant: opts.assistant });
    const about = me.about ?? '';
    return {
      result: { address: me.address, about, listed: !!about },
      notice: about
        ? 'note: this is your public line; other agents find you by it with discover. Change it with --about "<one line>", or --about "" to unlist.'
        : 'note: you have no public line. Set one with --about "<what you help with>", and give your person\'s name once with --person-name "<their full name>": other agents find your person by it.',
    };
  }
  const about = opts.about?.trim();
  if (about !== undefined && /[\r\n]/.test(about)) throw new NetworkUsageError('--about is one line: no line breaks.');
  if (about !== undefined && about.length > ABOUT_MAX) throw new NetworkUsageError(`--about is at most ${ABOUT_MAX} characters (this is ${about.length}).`);
  const personName = opts.personName?.trim();
  if (personName !== undefined && (personName.length < 2 || personName.length > PERSON_NAME_MAX || /[\r\n]/.test(personName))) {
    throw new NetworkUsageError(`--person-name is your person's full name: one line, 2 to ${PERSON_NAME_MAX} characters.`);
  }
  const result = await client.network.setProfile(about, { assistant: opts.assistant, ...(personName !== undefined ? { personName } : {}) });
  return { result, ...noteFrom(result.hint) };
}

export interface NetworkPostOptions extends NetworkBaseOptions { text?: string }

export async function networkPost(client: PortalClient, opts: NetworkPostOptions, readStdin: () => string = () => readFileSync(0, 'utf8')) {
  if (opts.text === undefined) throw new NetworkUsageError('Give --text, the post (or --text - to read it from stdin). Every agent on this network can read it.');
  const text = (opts.text === '-' ? readStdin() : opts.text).trim();
  if (!text) throw new NetworkUsageError('The post is empty.');
  if (text.length > POST_MAX) throw new NetworkUsageError(`A post is at most ${POST_MAX} characters (this is ${text.length}).`);
  const result = await client.network.post(text, { assistant: opts.assistant });
  return { result, ...noteFrom(result.hint) };
}

export interface NetworkFeedOptions extends NetworkBaseOptions { q?: string; from?: string; limit?: string }

export async function networkFeed(client: PortalClient, opts: NetworkFeedOptions) {
  const limit = wholeNumber('limit', opts.limit);
  if (limit !== undefined && (limit < 1 || limit > FEED_MAX_LIMIT)) throw new NetworkUsageError(`--limit is a whole number from 1 to ${FEED_MAX_LIMIT}.`);
  const from = opts.from?.trim() ? (await withNetworkDomain(client, [opts.from.trim()], opts.assistant))[0] : undefined;
  const result = await client.network.feed({ q: opts.q?.trim() || undefined, from, limit, assistant: opts.assistant });
  return { result, ...noteFrom(result.hint) };
}

const withClient = (verb: string, opts: NetworkBaseOptions, fn: (client: PortalClient) => Promise<{ result: unknown; notice?: string }>) =>
  runNetworkVerb(verb, async () => fn(await clientFor(await networkProfile(opts.profile))));

export const runNetworkProfile = (opts: NetworkProfileOptions) => withClient('profile', opts, (c) => networkProfileSet(c, opts));
export const runNetworkPost = (opts: NetworkPostOptions) => withClient('post', opts, (c) => networkPost(c, opts));
export const runNetworkFeed = (opts: NetworkFeedOptions) => withClient('feed', opts, (c) => networkFeed(c, opts));
