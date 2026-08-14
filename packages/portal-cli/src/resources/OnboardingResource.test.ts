import { describe, it, expect, vi } from 'vitest';
import { OnboardingResource } from './OnboardingResource.js';
import type { HttpClient } from '../HttpClient.js';

function fakeHttp(overrides: Partial<HttpClient> = {}): HttpClient {
  return { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), ...overrides } as unknown as HttpClient;
}

describe('OnboardingResource', () => {
  it('run() posts an empty body to /onboarding/run and returns the flat result', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true, sessionId: 's1', status: 'in_progress' }) });
    const result = await new OnboardingResource(http).run();
    expect(http.post).toHaveBeenCalledWith('/onboarding/run', {});
    expect(result).toEqual({ ok: true, sessionId: 's1', status: 'in_progress' });
  });

  it('listSessions()/getSession() unwrap { sessions }/{ session }', async () => {
    const http = fakeHttp({
      get: vi.fn()
        .mockResolvedValueOnce({ sessions: [{ id: 's1' }] })
        .mockResolvedValueOnce({ session: { id: 's1' } }),
    });
    const resource = new OnboardingResource(http);
    expect(await resource.listSessions()).toEqual([{ id: 's1' }]);
    expect(await resource.getSession('s1')).toEqual({ id: 's1' });
    expect(http.get).toHaveBeenCalledWith('/onboarding/sessions/s1');
  });

  it('getCurrentOrLatest() unwraps { session } and falls back to null', async () => {
    const http = fakeHttp({ get: vi.fn().mockResolvedValue(null) });
    const result = await new OnboardingResource(http).getCurrentOrLatest();
    expect(http.get).toHaveBeenCalledWith('/onboarding/sessions/current-or-latest');
    expect(result).toBeNull();
  });

  it('updateBite()/skipRestBites() unwrap { session }', async () => {
    const http = fakeHttp({
      patch: vi.fn().mockResolvedValue({ session: { id: 's1', bites: [] } }),
      post: vi.fn().mockResolvedValue({ session: { id: 's1' } }),
    });
    const resource = new OnboardingResource(http);
    await resource.updateBite('s1', 'b1', { reviewState: 'approved' });
    expect(http.patch).toHaveBeenCalledWith('/onboarding/sessions/s1/bites/b1', { reviewState: 'approved' });
    await resource.skipRestBites('s1');
    expect(http.post).toHaveBeenCalledWith('/onboarding/sessions/s1/bites/skip-rest', {});
  });

  it('card patchers hit their distinct /cards/:type paths', async () => {
    const http = fakeHttp({ patch: vi.fn().mockResolvedValue({ session: { id: 's1' } }) });
    const resource = new OnboardingResource(http);
    await resource.updateAboutCard('s1', { reviewState: 'approved' });
    expect(http.patch).toHaveBeenCalledWith('/onboarding/sessions/s1/cards/about', { reviewState: 'approved' });
    await resource.updatePeopleCard('s1', { reviewState: 'approved' });
    expect(http.patch).toHaveBeenCalledWith('/onboarding/sessions/s1/cards/people', { reviewState: 'approved' });
    await resource.updateSchedulingCard('s1', { reviewState: 'approved' });
    expect(http.patch).toHaveBeenCalledWith('/onboarding/sessions/s1/cards/scheduling', { reviewState: 'approved' });
    await resource.updateDayInLifeCard('s1', { reviewState: 'approved' });
    expect(http.patch).toHaveBeenCalledWith('/onboarding/sessions/s1/cards/dayInLife', { reviewState: 'approved' });
  });

  it('finalize() defaults to { applyPreferences: true, saveMemories: true } and returns the flat result', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true, sessionId: 's1', summary: {}, asyncWorkflowJobs: [] }) });
    const result = await new OnboardingResource(http).finalize('s1');
    expect(http.post).toHaveBeenCalledWith('/onboarding/sessions/s1/finalize', { applyPreferences: true, saveMemories: true });
    expect(result.sessionId).toBe('s1');
  });

  it('getFinalizeStatus()/getWorkflowStatus() return their flat responses directly', async () => {
    const http = fakeHttp({
      get: vi.fn()
        .mockResolvedValueOnce({ ok: true, status: 'complete', messages: [], pendingQuestions: [] })
        .mockResolvedValueOnce({ ok: true, jobs: [], allComplete: true }),
    });
    const resource = new OnboardingResource(http);
    expect((await resource.getFinalizeStatus('s1')).status).toBe('complete');
    expect(http.get).toHaveBeenCalledWith('/onboarding/sessions/s1/finalize-status');
    expect((await resource.getWorkflowStatus('s1')).allComplete).toBe(true);
    expect(http.get).toHaveBeenCalledWith('/onboarding/sessions/s1/workflow-status');
  });

  it('markOnboarded() posts with no body', async () => {
    const http = fakeHttp({ post: vi.fn().mockResolvedValue({ ok: true }) });
    const result = await new OnboardingResource(http).markOnboarded();
    expect(http.post).toHaveBeenCalledWith('/onboarding/mark-onboarded', undefined);
    expect(result).toEqual({ ok: true });
  });
});
