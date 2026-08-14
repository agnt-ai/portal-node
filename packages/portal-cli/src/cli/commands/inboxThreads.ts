import { clientFor } from '../utils/api.js';

export interface InboxThreadsListOptions {
  assistantId?: string;
  status?: string;
  q?: string;
  platform?: string;
  profile?: string;
  json?: boolean;
}

export async function runInboxThreadsList(opts: InboxThreadsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.inboxThreads.list({
    assistantId: opts.assistantId, status: opts.status, q: opts.q, platform: opts.platform,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.threads.length) {
    console.log('No inbox threads found.');
    return;
  }
  for (const thread of result.threads) {
    console.log(`${thread.id}  ${(thread as any).subject ?? '(no subject)'}  [${(thread as any).status}]`);
  }
}

export interface InboxThreadsEmailsOptions {
  profile?: string;
  json?: boolean;
}

export async function runInboxThreadsEmails(threadId: string, opts: InboxThreadsEmailsOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const emails = await client.inboxThreads.listEmails(threadId);

  if (opts.json) {
    console.log(JSON.stringify(emails, null, 2));
    return;
  }
  if (!emails.length) {
    console.log('No emails in this thread.');
    return;
  }
  for (const email of emails) {
    console.log(`${email.id}  ${(email as any).from}  ${(email as any).sentAt ?? ''}  ${(email as any).snippet ?? ''}`);
  }
}

export interface InboxThreadsUpdateOptions {
  profile?: string;
  json?: boolean;
}

export async function runInboxThreadsUpdate(threadId: string, status: string, opts: InboxThreadsUpdateOptions): Promise<void> {
  if (status !== 'active' && status !== 'archived') {
    console.error('status must be one of: active, archived');
    process.exit(1);
  }
  const client = await clientFor(opts.profile);
  const result = await client.inboxThreads.update(threadId, status);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Thread ${result.id} is now ${result.status}.`);
}

export interface InboxThreadsDeleteOptions {
  profile?: string;
}

export async function runInboxThreadsDelete(threadId: string, opts: InboxThreadsDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.inboxThreads.delete(threadId);
  console.log(`Deleted thread ${threadId}.`);
}
