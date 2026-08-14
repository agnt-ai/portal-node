import { describe, it, expect, vi } from 'vitest';
import { CalendarsResource } from './CalendarsResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    ...overrides
  } as unknown as HttpClient;
}

describe('CalendarsResource', () => {
  it('list() unwraps { calendars }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ calendars: [{ id: 'cal1' }] }) });
    const calendars = await new CalendarsResource(http).list();
    expect(http.get).toHaveBeenCalledWith('/calendars');
    expect(calendars).toEqual([{ id: 'cal1' }]);
  });

  it('get() unwraps { calendar }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ calendar: { id: 'cal1' } }) });
    expect(await new CalendarsResource(http).get('cal1')).toEqual({ id: 'cal1' });
    expect(http.get).toHaveBeenCalledWith('/calendars/cal1');
  });

  it('listEvents() passes startsAt/endsAt/timezone and unwraps { events }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ events: [{ id: 'e1' }] }) });
    const events = await new CalendarsResource(http).listEvents('cal1', '2026-01-01', '2026-01-08', 'America/New_York');
    expect(http.get).toHaveBeenCalledWith('/calendars/cal1/events', { startsAt: '2026-01-01', endsAt: '2026-01-08', timezone: 'America/New_York' });
    expect(events).toEqual([{ id: 'e1' }]);
  });

  it('createEvent()/updateEvent() unwrap { event } and use PATCH for updates', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({ event: { id: 'e1', title: 'Flight' } }),
      patch: vi.fn().mockResolvedValue({ event: { id: 'e1', title: 'Flight (updated)' } })
    });
    const resource = new CalendarsResource(http);

    const created = await resource.createEvent('cal1', { title: 'Flight', start: 's', end: 'e' });
    expect(http.post).toHaveBeenCalledWith('/calendars/cal1/events', { title: 'Flight', start: 's', end: 'e' });
    expect(created).toEqual({ id: 'e1', title: 'Flight' });

    const updated = await resource.updateEvent('cal1', 'e1', { title: 'Flight (updated)' });
    expect(http.patch).toHaveBeenCalledWith('/calendars/cal1/events/e1', { title: 'Flight (updated)' });
    expect(updated).toEqual({ id: 'e1', title: 'Flight (updated)' });
  });

  it('linkTask()/unlinkTask() hit the linked-tasks sub-resource', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined), delete: vi.fn().mockResolvedValue(undefined) });
    const resource = new CalendarsResource(http);

    await resource.linkTask('cal1', 'e1', 't1');
    expect(http.post).toHaveBeenCalledWith('/calendars/cal1/events/e1/linked-tasks', { taskId: 't1' });

    await resource.unlinkTask('cal1', 'e1', 't1');
    expect(http.delete).toHaveBeenCalledWith('/calendars/cal1/events/e1/linked-tasks/t1');
  });
});
