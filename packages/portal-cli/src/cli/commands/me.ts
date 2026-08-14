import { clientFor } from '../utils/api.js';

export interface MeOptions {
  profile?: string;
  json?: boolean;
}

export async function runMeGet(opts: MeOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const user = await client.me.get();
  console.log(JSON.stringify(user, null, 2));
}

export async function runMeUpdate(body: string, opts: MeOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.error('Update body must be valid JSON, e.g. \'{"firstName":"Ada"}\'');
    process.exit(1);
  }
  const user = await client.me.update(parsed);

  if (opts.json) {
    console.log(JSON.stringify(user, null, 2));
    return;
  }
  console.log('Profile updated.');
}
