#!/usr/bin/env node
/**
 * {{accountSlug}} CLI — @agnt-sdk/{{accountSlug}}
 *
 * Connect your own agent (Claude, a custom script, whatever you already run)
 * to your {{accountName}} account. You don't switch tools — your agent gains a
 * task board, connections, and more.
 */

import { Command } from 'commander';
import { runLogin } from './commands/login.js';
import { runLogout } from './commands/logout.js';
import { runConfigure } from './commands/configure.js';
import { runProfilesList, runProfilesUse } from './commands/profiles.js';
import { runOnboard } from './commands/onboard.js';
import {
  runTasksList, runTasksCreate, runTasksGet, runTasksActivities, runTasksMessage,
  runTasksResume, runTasksStop, runTasksApprove, runTasksDecline, runTasksMarkDone,
  runTasksArchive, runTasksUnarchive, runTasksDelete
} from './commands/tasks.js';
import { runConnectionsList, runConnect, runDisconnect, runRefresh } from './commands/connections.js';
import { runMemoriesList, runMemoriesCreate, runMemoriesUpdate, runMemoriesDelete } from './commands/memories.js';
import { runChatsList, runChatsGet, runChatsMessages, runChatsProcess, runChatsDelete } from './commands/chats.js';
import { runContactsList, runContactsGet, runContactsCreate, runContactsDelete, runContactsActivity } from './commands/contacts.js';
import {
  runCompaniesList, runCompaniesSearch, runCompaniesGet, runCompaniesCreate,
  runCompaniesFindOrCreate, runCompaniesUpdate, runCompaniesDelete, runCompaniesContacts
} from './commands/companies.js';
import { runPropertyDefinitionsList, runPropertyDefinitionsUpsert } from './commands/propertyDefinitions.js';
import {
  runInboxThreadsList, runInboxThreadsEmails, runInboxThreadsUpdate, runInboxThreadsDelete
} from './commands/inboxThreads.js';
import { runRevisionsList, runRevisionsRestore, runRevisionsFeed } from './commands/revisions.js';
import {
  runPreferencesGetSkill, runPreferencesSetSkill, runPreferencesGetScheduling, runPreferencesUpdateScheduling,
  runPreferencesGetMatrix, runPreferencesUpdateMatrix, runPreferencesResetMatrix,
  runPreferencesAddException, runPreferencesRemoveException,
  runPreferencesGetNotifications, runPreferencesUpdateNotifications,
  runPreferencesGetProviders, runPreferencesUpdateProviders,
  runPreferencesGetReminders, runPreferencesUpdateReminders,
} from './commands/preferences.js';
import {
  runCalendarBlocksList, runCalendarBlocksCreate, runCalendarBlocksUpdate, runCalendarBlocksDelete
} from './commands/calendarBlocks.js';
import {
  runRosterList, runRosterCreateAndHire, runRosterHire, runRosterSetPrimary, runRosterRelease
} from './commands/roster.js';
import {
  runContextsList, runContextsGet, runContextsCreate, runContextsUpdate, runContextsDelete
} from './commands/contexts.js';
import {
  runCartsListPending, runCartsGet, runCartsApprove, runCartsCancel,
  runCartsUpdateDispatch, runCartsRemoveDispatch, runCartsUndoDispatch,
  runCartsSnapshots, runCartsUndoAll,
} from './commands/carts.js';
import {
  runSchedulingTablesList, runSchedulingTablesCreate, runSchedulingTablesGet, runSchedulingTablesUpdate,
  runSchedulingTablesDelete, runSchedulingTablesAddSlots, runSchedulingTablesRemoveSlot,
  runSchedulingTablesAddParticipants, runSchedulingTablesUpdateParticipant, runSchedulingTablesRemoveParticipant,
  runSchedulingTablesSendInvite, runSchedulingTablesSubmitResponses,
} from './commands/schedulingTables.js';
import { runSchedulingSnapshot, runSchedulingPreview } from './commands/scheduling.js';
import {
  runHandoffList, runHandoffResolve, runHandoffStartSession, runHandoffComplete,
  runHandoffDefer, runHandoffDecline, runHandoffLaunch,
} from './commands/handoff.js';
import {
  runOnboardingRun, runOnboardingListSessions, runOnboardingCurrent, runOnboardingGet,
  runOnboardingUpdateFinding, runOnboardingUpdateWeekLabels, runOnboardingFinalize, runOnboardingFinalizeStatus,
  runOnboardingMarkOnboarded, runOnboardingUpFrontAnswers, runOnboardingUpdateBite, runOnboardingSkipRestBites,
  runOnboardingEarnedAnswers, runOnboardingUpdateWorkflowProposal, runOnboardingSkipAllWorkflowProposals,
  runOnboardingWorkflowStatus, runOnboardingUpdateCard,
} from './commands/onboarding.js';
import {
  runSkillStoreBrowse, runSkillStoreGet, runSkillStoreInstall, runSkillStoreUninstall,
  runSkillStoreRequestAccess, runSkillStorePermissions, runSkillStoreMyAccess,
  runSkillStoreIncomingRequests, runSkillStoreApproveRequest, runSkillStoreDeclineRequest,
} from './commands/skillStore.js';
import { runCalendarsList, runEventsList, runEventsCreate, runEventsLinkTask } from './commands/calendars.js';
import { runIdentifiersList, runIdentifiersMakePrimary, runIdentifiersDelete } from './commands/identifiers.js';
import { runAssistantsList, runAssistantsGet, runAssistantsGenerate, runAssistantsDelete } from './commands/assistants.js';
import { runNotificationsList, runNotificationsMarkRead, runNotificationsArchive, runNotificationsDelete, runNotificationsMarkAllRead } from './commands/notifications.js';
import { runDriveList, runDriveGet, runDriveDownload, runDriveRename, runDriveDelete } from './commands/drive.js';
import { runBookingLinksList, runBookingLinksGet, runBookingLinksDelete } from './commands/bookingLinks.js';
import { runTagsList } from './commands/tags.js';
import { runMeGet, runMeUpdate } from './commands/me.js';
import { runSkillsList, runSkillsGet, runSkillsRunNow, runSkillsDelete } from './commands/skills.js';
import { runTeamsList, runTeamsGet, runTeamsCreate, runTeamsDelete, runTeamsMembers, runTeamsAddMember, runTeamsRemoveMember } from './commands/teams.js';
import { runOrgsList, runOrgsGet, runOrgsCreate, runOrgsDelete } from './commands/organizations.js';
import { runUsersList, runUsersGet, runUsersDelete } from './commands/users.js';
import { runTrashList, runTrashRestore } from './commands/trash.js';
import { runKillSwitchGet, runKillSwitchFreeze, runKillSwitchRelease } from './commands/killSwitch.js';
import { BUILTIN_PROVIDERS } from '../resources/ConnectionsResource.js';
import { AgntApiError } from '../HttpClient.js';

const ONBOARDING_ERROR_CODES = new Set(['onboarding_required', 'onboarding_incomplete']);

function reportAndExit(err: unknown): never {
  if (err instanceof AgntApiError) {
    console.error(`Error: ${err.message}`);
    // Every account-using command funnels its error through here, so this is
    // the one place that reliably catches an agent that skipped (or never
    // saw) login's own onboarding hint and hit the server-side gate later on
    // some other command instead.
    if (err.errorCode && ONBOARDING_ERROR_CODES.has(err.errorCode)) {
      console.error('');
      console.error('Run: {{accountSlug}} onboard --timezone "America/New_York" --working-hours \'{"MO":[{"start":"09:00","end":"17:00"}]}\'');
    }
  } else if (err instanceof Error) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error('Error:', err);
  }
  process.exit(1);
}

