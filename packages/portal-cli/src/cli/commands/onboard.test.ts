import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOnboard } from './onboard.js';
import { clientFor } from '../utils/api.js';

const client = {
  me: { get: vi.fn().mockResolvedValue({ id: 'u1' }), update: vi.fn().mockResolvedValue({}) },
  preferences: { updateUserScheduling: vi.fn().mockResolvedValue({}) },
  onboarding: { markOnboarded: vi.fn().mockResolvedValue({ ok: true }) },
};

vi.mock('../utils/api.js', () => ({ clientFor: vi.fn() }));

describe('runOnboard', () => {
  beforeEach(() => {
    vi.mocked(clientFor).mockResolvedValue(client as any);
    for (const fn of [client.me.get, client.me.update, client.preferences.updateUserScheduling, client.onboarding.markOnboarded]) fn.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('needs no flags: only marks the account set up', async () => {
    await runOnboard({});
    expect(client.onboarding.markOnboarded).toHaveBeenCalledTimes(1);
    expect(client.me.update).not.toHaveBeenCalled();
    expect(client.preferences.updateUserScheduling).not.toHaveBeenCalled();
  });

  it('sets a timezone when given one, and working hours only when given them', async () => {
    await runOnboard({ timezone: ' Europe/Paris ', workingHours: '{"MO":[{"start":"09:00","end":"17:00"}]}', json: true });
    expect(client.me.update).toHaveBeenCalledWith({ timezone: 'Europe/Paris' });
    expect(client.preferences.updateUserScheduling).toHaveBeenCalledWith('u1',
      { sync: true, availability: { sync: true, workingHours: { MO: [{ start: '09:00', end: '17:00' }] } } });
    expect(client.onboarding.markOnboarded).toHaveBeenCalledTimes(1);
  });
});
