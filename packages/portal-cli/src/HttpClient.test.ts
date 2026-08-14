import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpClient, AgntApiError, publicRequest } from './HttpClient.js';

describe('HttpClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('attaches the bearer token and content-type on every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true })
    });
    global.fetch = fetchMock as any;

    const client = new HttpClient('https://api.example.com', 'ak_live_abc');
    await client.get('/tasks');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/tasks');
    expect(init.headers.Authorization).toBe('Bearer ak_live_abc');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('strips a trailing slash from apiUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as any;

    const client = new HttpClient('https://api.example.com/', 'ak_live_abc');
    await client.get('/tasks');

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/tasks');
  });

  it('serializes query params, skipping undefined/null values', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as any;

    const client = new HttpClient('https://api.example.com', 'ak_live_abc');
    await client.get('/tasks', { status: 'open', limit: 10, cursor: undefined, x: null as any });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('status=open');
    expect(url).toContain('limit=10');
    expect(url).not.toContain('cursor');
    expect(url).not.toContain('x=');
  });

  it('sends a JSON body on post/put/patch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as any;

    const client = new HttpClient('https://api.example.com', 'ak_live_abc');
    await client.post('/tasks', { title: 'Book a flight' });

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'Book a flight' }));

    await client.patch('/portal/integrations/i1/resource-access', { calendar: 'read' });
    const patchInit = fetchMock.mock.calls[1][1];
    expect(patchInit.method).toBe('PATCH');
    expect(patchInit.body).toBe(JSON.stringify({ calendar: 'read' }));
  });

  it('returns undefined for a 204 response without parsing a body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => { throw new Error('should not be called'); } });
    global.fetch = fetchMock as any;

    const client = new HttpClient('https://api.example.com', 'ak_live_abc');
    const result = await client.delete('/tasks/1');
    expect(result).toBeUndefined();
  });

  it('throws AgntApiError with the parsed error/error_code on a non-ok JSON response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: 'Task not found', error_code: 'not_found' })
    });
    global.fetch = fetchMock as any;

    const client = new HttpClient('https://api.example.com', 'ak_live_abc');
    await expect(client.get('/tasks/x')).rejects.toMatchObject({
      status: 404,
      message: 'Task not found',
      errorCode: 'not_found'
    });
    await expect(client.get('/tasks/x')).rejects.toBeInstanceOf(AgntApiError);
  });

  it('falls back to raw text when the error body is not JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    });
    global.fetch = fetchMock as any;

    const client = new HttpClient('https://api.example.com', 'ak_live_abc');
    await expect(client.get('/tasks')).rejects.toMatchObject({ status: 500, message: 'Internal Server Error' });
  });

  describe('stream()', () => {
    function sseBodyStream(chunks: string[]): ReadableStream<Uint8Array> {
      const encoder = new TextEncoder();
      let i = 0;
      return new ReadableStream({
        pull(controller) {
          if (i < chunks.length) {
            controller.enqueue(encoder.encode(chunks[i++]));
          } else {
            controller.close();
          }
        }
      });
    }

    it('parses event/data blocks, including ones split mid-chunk', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        body: sseBodyStream([
          'event: status_update\ndata: {"message":"thinking"}\n\n',
          'event: mess', // split mid-event on purpose
          'age\ndata: {"content":"hello"}\n\n'
        ])
      });
      global.fetch = fetchMock as any;

      const client = new HttpClient('https://api.example.com', 'ak_live_abc');
      const events: any[] = [];
      for await (const evt of client.stream('/chats/c1/process', { message: 'hi' })) events.push(evt);

      expect(events).toEqual([
        { event: 'status_update', data: { message: 'thinking' } },
        { event: 'message', data: { content: 'hello' } }
      ]);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.example.com/chats/c1/process');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ message: 'hi' });
    });

    it('defaults an event with no "event:" line to "message"', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: sseBodyStream(['data: {"content":"x"}\n\n']) });
      global.fetch = fetchMock as any;

      const client = new HttpClient('https://api.example.com', 'ak_live_abc');
      const events: any[] = [];
      for await (const evt of client.stream('/chats/c1/process')) events.push(evt);

      expect(events).toEqual([{ event: 'message', data: { content: 'x' } }]);
    });

    it('throws AgntApiError immediately on a non-ok response, before touching the body', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => JSON.stringify({ error: 'Chat not found', error_code: 'not_found' })
      });
      global.fetch = fetchMock as any;

      const client = new HttpClient('https://api.example.com', 'ak_live_abc');
      await expect(async () => {
        for await (const _ of client.stream('/chats/missing/process')) { /* noop */ }
      }).rejects.toMatchObject({ status: 404, message: 'Chat not found', errorCode: 'not_found' });
    });
  });
});

describe('publicRequest', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs a JSON body with no Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify({ ok: true }) });
    global.fetch = fetchMock as any;

    const result = await publicRequest('https://api.example.com', '/portal/auth/agent/start', { email: 'a@b.com' });

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/portal/auth/agent/start');
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.com' });
  });

  it('throws AgntApiError on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: 'Too many requests', error_code: 'rate_limit' })
    });
    global.fetch = fetchMock as any;

    await expect(publicRequest('https://api.example.com', '/portal/auth/agent/start', {})).rejects.toMatchObject({
      status: 429,
      message: 'Too many requests',
      errorCode: 'rate_limit'
    });
  });
});