process.on('unhandledRejection', reportAndExit);

const program = new Command();

program
  .name('{{accountSlug}}')
  .description(
    'Connect your own agent to your {{accountName}} account — no browser required.\n\n' +
      'Typical first run:\n' +
      '  {{accountSlug}} login --email you@example.com\n' +
      '  {{accountSlug}} onboard --timezone "America/New_York" --working-hours \'{"MO":[{"start":"09:00","end":"17:00"}]}\'  # required — everything else 428s until this is done\n' +
      '  {{accountSlug}} tasks list\n' +
      '  {{accountSlug}} connections connect --mcp-server-url https://mcp.notion.com'
  )
  .version('0.1.0');

program
  .command('login')
  .description(
    'Sign up or log in — works for both a new email (creates the account) and an\n' +
    'existing one (logs in), the server decides which. Sends a one-time code to\n' +
    'the email; run again from a second agent/device to mint a second, separately\n' +
    'revocable key.\n\n' +
    'Examples:\n' +
    '  {{accountSlug}} login --email you@example.com\n' +
    '  {{accountSlug}} login --email you@example.com --account {{accountSlug}} --label "work-laptop"\n' +
    '  {{accountSlug}} login --email you@example.com --code 123456   # skip the interactive prompt'
  )
  .requiredOption('--email <email>', 'Your email address')
  .option('--account <slug>', 'AGNT account slug to sign up/log in under (defaults to the account this CLI was published for)')
  .option('--code <code>', 'Verification code, if you already have it (skips the interactive prompt)')
  .option('--label <label>', 'Label for the API key this mints, e.g. the agent/device name (defaults to this machine\'s hostname)')
  .option('--profile <name>', 'Credentials profile to save under (default: "default")')
  .option('--api-url <url>', 'Override the API base URL')
  .action(async (opts) => {
    await runLogin(opts);
  });

program
  .command('onboard')
  .description(
    'Set your timezone and working hours — required before any other command\n' +
    'will work (the server blocks everything else until this is done). Both\n' +
    'flags are required; there is no default working-hours guess.\n\n' +
    'Example:\n' +
    '  {{accountSlug}} onboard --timezone "America/New_York" \\\n' +
    '    --working-hours \'{"MO":[{"start":"09:00","end":"17:00"}],"TU":[{"start":"09:00","end":"17:00"}]}\''
  )
  .option('--timezone <tz>', 'IANA timezone, e.g. "America/New_York"')
  .option('--working-hours <json>', 'Day-keyed JSON of {start,end} ranges — keys MO/TU/WE/TH/FR/SA/SU')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runOnboard(opts);
  });

program
  .command('logout')
  .description(
    'Revoke a profile\'s API key (best-effort, server-side) and remove it from\n' +
    '~/.{{accountSlug}}/credentials. Defaults to the active profile.\n\n' +
    'Examples:\n' +
    '  {{accountSlug}} logout\n' +
    '  {{accountSlug}} logout --profile work'
  )
  .option('--profile <name>', 'Profile to log out of (default: the active profile)')
  .action(async (opts) => {
    await runLogout(opts);
  });

program
  .command('configure')
  .description('Save an API key you already have to ~/.{{accountSlug}}/credentials (like `aws configure --profile`)')
  .requiredOption('--api-key <key>', 'API key (ak_live_...)')
  .option('--profile <name>', 'Profile name', 'default')
  .option('--api-url <url>', 'API base URL')
  .option('--account <slug>', 'AGNT account slug')
  .action(async (opts) => {
    await runConfigure(opts);
  });

const profilesCmd = program
  .command('profiles')
  .description('Manage multiple {{accountSlug}} accounts on this machine — like `aws configure --profile`');

profilesCmd
  .command('list')
  .description(
    'List configured profiles (name, account, API URL — never the key itself).\n' +
    'The active one (from --profile / AGNT_CLI_PROFILE, or "default") is marked with *.\n\n' +
    'Example: {{accountSlug}} profiles list'
  )
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runProfilesList(opts);
  });

profilesCmd
  .command('use <name>')
  .description(
    'Set the persisted default profile — used whenever --profile / AGNT_CLI_PROFILE\n' +
    'aren\'t given. The first profile you ever create becomes this automatically;\n' +
    'use this to switch it later.\n\n' +
    'Example: {{accountSlug}} profiles use work'
  )
  .action(async (name) => {
    await runProfilesUse(name);
  });

const tasksCmd = program
  .command('tasks')
  .description('View and create tasks on your account\'s task board');

tasksCmd
  .command('list')
  .description(
    'List your tasks\n\n' +
    'Examples:\n' +
    '  {{accountSlug}} tasks list --status pending\n' +
    '  {{accountSlug}} tasks list --search "flight" --mine'
  )
  .option('--status <status>', 'Filter by status (e.g. pending, executing, awaiting_user_input, completed, archived)')
  .option('--search <text>', 'Search by title/description')
  .option('--mine', 'Only tasks assigned to you')
  .option('--limit <n>', 'Max results per page', '50')
  .option('--page <n>', 'Page number')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runTasksList(opts);
  });

tasksCmd
  .command('create <title>')
  .description('Create a new task\n\nExample: {{accountSlug}} tasks create "Book a flight to SF" --assistant travel@agnt.ai --message "Depart Friday, return Sunday"')
  .requiredOption('--assistant <email>', 'Assistant to assign the task to')
  .option('--description <text>', 'Task description')
  .option('--message <text>', 'Send an initial message right after creating (equivalent to `tasks message` right after)')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (title, opts) => {
    await runTasksCreate(title, opts);
  });

tasksCmd
  .command('get <taskId>')
  .description('Fetch a single task')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (taskId, opts) => {
    await runTasksGet(taskId, opts);
  });

tasksCmd
  .command('activities <taskId>')
  .description('View a task\'s full activity feed (messages, status changes, plan steps), oldest first')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (taskId, opts) => {
    await runTasksActivities(taskId, opts);
  });

tasksCmd
  .command('message <taskId> <message>')
  .description('Send a message to a task — the CLI/agent equivalent of replying in the task\'s chat. Also resumes a paused task.')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (taskId, message, opts) => {
    await runTasksMessage(taskId, message, opts);
  });

tasksCmd
  .command('resume <taskId>')
  .description('Resume a paused/on-hold task with no new message')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (taskId, opts) => {
    await runTasksResume(taskId, opts);
  });

tasksCmd
  .command('stop <taskId>')
  .description('Stop a running task')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (taskId, opts) => {
    await runTasksStop(taskId, opts);
  });

tasksCmd
  .command('approve <taskId>')
  .description('Approve a task sitting behind an approval gate')
  .option('--reason <text>', 'Optional reason')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (taskId, opts) => {
    await runTasksApprove(taskId, opts);
  });

tasksCmd
  .command('decline <taskId>')
  .description('Decline a task sitting behind an approval gate')
  .option('--reason <text>', 'Optional reason')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (taskId, opts) => {
    await runTasksDecline(taskId, opts);
  });

tasksCmd
  .command('mark-done <taskId>')
  .description('Mark a task done')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (taskId, opts) => {
    await runTasksMarkDone(taskId, opts);
  });

tasksCmd
  .command('archive <taskId>')
  .description('Archive a task')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (taskId, opts) => {
    await runTasksArchive(taskId, opts);
  });

tasksCmd
  .command('unarchive <taskId>')
  .description('Unarchive a task')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (taskId, opts) => {
    await runTasksUnarchive(taskId, opts);
  });

tasksCmd
  .command('delete <taskId>')
  .description('Permanently delete a task')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (taskId, opts) => {
    await runTasksDelete(taskId, opts);
  });

