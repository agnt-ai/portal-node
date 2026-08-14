import { clientFor } from '../utils/api.js';

function parseJsonBody(body: string, example: string): any {
  try {
    return JSON.parse(body);
  } catch {
    console.error(`Body must be valid JSON, e.g. '${example}'`);
    process.exit(1);
  }
}

export interface OnboardingOptions {
  profile?: string;
  json?: boolean;
}

export async function runOnboardingRun(opts: OnboardingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.onboarding.run();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Started onboarding session ${result.sessionId} (${result.status}).`);
}

export async function runOnboardingListSessions(opts: OnboardingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const sessions = await client.onboarding.listSessions();

  if (opts.json) {
    console.log(JSON.stringify(sessions, null, 2));
    return;
  }
  if (!sessions.length) {
    console.log('No onboarding sessions found.');
    return;
  }
  for (const s of sessions) {
    console.log(`${(s as any).id}  [${(s as any).status}]`);
  }
}

export async function runOnboardingCurrent(opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  const session = await client.onboarding.getCurrentOrLatest();
  console.log(JSON.stringify(session, null, 2));
}

export async function runOnboardingGet(sessionId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  const session = await client.onboarding.getSession(sessionId);
  console.log(JSON.stringify(session, null, 2));
}

export async function runOnboardingUpdateFinding(sessionId: string, findingId: string, body: string, opts: OnboardingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"status":"confirmed"}');
  const session = await client.onboarding.updateFinding(sessionId, findingId, parsed);
  console.log(opts.json ? JSON.stringify(session, null, 2) : `Updated finding ${findingId}.`);
}

export async function runOnboardingUpdateWeekLabels(sessionId: string, body: string, opts: OnboardingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"labels":[]}');
  const session = await client.onboarding.updateWeekLabels(sessionId, parsed);
  console.log(opts.json ? JSON.stringify(session, null, 2) : `Updated week labels for session ${sessionId}.`);
}

export async function runOnboardingFinalize(sessionId: string, body: string | undefined, opts: OnboardingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = body ? parseJsonBody(body, '{"applyPreferences":true,"saveMemories":true}') : undefined;
  const result = parsed ? await client.onboarding.finalize(sessionId, parsed) : await client.onboarding.finalize(sessionId);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Finalized session ${result.sessionId} — ${result.summary?.savedMemoryCount ?? 0} memories saved.`);
}

export async function runOnboardingFinalizeStatus(sessionId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  const status = await client.onboarding.getFinalizeStatus(sessionId);
  console.log(JSON.stringify(status, null, 2));
}

export async function runOnboardingMarkOnboarded(opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.onboarding.markOnboarded();
  console.log('Marked onboarded.');
}

export async function runOnboardingUpFrontAnswers(sessionId: string, body: string, opts: OnboardingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"roleOneLiner":"I run sales at Acme"}');
  const session = await client.onboarding.updateUpFrontAnswers(sessionId, parsed);
  console.log(opts.json ? JSON.stringify(session, null, 2) : `Updated up-front answers for session ${sessionId}.`);
}

export async function runOnboardingUpdateBite(sessionId: string, biteId: string, body: string, opts: OnboardingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"reviewState":"approved"}');
  const session = await client.onboarding.updateBite(sessionId, biteId, parsed);
  console.log(opts.json ? JSON.stringify(session, null, 2) : `Updated bite ${biteId}.`);
}

export async function runOnboardingSkipRestBites(sessionId: string, opts: OnboardingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const session = await client.onboarding.skipRestBites(sessionId);
  console.log(opts.json ? JSON.stringify(session, null, 2) : `Skipped remaining bites for session ${sessionId}.`);
}

export async function runOnboardingEarnedAnswers(sessionId: string, body: string, opts: OnboardingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"q1":"answer text"}');
  const session = await client.onboarding.updateEarnedAnswers(sessionId, parsed);
  console.log(opts.json ? JSON.stringify(session, null, 2) : `Updated earned answers for session ${sessionId}.`);
}

export async function runOnboardingUpdateWorkflowProposal(sessionId: string, proposalId: string, body: string, opts: OnboardingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"reviewState":"accepted"}');
  const session = await client.onboarding.updateWorkflowProposal(sessionId, proposalId, parsed);
  console.log(opts.json ? JSON.stringify(session, null, 2) : `Updated workflow proposal ${proposalId}.`);
}

export async function runOnboardingSkipAllWorkflowProposals(sessionId: string, opts: OnboardingOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const session = await client.onboarding.skipAllWorkflowProposals(sessionId);
  console.log(opts.json ? JSON.stringify(session, null, 2) : `Skipped all pending workflow proposals for session ${sessionId}.`);
}

export async function runOnboardingWorkflowStatus(sessionId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  const status = await client.onboarding.getWorkflowStatus(sessionId);
  console.log(JSON.stringify(status, null, 2));
}

const CARD_TYPES = ['about', 'people', 'scheduling', 'rules', 'dayInLife'] as const;
type CardType = (typeof CARD_TYPES)[number];

export async function runOnboardingUpdateCard(sessionId: string, cardType: string, body: string, opts: OnboardingOptions): Promise<void> {
  if (!CARD_TYPES.includes(cardType as CardType)) {
    console.error(`cardType must be one of: ${CARD_TYPES.join(', ')}`);
    process.exit(1);
  }
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"reviewState":"approved"}');
  let session;
  switch (cardType as CardType) {
    case 'about': session = await client.onboarding.updateAboutCard(sessionId, parsed); break;
    case 'people': session = await client.onboarding.updatePeopleCard(sessionId, parsed); break;
    case 'scheduling': session = await client.onboarding.updateSchedulingCard(sessionId, parsed); break;
    case 'rules': session = await client.onboarding.updateRulesCard(sessionId, parsed); break;
    case 'dayInLife': session = await client.onboarding.updateDayInLifeCard(sessionId, parsed); break;
  }
  console.log(opts.json ? JSON.stringify(session, null, 2) : `Updated ${cardType} card for session ${sessionId}.`);
}
