import { clientFor } from '../utils/api.js';

export interface AssistantsListOptions {
  profile?: string;
  json?: boolean;
}

export async function runAssistantsList(opts: AssistantsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const assistants = await client.assistants.list();

  if (opts.json) {
    console.log(JSON.stringify(assistants, null, 2));
    return;
  }
  if (!assistants.length) {
    console.log('No assistants found.');
    return;
  }
  for (const assistant of assistants) {
    console.log(`${assistant.id}  ${(assistant as any).name ?? ''}  ${(assistant as any).email ?? ''}`);
  }
}

export interface AssistantsGetOptions {
  profile?: string;
  json?: boolean;
}

export async function runAssistantsGet(assistantId: string, opts: AssistantsGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const assistant = await client.assistants.get(assistantId);
  console.log(JSON.stringify(assistant, null, 2));
}

export interface AssistantsGenerateOptions {
  profile?: string;
  json?: boolean;
}

export async function runAssistantsGenerate(name: string | undefined, opts: AssistantsGenerateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.assistants.generate(name);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${result.name}  (${result.emails.join(', ')})`);
}

export interface AssistantsDeleteOptions {
  profile?: string;
}

export async function runAssistantsDelete(assistantId: string, opts: AssistantsDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.assistants.delete(assistantId);
  console.log(`Deleted assistant ${assistantId}.`);
}