const connectionsCmd = program
  .command('connections')
  .description('Connect and manage third-party integrations (Slack, Teams, Zoom, Notion, Linear, Attio, and more)');

connectionsCmd
  .command('list')
  .description('List your connections')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runConnectionsList(opts);
  });

connectionsCmd
  .command('connect')
  .description(
    'Mint a connection link — hand this URL to a human to open in any browser\n' +
    '(no portal login required). Two shapes:\n\n' +
    `  Built-in (${BUILTIN_PROVIDERS.join('/')}), org/team-level:\n` +
    '    {{accountSlug}} connections connect --provider slack --target team --target-id <teamId>\n\n' +
    '  MCP-registry (Notion, Linear, Attio, Dropbox, etc.), per-user:\n' +
    '    {{accountSlug}} connections connect --mcp-server-url https://mcp.notion.com'
  )
  .option('--provider <name>', `Built-in provider (${BUILTIN_PROVIDERS.join('|')})`)
  .option('--target <org|team>', 'Required with --provider — which level this connection binds at')
  .option('--target-id <id>', 'Required with --provider — the org or team id')
  .option('--mcp-server-url <url>', 'MCP server URL for a registry skill (Notion, Linear, Attio, etc.)')
  .option('--scope <user|tenant>', 'Only with --mcp-server-url — "user" (default) or "tenant"-wide install')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runConnect(opts);
  });

connectionsCmd
  .command('disconnect <integrationId>')
  .description('Disconnect an integration (id from `connections list`)')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (integrationId, opts) => {
    await runDisconnect(integrationId, opts);
  });

connectionsCmd
  .command('refresh <integrationId>')
  .description('Re-authenticate an integration that needs it (e.g. an expired MCP token) — prints a new authUrl for MCP integrations')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (integrationId, opts) => {
    await runRefresh(integrationId, opts);
  });

const memoriesCmd = program
  .command('memories')
  .description('Your account\'s memory store — durable facts/preferences your assistant remembers across tasks');

memoriesCmd
  .command('list')
  .description('List memories, optionally filtered to a tag\n\nExample: {{accountSlug}} memories list --tag travel')
  .option('--tag <tag>', 'Filter by tag')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runMemoriesList(opts);
  });

memoriesCmd
  .command('create <content>')
  .description('Create a memory\n\nExample: {{accountSlug}} memories create "Prefers aisle seats" --tags travel,preferences')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (content, opts) => {
    await runMemoriesCreate(content, opts);
  });

memoriesCmd
  .command('update <memoryId>')
  .description('Update a memory\'s content and/or tags')
  .option('--content <text>', 'New content')
  .option('--tags <tags>', 'Comma-separated tags (replaces existing)')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (memoryId, opts) => {
    await runMemoriesUpdate(memoryId, opts);
  });

memoriesCmd
  .command('delete <memoryId>')
  .description('Delete a memory')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (memoryId, opts) => {
    await runMemoriesDelete(memoryId, opts);
  });

const chatsCmd = program
  .command('chats')
  .description('Conversation threads — a lighter-weight alternative to tasks for quick back-and-forth');

chatsCmd
  .command('list')
  .description('List your chats\n\nExample: {{accountSlug}} chats list --status active')
  .option('--status <active|archived>', 'Filter by status (default: active)')
  .option('--assistant-id <id>', 'Filter by assistant')
  .option('--platform <platform>', 'Filter by platform (chat, email, slack, teams, sms, whatsapp, imessage, phone) — comma-separated for multiple')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runChatsList(opts);
  });

chatsCmd
  .command('get <chatId>')
  .description('Fetch a single chat')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (chatId, opts) => {
    await runChatsGet(chatId, opts);
  });

chatsCmd
  .command('messages <chatId>')
  .description('List a chat\'s messages')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (chatId, opts) => {
    await runChatsMessages(chatId, opts);
  });

chatsCmd
  .command('send <chatId> <message>')
  .description(
    'Send a message and stream the assistant\'s reply live (Server-Sent Events)\n' +
    '— this is a real-time streaming call, not a fire-and-forget POST like `tasks message`.\n\n' +
    'Example: {{accountSlug}} chats send <chatId> "What\'s on my calendar today?"'
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print each raw SSE event as JSON instead of formatted text')
  .action(async (chatId, message, opts) => {
    await runChatsProcess(chatId, message, opts);
  });

chatsCmd
  .command('delete <chatId>')
  .description('Delete a chat')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (chatId, opts) => {
    await runChatsDelete(chatId, opts);
  });

const contactsCmd = program
  .command('contacts')
  .description('Your account\'s contacts / CRM');

contactsCmd
  .command('list')
  .description('List contacts\n\nExample: {{accountSlug}} contacts list --search "jane" --tags vip')
  .option('--search <text>', 'Search by name/email')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--status <status>', 'Filter by status (default: active)')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runContactsList(opts);
  });

contactsCmd
  .command('get <contactId>')
  .description('Fetch a single contact')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (contactId, opts) => {
    await runContactsGet(contactId, opts);
  });

contactsCmd
  .command('create <body>')
  .description(
    'Create a contact from a JSON body\n\n' +
    'Example: {{accountSlug}} contacts create \'{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.com"}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (body, opts) => {
    await runContactsCreate(body, opts);
  });

contactsCmd
  .command('activity <contactId>')
  .description('View a contact\'s activity history')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (contactId, opts) => {
    await runContactsActivity(contactId, opts);
  });

contactsCmd
  .command('delete <contactId>')
  .description('Delete a contact')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (contactId, opts) => {
    await runContactsDelete(contactId, opts);
  });

const companiesCmd = program
  .command('companies')
  .description('The universal company directory your contacts link to');

companiesCmd
  .command('list')
  .description('List companies visible to you\n\nExample: {{accountSlug}} companies list --domain acme.com')
  .option('--search <text>', 'Search by name/domain/alias')
  .option('--domain <domain>', 'Filter by exact domain')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runCompaniesList(opts);
  });

companiesCmd
  .command('search <query>')
  .description('Search companies by name/domain/keyword\n\nExample: {{accountSlug}} companies search acme')
  .option('--limit <n>', 'Max results (default 20, max 100)')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (query, opts) => {
    await runCompaniesSearch(query, opts);
  });

companiesCmd
  .command('get <companyId>')
  .description('Fetch a single company')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (companyId, opts) => {
    await runCompaniesGet(companyId, opts);
  });

companiesCmd
  .command('create <body>')
  .description(
    'Create a company from a JSON body\n\n' +
    'Example: {{accountSlug}} companies create \'{"name":"Acme Inc","domain":"acme.com"}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (body, opts) => {
    await runCompaniesCreate(body, opts);
  });

companiesCmd
  .command('find-or-create <body>')
  .description(
    'Find a company by name/domain/slug, or create it if none matches\n\n' +
    'Example: {{accountSlug}} companies find-or-create \'{"domain":"acme.com"}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (body, opts) => {
    await runCompaniesFindOrCreate(body, opts);
  });

companiesCmd
  .command('update <companyId> <body>')
  .description(
    'Update a company from a JSON body\n\n' +
    'Example: {{accountSlug}} companies update co_123 \'{"industry":"Software"}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (companyId, body, opts) => {
    await runCompaniesUpdate(companyId, body, opts);
  });

companiesCmd
  .command('contacts <companyId>')
  .description('List contacts at a company')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (companyId, opts) => {
    await runCompaniesContacts(companyId, opts);
  });

companiesCmd
  .command('delete <companyId>')
  .description('Delete a company')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (companyId, opts) => {
    await runCompaniesDelete(companyId, opts);
  });

