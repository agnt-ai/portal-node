import { clientFor } from '../utils/api.js';

export interface DriveListOptions {
  search?: string;
  folder?: string;
  kind?: string;
  profile?: string;
  json?: boolean;
}

export async function runDriveList(opts: DriveListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.drive.list({ search: opts.search, folder: opts.folder, kind: opts.kind });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.driveFiles.length) {
    console.log('No files found.');
    return;
  }
  for (const file of result.driveFiles) {
    console.log(`${file.id}  ${file.name}  (${file.status})`);
  }
}

export interface DriveGetOptions {
  profile?: string;
  json?: boolean;
}

export async function runDriveGet(fileId: string, opts: DriveGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const file = await client.drive.get(fileId);
  console.log(JSON.stringify(file, null, 2));
}

export async function runDriveDownload(fileId: string, opts: DriveGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const url = await client.drive.getDownloadUrl(fileId);
  console.log(url);
}

export interface DriveActionOptions {
  profile?: string;
}

export async function runDriveRename(fileId: string, name: string, opts: DriveActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.drive.rename(fileId, name);
  console.log(`Renamed ${fileId} to "${name}".`);
}

export async function runDriveDelete(fileId: string, opts: DriveActionOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.drive.delete(fileId);
  console.log(`Deleted file ${fileId}.`);
}
