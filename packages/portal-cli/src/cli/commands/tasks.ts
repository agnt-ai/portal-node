import { clientFor } from '../utils/api.js';
import type { PortalClient } from '../../index.js';

/**
 * `--assistant` is documented (and consistently used, e.g. `login --account`,
 * `tasks create ... --assistant travel@agnt.ai` in this command's own help
 * text) as an email address, but POST /tasks requires an assistant ObjectId —
 * passing the raw email straight through hits a Mongoose CastError server-
 * side ("Cast to ObjectId failed for value ... at path assistant"). Resolve
 * it here so the CLI's documented input actually works. A bare ObjectId
 * (no "@") passes through unresolved, in case a caller already has one.
 */
async function resolveAssistantId(client: PortalClient, assistantRef: string): Promise<string> {
  if (!assistantRef.includes('@')) return assistantRef;
  const assistants = await client.assistants.list();
  const match = assistants.find(a => a.email?.toLowerCase() === assistantRef.toLowerCase());
  if (!match) throw new Error(`No assistant found with email "${assistantRef}"`);
  return match.id;
}

export interface TasksListOptions {
  status?: string;
  search?: string;
  mine?: boolean;
  limit?: string;
  page?: string;
  profile?: string;
  json?: boolean;
}

export async function runTasksList(opts: TasksListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.tasks.list({
    status: opts.status as any,
    search: opts.search,
    mine: opts.mine ? true : undefined,
    perPage: opts.limit ? parseInt(opts.limit, 10) : undefined,
    page: opts.page ? parseInt(opts.page, 10) : undefined
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (!result.tasks.length) {
    console.log('No tasks found.');
    return;
  }

  for (const task of result.tasks) {
    console.log(`${task.id}  [${task.status}]  ${task.title}`);
  }
}

export interface TasksCreateOptions {
  assistant: string;
  description?: string;
  message?: string;
  profile?: string;
  json?: boolean;
}

export async function runTasksCreate(title: string, opts: TasksCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const assistantId = await resolveAssistantId(client, opts.assistant);
  const task = await client.tasks.create({ title, assistant: assistantId, description: opts.description });

  if (opts.message) {
    await client.tasks.sendMessage(task.id, opts.message);
  }

  if (opts.json) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }
  console.log(`Created task ${task.id}: ${task.title}`);
}

export interface TasksGetOptions {
  profile?: string;
  json?: boolean;
}

export async function runTasksGet(taskId: string, opts: TasksGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const task = await client.tasks.get(taskId);

  if (opts.json) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }
  console.log(`${task.id}  [${task.status}]  ${task.title}`);
  if (task.description) console.log(task.description);
}

export interface TaskActionOptions {
  profile?: string;
}

export async function runTasksDelete(taskId: string, opts: TaskActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.tasks.delete(taskId);
  console.log(`Deleted task ${taskId}.`);
}

export interface TasksMessageOptions extends TaskActionOptions {}

export async function runTasksMessage(taskId: string, message: string, opts: TasksMessageOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.tasks.sendMessage(taskId, message);
  console.log(`Sent message to task ${taskId}.`);
}

export async function runTasksResume(taskId: string, opts: TaskActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.tasks.resume(taskId);
  console.log(`Resumed task ${taskId}.`);
}

export async function runTasksStop(taskId: string, opts: TaskActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.tasks.stop(taskId);
  console.log(`Stopped task ${taskId}.`);
}

export async function runTasksMarkDone(taskId: string, opts: TaskActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.tasks.markDone(taskId);
  console.log(`Marked task ${taskId} done.`);
}

export async function runTasksArchive(taskId: string, opts: TaskActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.tasks.archive(taskId);
  console.log(`Archived task ${taskId}.`);
}

export async function runTasksUnarchive(taskId: string, opts: TaskActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.tasks.unarchive(taskId);
  console.log(`Unarchived task ${taskId}.`);
}

export interface TasksApproveOptions extends TaskActionOptions {
  reason?: string;
}

export async function runTasksApprove(taskId: string, opts: TasksApproveOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.tasks.approve(taskId, opts.reason);
  console.log(`Approved task ${taskId}.`);
}

export async function runTasksDecline(taskId: string, opts: TasksApproveOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.tasks.decline(taskId, opts.reason);
  console.log(`Declined task ${taskId}.`);
}

export interface TasksActivitiesOptions extends TaskActionOptions {
  json?: boolean;
}

export async function runTasksActivities(taskId: string, opts: TasksActivitiesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const activities = await client.tasks.listActivities(taskId);

  if (opts.json) {
    console.log(JSON.stringify(activities, null, 2));
    return;
  }

  if (!activities.length) {
    console.log('No activity yet.');
    return;
  }

  for (const activity of activities) {
    const who = activity.message?.role ?? activity.type;
    const text = activity.message?.content ?? `[${activity.type}]`;
    console.log(`${activity.createdAt}  ${who}: ${text}`);
  }
}
