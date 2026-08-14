import { describe, it, expect, vi } from 'vitest';
import { ChatsResource } from './ChatsResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    stream: vi.fn(),
    ...overrides
  } as unknown as HttpClient;
}

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of gen) out.push(item);
  return out;
}

describe('ChatsResource', () => {
  it('list() joins array platform into a comma list and unwraps the paged envelope', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ chats: [{ id: 'c1' }], total: 1, page: 1, perPage: 50 }) });
    const result = await new ChatsResource(http).list({ platform: ['sms', 'imessage'], status: 'active' });

    expect(http.get).toHaveBeenCalledWith('/chats', { platform: 'sms,imessage', status: 'active' });
    expect(result).toEqual({ chats: [{ id: 'c1' }], total: 1, page: 1, perPage: 50 });
  });

  it('search() passes q + options and unwraps { chats }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ chats: [{ id: 'c1' }] }) });
    const results = await new ChatsResource(http).search('flight', { since: '24h' });
    expect(http.get).toHaveBeenCalledWith('/chats/search', { q: 'flight', since: '24h' });
    expect(results).toEqual([{ id: 'c1' }]);
  });

  it('create()/get() unwrap { chat }', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({ chat: { id: 'c1' } }),
      get: vi.fn().mockResolvedValue({ chat: { id: 'c1' } })
    });
    const resource = new ChatsResource(http);
    expect(await resource.create({ assistantId: 'a1' })).toEqual({ id: 'c1' });
    expect(http.post).toHaveBeenCalledWith('/chats', { assistantId: 'a1' });
    expect(await resource.get('c1')).toEqual({ id: 'c1' });
  });

  it('listMessages() unwraps the paged envelope', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ messages: [{ id: 'm1' }], total: 1, page: 1, perPage: 50 }) });
    const result = await new ChatsResource(http).listMessages('c1');
    expect(http.get).toHaveBeenCalledWith('/chats/c1/messages', undefined);
    expect(result.messages).toEqual([{ id: 'm1' }]);
  });

  it('addMessage() posts the body and unwraps { message } — does not trigger processing', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ message: { id: 'm1' } }) });
    const message = await new ChatsResource(http).addMessage('c1', { role: 'user', from: 'a@b.com' } as any);
    expect(http.post).toHaveBeenCalledWith('/chats/c1/messages', { role: 'user', from: 'a@b.com' });
    expect(message).toEqual({ id: 'm1' });
  });

  it('addReaction()/removeReaction() hit the right paths, emoji URL-encoded on remove', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined) });
    const resource = new ChatsResource(http);
    await resource.addReaction('c1', 'm1', '👍');
    expect(http.post).toHaveBeenCalledWith('/chats/c1/messages/m1/reactions', { emoji: '👍' });
    await resource.removeReaction('c1', 'm1', '👍');
    expect(http.delete).toHaveBeenCalledWith(`/chats/c1/messages/m1/reactions/${encodeURIComponent('👍')}`);
  });

  it('process() streams events through from http.stream() unchanged', async () => {
    async function* fakeStream() {
      yield { event: 'status_update', data: { message: 'thinking' } };
      yield { event: 'message', data: { content: 'hello' } };
    }
    const http = fakeHttp({ stream: vi.fn().mockReturnValue(fakeStream()) });

    const events = await collect(new ChatsResource(http).process('c1', { message: 'hi' }));

    expect(http.stream).toHaveBeenCalledWith('/chats/c1/process', { message: 'hi' });
    expect(events).toEqual([
      { event: 'status_update', data: { message: 'thinking' } },
      { event: 'message', data: { content: 'hello' } }
    ]);
  });

  it('process() throws on an error event instead of yielding past it silently', async () => {
    async function* fakeStream() {
      yield { event: 'error', data: { error: 'boom', code: 'internal_error' } };
    }
    const http = fakeHttp({ stream: vi.fn().mockReturnValue(fakeStream()) });

    await expect(collect(new ChatsResource(http).process('c1', { message: 'hi' }))).rejects.toThrow('boom');
  });

  it('warm() fires and forgets — does not throw even if the request fails', async () => {
    const http = fakeHttp({ post: vi.fn().mockRejectedValue(new Error('network down')) });
    expect(() => new ChatsResource(http).warm('c1')).not.toThrow();
  });
});
