import { clientFor } from '../utils/api.js';
import type { RevisionedKind } from '../../types.js';

const VALID_KINDS: RevisionedKind[] = ['memories', 'contacts', 'companies', 'preferences', 'tasks', 'profile'];

function assertValidKind(kind: string): asserts kind is RevisionedKind {
  if (!VALID_KINDS.includes(kind as RevisionedKind)) {
    console.error(`kind must be one of: ${VALID_KINDS.join(', ')}`);
    process.exit(1);
  }
}

export interface RevisionsListOptions {
  profile?: string;
  json?: boolean;
}

export async function runRevisionsList(kind: string, id: string | undefined, opts: RevisionsListOptions): Promise<void> {
  assertValidKind(kind);
  if (kind !== 'profile' && !id) {
    console.error(`<id> is required for kind "${kind}"`);
    process.exit(1);
  }
  const client = await clientFor(opts.profile);
  const result = await client.revisions.list(kind, id);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.revisions.length) {
    console.log('No revisions found.');
    return;
  }
  for (const rev of result.revisions) {
    console.log(`${rev.id}  ${rev.createdAt}  fields: ${rev.fieldsChanged.join(', ') || '(none)'}  by: ${rev.author?.kind}`);
  }
}

export interface RevisionsRestoreOptions {
  reason?: string;
  skipCapture?: boolean;
  profile?: string;
  json?: boolean;
}

export async function runRevisionsRestore(kind: string, id: string | undefined, revisionId: string, opts: RevisionsRestoreOptions): Promise<void> {
  assertValidKind(kind);
  if (kind !== 'profile' && !id) {
    console.error(`<id> is required for kind "${kind}"`);
    process.exit(1);
  }
  const client = await clientFor(opts.profile);
  const result = await client.revisions.restore(kind, id, revisionId, { reason: opts.reason, skipCapture: opts.skipCapture });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Restored ${result.model} ${result.parentId} to revision ${result.restoredFrom} — fields: ${result.fieldsRestored.join(', ')}.`);
}

export interface RevisionsFeedOptions {
  model?: string;
  authorKind?: 'user' | 'agent' | 'system';
  limit?: string;
  profile?: string;
  json?: boolean;
}

export async function runRevisionsFeed(opts: RevisionsFeedOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.revisions.listForUser({
    model: opts.model, authorKind: opts.authorKind, limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
  });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.revisions.length) {
    console.log('No revisions found.');
    return;
  }
  for (const rev of result.revisions) {
    console.log(`${rev.id}  ${rev.model}  ${rev.parentId}  ${rev.createdAt}  by: ${rev.author?.kind}`);
  }
}