const propertyDefinitionsCmd = program
  .command('property-definitions')
  .description('Custom-field schema behind contacts\' and companies\' `properties` maps');

propertyDefinitionsCmd
  .command('list')
  .description('List property definitions\n\nExample: {{accountSlug}} property-definitions list --entity-type contact')
  .option('--entity-type <type>', 'Filter by entity type: contact or company')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runPropertyDefinitionsList({ entityType: opts.entityType, profile: opts.profile, json: opts.json });
  });

propertyDefinitionsCmd
  .command('upsert <entityType> <key> <body>')
  .description(
    'Create or update a property definition\n\n' +
    'Example: {{accountSlug}} property-definitions upsert contact churnRisk \'{"label":"Churn Risk","type":"text"}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (entityType, key, body, opts) => {
    await runPropertyDefinitionsUpsert(entityType, key, body, opts);
  });

const inboxThreadsCmd = program
  .command('inbox-threads')
  .description('Assistant mailbox threads and their emails');

inboxThreadsCmd
  .command('list')
  .description('List inbox threads\n\nExample: {{accountSlug}} inbox-threads list --assistant-id asst_123 --status active')
  .option('--assistant-id <id>', 'Filter to one assistant\'s inbox')
  .option('--status <status>', 'Filter by status (default: active)')
  .option('--q <query>', 'Full-text search across subject/body/participants')
  .option('--platform <platform>', 'Filter by inbox platform')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runInboxThreadsList(opts);
  });

inboxThreadsCmd
  .command('emails <threadId>')
  .description('List the emails in a thread, oldest first')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (threadId, opts) => {
    await runInboxThreadsEmails(threadId, opts);
  });

inboxThreadsCmd
  .command('update <threadId> <status>')
  .description('Update a thread\'s status: active or archived')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (threadId, status, opts) => {
    await runInboxThreadsUpdate(threadId, status, opts);
  });

inboxThreadsCmd
  .command('delete <threadId>')
  .description('Delete a thread and its emails')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (threadId, opts) => {
    await runInboxThreadsDelete(threadId, opts);
  });

const revisionsCmd = program
  .command('revisions')
  .description('Edit history for memories/contacts/companies/preferences/tasks/profile');

revisionsCmd
  .command('list <kind> [id]')
  .description(
    'List revisions for an entity (kind: memories|contacts|companies|preferences|tasks|profile — id omitted for profile)\n\n' +
    'Example: {{accountSlug}} revisions list contacts c_123'
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (kind, id, opts) => {
    await runRevisionsList(kind, id, opts);
  });

revisionsCmd
  .command('restore <kind> <revisionId> [id]')
  .description(
    'Restore an entity to a prior revision — writes a NEW revision recording the restore\n\n' +
    'Example: {{accountSlug}} revisions restore contacts rev_123 c_123 --reason "fix bad merge"'
  )
  .option('--reason <text>', 'Why this restore happened (recorded on the new revision)')
  .option('--skip-capture', 'Restore silently, without recording a new revision')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (kind, revisionId, id, opts) => {
    await runRevisionsRestore(kind, id, revisionId, { reason: opts.reason, skipCapture: opts.skipCapture, profile: opts.profile, json: opts.json });
  });

revisionsCmd
  .command('feed')
  .description('Cross-entity feed — everything Prime touched, filterable by model/author\n\nExample: {{accountSlug}} revisions feed --author-kind agent --limit 20')
  .option('--model <model>', 'Filter by model (Memory, Contact, Company, Preference, User, Task)')
  .option('--author-kind <kind>', 'Filter by author kind: user, agent, or system')
  .option('--limit <n>', 'Max results (default 100, max 500)')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runRevisionsFeed(opts);
  });

const preferencesCmd = program
  .command('preferences')
  .description('Skill, scheduling, supervision, notification, and provider preferences');

preferencesCmd
  .command('get-skill <identifierId> <skill>')
  .description('Get a per-identifier skill preference block (skill: reminders|followups|supervision|scheduling|...)')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (identifierId, skill, opts) => {
    await runPreferencesGetSkill(identifierId, skill, opts);
  });

preferencesCmd
  .command('set-skill <identifierId> <skill> <body>')
  .description('Set a per-identifier skill preference block from a JSON body\n\nExample: {{accountSlug}} preferences set-skill id_123 reminders \'{"level":"all"}\'')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (identifierId, skill, body, opts) => {
    await runPreferencesSetSkill(identifierId, skill, body, opts);
  });

preferencesCmd
  .command('get-scheduling <userId>')
  .description('Get a user\'s scheduling preferences (primary identifier)')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, opts) => {
    await runPreferencesGetScheduling(userId, opts);
  });

preferencesCmd
  .command('update-scheduling <userId> <body>')
  .description('Update a user\'s scheduling preferences from a JSON body')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, body, opts) => {
    await runPreferencesUpdateScheduling(userId, body, opts);
  });

preferencesCmd
  .command('get-matrix <userId>')
  .description('Get a user\'s supervision approval matrix, incl. team/org-locked cells')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, opts) => {
    await runPreferencesGetMatrix(userId, opts);
  });

preferencesCmd
  .command('update-matrix <userId> <body>')
  .description('Deep-merge a patch into a user\'s supervision matrix from a JSON body (matrix.locked is admin-only)')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, body, opts) => {
    await runPreferencesUpdateMatrix(userId, body, opts);
  });

preferencesCmd
  .command('reset-matrix <userId>')
  .description('Reset a user\'s supervision matrix to defaults')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, opts) => {
    await runPreferencesResetMatrix(userId, opts);
  });

preferencesCmd
  .command('add-exception <userId> <body>')
  .description('Add a recipient exception to the supervision matrix\n\nExample: {{accountSlug}} preferences add-exception u_123 \'{"match":{"kind":"contactId","value":"c_123"},"mode":"auto"}\'')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, body, opts) => {
    await runPreferencesAddException(userId, body, opts);
  });

preferencesCmd
  .command('remove-exception <userId> <exceptionId>')
  .description('Remove a recipient exception by id')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, exceptionId, opts) => {
    await runPreferencesRemoveException(userId, exceptionId, opts);
  });

preferencesCmd
  .command('get-notifications <userId>')
  .description('Get a user\'s notification preferences')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, opts) => {
    await runPreferencesGetNotifications(userId, opts);
  });

preferencesCmd
  .command('update-notifications <userId> <body>')
  .description('Update a user\'s notification preferences from a JSON body')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, body, opts) => {
    await runPreferencesUpdateNotifications(userId, body, opts);
  });

preferencesCmd
  .command('get-providers <userId>')
  .description('Get a user\'s preferred providers + preferred contact channel')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, opts) => {
    await runPreferencesGetProviders(userId, opts);
  });

preferencesCmd
  .command('update-providers <userId> <body>')
  .description('Update a user\'s preferred providers from a JSON body')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, body, opts) => {
    await runPreferencesUpdateProviders(userId, body, opts);
  });

preferencesCmd
  .command('get-reminders <userId>')
  .description('Get a user\'s cross-identifier reminder preferences')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, opts) => {
    await runPreferencesGetReminders(userId, opts);
  });

preferencesCmd
  .command('update-reminders <userId> <body>')
  .description('Update a user\'s cross-identifier reminder preferences from a JSON body')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, body, opts) => {
    await runPreferencesUpdateReminders(userId, body, opts);
  });

const calendarBlocksCmd = program
  .command('calendar-blocks')
  .description('Manual busy-time blocks that keep a window free of scheduling');

