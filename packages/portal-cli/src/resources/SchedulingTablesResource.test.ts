import { describe, it, expect, vi } from 'vitest';
import { SchedulingTablesResource } from './SchedulingTablesResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('SchedulingTablesResource', () => {
  it('list() unwraps { schedulingTables }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ schedulingTables: [{ id: 't1' }] }) });
    const result = await new SchedulingTablesResource(http).list();
    expect(http.get).toHaveBeenCalledWith('/scheduling-tables');
    expect(result).toEqual([{ id: 't1' }]);
  });

  it('create()/get()/update() unwrap { schedulingTable }', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({ schedulingTable: { id: 't1' } }),
      get: vi.fn().mockResolvedValue({ schedulingTable: { id: 't1' } }),
      patch: vi.fn().mockResolvedValue({ schedulingTable: { id: 't1', status: 'closed' } }),
    });
    const resource = new SchedulingTablesResource(http);
    expect(await resource.create({ title: 'Sync' })).toEqual({ id: 't1' });
    expect(await resource.get('t1')).toEqual({ id: 't1' });
    expect(await resource.update('t1', { status: 'closed' })).toEqual({ id: 't1', status: 'closed' });
    expect(http.patch).toHaveBeenCalledWith('/scheduling-tables/t1', { status: 'closed' });
  });

  it('delete() DELETEs /scheduling-tables/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new SchedulingTablesResource(http).delete('t1');
    expect(http.delete).toHaveBeenCalledWith('/scheduling-tables/t1');
  });

  it('slot operations hit /slots and /slots/:slotId, unwrapping { schedulingTable }', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({ schedulingTable: { id: 't1', slots: [{ id: 's1' }] } }),
      delete: vi.fn().mockResolvedValue({ schedulingTable: { id: 't1', slots: [] } }),
    });
    const resource = new SchedulingTablesResource(http);
    await resource.addSlots('t1', { slots: [{ start: 'a', end: 'b' }] });
    expect(http.post).toHaveBeenCalledWith('/scheduling-tables/t1/slots', { slots: [{ start: 'a', end: 'b' }] });
    await resource.removeSlot('t1', 's1');
    expect(http.delete).toHaveBeenCalledWith('/scheduling-tables/t1/slots/s1');
  });

  it('participant operations hit /participants and /participants/:id, unwrapping { schedulingTable }', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({ schedulingTable: { id: 't1' } }),
      patch: vi.fn().mockResolvedValue({ schedulingTable: { id: 't1' } }),
      delete: vi.fn().mockResolvedValue({ schedulingTable: { id: 't1' } }),
    });
    const resource = new SchedulingTablesResource(http);
    await resource.addParticipants('t1', { participants: [{ name: 'Ada', email: 'ada@example.com' }] });
    expect(http.post).toHaveBeenCalledWith('/scheduling-tables/t1/participants', { participants: [{ name: 'Ada', email: 'ada@example.com' }] });
    await resource.updateParticipant('t1', 'p1', { required: true });
    expect(http.patch).toHaveBeenCalledWith('/scheduling-tables/t1/participants/p1', { required: true });
    await resource.removeParticipant('t1', 'p1');
    expect(http.delete).toHaveBeenCalledWith('/scheduling-tables/t1/participants/p1');
  });

  it('sendInvite() posts to .../invite and submitResponses() PUTs .../responses', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({ schedulingTable: { id: 't1' } }),
      put: vi.fn().mockResolvedValue({ schedulingTable: { id: 't1' } }),
    });
    const resource = new SchedulingTablesResource(http);
    await resource.sendInvite('t1', 'p1');
    expect(http.post).toHaveBeenCalledWith('/scheduling-tables/t1/participants/p1/invite', undefined);
    await resource.submitResponses('t1', 'p1', { responses: [{ slotId: 's1', availability: 'yes' }] });
    expect(http.put).toHaveBeenCalledWith('/scheduling-tables/t1/participants/p1/responses', { responses: [{ slotId: 's1', availability: 'yes' }] });
  });
});
