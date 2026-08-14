import { clientFor } from '../utils/api.js';

export interface SchedulingTablesOptions {
  profile?: string;
  json?: boolean;
}

function parseJsonBody(body: string, example: string): any {
  try {
    return JSON.parse(body);
  } catch {
    console.error(`Body must be valid JSON, e.g. '${example}'`);
    process.exit(1);
  }
}

export async function runSchedulingTablesList(opts: SchedulingTablesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const tables = await client.schedulingTables.list();

  if (opts.json) {
    console.log(JSON.stringify(tables, null, 2));
    return;
  }
  if (!tables.length) {
    console.log('No scheduling tables found.');
    return;
  }
  for (const table of tables) {
    console.log(`${table.id}  ${table.title}  [${table.status}]  ${table.slots.length} slot(s), ${table.participants.length} participant(s)`);
  }
}

export async function runSchedulingTablesCreate(body: string, opts: SchedulingTablesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"title":"Team sync"}');
  const table = await client.schedulingTables.create(parsed);

  if (opts.json) {
    console.log(JSON.stringify(table, null, 2));
    return;
  }
  console.log(`Created scheduling table ${table.id}.`);
}

export async function runSchedulingTablesGet(tableId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  const table = await client.schedulingTables.get(tableId);
  console.log(JSON.stringify(table, null, 2));
}

export async function runSchedulingTablesUpdate(tableId: string, body: string, opts: SchedulingTablesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"status":"closed"}');
  const table = await client.schedulingTables.update(tableId, parsed);

  if (opts.json) {
    console.log(JSON.stringify(table, null, 2));
    return;
  }
  console.log(`Updated scheduling table ${table.id}.`);
}

export async function runSchedulingTablesDelete(tableId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.schedulingTables.delete(tableId);
  console.log(`Deleted scheduling table ${tableId}.`);
}

export async function runSchedulingTablesAddSlots(tableId: string, body: string, opts: SchedulingTablesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"slots":[{"start":"2026-01-01T09:00:00Z","end":"2026-01-01T09:30:00Z"}]}');
  const table = await client.schedulingTables.addSlots(tableId, parsed);

  if (opts.json) {
    console.log(JSON.stringify(table, null, 2));
    return;
  }
  console.log(`Table ${table.id} now has ${table.slots.length} slot(s).`);
}

export async function runSchedulingTablesRemoveSlot(tableId: string, slotId: string, opts: SchedulingTablesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const table = await client.schedulingTables.removeSlot(tableId, slotId);

  if (opts.json) {
    console.log(JSON.stringify(table, null, 2));
    return;
  }
  console.log(`Removed slot ${slotId} from table ${table.id}.`);
}

export async function runSchedulingTablesAddParticipants(tableId: string, body: string, opts: SchedulingTablesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"participants":[{"name":"Ada","email":"ada@example.com"}]}');
  const table = await client.schedulingTables.addParticipants(tableId, parsed);

  if (opts.json) {
    console.log(JSON.stringify(table, null, 2));
    return;
  }
  console.log(`Table ${table.id} now has ${table.participants.length} participant(s).`);
}

export async function runSchedulingTablesUpdateParticipant(tableId: string, participantId: string, body: string, opts: SchedulingTablesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"required":true}');
  const table = await client.schedulingTables.updateParticipant(tableId, participantId, parsed);

  if (opts.json) {
    console.log(JSON.stringify(table, null, 2));
    return;
  }
  console.log(`Updated participant ${participantId} on table ${table.id}.`);
}

export async function runSchedulingTablesRemoveParticipant(tableId: string, participantId: string, opts: SchedulingTablesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const table = await client.schedulingTables.removeParticipant(tableId, participantId);

  if (opts.json) {
    console.log(JSON.stringify(table, null, 2));
    return;
  }
  console.log(`Removed participant ${participantId} from table ${table.id}.`);
}

export async function runSchedulingTablesSendInvite(tableId: string, participantId: string, opts: { profile?: string }): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.schedulingTables.sendInvite(tableId, participantId);
  console.log(`Sent invite to participant ${participantId} on table ${tableId}.`);
}

export async function runSchedulingTablesSubmitResponses(tableId: string, participantId: string, body: string, opts: SchedulingTablesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"responses":[{"slotId":"s_123","availability":"yes"}]}');
  const table = await client.schedulingTables.submitResponses(tableId, participantId, parsed);

  if (opts.json) {
    console.log(JSON.stringify(table, null, 2));
    return;
  }
  console.log(`Submitted responses for participant ${participantId} on table ${table.id}.`);
}
