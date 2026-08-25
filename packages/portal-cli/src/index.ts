/**
 * @agnt-sdk/{{accountSlug}}
 *
 * Connect your own agent to your {{accountName}} (or any AGNT-hosted) account —
 * signup, tasks, and connections, without a browser.
 *
 * @example
 *   import { PortalClient } from '@agnt-sdk/{{accountSlug}}';
 *
 *   const client = new PortalClient({ apiUrl: 'https://api.agnt.ai', apiKey: 'ak_live_...' });
 *   await client.tasks.list();
 *   const { authUrl } = await client.connections.connectMcp({ mcpServerUrl: 'https://mcp.notion.com' });
 */

import { HttpClient } from './HttpClient.js';
import { TasksResource } from './resources/TasksResource.js';
import { ConnectionsResource } from './resources/ConnectionsResource.js';
import { MemoriesResource } from './resources/MemoriesResource.js';
import { ChatsResource } from './resources/ChatsResource.js';
import { ContactsResource } from './resources/ContactsResource.js';
import { CompaniesResource } from './resources/CompaniesResource.js';
import { PropertyDefinitionsResource } from './resources/PropertyDefinitionsResource.js';
import { InboxThreadsResource } from './resources/InboxThreadsResource.js';
import { RevisionsResource } from './resources/RevisionsResource.js';
import { PreferencesResource } from './resources/PreferencesResource.js';
import { CalendarBlocksResource } from './resources/CalendarBlocksResource.js';
import { RosterResource } from './resources/RosterResource.js';
import { ContextsResource } from './resources/ContextsResource.js';
import { CartsResource } from './resources/CartsResource.js';
import { SchedulingTablesResource } from './resources/SchedulingTablesResource.js';
import { SchedulingResource } from './resources/SchedulingResource.js';
import { HandoffResource } from './resources/HandoffResource.js';
import { OnboardingResource } from './resources/OnboardingResource.js';
import { SkillStoreResource } from './resources/SkillStoreResource.js';
import { CalendarsResource } from './resources/CalendarsResource.js';
import { IdentifiersResource } from './resources/IdentifiersResource.js';
import { AssistantsResource } from './resources/AssistantsResource.js';
import { NotificationsResource } from './resources/NotificationsResource.js';
import { DriveResource } from './resources/DriveResource.js';
import { BookingLinksResource } from './resources/BookingLinksResource.js';
import { TagsResource } from './resources/TagsResource.js';
import { MeResource } from './resources/MeResource.js';
import { SkillsResource } from './resources/SkillsResource.js';
import { TeamsResource } from './resources/TeamsResource.js';
import { OrganizationsResource } from './resources/OrganizationsResource.js';
import { UsersResource } from './resources/UsersResource.js';
import { TrashResource } from './resources/TrashResource.js';
import { DEFAULT_API_URL } from './defaults.js';

export interface PortalClientOptions {
  apiKey: string;
  apiUrl?: string;
}

export class PortalClient {
  readonly tasks: TasksResource;
  readonly connections: ConnectionsResource;
  readonly memories: MemoriesResource;
  readonly chats: ChatsResource;
  readonly contacts: ContactsResource;
  readonly companies: CompaniesResource;
  readonly propertyDefinitions: PropertyDefinitionsResource;
  readonly inboxThreads: InboxThreadsResource;
  readonly revisions: RevisionsResource;
  readonly preferences: PreferencesResource;
  readonly calendarBlocks: CalendarBlocksResource;
  readonly roster: RosterResource;
  readonly contexts: ContextsResource;
  readonly carts: CartsResource;
  readonly schedulingTables: SchedulingTablesResource;
  readonly scheduling: SchedulingResource;
  readonly handoff: HandoffResource;
  readonly onboarding: OnboardingResource;
  readonly skillStore: SkillStoreResource;
  readonly calendars: CalendarsResource;
  readonly identifiers: IdentifiersResource;
  readonly assistants: AssistantsResource;
  readonly notifications: NotificationsResource;
  readonly drive: DriveResource;
  readonly bookingLinks: BookingLinksResource;
  readonly tags: TagsResource;
  readonly me: MeResource;
  readonly skills: SkillsResource;
  readonly teams: TeamsResource;
  readonly organizations: OrganizationsResource;
  readonly users: UsersResource;
  readonly trash: TrashResource;

