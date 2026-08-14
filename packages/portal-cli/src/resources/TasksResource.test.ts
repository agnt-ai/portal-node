import { describe, it, expect, vi } from 'vitest';
import { TasksResource } from './TasksResource.js';
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

describe('TasksResource', () => {
  it('list() joins array status into a comma list and unwraps the paged envelope', async () => {
    const http = fakeHttp({
      get: vi.fn().mockResolvedValue({ ok: true, page: 1, perPage: 50, total: 2, tasks: [{ id: 't1' }, { id: 't2' }] })
    });
    const resource = new TasksResource(http);

    const result = await resource.list({ status: ['pending', 'executing'], mine: true, search: 'flight' });

    expect(http.get).toHaveBeenCalledWith('/tasks', { status: 'pending,executing', mine: 'true', search: 'flight' });
    expect(result).toEqual({ tasks: [{ id: 't1' }, { id: 't2' }], total: 2, page: 1, perPage: 50 });
  });

  it('create() posts the body and unwraps either a bare Task or { task }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ task: { id: 't1', title: 'Book a flight' } }) });
    const task = await new TasksResource(http).create({ title: 'Book a flight', assistant: 'travel@agnt.ai' });
    expect(http.post).toHaveBeenCalledWith('/tasks', { title: 'Book a flight', assistant: 'travel@agnt.ai' });
    expect(task).toEqual({ id: 't1', title: 'Book a flight' });

    const http2 = fakeHttp({ post: vi.fn().mockResolvedValue({ id: 't2', title: 'Bare shape' }) });
    const task2 = await new TasksResource(http2).create({ title: 'Bare shape', assistant: 'x@agnt.ai' });
    expect(task2).toEqual({ id: 't2', title: 'Bare shape' });
  });

  it('get() fetches by id and unwraps { task }', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue({ task: { id: 't1' } }) });
    expect(await new TasksResource(http).get('t1')).toEqual({ id: 't1' });
    expect(http.get).toHaveBeenCalledWith('/tasks/t1');
  });

  it('update() PUTs to /tasks/:id and unwraps the task', async () => {
    const http = fakeHttp({ put: vi.fn().mockResolvedValue({ task: { id: 't1', title: 'New title' } }) });
    const task = await new TasksResource(http).update('t1', { title: 'New title' });
    expect(http.put).toHaveBeenCalledWith('/tasks/t1', { title: 'New title' });
    expect(task).toEqual({ id: 't1', title: 'New title' });
  });

  it('delete() DELETEs /tasks/:id', async () => {
    const http = fakeHttp({ delete: vi.fn().mockResolvedValue(undefined) });
    await new TasksResource(http).delete('t1');
    expect(http.delete).toHaveBeenCalledWith('/tasks/t1');
  });

  it('process()/resume()/sendMessage() all hit the same /process endpoint — resume is process() with no body', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined) });
    const resource = new TasksResource(http);

    await resource.resume('t1');
    expect(http.post).toHaveBeenCalledWith('/tasks/t1/process', {});

    await resource.sendMessage('t1', 'hello', [{ name: 'a.txt', fileId: 'f1' }]);
    expect(http.post).toHaveBeenCalledWith('/tasks/t1/process', { message: 'hello', files: [{ name: 'a.txt', fileId: 'f1' }] });
  });

  it('sendMessage() omits files entirely when none are given', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined) });
    await new TasksResource(http).sendMessage('t1', 'hello');
    expect(http.post).toHaveBeenCalledWith('/tasks/t1/process', { message: 'hello' });
  });

  it.each([
    ['stop', '/tasks/t1/stop'],
    ['interrupt', '/tasks/t1/interrupt'],
    ['markDone', '/tasks/t1/mark-done'],
    ['archive', '/tasks/t1/archive'],
    ['unarchive', '/tasks/t1/unarchive'],
    ['seize', '/tasks/t1/seize']
  ] as const)('%s() posts to %s with no body', async (method, path) => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined) });
    const resource = new TasksResource(http);
    // @ts-expect-error dynamic method lookup for the parametrized case
    await resource[method]('t1');
    expect(http.post).toHaveBeenCalledWith(path);
  });

  it('markSeen() defaults lastSeenAt to now when omitted', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined) });
    await new TasksResource(http).markSeen('t1');
    expect(http.post).toHaveBeenCalledWith('/tasks/t1/seen', { lastSeenAt: expect.any(String) });
  });

  it('approve()/decline() post an optional reason and unwrap { task }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ task: { id: 't1', status: 'executing' } }) });
    const resource = new TasksResource(http);

    await resource.approve('t1', 'looks good');
    expect(http.post).toHaveBeenCalledWith('/tasks/t1/approve', { reason: 'looks good' });

    await resource.decline('t1');
    expect(http.post).toHaveBeenCalledWith('/tasks/t1/decline', {});
  });

  it('approveBatch() posts taskIds and unwraps { batch }', async () => {
    const http = fakeHttp({
      post: vi.fn().mockResolvedValue({ batch: { approved: ['t1'], failed: [] } })
    });
    const result = await new TasksResource(http).approveBatch(['t1', 't2']);
    expect(http.post).toHaveBeenCalledWith('/tasks/approve-batch', { taskIds: ['t1', 't2'] });
    expect(result).toEqual({ approved: ['t1'], failed: [] });
  });

  it('saveAsWorkflow() unwraps { skill }', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ skill: { id: 's1', name: 'x', title: 'X' } }) });
    const skill = await new TasksResource(http).saveAsWorkflow('t1');
    expect(http.post).toHaveBeenCalledWith('/tasks/t1/save-as-workflow');
    expect(skill).toEqual({ id: 's1', name: 'x', title: 'X' });
  });

  it('listActivities() paginates with before=cursor until hasMore is false, then reverses to chronological order', async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ activities: [{ id: 'a2' }, { id: 'a1' }], hasMore: true, cursor: 'a1' })
      .mockResolvedValueOnce({ activities: [{ id: 'a0' }], hasMore: false });
    const http = fakeHttp({ get });

    const activities = await new TasksResource(http).listActivities('t1');

    expect(get).toHaveBeenNthCalledWith(1, '/tasks/t1/activities', { limit: 100 });
    expect(get).toHaveBeenNthCalledWith(2, '/tasks/t1/activities', { limit: 100, before: 'a1' });
    expect(activities).toEqual([{ id: 'a0' }, { id: 'a1' }, { id: 'a2' }]);
  });

  it('updateAssignees() PUTs emails and unwraps { task }', async () => {
    const http = fakeHttp({ put: vi.fn().mockResolvedValue({ task: { id: 't1' } }) });
    await new TasksResource(http).updateAssignees('t1', ['a@b.com']);
    expect(http.put).toHaveBeenCalledWith('/tasks/t1/assignees', { emails: ['a@b.com'] });
  });

  it('feedback() posts a like/dislike/null status', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue(undefined) });
    await new TasksResource(http).feedback('t1', 'like');
    expect(http.post).toHaveBeenCalledWith('/tasks/t1/feedback', { status: 'like' });
  });
});
