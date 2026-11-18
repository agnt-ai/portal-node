import { describe, it, expect, vi } from 'vitest';
import { inboxQuery, networkInbox, networkKeep, keepIds, keptLine, READ_TAKE_KEEP, KEEP_MAX_IDS } from './networkMailbox.js';
import { NetworkUsageError, briefEntry } from './network.js';
import { NetworkResource, NETWORK_CALL_TIMEOUT_MS } from '../../resources/NetworkResource.js';
import { NETWORK_CORE } from '../networkCore.js';
import { readSkill } from './agentGuide.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { HttpClient } from '../../HttpClient.js';

// Keep a message pending for the person's decision (Paul, 2026-11-18): POST /agnt/keep, inbox --kept.
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const client = (network: Record<string, any>) => ({ network }) as any;
const KEPT = { count: 2, ids: [A, B] };
const UNREAD = { count: 0, senders: {}, oldest: null };
const readme = readFileSync(fileURLToPath(new URL('../../../README.md', import.meta.url)), 'utf8');

describe('network keep', () => {
  it('keeps by default and releases with --release, ids in full, lower-cased and once each', async () => {
    const keep = vi.fn().mockResolvedValue({ changed: 2, kept: KEPT, unread: UNREAD });
    const out = await networkKeep(client({ keep }), [A, B.toUpperCase(), A], {});
    expect(keep).toHaveBeenCalledWith([A, B], true, { assistant: undefined });
    expect(out.result).toEqual({ changed: 2, kept: KEPT, unread: UNREAD });
    expect(out.notice).toBe('kept 2 of 2; 2 kept in all.');
    keep.mockResolvedValue({ changed: 0, kept: { count: 0, ids: [] }, unread: UNREAD });
    const released = await networkKeep(client({ keep }), [A], { release: true, assistant: 'as1' });
    expect(keep).toHaveBeenLastCalledWith([A], false, { assistant: 'as1' });
    expect(released.notice).toMatch(/^released 0 of 1; 0 kept in all\. An id that is not a message you received, or is already in that state, changes nothing\.$/);
  });

  it('refuses no ids, a short id, or more than 200 before anything is sent', () => {
    expect(() => keepIds([])).toThrow(NetworkUsageError);
    expect(() => keepIds(['abc'])).toThrow(/64 hex characters/);
    expect(() => keepIds(Array.from({ length: KEEP_MAX_IDS + 1 }, (_, i) => i.toString(16).padStart(64, '0')))).toThrow(/At most 200/);
  });

  it('the resource POSTs /agnt/keep {ids, keep}, naming an assistant only when given', async () => {
    const http = { get: vi.fn(), post: vi.fn().mockResolvedValue({}), delete: vi.fn() } as unknown as HttpClient;
    const network = new NetworkResource(http);
    await network.keep([A]);
    await network.keep([A], false, { assistant: 'as1' });
    expect((http.post as any).mock.calls).toEqual([
      ['/agnt/keep', { ids: [A], keep: true }, { timeoutMs: NETWORK_CALL_TIMEOUT_MS }],
      ['/agnt/keep', { ids: [A], keep: false, assistant: 'as1' }, { timeoutMs: NETWORK_CALL_TIMEOUT_MS }],
    ]);
  });
});

describe('inbox --kept', () => {
  it('asks the mailbox for kept=true; not with --sent or --unread', async () => {
    expect(inboxQuery({ kept: true }).kept).toBe(true);
    expect(() => inboxQuery({ kept: true, sent: true })).toThrow(/--kept is about messages you received/);
    expect(() => inboxQuery({ kept: true, unread: true })).toThrow(/A kept message is read/);
    const http = { get: vi.fn().mockResolvedValue({}), post: vi.fn(), delete: vi.fn() } as unknown as HttpClient;
    await new NetworkResource(http).inbox({ view: 'received', kept: true });
    expect((http.get as any).mock.calls[0][1]).toMatchObject({ view: 'received', kept: 'true' });
  });

  it('the page\'s kept summary passes through, with one plain line from its count; --brief keeps each entry\'s kept', async () => {
    const message = { id: A, receivedAt: 'x', carrier: 'https://c.test', claims: [], kind: 'message', direction: 'received', unread: false, kept: true,
      sender: { verified: true, relation: 'external', pairing: null }, message: { untrusted: { from: 'bob@agent.test', basis: 'author-signed', content: { parts: [] } } } };
    const page = { rule: 'r', contract: 2, view: 'received', messages: [message], unread: UNREAD, kept: KEPT, more: false, cursor: null, token: 't' };
    const out = await networkInbox(client({ inbox: vi.fn().mockResolvedValue(page) }), { kept: true, brief: true }) as any;
    expect(out.result.kept).toEqual(KEPT);
    expect(out.result.messages[0].kept).toBe(true);
    expect(out.notice).toMatch(/kept: 2 messages waiting on your person's decision \(`\S+ network inbox --kept` lists them; `\S+ network keep --release <id>` once they decide\)\./);
    expect(briefEntry({ ...message, kept: undefined } as any)).not.toHaveProperty('kept');
    expect(keptLine({ count: 0, ids: [] })).toBeUndefined();
    expect(keptLine(undefined)).toBeUndefined();
  });
});

describe('the guidance: read, take or keep; and the PATH line', () => {
  it('one line wherever inbox and listen are explained: the skill and the README (the short agent-guide pages stay under their cap and open with the card)', () => {
    const line = "Read with `inbox` (it marks nothing) or take with `listen` (it marks read); to hand a message to your person for a decision, `keep <id>`, and release it with `keep --release <id>` once they decide.";
    expect(READ_TAKE_KEEP).toBe(line);
    const flat = (s: string) => s.replace(/\s+/g, ' ');
    expect(flat(readSkill())).toContain(line);
    expect(readme).toContain(line);
  });

  it('the card says what to do when the command is not found after install, right after the join sentence, and never npx', () => {
    expect(NETWORK_CORE).toMatch(/then `join --email <their email> --code <code>`\. If `\S+` is then not found, npm's global bin is not on your PATH: run `export PATH="\$\(npm prefix -g\)\/bin:\$PATH"` and try again\. Without a terminal/);
    expect(readme).toMatch(/An older copy must be updated with the same npm command: `npm i -g @agnt-sdk\/\S+`\. If `\S+` is then not found, npm's global bin is not on your PATH/);
    for (const text of [NETWORK_CORE, readSkill(), readme]) expect(text).not.toMatch(/\bnpx\b/);
  });
});