calendarBlocksCmd
  .command('list')
  .description('List calendar blocks\n\nExample: {{accountSlug}} calendar-blocks list --starts-at 2026-01-01T00:00:00Z --ends-at 2026-01-31T00:00:00Z')
  .option('--starts-at <iso>', 'Filter to blocks starting at/after this time')
  .option('--ends-at <iso>', 'Filter to blocks ending at/before this time')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runCalendarBlocksList(opts);
  });

calendarBlocksCmd
  .command('create <body>')
  .description(
    'Create a calendar block from a JSON body\n\n' +
    'Example: {{accountSlug}} calendar-blocks create \'{"startsAt":"2026-01-01T09:00:00Z","endsAt":"2026-01-01T10:00:00Z","title":"Focus time"}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (body, opts) => {
    await runCalendarBlocksCreate(body, opts);
  });

calendarBlocksCmd
  .command('update <blockId> <body>')
  .description('Update a calendar block from a JSON body')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (blockId, body, opts) => {
    await runCalendarBlocksUpdate(blockId, body, opts);
  });

calendarBlocksCmd
  .command('delete <blockId>')
  .description('Delete a calendar block')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (blockId, opts) => {
    await runCalendarBlocksDelete(blockId, opts);
  });

const rosterCmd = program
  .command('roster')
  .description('Multiple-assistants-per-user roster + hire/primary/release lifecycle');

rosterCmd
  .command('list <userId>')
  .description('List a user\'s roster of hired assistants')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (userId, opts) => {
    await runRosterList(userId, opts);
  });

rosterCmd
  .command('create-and-hire <userId> <body>')
  .description(
    'Create a user-scoped assistant and hire it in one call — idempotent on (user, name)\n\n' +
    'Example: {{accountSlug}} roster create-and-hire u_123 \'{"name":"Ada"}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (userId, body, opts) => {
    await runRosterCreateAndHire(userId, body, opts);
  });

rosterCmd
  .command('hire <userId> <assistantId>')
  .description('Hire an already-visible (team/org-shared) assistant onto the roster')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (userId, assistantId, opts) => {
    await runRosterHire(userId, assistantId, opts);
  });

rosterCmd
  .command('set-primary <userId> <assistantId>')
  .description('Set the user\'s primary assistant — hires it as part of the flip if needed')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (userId, assistantId, opts) => {
    await runRosterSetPrimary(userId, assistantId, opts);
  });

rosterCmd
  .command('release <userId> <assistantId>')
  .description('Release an assistant from the roster (cannot release the primary — set a new one first)')
  .option('--transfer-pending-work', 'Move in-flight tasks to the primary instead of blocking on a 409')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (userId, assistantId, opts) => {
    await runRosterRelease(userId, assistantId, opts);
  });

const contextsCmd = program
  .command('contexts')
  .description('Structured, tagged context records retrievable by resourceType/tags');

contextsCmd
  .command('list')
  .description('List contexts\n\nExample: {{accountSlug}} contexts list --resource-type task --tags urgent')
  .option('--resource-type <type>', 'Filter by resourceType')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--status <status>', 'Filter by status')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runContextsList(opts);
  });

contextsCmd
  .command('get <contextId>')
  .description('Fetch a single context')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (contextId, opts) => {
    await runContextsGet(contextId, opts);
  });

contextsCmd
  .command('create <body>')
  .description(
    'Create a context from a JSON body\n\n' +
    'Example: {{accountSlug}} contexts create \'{"resourceType":"task","data":{"summary":"..."}}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (body, opts) => {
    await runContextsCreate(body, opts);
  });

contextsCmd
  .command('update <contextId> <body>')
  .description('Update a context from a JSON body')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (contextId, body, opts) => {
    await runContextsUpdate(contextId, body, opts);
  });

contextsCmd
  .command('delete <contextId>')
  .description('Delete a context')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (contextId, opts) => {
    await runContextsDelete(contextId, opts);
  });

const cartsCmd = program
  .command('carts')
  .description('DispatchCart approval flow — pending actions an assistant is waiting on you to review');

cartsCmd
  .command('list-pending')
  .description('List carts awaiting review (status: pending_approval, time_boxed)')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runCartsListPending(opts);
  });

cartsCmd
  .command('get <cartId>')
  .description('Fetch full cart detail, including dispatches and undo snapshots')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (cartId, opts) => {
    await runCartsGet(cartId, opts);
  });

cartsCmd
  .command('approve <cartId>')
  .description('Approve a time-boxed or pending_approval cart early — executes its dispatches')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (cartId, opts) => {
    await runCartsApprove(cartId, opts);
  });

cartsCmd
  .command('cancel <cartId>')
  .description('Cancel an open, time-boxed, or pending_approval cart')
  .option('--reason <text>', 'Why the cart is being cancelled')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (cartId, opts) => {
    await runCartsCancel(cartId, opts);
  });

cartsCmd
  .command('update-dispatch <cartId> <dispatchIndex> <body>')
  .description(
    'Partially update a dispatch from a JSON body — cart must be pending_approval or time_boxed\n\n' +
    'Example: {{accountSlug}} carts update-dispatch cart_123 0 \'{"subject":"New subject"}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (cartId, dispatchIndex, body, opts) => {
    await runCartsUpdateDispatch(cartId, dispatchIndex, body, opts);
  });

cartsCmd
  .command('remove-dispatch <cartId> <dispatchIndex>')
  .description('Remove a dispatch from the cart')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (cartId, dispatchIndex, opts) => {
    await runCartsRemoveDispatch(cartId, dispatchIndex, opts);
  });

cartsCmd
  .command('undo-dispatch <cartId> <dispatchIndex>')
  .description('Undo a single completed, reversible dispatch')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (cartId, dispatchIndex, opts) => {
    await runCartsUndoDispatch(cartId, dispatchIndex, opts);
  });

cartsCmd
  .command('snapshots <cartId>')
  .description('List dispatch undo snapshots for a cart')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (cartId, opts) => {
    await runCartsSnapshots(cartId, opts);
  });

cartsCmd
  .command('undo-all <cartId>')
  .description('Undo every reversible dispatch in the cart, in reverse order')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (cartId, opts) => {
    await runCartsUndoAll(cartId, opts);
  });

const schedulingTablesCmd = program
  .command('scheduling-tables')
  .description('When2meet-style shared availability grids: propose slots, invite participants, collect responses');

schedulingTablesCmd
  .command('list')
  .description('List your scheduling tables')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runSchedulingTablesList(opts);
  });

schedulingTablesCmd
  .command('create <body>')
  .description('Create a scheduling table from a JSON body\n\nExample: {{accountSlug}} scheduling-tables create \'{"title":"Team sync"}\'')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (body, opts) => {
    await runSchedulingTablesCreate(body, opts);
  });

schedulingTablesCmd
  .command('get <tableId>')
  .description('Fetch a scheduling table, including its slots and participants')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (tableId, opts) => {
    await runSchedulingTablesGet(tableId, opts);
  });

schedulingTablesCmd
  .command('update <tableId> <body>')
  .description('Update a scheduling table from a JSON body')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (tableId, body, opts) => {
    await runSchedulingTablesUpdate(tableId, body, opts);
  });

schedulingTablesCmd
  .command('delete <tableId>')
  .description('Delete a scheduling table')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (tableId, opts) => {
    await runSchedulingTablesDelete(tableId, opts);
  });

schedulingTablesCmd
  .command('add-slots <tableId> <body>')
  .description(
    'Add candidate slots from a JSON body\n\n' +
    'Example: {{accountSlug}} scheduling-tables add-slots t_123 \'{"slots":[{"start":"2026-01-01T09:00:00Z","end":"2026-01-01T09:30:00Z"}]}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (tableId, body, opts) => {
    await runSchedulingTablesAddSlots(tableId, body, opts);
  });

