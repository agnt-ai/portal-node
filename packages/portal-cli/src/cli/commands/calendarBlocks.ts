import { clientFor } from '../utils/api.js';

export interface CalendarBlocksListOptions {
  startsAt?: string;
  endsAt?: string;
  profile?: string;
  json?: boolean;
}

export async function runCalendarBlocksList(opts: CalendarBlocksListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const blocks = await client.calendarBlocks.list(opts.startsAt, opts.endsAt);

  if (opts.json) {
    console.log(JSON.stringify(blocks, null, 2));
    return;
  }
  if (!blocks.length) {
    console.log('No calendar blocks found.');
    return;
  }
  for (const block of blocks) {
    console.log(`${block.id}  ${block.startsAt} → ${block.endsAt}  ${block.title ?? ''}`);
  }
}

export interface CalendarBlocksCreateOptions {
  profile?: string;
  json?: boolean;
}

export async function runCalendarBlocksCreate(body: string, opts: CalendarBlocksCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error('Body must be valid JSON, e.g. \'{"startsAt":"2026-01-01T09:00:00Z","endsAt":"2026-01-01T10:00:00Z","title":"Focus time"}\'');
    process.exit(1);
  }
  const block = await client.calendarBlocks.create(parsed);

  if (opts.json) {
    console.log(JSON.stringify(block, null, 2));
    return;
  }
  console.log(`Created calendar block ${block.id}.`);
}

export async function runCalendarBlocksUpdate(blockId: string, body: string, opts: CalendarBlocksCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error('Body must be valid JSON, e.g. \'{"title":"Renamed"}\'');
    process.exit(1);
  }
  const block = await client.calendarBlocks.update(blockId, parsed);

  if (opts.json) {
    console.log(JSON.stringify(block, null, 2));
    return;
  }
  console.log(`Updated calendar block ${block.id}.`);
}

export interface CalendarBlocksDeleteOptions {
  profile?: string;
}

export async function runCalendarBlocksDelete(blockId: string, opts: CalendarBlocksDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.calendarBlocks.delete(blockId);
  console.log(`Deleted calendar block ${blockId}.`);
}
