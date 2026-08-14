import { clientFor } from '../utils/api.js';

export interface ContextsListOptions {
  resourceType?: string;
  tags?: string;
  status?: string;
  profile?: string;
  json?: boolean;
}

export async function runContextsList(opts: ContextsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.contexts.list({ resourceType: opts.resourceType, tags: opts.tags, status: opts.status });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.contexts.length) {
    console.log('No contexts found.');
    return;
  }
  for (const ctx of result.contexts) {
    console.log(`${ctx.id}  ${ctx.resourceType}  tags: ${ctx.tags.join(', ') || '(none)'}`);
  }
}

export interface ContextsGetOptions {
  profile?: string;
}

export async function runContextsGet(contextId: string, opts: ContextsGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const ctx = await client.contexts.get(contextId);
  console.log(JSON.stringify(ctx, null, 2));
}

function parseJsonBody(body: string, example: string): any {
  try {
    return JSON.parse(body);
  } catch {
    console.error(`Body must be valid JSON, e.g. '${example}'`);
    process.exit(1);
  }
}

export interface ContextsCreateOptions {
  profile?: string;
  json?: boolean;
}

export async function runContextsCreate(body: string, opts: ContextsCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"resourceType":"task","data":{"summary":"..."}}');
  const ctx = await client.contexts.create(parsed);

  if (opts.json) {
    console.log(JSON.stringify(ctx, null, 2));
    return;
  }
  console.log(`Created context ${ctx.id}.`);
}

export async function runContextsUpdate(contextId: string, body: string, opts: ContextsCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const parsed = parseJsonBody(body, '{"tags":["important"]}');
  const ctx = await client.contexts.update(contextId, parsed);

  if (opts.json) {
    console.log(JSON.stringify(ctx, null, 2));
    return;
  }
  console.log(`Updated context ${ctx.id}.`);
}

export interface ContextsDeleteOptions {
  profile?: string;
}

export async function runContextsDelete(contextId: string, opts: ContextsDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.contexts.delete(contextId);
  console.log(`Deleted context ${contextId}.`);
}
