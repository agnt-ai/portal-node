import { describe, it, expect, vi } from 'vitest';
import { SchedulingResource } from './SchedulingResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('SchedulingResource', () => {
  it('getSnapshot() unwraps { snapshot }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ ok: true, snapshot: { parentTaskId: 't1', participants: [] } }) });
    const result = await new SchedulingResource(http).getSnapshot('t1');
    expect(http.get).toHaveBeenCalledWith('/tasks/t1/scheduling-snapshot');
    expect(result).toEqual({ parentTaskId: 't1', participants: [] });
  });

  it('previewSlots() posts excludeEmails and unwraps { preview }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true, preview: { meetingId: 'm1', strategies: [] } }) });
    const result = await new SchedulingResource(http).previewSlots('t1', { excludeEmails: ['a@example.com'] });
    expect(http.post).toHaveBeenCalledWith('/tasks/t1/scheduling-preview', { excludeEmails: ['a@example.com'] });
    expect(result).toEqual({ meetingId: 'm1', strategies: [] });
  });
});
