/**
 * Types sourced from agnt-backend's own OpenAPI spec where possible — see
 * `components` below, generated into ./generated/api.d.ts by
 * `npm run sync:openapi` (scripts/sync-openapi-types.mjs at the repo root).
 * That file is gitignored and regenerated fresh before every build/test, so
 * these aliases stay in sync with the real API automatically rather than
 * drifting the way a hand-copied type would.
 *
 * Not everything used here is in the spec yet (activity feed shapes, list
 * envelopes, integrations/identifiers) — those stay hand-typed below, same
 * as agnt-portal's own lib/api/*.ts does for its "not in OpenAPI yet" types.
 */
import type { components } from './generated/api.js';

export type Task = components['schemas']['Task'];
export type TaskStatus = NonNullable<Task['status']>;
export type CreateTaskBody = components['schemas']['CreateTaskBody'];
export type UpdateTaskBody = components['schemas']['UpdateTaskBody'];

export type BookingLink = components['schemas']['BookingLink'];
export type CreateBookingLinkBody = components['schemas']['CreateBookingLinkBody'];
export type UpdateBookingLinkBody = components['schemas']['UpdateBookingLinkBody'];

export type Memory = components['schemas']['Memory'];
export type CreateMemoryBody = components['schemas']['CreateMemoryBody'];
export type UpdateMemoryBody = components['schemas']['UpdateMemoryBody'];

export type Calendar = components['schemas']['Calendar'];

// No CalendarEvent/CreateCalendarEventBody schemas in the OpenAPI spec yet —
// hand-typed, matching agnt-portal's own lib/api/calendars.ts exactly (not
// guessed independently).
export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  status?: string;
  organizer?: { name?: string; email?: string };
  attendees?: Array<{ name?: string; email?: string; status?: string }>;
  conferenceUrl?: string;
  htmlLink?: string;
  recurringEventId?: string;
  transparency?: string;
  visibility?: string;
  priority?: number;
  assistantReminder?: boolean;
  [key: string]: unknown;
}

export interface CreateCalendarEventBody {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  allDay?: boolean;
  attendees?: Array<{ email: string; name?: string }>;
}

export type UpdateCalendarEventBody = Partial<
  Pick<CalendarEvent, 'title' | 'description' | 'location' | 'start' | 'end' | 'allDay' | 'status' | 'priority' | 'assistantReminder'>
>;

export type Assistant = components['schemas']['Assistant'];
export type AssistantScope = Assistant['scope'];
export type CreateAssistantBody = components['schemas']['CreateAssistantBody'];
export type UpdateAssistantBody = components['schemas']['UpdateAssistantBody'];

export interface GenerateAssistantResult {
  name: string;
  emails: string[];
}

export type InboxItem = components['schemas']['InboxItem'];

export type DriveFile = components['schemas']['DriveFile'];

export interface ListDriveFilesParams {
  status?: string;
  search?: string;
  folder?: string;
  kind?: string;
  eventId?: string;
  noteType?: string;
  tags?: string | string[];
  page?: number;
  perPage?: number;
}

export interface DriveFilesPage {
  driveFiles: DriveFile[];
  total: number;
  page: number;
  perPage: number;
}

export type SkillInstall = components['schemas']['SkillInstall'];

