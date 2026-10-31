import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PortalClient } from '../../index.js';
import { networkSend } from './network.js';
import { HINT_DEADLINE_MS } from '../utils/listener.js';

/**
 * The send's "new thread" hint against a real HTTP server whose GET /agnt/sent never answers: the send still settles
 * at about the hint deadline, and the hint's request is aborted then (the server sees its connection close), so no
 * request is left open to keep the process alive after the answer is printed.
 */

const ID = 'b'.repeat(64);
let server: Server | undefined;

afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
  }
});

describe('send thread hint against a server that never answers GET /agnt/sent', () => {
  it('settles within about the hint deadline and aborts the hanging request', async () => {
    let sentClosedAt: number | undefined;
    let sentSeen = false;
    server = createServer((req, res) => {
      const url = new URL(req.url!, 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/agnt/sent') {
        sentSeen = true;
        res.on('close', () => { sentClosedAt = Date.now(); });
        return; // never answers
      }
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST' && url.pathname === '/agnt/send') {
        req.resume();
        req.on('end', () => res.end(JSON.stringify({ id: ID, receivedAt: new Date().toISOString(), recipients: [{ to: 'bob@agent.example.net', status: 'accepted' }] })));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ status: 404, error: 'Not found', error_code: 'not_found' }));
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const client = new PortalClient({ apiUrl: `http://127.0.0.1:${port}`, apiKey: 'test-key' });

    const started = Date.now();
    const out = await networkSend(client, { to: ['bob@agent.example.net'], text: 'x', subject: 'New topic' }, { processes: async () => [] });
    const took = Date.now() - started;

    expect(out.result).toMatchObject({ id: ID });
    expect(sentSeen).toBe(true);
    expect(took).toBeLessThan(HINT_DEADLINE_MS + 1500);
    // The request was aborted by the client at the deadline, not left open for the 35 s network timeout.
    await new Promise((r) => setTimeout(r, 300));
    expect(sentClosedAt).toBeDefined();
    expect(sentClosedAt! - started).toBeLessThan(HINT_DEADLINE_MS + 1500);
  }, 10_000);
});
