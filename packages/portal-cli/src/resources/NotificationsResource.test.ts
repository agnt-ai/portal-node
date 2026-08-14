import { describe, it, expect, vi } from 'vitest';
import { NotificationsResource } from './NotificationsResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    ...overrides
  } as unknown as HttpClient;
}

describe('NotificationsResource', () => {
  it('list() pins perPage to 100 (the backend hard cap, not its default of 20)', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ notifications: [{ id: 'n1' }] }) });
    const notifications = await new NotificationsResource(http).list();
    expect(http.get).toHaveBeenCalledWith('/notifications', { archived: false, perPage: 100 });
    expect(notifications).toEqual([{ id: 'n1' }]);
  });

  it('list(true) passes archived=true', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ notifications: [] }) });
    await new NotificationsResource(http).list(true);
    expect(http.get).toHaveBeenCalledWith('/notifications', { archived: true, perPage: 100 });
  });

  it('markRead()/archive()/unarchive() PUT the right flag and unwrap { notification }', async () => {
    const http = fakeHttp({ put: vi.fn().mockResolvedValue({ notification: { id: 'n1' } }) });
    const resource = new NotificationsResource(http);

    await resource.markRead('n1');
    expect(http.put).toHaveBeenCalledWith('/notifications/n1', { read: true });

    await resource.archive('n1');
    expect(http.put).toHaveBeenCalledWith('/notifications/n1', { archived: true });

    await resource.unarchive('n1');
    expect(http.put).toHaveBeenCalledWith('/notifications/n1', { archived: false });
  });

  it('delete() DELETEs /notifications/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new NotificationsResource(http).delete('n1');
    expect(http.delete).toHaveBeenCalledWith('/notifications/n1');
  });

  it('markAllRead() POSTs with no body', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined) });
    await new NotificationsResource(http).markAllRead();
    expect(http.post).toHaveBeenCalledWith('/notifications/mark-all-read');
  });
});