// Team/TeamMember are empty stub schemas ({}) in the OpenAPI spec today —
// hand-typed instead of aliasing to components['schemas']['Team'], which
// would type as an empty object with no usable fields.
export interface Team {
  id: string;
  name: string;
  account: string;
  organization?: string | null;
  status?: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface TeamMember {
  id: string;
  team: string;
  user: string;
  role: 'owner' | 'admin' | 'member' | string;
  status?: string;
  [key: string]: unknown;
}

export interface TeamsPage {
  teams: Team[];
  total: number;
  page: number;
  perPage: number;
}

export interface TeamMembersPage {
  members: TeamMember[];
  total: number;
  page: number;
  perPage: number;
}

// Organization is also an empty stub schema ({}) in the OpenAPI spec — hand-typed.
export interface Organization {
  id: string;
  name: string;
  account: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface OrganizationsPage {
  organizations: Organization[];
  total: number;
  page: number;
  perPage: number;
}

// No "Skill" schema in the OpenAPI spec yet (only SkillInstall) — hand-typed.
export interface Skill {
  id: string;
  name: string;
  title?: string;
  kind: 'http' | 'mcp' | 'system' | string;
  status?: string;
  [key: string]: unknown;
}

export interface ListSkillsParams {
  kind?: string;
  source?: string;
  scope?: 'account' | 'tenant-policy' | 'user' | 'team' | 'org';
  q?: string;
  page?: number;
  limit?: number;
}

// Not in the OpenAPI spec — hand-typed, matching agnt-portal's lib/api/killSwitch.ts exactly.
export type KillSwitchState = 'active' | 'paused' | 'frozen';
export type KillSwitchAction = 'freeze' | 'release';

export interface KillSwitchSnapshot {
  state: KillSwitchState;
  engagedAt: string | null;
  engagedBy: { actor: string | null; source: 'user' | 'staff' | 'auto' | null } | null;
  autoTrigger: { kind: string | null; count: number | null; windowMs: number | null } | null;
  reason: string | null;
}

export type TrashKind = 'skills' | 'assistants' | 'inbox';

// Not in the OpenAPI spec — hand-typed, matching agnt-portal's lib/api/trash.ts exactly.
export interface TrashItem {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  icon?: string;
  email?: string;
  avatar?: string;
  itemType?: string;
  task?: string | null;
  title?: string | null;
  preview?: string | null;
  assistantName?: string | null;
  deletedAt: string;
  retentionUntil: string;
}

export interface TrashListResponse {
  count: number;
  retentionDays: number;
  items: TrashItem[];
}

export interface RestoreResponse {
  ok: boolean;
  id: string;
  restoredAt: string;
  cascadeHint?: string | null;
}

export type User = components['schemas']['User'];
export type UpdateMeBody = components['schemas']['UpdateMeBody'];
export type CreateUserBody = components['schemas']['CreateUserBody'];
export type UpdateUserBody = components['schemas']['UpdateUserBody'];

export interface UsersPage {
  users: User[];
  total: number;
  page: number;
  perPage: number;
}

export type Contact = components['schemas']['Contact'];
export type CreateContactBody = components['schemas']['CreateContactBody'];
export type UpdateContactBody = components['schemas']['UpdateContactBody'];

export interface ListContactsParams {
  status?: string;
  sourceType?: string | string[];
  tags?: string | string[];
  search?: string;
  scope?: 'user' | 'team';
  userId?: string;
  page?: number;
  perPage?: number;
}

export interface ContactsPage {
  contacts: Contact[];
  total: number;
  page: number;
  perPage: number;
}

// Not in the OpenAPI spec yet — hand-typed, same as agnt-portal's own lib/api/contacts.ts.
export interface ContactActivity {
  contact: string;
  events: Array<{ type: string; createdAt: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface BulkTagResult {
  updated: number;
  [key: string]: unknown;
}

export type Company = components['schemas']['Company'];
export type CreateCompanyBody = components['schemas']['CreateCompanyBody'];
export type UpdateCompanyBody = components['schemas']['UpdateCompanyBody'];

export interface ListCompaniesParams {
  domain?: string;
  tags?: string | string[];
  search?: string;
  page?: number;
  perPage?: number;
}

export interface CompaniesPage {
  companies: Company[];
  total: number;
  page: number;
  perPage: number;
}

export interface FindOrCreateCompanyBody {
  name?: string;
  domain?: string;
  slug?: string;
  aliases?: string[];
}

// company.serialize() plus created/alreadyExists — POST /companies/find-or-create only.
export type FindOrCreateCompanyResult = Company & { created: boolean; alreadyExists: boolean };

export type PropertyDefinition = components['schemas']['PropertyDefinition'];
export type UpsertPropertyDefinitionBody = components['schemas']['UpsertPropertyDefinitionBody'];
export type PropertyDefinitionEntityType = 'contact' | 'company';

export type InboxThread = components['schemas']['InboxThread'];
export type InboxEmail = components['schemas']['InboxEmail'];
export type InboxEmailAttachment = components['schemas']['InboxEmailAttachment'];

export interface ListInboxThreadsParams {
  assistantId?: string;
  status?: string;
  q?: string;
  platform?: string;
  page?: number;
  perPage?: number;
}

export interface InboxThreadsPage {
  threads: InboxThread[];
  total: number;
  page: number;
  perPage: number;
}

export interface UpdateInboxThreadResult {
  ok: boolean;
  id: string;
  status: string;
}

// Not in the OpenAPI spec (portal-internal feature) — hand-typed, matches
// portalRevisionsController.mjs's #serializeRevision() output exactly.
export type RevisionAuthorKind = 'user' | 'agent' | 'system' | 'migration';

export interface RevisionAuthor {
  kind: RevisionAuthorKind;
  userId?: string;
  agent?: {
    assistantId?: string;
    taskId?: string;
    runId?: string;
    skillSlug?: string;
  };
  reason?: string;
}

export type RevisionedModel = 'Memory' | 'Contact' | 'Company' | 'Preference' | 'User' | 'Task';
export type RevisionedKind = 'memories' | 'contacts' | 'companies' | 'preferences' | 'tasks' | 'profile';

export interface RevisionItem {
  id: string;
  createdAt: string;
  model: RevisionedModel;
  parentId: string;
  fieldsChanged: string[];
  previousState: Record<string, unknown>;
  author: RevisionAuthor;
  expiresAt: string | null;
}

export interface RevisionsResponse {
  model: string;
  parentId: string;
  count: number;
  revisions: RevisionItem[];
}

export interface UserRevisionsResponse {
  count: number;
  revisions: RevisionItem[];
}

export interface RestoreRevisionResult {
  ok: boolean;
  model: string;
  parentId: string;
  restoredFrom: string;
  fieldsRestored: string[];
}

export type Preference = components['schemas']['Preference'];
export type SchedulingPreferences = components['schemas']['SchedulingPreferences'];
export type RemindersPreferences = components['schemas']['RemindersPreferences'];
export type FollowupsPreferences = components['schemas']['FollowupsPreferences'];
export type SupervisionPreferences = components['schemas']['SupervisionPreferences'];
export type SupervisionMatrix = components['schemas']['SupervisionMatrix'];
export type RecipientException = components['schemas']['RecipientException'];
export type UpdateSupervisionMatrixBody = components['schemas']['UpdateSupervisionMatrixBody'];
export type CreateRecipientExceptionBody = components['schemas']['CreateRecipientExceptionBody'];
export type SetSkillPreferencesBody = components['schemas']['SetSkillPreferencesBody'];

export interface SkillPreferences<T = unknown> {
  skill: string;
  preferences: T;
}

export interface SupervisionMatrixSnapshot {
  matrix: SupervisionMatrix | null;
  matrixUpdatedAt: string | null;
  parentLockedCells: string[];
  orgLockedCells: string[];
  teamLockedCells: string[];
  lockedValues: Record<string, unknown>;
}

// Not in the OpenAPI spec yet — hand-typed from preferencesController.mjs's
// buildNotificationPreferencesResponse()/#serializePreferredProviders().
export interface NotificationPreferences {
  [key: string]: unknown;
}

export interface PreferredProviders {
  [key: string]: unknown;
}

// Not in the OpenAPI spec yet — hand-typed, same as agnt-portal's own lib/api/calendarBlocks.ts.
export interface CalendarBlock {
  id: string;
  title?: string | null;
  note?: string | null;
  startsAt: string;
  endsAt: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface CreateCalendarBlockBody {
  title?: string;
  note?: string;
  startsAt: string;
  endsAt: string;
}

export type UpdateCalendarBlockBody = Partial<CreateCalendarBlockBody>;

// Not in the OpenAPI spec yet — hand-typed, same as agnt-portal's own lib/api/roster.ts.
export type RosterAssistant = Assistant & { isPrimary: boolean };

export interface Roster {
  assistants: RosterAssistant[];
  primaryAssistantId: string | null;
}

// Not in the OpenAPI spec yet — hand-typed, same as agnt-portal's own lib/api/contexts.ts.
export interface Context {
  id: string;
  kind: 'structured';
  resourceType: string;
  tags: string[];
  content: string | null;
  data: Record<string, unknown> | null;
  resource: Record<string, unknown> | null;
  scope: string;
  team: string | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContextBody {
  resourceType: string;
  data: Record<string, unknown>;
  tags?: string[];
  content?: string;
  scope?: 'user' | 'team';
  team?: string;
}

export interface UpdateContextBody {
  data?: Record<string, unknown>;
  tags?: string[];
  content?: string;
}

export interface ListContextsParams {
  resourceType?: string;
  tags?: string;
  status?: string;
  page?: number;
  perPage?: number;
}

export interface ContextsPage {
  contexts: Context[];
  total: number;
  page: number;
  perPage: number;
}

// Not in the OpenAPI spec yet (see CART-APPROVAL-UI.md) — hand-typed, same as
// agnt-portal's own lib/types/carts.ts.
export type CartStatus =
  | 'open' | 'pending_approval' | 'time_boxed' | 'approved' | 'executing' | 'executed' | 'cancelled' | 'rejected';

export type CartApprovalMode = 'auto' | 'time-boxed' | 'manual';
export type DispatchPlatform = 'email' | 'sms' | 'whatsapp' | 'imessage' | 'slack' | 'teams' | 'chat' | null;
export type KnownDispatchType = 'send_message' | 'create_calendar_event' | 'update_calendar_event' | 'delete_calendar_event';
export type DispatchType = KnownDispatchType | string;
export type UndoStatus = 'available' | 'undone' | 'expired' | 'not_applicable';

export interface DispatchSnapshotInfo {
  reversible: boolean;
  undoStatus: UndoStatus;
  undoExpiresAt: string | null;
  previousState?: unknown;
  resultRef?: unknown;
  executionDelayUntil?: string | null;
}

export interface CartDispatch {
  index: number;
  type: DispatchType;
  platform: DispatchPlatform;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  description: string;
  resolvedApprovalMode?: 'auto' | 'time-boxed' | 'manual' | null;
  payload?: Record<string, unknown>;
  files?: Array<{ filename?: string; mimeType?: string; s3Key?: string; size?: number }>;
  primeNote?: string;
  snapshot?: DispatchSnapshotInfo;
}

export interface PrimeRequestedTightening {
  mode: 'time-boxed' | 'manual';
  reason: string;
}

export interface PendingCart {
  id: string;
  taskId: string;
  taskTitle: string;
  assistantName?: string;
  assistantAvatar?: string;
  status: CartStatus;
  resolvedApprovalMode: CartApprovalMode;
  timeBoxedExpiresAt: string | null;
  timeBoxedExpiry: 'execute' | 'cancel';
  dispatches: CartDispatch[];
  primeRequestedTightening?: PrimeRequestedTightening | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApproveCartResponse {
  ok: boolean;
  cartId: string;
  status: CartStatus;
  executionError?: string;
}

export interface CancelCartResponse {
  ok: boolean;
  cartId: string;
  status: CartStatus;
}

export interface UndoDispatchResponse {
  ok: boolean;
  undone: boolean;
  type: 'cancelled_during_delay' | 'reversed';
  dispatchType?: string;
  previousState?: unknown;
  note?: string;
}

export interface DispatchPatch {
  subject?: string;
  body?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  payload?: Record<string, unknown>;
}

export interface DispatchSnapshotSummary {
  dispatchIndex: number;
  dispatchType: string;
  resourceType: 'email' | 'calendar' | 'messaging' | 'files' | 'contacts' | string;
  reversible: boolean;
  undoStatus: 'available' | 'undone' | 'expired' | 'not_applicable' | 'failed';
  undoExpiresAt: string | null;
  undoneAt: string | null;
  undoAvailable: boolean;
  providerContext: null | { provider?: string; externalId?: string; meetingId?: string };
  undoResult: unknown | null;
}

export interface SnapshotsResponse {
  cartId: string;
  count: number;
  snapshots: DispatchSnapshotSummary[];
}

export interface CartUndoAllResult {
  ok: boolean;
  cartId: string;
  undone: number;
  skipped: number;
  expired: number;
  failed: number;
  details: Array<{
    dispatchIndex: number;
    type: string;
    undone: boolean;
    reason?: string;
    error?: string;
    result?: unknown;
  }>;
}

// Not in the OpenAPI spec yet — hand-typed, same as agnt-portal's own lib/types/index.ts.
export interface SlotResponse {
  slotId: string;
  availability: 'yes' | 'no' | 'maybe';
  note: string | null;
  updatedAt: string;
}

export interface CandidateSlot {
  id: string;
  start: string;
  end: string;
  position: number;
  source: 'manual' | 'ai_seeded';
}

export interface SchedulingTableParticipant {
  id: string;
  name: string;
  email: string;
  userId: string | null;
  role: 'host' | 'participant';
  required: boolean;
  shareToken?: string;
  responses: SlotResponse[];
  respondedAt: string | null;
}

export interface SchedulingTable {
  id: string;
  account: string;
  createdBy: string;
  title: string;
  slug?: string | null;
  description: string | null;
  duration: number | null;
  status: 'active' | 'closed';
  accessMode: 'invite_only' | 'anyone_with_link';
  participantPrivacy: 'visible' | 'anonymous';
  timezone: string | null;
  shareToken: string;
  slots: CandidateSlot[];
  participants: SchedulingTableParticipant[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateSchedulingTableBody {
  title: string;
  description?: string;
  duration?: number;
  accessMode?: 'invite_only' | 'anyone_with_link';
  participantPrivacy?: 'visible' | 'anonymous';
  slots?: { start: string; end: string; source?: 'manual' | 'ai_seeded' }[];
  participants?: { name: string; email: string; required?: boolean; role?: 'host' | 'participant' }[];
}

export interface UpdateSchedulingTableBody {
  title?: string;
  description?: string;
  status?: 'active' | 'closed';
  accessMode?: 'invite_only' | 'anyone_with_link';
  participantPrivacy?: 'visible' | 'anonymous';
  duration?: number;
}

export interface AddSlotsBody {
  slots: { start: string; end: string; source?: 'manual' | 'ai_seeded' }[];
}

export interface AddParticipantsBody {
  participants: { name: string; email: string; required?: boolean; role?: 'host' | 'participant' }[];
}

export interface UpdateParticipantBody {
  required?: boolean;
  role?: string;
}

export interface SubmitResponsesBody {
  responses: { slotId: string; availability: 'yes' | 'no' | 'maybe'; note?: string }[];
}

// Not in the OpenAPI spec yet — hand-typed. Simplified relative to
// agnt-portal's own lib/types/scheduling.ts (292 lines, built for a rich
// grid-visualization UI): the deeply-nested per-cell grid/strategy-move
// shapes are loosely typed here since a CLI consumer cares about the
// top-level scheduling state, not pixel-level UI annotations.
export interface SchedulingParticipant {
  recipientTaskId: string;
  email: string | null;
  taskStatus: string;
  status: 'pending' | 'submitted' | 'available' | 'no_slots' | 'degraded' | 'failed';
  submittedAt: string | null;
  isOrganizer?: boolean;
  tier?: 'organizer' | 'internal' | 'external';
  isMe?: boolean;
  [key: string]: unknown;
}

export interface SchedulingStrategy {
  id: string;
  friction: 'none' | 'low' | 'medium' | 'high';
  type: 'clean_overlap' | 'single_yield' | 'multi_yield';
  slot: { startsAt: string; endsAt: string; duration?: number };
  summary: string;
  [key: string]: unknown;
}

export interface SchedulingSnapshot {
  parentTaskId: string;
  meetingId: string | null;
  meetingWindow: { startsAt: string; endsAt: string } | null;
  viewerIsOrganizer: boolean;
  totalRecipients: number;
  submittedCount: number;
  pendingCount: number;
  failedCount: number;
  participants: SchedulingParticipant[];
  lastScramblerOutput: Record<string, unknown> | null;
  gridSlots?: Array<Record<string, unknown>> | null;
  gridStatus?: 'collecting' | 'booked' | 'cancelled' | 'no-match' | null;
  bookedSlot?: { startsAt: string; endsAt: string } | null;
}

export interface SchedulingPreview {
  meetingId: string;
  ranAt: string;
  hasCleanOverlap: boolean;
  noMatch: boolean;
  strategies: SchedulingStrategy[];
  participantCount: number;
  slotsCompared: number;
  permutationsTested: number;
  includedParticipants: string[];
  missingParticipants: string[];
  excludedParticipants: string[];
  partial: boolean;
}

// Not in the OpenAPI spec yet — hand-typed, same as agnt-portal's own lib/api/handoff.ts.
export interface WorkspaceHandoff {
  id: string;
  account: string;
  userId: string;
  taskId?: string | null;
  actionType: 'login' | 'payment' | 'form_fill' | 'mfa' | 'other';
  prompt?: string | null;
  targetUrl?: string | null;
  screenshotUrl?: string | null;
  status: 'pending' | 'starting' | 'ready' | 'active' | 'completed' | 'deferred' | 'declined' | 'closed' | 'expired' | 'failed';
  deferredUntil?: string | null;
  closeReason?: 'completed' | 'declined' | 'deferred' | 'expired' | 'task_closed' | null;
  closedAt?: string | null;
  expiresAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type HandoffOutcome = 'completed' | 'declined' | 'pending';

export interface HandoffResolution {
  handoffId: string;
  outcome: HandoffOutcome;
  note?: string;
}

// Onboarding — session-based "bites"/"cards" review flow (Prime extracts
// facts from the user's inbox/calendar, the user confirms/edits/rejects
// each one). v2/v4 shapes aren't in the OpenAPI spec yet (backend hasn't
// regenerated against them) — hand-typed here, same as agnt-portal's own
// lib/api/onboarding.ts, which carries the same TODO.
export type OnboardingFinding = components['schemas']['OnboardingFinding'];
export type UpdateOnboardingFindingBody = components['schemas']['UpdateOnboardingFindingBody'];
export type UpdateOnboardingWeekLabelsBody = components['schemas']['UpdateOnboardingWeekLabelsBody'];
export type OnboardingWeekLabel = components['schemas']['OnboardingWeekLabel'];
export type FinalizeOnboardingBody = components['schemas']['FinalizeOnboardingBody'];

export type BiteCategory = 'PROFILE' | 'CONTACT' | 'COMPANY' | 'EVENT' | 'SCHEDULING' | 'FAMILY' | 'VOICE' | 'RULE';
export type BiteReviewState = 'pending' | 'approved' | 'edited' | 'rejected' | 'silent_saved';
export type BiteSuggestedAction = 'save_memory' | 'apply_pref' | 'upsert_contact' | 'upsert_company' | 'opaque_constraint';
export type BiteScope =
  | { kind: 'global' }
  | { kind: 'contact'; contactKey: string }
  | { kind: 'event'; seriesKey: string }
  | { kind: 'company'; companyKey: string };

export interface OnboardingBite {
  biteId: string;
  text: string;
  category: BiteCategory;
  scope: BiteScope;
  confidence: number;
  evidence?: { findingIds: string[]; excerpt?: string };
  suggestedAction: BiteSuggestedAction;
  prefMapping?: { path: string; value: unknown };
  presentation?: { photoUrl?: string; linkedinUrl?: string; title?: string; companyName?: string; oneLiner?: string; contactPriority?: 1 | 2 | 3 };
  proposedTags: string[];
  reviewState: BiteReviewState;
  userEditedText?: string;
  userAnswer?: string;
  queue: 'primary' | 'overflow';
  order: number;
  createdAt: string;
}

export type WorkflowCategory = 'email' | 'calendar' | 'post-meeting' | 'follow-ups' | 'briefings' | 'contacts' | 'other';
export type WorkflowReviewState = 'pending' | 'accepted' | 'edited' | 'rejected';

export interface OnboardingWorkflowProposal {
  proposalId: string;
  sentence: string;
  category: WorkflowCategory;
  evidence?: { biteIds: string[]; findingIds: string[] };
  confidence: number;
  reviewState: WorkflowReviewState;
  userEditedSentence?: string;
  createdAt: string;
}

export interface OnboardingUpFrontAnswers {
  roleOneLiner?: string;
  schedulingAnnoyance?: string;
}

export interface OnboardingFinalizeSummary {
  appliedPreferences: boolean;
  savedMemoryCount: number;
  memoryBreakdown: Array<{ category: BiteCategory; count: number }>;
  contactsCreated: number;
  contactsUpdated: number;
  companiesUpsertedCount: number;
  ownCompanyId?: string;
  weekLabelsApplied: number;
  skillsInstalled: string[];
  notes: string[];
}

export type AsyncWorkflowJobStatus = 'queued' | 'building' | 'ready' | 'failed';

export interface OnboardingAsyncWorkflowJob {
  proposalId: string;
  status: AsyncWorkflowJobStatus;
  skillId?: string;
  error?: string;
  updatedAt: string;
}

export type OnboardingNextStep = 'pipeline' | 'bites' | 'week_labels' | 'workflows' | 'finalized' | 'unknown';

export type CardReviewState = 'pending' | 'approved' | 'skipped';
export type PeoplePriority = 1 | 2 | 3;
export type PeopleRelationship = 'coworker' | 'direct_report' | 'manager' | 'client' | 'friend' | 'family' | 'investor' | 'vendor' | 'other';

export interface NarrativeCard {
  llmFraming: string;
  bullets: string[];
  userAnswer: string;
  reviewState: CardReviewState;
}

export interface PeopleCardEntry {
  email: string;
  name?: string;
  photoUrl?: string;
  priority: PeoplePriority;
  relationship: PeopleRelationship;
  relationshipOther?: string;
  note: string;
  title?: string;
  companyName?: string;
}

export interface PeopleCard {
  llmFraming: string;
  people: PeopleCardEntry[];
  userAnswer: string;
  reviewState: CardReviewState;
}

export interface WorkingHoursDay {
  start: string;
  end: string;
}

export interface SchedulingCard {
  llmFraming: string;
  workingHours: Partial<Record<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday', WorkingHoursDay | null>>;
  buffersEnabled: boolean;
  bufferMinutes: number;
  defaultMeetingDuration?: number;
  defaultDurationVirtual?: number;
  defaultDurationInPerson?: number;
  observedEventTitles?: string[];
  userAnswer: string;
  reviewState: CardReviewState;
}

export interface DayInLifeEvent {
  eventId: string;
  title?: string;
  startsAt?: string;
  endsAt?: string;
  priority: PeoplePriority;
  note: string;
}

export interface DayInLifeCard {
  selectedDate: string;
  events: DayInLifeEvent[];
  userAnswer: string;
  reviewState: CardReviewState;
}

export interface OnboardingCards {
  about: NarrativeCard;
  people: PeopleCard;
  scheduling: SchedulingCard;
  rules: NarrativeCard;
  dayInLife: DayInLifeCard;
}

export type OnboardingCardType = keyof OnboardingCards;

export interface UpdateOnboardingBiteBody {
  reviewState: BiteReviewState;
  userEditedText?: string;
  userAnswer?: string;
  contactPriority?: 1 | 2 | 3;
}

export interface UpdateOnboardingWorkflowProposalBody {
  reviewState: WorkflowReviewState;
  userEditedSentence?: string;
}

export interface UpdateNarrativeCardBody {
  llmFraming?: string;
  bullets?: string[];
  userAnswer?: string;
  reviewState?: CardReviewState;
}

export interface UpdatePeopleCardBody {
  llmFraming?: string;
  people?: Array<Partial<PeopleCardEntry> & { email: string }>;
  userAnswer?: string;
  reviewState?: CardReviewState;
}

export interface UpdateSchedulingCardBody {
  llmFraming?: string;
  workingHours?: SchedulingCard['workingHours'];
  buffersEnabled?: boolean;
  bufferMinutes?: number;
  defaultMeetingDuration?: number;
  defaultDurationVirtual?: number;
  defaultDurationInPerson?: number;
  observedEventTitles?: string[];
  userAnswer?: string;
  reviewState?: CardReviewState;
}

export interface UpdateDayInLifeCardBody {
  selectedDate?: string;
  events?: Array<{ eventId: string; priority?: PeoplePriority; note?: string }>;
  userAnswer?: string;
  reviewState?: CardReviewState;
}

export type OnboardingSession = components['schemas']['OnboardingSession'] & {
  bites?: OnboardingBite[];
  cards?: OnboardingCards;
  workflowProposals?: OnboardingWorkflowProposal[];
  upFrontAnswers?: OnboardingUpFrontAnswers;
  earnedAnswers?: Record<string, string>;
  finalize?: { summary: OnboardingFinalizeSummary; asyncWorkflowJobs: OnboardingAsyncWorkflowJob[] };
  skipRestFlagged?: boolean;
  excludedCalendars?: Array<{ calendarId: string; reason?: string }>;
};

export type OnboardingSessionSummary = components['schemas']['OnboardingSessionSummary'] & {
  bitesCount?: number;
  pendingBitesCount?: number;
  pendingWorkflowProposalsCount?: number;
};

export interface OnboardingCurrentOrLatestSession extends OnboardingSessionSummary {
  nextStep: OnboardingNextStep;
}

export interface OnboardingWorkflowStatusResponse {
  ok: boolean;
  jobs: OnboardingAsyncWorkflowJob[];
  allComplete: boolean;
}

export interface OnboardingFinalizeStatusResponse {
  ok: boolean;
  status: 'idle' | 'running' | 'complete' | 'error';
  currentTask?: string;
  messages: Array<{ role: string; content: string; at?: string }>;
  pendingQuestions: Array<{ questionId: string; text: string }>;
  summary?: OnboardingFinalizeSummary;
  error?: string;
}

export interface RunOnboardingResult {
  ok: boolean;
  sessionId: string;
  status: string;
}

export interface FinalizeOnboardingResult {
  ok: boolean;
  sessionId: string;
  summary: OnboardingFinalizeSummary;
  asyncWorkflowJobs: OnboardingAsyncWorkflowJob[];
}

// Not in the OpenAPI spec yet — hand-typed, same as agnt-portal's own lib/api/skillStore.ts.
export interface StoreItem {
  type: 'skill';
  id: string;
  accountSlug: string;
  slug: string;
  displayName: string;
  description?: string;
  kind: string;
  dispatchable: boolean;
  visibility: string;
  approvalMode: 'auto' | 'manual';
  pricing: { perExecution: number; currency: string };
  accessStatus: 'none' | 'pending' | 'using' | 'granted';
  tier: 'agnt' | 'official' | 'community';
  author?: string | null;
  sourceUrl?: string | null;
  stars?: number | null;
  iconUrl?: string | null;
  iconLib?: string | null;
  iconBgColor?: string | null;
  smitheryQualifiedName?: string | null;
}

export interface StoreFilters {
  tier?: 'agnt' | 'official' | 'community';
  kind?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface BrowseStoreResult {
  skills: StoreItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface StorePermissions {
  canBrowseStore: boolean;
  canInstallFromStore: boolean;
  canAddSkillsFreestyle: boolean;
  requireApproval: boolean;
}

// GET /skills/store/my-access — non-own installs (grant = admin-pushed, import = self-installed).
export interface StoreAccessItem {
  installId: string;
  skill: StoreItem;
  source: 'grant' | 'import';
  status: string;
  [key: string]: unknown;
}

// GET /skills/store/requests/incoming — pending access requests for skills you own, awaiting your approval.
export interface StoreAccessRequest {
  installId: string;
  requestedBy: string;
  skillSlug: string;
  status: string;
  message?: string | null;
  createdAt: string;
  [key: string]: unknown;
}

export type Chat = components['schemas']['Chat'];
export type ChatMessage = components['schemas']['ChatMessage'];
export type CreateChatBody = components['schemas']['CreateChatBody'];
export type AddMessageBody = components['schemas']['AddMessageBody'];

export interface ListChatsParams {
  status?: 'active' | 'archived';
  assistantId?: string;
  platform?: string | string[];
  contextId?: string;
  userEmail?: string;
  page?: number;
  perPage?: number;
}

export interface ChatsPage {
  chats: Chat[];
  total: number;
  page: number;
  perPage: number;
}

export interface MessagesPage {
  messages: ChatMessage[];
  total: number;
  page: number;
  perPage: number;
}

// processChat is Server-Sent Events, not a plain JSON response — these are
// the event vocabulary chatsController.mjs's processChat() actually emits.
export type ProcessChatEvent =
  | { event: 'status_update'; data: { message: string; activityId?: string } }
  | { event: 'interim_message'; data: { message: unknown; activityId?: string } }
  | { event: 'message'; data: ChatMessage | Record<string, unknown> }
  | { event: 'error'; data: { error: string; code?: string; status?: number } };

export interface PagedResponse<T> {
  ok: boolean;
  page?: number;
  perPage?: number;
  total?: number;
  items: T[];
}

export interface ListTasksParams {
  search?: string;
  status?: TaskStatus | TaskStatus[];
  visibility?: 'normal' | 'all' | 'internal';
  approvalGate?: 'pending_user_approval' | 'approved' | 'declined';
  mine?: true;
  ownerEmail?: string;
  page?: number;
  perPage?: number;
}

export interface TaskActivity {
  id: string;
  task?: string;
  type: string;
  actor?: string;
  visibility?: string;
  createdAt: string;
  updatedAt?: string;
  message?: { role?: 'user' | 'assistant'; content?: string; [key: string]: unknown };
  [key: string]: unknown;
}

export interface TasksPage {
  tasks: Task[];
  total: number;
  page: number;
  perPage: number;
}

export interface ApproveBatchResult {
  approved: string[];
  failed: Array<{ taskId: string; error: string }>;
}

export type ResourceAccessMode = 'off' | 'read' | 'read_write';
export type ResourceAccessKind = 'calendar' | 'contacts' | 'email' | 'drive' | 'messaging' | 'video' | 'teams' | 'projects' | 'crm';

// Mirrors UserIntegration.serialize() (agnt-backend/layers/agnt-shared/models/schema/userIntegration.mjs) —
// this is what agnt-portal itself calls a "connection" in its UI, even
// though the portal's own /api/connections endpoint is a different, older
// concept (email/phone identifiers — see Identifier below). Not in the
// OpenAPI spec today, so hand-typed like agnt-portal's own supplementary types.
export interface Integration {
  id: string;
  account: string;
  user: string | null;
  type: string; // e.g. 'google' | 'azure' | 'slack' | 'mcp:notion' | ...
  oauthId: string | null;
  hasApiKey: boolean;
  value: string | null; // e.g. the connected email
  accessGranted: string[];
  authError: boolean;
  authErrorAt: string | null;
  accessRevoked: boolean;
  resourceAccess: Partial<Record<ResourceAccessKind, ResourceAccessMode>> | null;
  enabled: boolean;
  expiresAt: string | null;
  usedBySkills?: Array<{ id: string; name: string; title: string }>;
  [key: string]: unknown;
}

// Mirrors UserIdentifier — a verified email/phone the account can be reached
// at, distinct from an Integration above (which is a third-party OAuth
// connection). What agnt-portal's own /api/connections + /api/identifiers
// endpoints operate on.
export interface Identifier {
  id: string;
  type: 'email' | 'phone';
  value: string;
  verified: boolean;
  primary?: boolean;
  label?: string;
  userId?: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface CreateIdentifierBody {
  type: 'email' | 'phone';
  value: string;
  userId?: string;
  verified?: boolean;
  label?: string;
}

export interface UpdateIdentifierBody {
  label?: string;
  verified?: boolean;
  [key: string]: unknown;
}

export interface AgentAuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
}

export interface AgentAuthVerifyResult {
  ok: boolean;
  user: AgentAuthUser;
  apiKey: string;
  apiKeyId: string;
}