schedulingTablesCmd
  .command('remove-slot <tableId> <slotId>')
  .description('Remove a candidate slot')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (tableId, slotId, opts) => {
    await runSchedulingTablesRemoveSlot(tableId, slotId, opts);
  });

schedulingTablesCmd
  .command('add-participants <tableId> <body>')
  .description(
    'Add participants from a JSON body\n\n' +
    'Example: {{accountSlug}} scheduling-tables add-participants t_123 \'{"participants":[{"name":"Ada","email":"ada@example.com"}]}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (tableId, body, opts) => {
    await runSchedulingTablesAddParticipants(tableId, body, opts);
  });

schedulingTablesCmd
  .command('update-participant <tableId> <participantId> <body>')
  .description('Update a participant (required/role) from a JSON body')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (tableId, participantId, body, opts) => {
    await runSchedulingTablesUpdateParticipant(tableId, participantId, body, opts);
  });

schedulingTablesCmd
  .command('remove-participant <tableId> <participantId>')
  .description('Remove a participant')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (tableId, participantId, opts) => {
    await runSchedulingTablesRemoveParticipant(tableId, participantId, opts);
  });

schedulingTablesCmd
  .command('send-invite <tableId> <participantId>')
  .description('Re-send the invite email to a participant')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (tableId, participantId, opts) => {
    await runSchedulingTablesSendInvite(tableId, participantId, opts);
  });

schedulingTablesCmd
  .command('submit-responses <tableId> <participantId> <body>')
  .description(
    'Submit a participant\'s slot responses from a JSON body\n\n' +
    'Example: {{accountSlug}} scheduling-tables submit-responses t_123 p_456 \'{"responses":[{"slotId":"s_123","availability":"yes"}]}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (tableId, participantId, body, opts) => {
    await runSchedulingTablesSubmitResponses(tableId, participantId, body, opts);
  });

const schedulingCmd = program
  .command('scheduling')
  .description('Live scheduling-engine state for a task: participant availability + strategy previews');

schedulingCmd
  .command('snapshot <taskId>')
  .description('Get a task\'s live scheduling snapshot — participants, grid state, last solver output')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (taskId, opts) => {
    await runSchedulingSnapshot(taskId, opts);
  });

schedulingCmd
  .command('preview <taskId>')
  .description('Run the solver against current availability without committing\n\nExample: {{accountSlug}} scheduling preview t_123 --exclude-emails "bob@example.com,eve@example.com"')
  .option('--exclude-emails <emails>', 'Comma-separated emails to exclude from the preview')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (taskId, opts) => {
    await runSchedulingPreview(taskId, opts);
  });

const handoffCmd = program
  .command('handoff')
  .description('Workspace handoff (JIT Auth) — hand a live browser session between agent and human');

handoffCmd
  .command('list')
  .description('List outstanding handoffs, oldest first')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runHandoffList(opts);
  });

handoffCmd
  .command('resolve <items>')
  .description(
    'Hand control back for one or more handoffs in one call\n\n' +
    'Example: {{accountSlug}} handoff resolve \'[{"handoffId":"h_123","outcome":"completed"}]\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (items, opts) => {
    await runHandoffResolve(items, opts);
  });

handoffCmd
  .command('start-session <handoffId>')
  .description('Mint a session URL for a ready handoff — open it in a browser to act on it')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (handoffId, opts) => {
    await runHandoffStartSession(handoffId, opts);
  });

handoffCmd
  .command('complete <handoffId>')
  .description('Mark a handoff as completed')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (handoffId, opts) => {
    await runHandoffComplete(handoffId, opts);
  });

handoffCmd
  .command('defer <handoffId> <message>')
  .description('"Do It Later" — close now, the assistant comes back later')
  .option('--minutes <n>', 'Concrete defer window in minutes (omit to let the assistant decide)')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (handoffId, message, opts) => {
    await runHandoffDefer(handoffId, message, opts);
  });

handoffCmd
  .command('decline <handoffId>')
  .description('Terminal refusal — the backend won\'t ask again for this task')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (handoffId, opts) => {
    await runHandoffDecline(handoffId, opts);
  });

handoffCmd
  .command('launch')
  .description('User-initiated browser session with no agent request — async, poll "handoff list" until status is ready')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runHandoffLaunch(opts);
  });

const onboardingCmd = program
  .command('onboarding')
  .description('Session-based bite/card review flow — Prime extracts facts, you approve/edit/reject, then finalize');

onboardingCmd
  .command('run')
  .description('Start a new onboarding session')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runOnboardingRun(opts);
  });

onboardingCmd
  .command('list-sessions')
  .description('List onboarding sessions')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runOnboardingListSessions(opts);
  });

onboardingCmd
  .command('current')
  .description('Resume-banner data — most-recent in-progress session, or most-recent overall')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (opts) => {
    await runOnboardingCurrent(opts);
  });

onboardingCmd
  .command('get <sessionId>')
  .description('Fetch a session — bites, cards, workflow proposals, finalize state')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (sessionId, opts) => {
    await runOnboardingGet(sessionId, opts);
  });

onboardingCmd
  .command('update-finding <sessionId> <findingId> <body>')
  .description('Update an extracted finding from a JSON body')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (sessionId, findingId, body, opts) => {
    await runOnboardingUpdateFinding(sessionId, findingId, body, opts);
  });

onboardingCmd
  .command('update-week-labels <sessionId> <body>')
  .description('Replace the session\'s week labels from a JSON body')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (sessionId, body, opts) => {
    await runOnboardingUpdateWeekLabels(sessionId, body, opts);
  });

onboardingCmd
  .command('finalize <sessionId> [body]')
  .description(
    'Apply preferences and save memories — defaults to {applyPreferences:true,saveMemories:true} if body is omitted\n\n' +
    'Example: {{accountSlug}} onboarding finalize s_123'
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (sessionId, body, opts) => {
    await runOnboardingFinalize(sessionId, body, opts);
  });

onboardingCmd
  .command('finalize-status <sessionId>')
  .description('Poll finalize progress — idle/running/complete/error')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (sessionId, opts) => {
    await runOnboardingFinalizeStatus(sessionId, opts);
  });

onboardingCmd
  .command('mark-onboarded')
  .description('Lightweight flag-only write for dismissing the tutorial — does not run finalize')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (opts) => {
    await runOnboardingMarkOnboarded(opts);
  });

onboardingCmd
  .command('up-front-answers <sessionId> <body>')
  .description('Update the session\'s up-front answers (roleOneLiner, schedulingAnnoyance) from a JSON body')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (sessionId, body, opts) => {
    await runOnboardingUpFrontAnswers(sessionId, body, opts);
  });

onboardingCmd
  .command('update-bite <sessionId> <biteId> <body>')
  .description(
    'Approve / edit / reject an extracted bite\n\n' +
    'Example: {{accountSlug}} onboarding update-bite s_123 b_456 \'{"reviewState":"approved"}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (sessionId, biteId, body, opts) => {
    await runOnboardingUpdateBite(sessionId, biteId, body, opts);
  });

onboardingCmd
  .command('skip-rest-bites <sessionId>')
  .description('"I\'m good, let\'s keep going" — remaining high-confidence bites silent-save at finalize')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (sessionId, opts) => {
    await runOnboardingSkipRestBites(sessionId, opts);
  });

onboardingCmd
  .command('earned-answers <sessionId> <body>')
  .description('Update free-text earned-question answers from a JSON body, keyed per question — missing keys preserve existing values')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (sessionId, body, opts) => {
    await runOnboardingEarnedAnswers(sessionId, body, opts);
  });