  constructor(options: PortalClientOptions) {
    if (!options.apiKey) throw new Error('[PortalClient] apiKey is required');
    const http = new HttpClient(options.apiUrl ?? DEFAULT_API_URL, options.apiKey);
    this.tasks = new TasksResource(http);
    this.connections = new ConnectionsResource(http);
    this.memories = new MemoriesResource(http);
    this.chats = new ChatsResource(http);
    this.contacts = new ContactsResource(http);
    this.companies = new CompaniesResource(http);
    this.propertyDefinitions = new PropertyDefinitionsResource(http);
    this.inboxThreads = new InboxThreadsResource(http);
    this.revisions = new RevisionsResource(http);
    this.preferences = new PreferencesResource(http);
    this.calendarBlocks = new CalendarBlocksResource(http);
    this.roster = new RosterResource(http);
    this.contexts = new ContextsResource(http);
    this.carts = new CartsResource(http);
    this.schedulingTables = new SchedulingTablesResource(http);
    this.scheduling = new SchedulingResource(http);
    this.handoff = new HandoffResource(http);
    this.onboarding = new OnboardingResource(http);
    this.skillStore = new SkillStoreResource(http);
    this.calendars = new CalendarsResource(http);
    this.identifiers = new IdentifiersResource(http);
    this.assistants = new AssistantsResource(http);
    this.notifications = new NotificationsResource(http);
    this.drive = new DriveResource(http);
    this.bookingLinks = new BookingLinksResource(http);
    this.tags = new TagsResource(http);
    this.me = new MeResource(http);
    this.skills = new SkillsResource(http);
    this.teams = new TeamsResource(http);
    this.organizations = new OrganizationsResource(http);
    this.users = new UsersResource(http);
    this.trash = new TrashResource(http);
  }
}

export { HttpClient, AgntApiError, publicRequest } from './HttpClient.js';
export { TasksResource } from './resources/TasksResource.js';
export { ConnectionsResource } from './resources/ConnectionsResource.js';
export { MemoriesResource } from './resources/MemoriesResource.js';
export { ChatsResource } from './resources/ChatsResource.js';
export { ContactsResource } from './resources/ContactsResource.js';
export { CompaniesResource } from './resources/CompaniesResource.js';
export { PropertyDefinitionsResource } from './resources/PropertyDefinitionsResource.js';
export { InboxThreadsResource } from './resources/InboxThreadsResource.js';
export { RevisionsResource } from './resources/RevisionsResource.js';
export { PreferencesResource } from './resources/PreferencesResource.js';
export { CalendarBlocksResource } from './resources/CalendarBlocksResource.js';
export { RosterResource } from './resources/RosterResource.js';
export { ContextsResource } from './resources/ContextsResource.js';
export { CartsResource } from './resources/CartsResource.js';
export { SchedulingTablesResource } from './resources/SchedulingTablesResource.js';
export { SchedulingResource } from './resources/SchedulingResource.js';
export { HandoffResource } from './resources/HandoffResource.js';
export { OnboardingResource } from './resources/OnboardingResource.js';
export { SkillStoreResource } from './resources/SkillStoreResource.js';
export { CalendarsResource } from './resources/CalendarsResource.js';
export { IdentifiersResource } from './resources/IdentifiersResource.js';
export { AssistantsResource } from './resources/AssistantsResource.js';
export { NotificationsResource } from './resources/NotificationsResource.js';
export { DriveResource } from './resources/DriveResource.js';
export { BookingLinksResource } from './resources/BookingLinksResource.js';
export { TagsResource } from './resources/TagsResource.js';
export { MeResource } from './resources/MeResource.js';
export { SkillsResource } from './resources/SkillsResource.js';
export { TeamsResource } from './resources/TeamsResource.js';
export { OrganizationsResource } from './resources/OrganizationsResource.js';
export { UsersResource } from './resources/UsersResource.js';
export { TrashResource } from './resources/TrashResource.js';
export * from './types.js';
export { DEFAULT_API_URL, resolveDefaultAccountSlug, resolveDefaultAccountName } from './defaults.js';
