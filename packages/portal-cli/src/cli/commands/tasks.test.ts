import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTasksCreate } from './tasks.js';
import { clientFor } from '../utils/api.js';

vi.mock('../utils/api.js', () => ({
  clientFor: vi.fn()
}));

function fakeClient(overrides: any = {}) {
  return {
    assistants: { list: vi.fn().mockResolvedValue([]) },
    tasks: { create: vi.fn().mockResolvedValue({ id: 't1', title: 'Task' }), sendMessage: vi.fn() },
    ...overrides
  };
}

describe('runTasksCreate — --assistant email resolution', () => {
  beforeEach(() => { vi.mocked(clientFor).mockReset(); });

  it('resolves an email --assistant value to the matching assistant id before creating the task', async () => {
    const client = fakeClient({
      assistants: {
        list: vi.fn().mockResolvedValue([
          { id: 'a1', email: 'kavya@openassistant.us' },
          { id: 'a2', email: 'annie@openassistant.us' }
        ])
      }
    });
    vi.mocked(clientFor).mockResolvedValue(client as any);

    await runTasksCreate('Investigate an error', { assistant: 'kavya@openassistant.us' });

    expect(client.tasks.create).toHaveBeenCalledWith({ title: 'Investigate an error', assistant: 'a1', description: undefined });
  });

  it('matches email case-insensitively', async () => {
    const client = fakeClient({
      assistants: { list: vi.fn().mockResolvedValue([{ id: 'a1', email: 'kavya@openassistant.us' }]) }
    });
    vi.mocked(clientFor).mockResolvedValue(client as any);

    await runTasksCreate('Task', { assistant: 'KAVYA@OpenAssistant.us' });

    expect(client.tasks.create).toHaveBeenCalledWith({ title: 'Task', assistant: 'a1', description: undefined });
  });

  it('throws a clear error when no assistant matches the given email', async () => {
    const client = fakeClient({ assistants: { list: vi.fn().mockResolvedValue([]) } });
    vi.mocked(clientFor).mockResolvedValue(client as any);

    await expect(runTasksCreate('Task', { assistant: 'nobody@example.com' }))
      .rejects.toThrow('No assistant found with email "nobody@example.com"');
    expect(client.tasks.create).not.toHaveBeenCalled();
  });

  it('passes a bare (non-email) --assistant value through unresolved — no assistants.list() call', async () => {
    const client = fakeClient();
    vi.mocked(clientFor).mockResolvedValue(client as any);

    await runTasksCreate('Task', { assistant: '507f1f77bcf86cd799439011' });

    expect(client.assistants.list).not.toHaveBeenCalled();
    expect(client.tasks.create).toHaveBeenCalledWith({ title: 'Task', assistant: '507f1f77bcf86cd799439011', description: undefined });
  });

  it('still sends the initial message after resolving the assistant', async () => {
    const client = fakeClient({
      assistants: { list: vi.fn().mockResolvedValue([{ id: 'a1', email: 'kavya@openassistant.us' }]) },
      tasks: { create: vi.fn().mockResolvedValue({ id: 't1', title: 'Task' }), sendMessage: vi.fn() }
    });
    vi.mocked(clientFor).mockResolvedValue(client as any);

    await runTasksCreate('Task', { assistant: 'kavya@openassistant.us', message: 'go check logs' });

    expect(client.tasks.sendMessage).toHaveBeenCalledWith('t1', 'go check logs');
  });
});
