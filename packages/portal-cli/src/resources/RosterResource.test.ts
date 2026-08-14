import { describe, it, expect, vi } from 'vitest';
import { RosterResource } from './RosterResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), delete: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('RosterResource', () => {
  it('list() unwraps { assistants, primaryAssistantId }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true, assistants: [{ id: 'a1', isPrimary: true }], primaryAssistantId: 'a1' }) });
    const result = await new RosterResource(http).list('u1');
    expect(http.get).toHaveBeenCalledWith('/users/u1/assistants');
    expect(result).toEqual({ assistants: [{ id: 'a1', isPrimary: true }], primaryAssistantId: 'a1' });
  });

  it('createAndHire() posts to /users/:userId/assistants and unwraps { assistant }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ assistant: { id: 'a1', isPrimary: true } }) });
    const result = await new RosterResource(http).createAndHire('u1', { name: 'Ada' } as any);
    expect(http.post).toHaveBeenCalledWith('/users/u1/assistants', { name: 'Ada' });
    expect(result).toEqual({ id: 'a1', isPrimary: true });
  });

  it('hireExisting() posts to /hire and unwraps { user } — NOT void despite the portal typing it that way', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ user: { id: 'u1', assistant: 'a2' } }) });
    const result = await new RosterResource(http).hireExisting('u1', 'a2');
    expect(http.post).toHaveBeenCalledWith('/users/u1/assistants/a2/hire', undefined);
    expect(result).toEqual({ id: 'u1', assistant: 'a2' });
  });

  it('setPrimary() posts to /primary and unwraps { user }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ user: { id: 'u1', assistant: 'a2' } }) });
    await new RosterResource(http).setPrimary('u1', 'a2');
    expect(http.post).toHaveBeenCalledWith('/users/u1/assistants/a2/primary', undefined);
  });

  it('release() DELETEs, appending ?transfer=primary only when transferPendingWork is set', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) });
    const resource = new RosterResource(http);
    await resource.release('u1', 'a2');
    expect(http.delete).toHaveBeenCalledWith('/users/u1/assistants/a2');
    await resource.release('u1', 'a2', { transferPendingWork: true });
    expect(http.delete).toHaveBeenCalledWith('/users/u1/assistants/a2?transfer=primary');
  });
});
