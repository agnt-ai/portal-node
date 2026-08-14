import { clientFor } from '../utils/api.js';

export interface TagsListOptions {
  kind?: 'all' | 'contact' | 'company';
  prefix?: string;
  limit?: string;
  profile?: string;
  json?: boolean;
}

export async function runTagsList(opts: TagsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const tags = await client.tags.list({
    kind: opts.kind,
    prefix: opts.prefix,
    limit: opts.limit ? parseInt(opts.limit, 10) : undefined
  });

  if (opts.json) {
    console.log(JSON.stringify(tags, null, 2));
    return;
  }
  if (!tags.length) {
    console.log('No tags found.');
    return;
  }
  console.log(tags.join('\n'));
}
