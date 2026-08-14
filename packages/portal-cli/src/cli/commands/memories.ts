import { clientFor } from '../utils/api.js';

export interface MemoriesListOptions {
  tag?: string;
  profile?: string;
  json?: boolean;
}

export async function runMemoriesList(opts: MemoriesListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const memories = await client.memories.list(opts.tag);

  if (opts.json) {
    console.log(JSON.stringify(memories, null, 2));
    return;
  }
  if (!memories.length) {
    console.log('No memories found.');
    return;
  }
  for (const memory of memories) {
    const tags = memory.tags?.length ? `  [${memory.tags.join(', ')}]` : '';
    console.log(`${memory.id}  ${memory.content}${tags}`);
  }
}

export interface MemoriesCreateOptions {
  tags?: string;
  profile?: string;
  json?: boolean;
}

export async function runMemoriesCreate(content: string, opts: MemoriesCreateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const memory = await client.memories.create({
    content,
    tags: opts.tags ? opts.tags.split(',').map((t) => t.trim()) : []
  });

  if (opts.json) {
    console.log(JSON.stringify(memory, null, 2));
    return;
  }
  console.log(`Created memory ${memory.id}.`);
}

export interface MemoriesUpdateOptions {
  content?: string;
  tags?: string;
  profile?: string;
  json?: boolean;
}

export async function runMemoriesUpdate(memoryId: string, opts: MemoriesUpdateOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const memory = await client.memories.update(memoryId, {
    content: opts.content,
    tags: opts.tags ? opts.tags.split(',').map((t) => t.trim()) : undefined
  });

  if (opts.json) {
    console.log(JSON.stringify(memory, null, 2));
    return;
  }
  console.log(`Updated memory ${memoryId}.`);
}

export interface MemoriesDeleteOptions {
  profile?: string;
}

export async function runMemoriesDelete(memoryId: string, opts: MemoriesDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.memories.delete(memoryId);
  console.log(`Deleted memory ${memoryId}.`);
}
