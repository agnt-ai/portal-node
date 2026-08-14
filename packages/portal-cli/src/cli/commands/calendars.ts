import { clientFor } from '../utils/api.js';

export interface CalendarsListOptions {
  profile?: string;
  json?: boolean;
}

export async function runCalendarsList(opts: CalendarsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const calendars = await client.calendars.list();

  if (opts.json) {
    console.log(JSON.stringify(calendars, null, 2));
    return;
  }
  if (!calendars.length) {
    console.log('No calendars found.');
    return;
  }
  for (const calendar of calendars) {
    console.log(`${calendar.id}  ${(calendar as any).name ?? (calendar as any).summary ?? ''}`);
  }
}

export interface EventsListOptions {
  from: string;
  to: string;
  timezone?: string;
  profile?: string;
  json?: boolean;
}

export async function runEventsList(calendarId: string, opts: EventsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const events = await client.calendars.listEvents(calendarId, opts.from, opts.to, opts.timezone);

  if (opts.json) {
    console.log(JSON.stringify(events, null, 2));
    return;
  }
  if (!events.length) {
    console.log('No events found in that range.');
    return;
  }
  for (const event of events) {
    console.log(`${event.id}  ${event.start} → ${event.end}  ${event.title}`);
  }
}

export interface EventsCreateOptions {
  start: string;
  end: string;
  description?: string;
  location?: string;
  profile?: string;
  json?: boolean;
}

export async function runEventsCreate(calendarId: string, title: string, opts: EventsCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const event = await client.calendars.createEvent(calendarId, {
    title,
    start: opts.start,
    end: opts.end,
    description: opts.description,
    location: opts.location
  });

  if (opts.json) {
    console.log(JSON.stringify(event, null, 2));
    return;
  }
  console.log(`Created event ${event.id}: ${event.title} (${event.start} → ${event.end})`);
}

export interface EventsDeleteLinkOptions {
  profile?: string;
}

export async function runEventsLinkTask(calendarId: string, eventId: string, taskId: string, opts: EventsDeleteLinkOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.calendars.linkTask(calendarId, eventId, taskId);
  console.log(`Linked task ${taskId} to event ${eventId}.`);
}
