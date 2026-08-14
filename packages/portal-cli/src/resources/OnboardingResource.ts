import type { HttpClient } from '../HttpClient.js';
import type {
  RunOnboardingResult, OnboardingSessionSummary, OnboardingSession, OnboardingCurrentOrLatestSession,
  UpdateOnboardingFindingBody, UpdateOnboardingWeekLabelsBody, FinalizeOnboardingBody, FinalizeOnboardingResult,
  OnboardingUpFrontAnswers, UpdateOnboardingBiteBody, UpdateOnboardingWorkflowProposalBody,
  OnboardingWorkflowStatusResponse, OnboardingFinalizeStatusResponse,
  UpdateNarrativeCardBody, UpdatePeopleCardBody, UpdateSchedulingCardBody, UpdateDayInLifeCardBody,
} from '../types.js';

/**
 * Onboarding — session-based "bites"/"cards" review flow. Prime extracts
 * candidate facts (bites) and builds five summary cards (about, people,
 * scheduling, rules, dayInLife) from the user's inbox/calendar; the caller
 * approves/edits/rejects each one, then finalizes to apply preferences and
 * save memories. Every mutation returns the full updated session.
 */
export class OnboardingResource {
  constructor(private http: HttpClient) {}

  async run(): Promise<RunOnboardingResult> {
    return this.http.post<RunOnboardingResult>('/onboarding/run', {});
  }

  async listSessions(): Promise<OnboardingSessionSummary[]> {
    const r = await this.http.get<any>('/onboarding/sessions');
    return r.sessions ?? [];
  }

  /** Resume-banner data — most-recent in-progress session (or most-recent overall). Null if never run. */
  async getCurrentOrLatest(): Promise<OnboardingCurrentOrLatestSession | null> {
    const r = await this.http.get<any>('/onboarding/sessions/current-or-latest');
    return r?.session ?? null;
  }

  async getSession(sessionId: string): Promise<OnboardingSession> {
    const r = await this.http.get<any>(`/onboarding/sessions/${sessionId}`);
    return r.session;
  }

  async updateFinding(sessionId: string, findingId: string, body: UpdateOnboardingFindingBody): Promise<OnboardingSession> {
    const r = await this.http.patch<any>(`/onboarding/sessions/${sessionId}/findings/${findingId}`, body);
    return r.session;
  }

  async updateWeekLabels(sessionId: string, body: UpdateOnboardingWeekLabelsBody): Promise<OnboardingSession> {
    const r = await this.http.put<any>(`/onboarding/sessions/${sessionId}/week-labels`, body);
    return r.session;
  }

  /** Applies preferences and saves memories by default — pass explicit flags to narrow that. */
  async finalize(sessionId: string, body: FinalizeOnboardingBody = { applyPreferences: true, saveMemories: true }): Promise<FinalizeOnboardingResult> {
    return this.http.post<FinalizeOnboardingResult>(`/onboarding/sessions/${sessionId}/finalize`, body);
  }

  /** Poll while status is 'running' — stops once 'complete' or 'error'. */
  async getFinalizeStatus(sessionId: string): Promise<OnboardingFinalizeStatusResponse> {
    return this.http.get<OnboardingFinalizeStatusResponse>(`/onboarding/sessions/${sessionId}/finalize-status`);
  }

  /** Lightweight flag-only write — call once the tutorial is dismissed. Does not run finalize. */
  async markOnboarded(): Promise<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>('/onboarding/mark-onboarded', undefined);
  }

  async updateUpFrontAnswers(sessionId: string, body: OnboardingUpFrontAnswers): Promise<OnboardingSession> {
    const r = await this.http.patch<any>(`/onboarding/sessions/${sessionId}/up-front-answers`, body);
    return r.session;
  }

  /** ✓ approve / ✎ edit / ✗ reject a single extracted bite. */
  async updateBite(sessionId: string, biteId: string, body: UpdateOnboardingBiteBody): Promise<OnboardingSession> {
    const r = await this.http.patch<any>(`/onboarding/sessions/${sessionId}/bites/${biteId}`, body);
    return r.session;
  }

  /** "I'm good, let's keep going" — flags the session so remaining high-confidence bites silent-save at finalize. */
  async skipRestBites(sessionId: string): Promise<OnboardingSession> {
    const r = await this.http.post<any>(`/onboarding/sessions/${sessionId}/bites/skip-rest`, {});
    return r.session;
  }

  /** Supplied keys overwrite; missing keys preserve existing values. */
  async updateEarnedAnswers(sessionId: string, answers: Record<string, string>): Promise<OnboardingSession> {
    const r = await this.http.patch<any>(`/onboarding/sessions/${sessionId}/earned-answers`, answers);
    return r.session;
  }

  /** accept / edit-sentence / reject a proposed workflow. */
  async updateWorkflowProposal(sessionId: string, proposalId: string, body: UpdateOnboardingWorkflowProposalBody): Promise<OnboardingSession> {
    const r = await this.http.patch<any>(`/onboarding/sessions/${sessionId}/workflow-proposals/${proposalId}`, body);
    return r.session;
  }

  /** Mass-rejects pending proposals only — already-accepted/edited ones are untouched. */
  async skipAllWorkflowProposals(sessionId: string): Promise<OnboardingSession> {
    const r = await this.http.post<any>(`/onboarding/sessions/${sessionId}/workflow-proposals/skip-all`, {});
    return r.session;
  }

  /** Poll every ~5s while any job is queued/building; stop once allComplete. */
  async getWorkflowStatus(sessionId: string): Promise<OnboardingWorkflowStatusResponse> {
    return this.http.get<OnboardingWorkflowStatusResponse>(`/onboarding/sessions/${sessionId}/workflow-status`);
  }

  async updateAboutCard(sessionId: string, body: UpdateNarrativeCardBody): Promise<OnboardingSession> {
    const r = await this.http.patch<any>(`/onboarding/sessions/${sessionId}/cards/about`, body);
    return r.session;
  }

  async updatePeopleCard(sessionId: string, body: UpdatePeopleCardBody): Promise<OnboardingSession> {
    const r = await this.http.patch<any>(`/onboarding/sessions/${sessionId}/cards/people`, body);
    return r.session;
  }

  async updateSchedulingCard(sessionId: string, body: UpdateSchedulingCardBody): Promise<OnboardingSession> {
    const r = await this.http.patch<any>(`/onboarding/sessions/${sessionId}/cards/scheduling`, body);
    return r.session;
  }

  async updateRulesCard(sessionId: string, body: UpdateNarrativeCardBody): Promise<OnboardingSession> {
    const r = await this.http.patch<any>(`/onboarding/sessions/${sessionId}/cards/rules`, body);
    return r.session;
  }

  async updateDayInLifeCard(sessionId: string, body: UpdateDayInLifeCardBody): Promise<OnboardingSession> {
    const r = await this.http.patch<any>(`/onboarding/sessions/${sessionId}/cards/dayInLife`, body);
    return r.session;
  }
}
