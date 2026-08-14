import { clientFor } from '../utils/api.js';

export interface NotificationsListOptions {
  archived?: boolean;
  profile?: string;
  json?: boolean;
}

export async function runNotificationsList(opts: NotificationsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const notifications = await client.notifications.list(opts.archived ?? false);

  if (opts.json) {
    console.log(JSON.stringify(notifications, null, 2));
    return;
  }
  if (!notifications.length) {
    console.log('No notifications.');
    return;
  }
  for (const item of notifications) {
    console.log(`${item.id}  ${(item as any).title ?? (item as any).message ?? ''}`);
  }
}

export interface NotificationActionOptions {
  profile?: string;
}

export async function runNotificationsMarkRead(itemId: string, opts: NotificationActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.notifications.markRead(itemId);
  console.log(`Marked ${itemId} read.`);
}

export async function runNotificationsArchive(itemId: string, opts: NotificationActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.notifications.archive(itemId);
  console.log(`Archived ${itemId}.`);
}

export async function runNotificationsDelete(itemId: string, opts: NotificationActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.notifications.delete(itemId);
  console.log(`Deleted ${itemId}.`);
}

export async function runNotificationsMarkAllRead(opts: NotificationActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.notifications.markAllRead();
  console.log('Marked all notifications read.');
}
