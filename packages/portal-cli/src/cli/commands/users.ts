import { clientFor } from '../utils/api.js';

export interface UsersListOptions {
  profile?: string;
  json?: boolean;
}

export async function runUsersList(opts: UsersListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.users.list();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.users.length) {
    console.log('No users found.');
    return;
  }
  for (const user of result.users) {
    console.log(`${user.id}  ${(user as any).email ?? ''}  ${(user as any).name ?? ''}`);
  }
}

export interface UsersGetOptions {
  profile?: string;
  json?: boolean;
}

export async function runUsersGet(userId: string, opts: UsersGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const user = await client.users.get(userId);
  console.log(JSON.stringify(user, null, 2));
}

export interface UsersDeleteOptions {
  profile?: string;
}

export async function runUsersDelete(userId: string, opts: UsersDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.users.delete(userId);
  console.log(`Deleted user ${userId}.`);
}