onboardingCmd
  .command('update-workflow-proposal <sessionId> <proposalId> <body>')
  .description('Accept / edit-sentence / reject a proposed workflow')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (sessionId, proposalId, body, opts) => {
    await runOnboardingUpdateWorkflowProposal(sessionId, proposalId, body, opts);
  });

onboardingCmd
  .command('skip-all-workflow-proposals <sessionId>')
  .description('Mass-reject pending workflow proposals — already-accepted/edited ones are untouched')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (sessionId, opts) => {
    await runOnboardingSkipAllWorkflowProposals(sessionId, opts);
  });

onboardingCmd
  .command('workflow-status <sessionId>')
  .description('Poll async workflow-build jobs — stop once allComplete')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (sessionId, opts) => {
    await runOnboardingWorkflowStatus(sessionId, opts);
  });

onboardingCmd
  .command('update-card <sessionId> <cardType> <body>')
  .description(
    'Update one of the five summary cards (about, people, scheduling, rules, dayInLife) from a JSON body\n\n' +
    'Example: {{accountSlug}} onboarding update-card s_123 about \'{"reviewState":"approved"}\''
  )
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (sessionId, cardType, body, opts) => {
    await runOnboardingUpdateCard(sessionId, cardType, body, opts);
  });

const skillStoreCmd = program
  .command('skill-store')
  .description('Skill marketplace — browse/install distinct from `skills`\' CRUD over skills you own');

skillStoreCmd
  .command('browse')
  .description('Browse the marketplace\n\nExample: {{accountSlug}} skill-store browse --tier community --search notion')
  .option('--tier <tier>', 'Filter by tier: agnt, official, or community')
  .option('--kind <kind>', 'Filter by skill kind')
  .option('--search <text>', 'Search by name/description')
  .option('--page <n>', 'Page number')
  .option('--limit <n>', 'Results per page (max 96)')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runSkillStoreBrowse(opts);
  });

skillStoreCmd
  .command('get <accountSlug> <skillSlug>')
  .description('Fetch a single marketplace skill')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (accountSlug, skillSlug, opts) => {
    await runSkillStoreGet(accountSlug, skillSlug, opts);
  });

skillStoreCmd
  .command('install <accountSlug> <skillSlug>')
  .description('Install an auto-approval skill — use "request-access" instead for manual-approval skills')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (accountSlug, skillSlug, opts) => {
    await runSkillStoreInstall(accountSlug, skillSlug, opts);
  });

skillStoreCmd
  .command('uninstall <accountSlug> <skillSlug>')
  .description('Uninstall a marketplace skill')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (accountSlug, skillSlug, opts) => {
    await runSkillStoreUninstall(accountSlug, skillSlug, opts);
  });

skillStoreCmd
  .command('request-access <accountSlug> <skillSlug>')
  .description('Request access to a manual-approval skill — creates a pending request its owner must approve/decline')
  .option('--message <text>', 'Why you need access')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (accountSlug, skillSlug, opts) => {
    await runSkillStoreRequestAccess(accountSlug, skillSlug, opts);
  });

skillStoreCmd
  .command('permissions')
  .description('Your marketplace permissions (browse/install/freestyle/approval requirement)')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (opts) => {
    await runSkillStorePermissions(opts);
  });

skillStoreCmd
  .command('my-access')
  .description('List your non-owned skill access (admin-granted or self-installed)')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runSkillStoreMyAccess(opts);
  });

skillStoreCmd
  .command('incoming-requests')
  .description('List pending access requests for skills you own, awaiting your approval')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runSkillStoreIncomingRequests(opts);
  });

skillStoreCmd
  .command('approve-request <installId>')
  .description('Approve a pending access request')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (installId, opts) => {
    await runSkillStoreApproveRequest(installId, opts);
  });

skillStoreCmd
  .command('decline-request <installId>')
  .description('Decline a pending access request')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (installId, opts) => {
    await runSkillStoreDeclineRequest(installId, opts);
  });

const calendarsCmd = program
  .command('calendars')
  .description('Calendars and events');

calendarsCmd
  .command('list')
  .description('List your calendars')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runCalendarsList(opts);
  });

const eventsCmd = calendarsCmd
  .command('events')
  .description('View and create calendar events');

eventsCmd
  .command('list <calendarId>')
  .description('List events in a time range\n\nExample: {{accountSlug}} calendars events list <calendarId> --from 2026-01-01T00:00:00Z --to 2026-01-08T00:00:00Z')
  .requiredOption('--from <isoDate>', 'Range start (ISO 8601)')
  .requiredOption('--to <isoDate>', 'Range end (ISO 8601)')
  .option('--timezone <tz>', 'IANA timezone')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (calendarId, opts) => {
    await runEventsList(calendarId, opts);
  });

eventsCmd
  .command('create <calendarId> <title>')
  .description('Create an event\n\nExample: {{accountSlug}} calendars events create <calendarId> "Flight to SF" --start 2026-01-01T08:00:00Z --end 2026-01-01T11:00:00Z')
  .requiredOption('--start <isoDate>', 'Start time (ISO 8601)')
  .requiredOption('--end <isoDate>', 'End time (ISO 8601)')
  .option('--description <text>', 'Event description')
  .option('--location <text>', 'Event location')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (calendarId, title, opts) => {
    await runEventsCreate(calendarId, title, opts);
  });

eventsCmd
  .command('link-task <calendarId> <eventId> <taskId>')
  .description('Link a task to a calendar event')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (calendarId, eventId, taskId, opts) => {
    await runEventsLinkTask(calendarId, eventId, taskId, opts);
  });

const identifiersCmd = program
  .command('identifiers')
  .description('Verified emails/phones on your account (not third-party connections — see `connections` for those)');

identifiersCmd
  .command('list')
  .description('List your identifiers')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runIdentifiersList(opts);
  });

identifiersCmd
  .command('make-primary <identifierId>')
  .description('Set an identifier as primary')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (identifierId, opts) => {
    await runIdentifiersMakePrimary(identifierId, opts);
  });

identifiersCmd
  .command('delete <identifierId>')
  .description('Delete an identifier')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (identifierId, opts) => {
    await runIdentifiersDelete(identifierId, opts);
  });

const assistantsCmd = program
  .command('assistants')
  .description('AI assistants configured on your account');

assistantsCmd
  .command('list')
  .description('List your assistants')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runAssistantsList(opts);
  });

assistantsCmd
  .command('get <assistantId>')
  .description('Fetch a single assistant')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (assistantId, opts) => {
    await runAssistantsGet(assistantId, opts);
  });

assistantsCmd
  .command('generate [name]')
  .description('Suggest an available assistant name + email handles, before creating one')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (name, opts) => {
    await runAssistantsGenerate(name, opts);
  });

assistantsCmd
  .command('delete <assistantId>')
  .description('Delete an assistant')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (assistantId, opts) => {
    await runAssistantsDelete(assistantId, opts);
  });

const notificationsCmd = program
  .command('notifications')
  .description('Your inbox notifications');

notificationsCmd
  .command('list')
  .description('List notifications\n\nExample: {{accountSlug}} notifications list --archived')
  .option('--archived', 'List archived instead of active notifications')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runNotificationsList(opts);
  });

notificationsCmd
  .command('mark-read <itemId>')
  .description('Mark a notification read')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (itemId, opts) => {
    await runNotificationsMarkRead(itemId, opts);
  });

notificationsCmd
  .command('mark-all-read')
  .description('Mark all notifications read')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (opts) => {
    await runNotificationsMarkAllRead(opts);
  });

