import { clientFor } from '../utils/api.js';
import type { TrashKind } from '../../types.js';

export interface TrashListOptions {
  profile?: string;
  json?: boolean;
}

export async function runTrashList(kind: TrashKind, opts: TrashListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.trash.list(kind);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.items.length) {
    console.log('Nothing in trash.');
    return;
  }
  for (const item of result.items) {
    console.log(`${item.id}  ${item.name ?? item.title ?? ''}  (retained until ${item.retentionUntil})`);
  }
}

export interface TrashRestoreOptions {
  profile?: string;
}

export async function runTrashRestore(kind: TrashKind, id: string, opts: TrashRestoreOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.trash.restore(kind, id);
  console.log(`Restored ${id}.${result.cascadeHint ? ` (${result.cascadeHint})` : ''}`);
}