notificationsCmd
  .command('archive <itemId>')
  .description('Archive a notification')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (itemId, opts) => {
    await runNotificationsArchive(itemId, opts);
  });

notificationsCmd
  .command('delete <itemId>')
  .description('Delete a notification')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (itemId, opts) => {
    await runNotificationsDelete(itemId, opts);
  });

const driveCmd = program
  .command('drive')
  .description('Files your agents create/attach — visible and manageable by you');

driveCmd
  .command('list')
  .description('List files\n\nExample: {{accountSlug}} drive list --search "report"')
  .option('--search <text>', 'Search by filename')
  .option('--folder <folderId>', 'Filter by folder')
  .option('--kind <file|note>', 'Filter by kind')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runDriveList(opts);
  });

driveCmd
  .command('get <fileId>')
  .description('Fetch a single file\'s metadata')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (fileId, opts) => {
    await runDriveGet(fileId, opts);
  });

driveCmd
  .command('download <fileId>')
  .description('Print a presigned download URL (valid 15 minutes)')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (fileId, opts) => {
    await runDriveDownload(fileId, opts);
  });

driveCmd
  .command('rename <fileId> <name>')
  .description('Rename a file')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (fileId, name, opts) => {
    await runDriveRename(fileId, name, opts);
  });

driveCmd
  .command('delete <fileId>')
  .description('Delete a file')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (fileId, opts) => {
    await runDriveDelete(fileId, opts);
  });

const bookingLinksCmd = program
  .command('booking-links')
  .description('Scheduling links');

bookingLinksCmd
  .command('list')
  .description('List your booking links')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runBookingLinksList(opts);
  });

bookingLinksCmd
  .command('get <bookingLinkId>')
  .description('Fetch a single booking link')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (bookingLinkId, opts) => {
    await runBookingLinksGet(bookingLinkId, opts);
  });

bookingLinksCmd
  .command('delete <bookingLinkId>')
  .description('Delete a booking link')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (bookingLinkId, opts) => {
    await runBookingLinksDelete(bookingLinkId, opts);
  });

program
  .command('tags')
  .description('List freeform tags used on contacts/companies\n\nExample: {{accountSlug}} tags --kind contact --prefix vi')
  .option('--kind <all|contact|company>', 'Filter by entity kind (default: all)')
  .option('--prefix <text>', 'Autocomplete-style prefix filter')
  .option('--limit <n>', 'Max results (default 20, max 100)')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runTagsList(opts);
  });

const meCmd = program
  .command('me')
  .description('Your own user profile');

meCmd
  .command('get')
  .description('Fetch your profile')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (opts) => {
    await runMeGet(opts);
  });

meCmd
  .command('update <body>')
  .description('Update your profile from a JSON body\n\nExample: {{accountSlug}} me update \'{"firstName":"Ada"}\'')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (body, opts) => {
    await runMeUpdate(body, opts);
  });

const skillsCmd = program
  .command('skills')
  .description('Installed skills/workflows on your account');

skillsCmd
  .command('list')
  .description('List your skills\n\nExample: {{accountSlug}} skills list --kind mcp')
  .option('--kind <http|mcp|system>', 'Filter by kind')
  .option('--q <text>', 'Search')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runSkillsList(opts);
  });

skillsCmd
  .command('get <skillId>')
  .description('Fetch a single skill')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (skillId, opts) => {
    await runSkillsGet(skillId, opts);
  });

skillsCmd
  .command('run <skillId>')
  .description('Run a workflow skill immediately, off its normal schedule')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (skillId, opts) => {
    await runSkillsRunNow(skillId, opts);
  });

skillsCmd
  .command('delete <skillId>')
  .description('Delete/uninstall a skill')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (skillId, opts) => {
    await runSkillsDelete(skillId, opts);
  });

const teamsCmd = program
  .command('teams')
  .description('Teams — org-admin action, requires an admin role');

teamsCmd
  .command('list')
  .description('List teams')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runTeamsList(opts);
  });

teamsCmd
  .command('get <teamId>')
  .description('Fetch a single team')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (teamId, opts) => {
    await runTeamsGet(teamId, opts);
  });

teamsCmd
  .command('create <name>')
  .description('Create a team')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (name, opts) => {
    await runTeamsCreate(name, opts);
  });

teamsCmd
  .command('delete <teamId>')
  .description('Delete a team')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (teamId, opts) => {
    await runTeamsDelete(teamId, opts);
  });

teamsCmd
  .command('members <teamId>')
  .description('List a team\'s members')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (teamId, opts) => {
    await runTeamsMembers(teamId, opts);
  });

teamsCmd
  .command('add-member <teamId> <userId>')
  .description('Add a member to a team (default role: member)')
  .option('--role <owner|admin|member>', 'Role to assign')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (teamId, userId, opts) => {
    await runTeamsAddMember(teamId, userId, opts);
  });

teamsCmd
  .command('remove-member <teamId> <memberId>')
  .description('Remove a member from a team')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (teamId, memberId, opts) => {
    await runTeamsRemoveMember(teamId, memberId, opts);
  });

const orgsCmd = program
  .command('organizations')
  .description('Organizations — org-admin action, requires an admin role');

orgsCmd
  .command('list')
  .description('List organizations')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runOrgsList(opts);
  });

orgsCmd
  .command('get <orgId>')
  .description('Fetch a single organization')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (orgId, opts) => {
    await runOrgsGet(orgId, opts);
  });

orgsCmd
  .command('create <name>')
  .description('Create an organization')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (name, opts) => {
    await runOrgsCreate(name, opts);
  });

orgsCmd
  .command('delete <orgId>')
  .description('Delete an organization')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (orgId, opts) => {
    await runOrgsDelete(orgId, opts);
  });

const usersCmd = program
  .command('users')
  .description('Account members — list/get are broadly usable, delete requires org-admin');

usersCmd
  .command('list')
  .description('List account members')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runUsersList(opts);
  });

usersCmd
  .command('get <userId>')
  .description('Fetch a single user')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, opts) => {
    await runUsersGet(userId, opts);
  });

usersCmd
  .command('delete <userId>')
  .description('Deprovision a user — requires org-admin')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (userId, opts) => {
    await runUsersDelete(userId, opts);
  });

const trashCmd = program
  .command('trash')
  .description('Soft-deleted skills/assistants/inbox items, restorable within the retention window');

trashCmd
  .command('list <kind>')
  .description('List trashed items\n\nExample: {{accountSlug}} trash list skills')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (kind, opts) => {
    await runTrashList(kind, opts);
  });

trashCmd
  .command('restore <kind> <id>')
  .description('Restore a trashed item\n\nExample: {{accountSlug}} trash restore assistants <id>')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (kind, id, opts) => {
    await runTrashRestore(kind, id, opts);
  });

const killSwitchCmd = program
  .command('kill-switch')
  .description('Account-wide emergency stop — freezing halts ALL agent activity');

killSwitchCmd
  .command('status')
  .description('Check the kill switch state')
  .option('--profile <name>', 'Credentials profile to use')
  .action(async (opts) => {
    await runKillSwitchGet(opts);
  });

killSwitchCmd
  .command('freeze')
  .description('Stop all agent activity on the account immediately')
  .option('--reason <text>', 'Optional reason')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runKillSwitchFreeze(opts);
  });

killSwitchCmd
  .command('release')
  .description('Resume normal activity after a freeze')
  .option('--reason <text>', 'Optional reason')
  .option('--profile <name>', 'Credentials profile to use')
  .option('--json', 'Print raw JSON')
  .action(async (opts) => {
    await runKillSwitchRelease(opts);
  });

program.parseAsync(process.argv).catch(reportAndExit);
