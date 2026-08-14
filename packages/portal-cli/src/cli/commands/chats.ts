import { clientFor } from '../utils/api.js';

export interface ChatsListOptions {
  status?: 'active' | 'archived';
  assistantId?: string;
  platform?: string;
  profile?: string;
  json?: boolean;
}

export async function runChatsList(opts: ChatsListOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.chats.list({ status: opts.status, assistantId: opts.assistantId, platform: opts.platform });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.chats.length) {
    console.log('No chats found.');
    return;
  }
  for (const chat of result.chats) {
    console.log(`${chat.id}  ${chat.platform ?? 'chat'}  ${chat.assistant ?? ''}`);
  }
}

export interface ChatsGetOptions {
  profile?: string;
  json?: boolean;
}

export async function runChatsGet(chatId: string, opts: ChatsGetOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const chat = await client.chats.get(chatId);
  if (opts.json) {
    console.log(JSON.stringify(chat, null, 2));
    return;
  }
  console.log(JSON.stringify(chat, null, 2));
}

export interface ChatsMessagesOptions {
  profile?: string;
  json?: boolean;
}

export async function runChatsMessages(chatId: string, opts: ChatsMessagesOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  const result = await client.chats.listMessages(chatId);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!result.messages.length) {
    console.log('No messages yet.');
    return;
  }
  for (const message of result.messages) {
    console.log(`${message.role ?? 'user'}: ${(message as any).content ?? ''}`);
  }
}

export interface ChatsProcessOptions {
  profile?: string;
  json?: boolean;
}

export async function runChatsProcess(chatId: string, message: string, opts: ChatsProcessOptions): Promise<void> {
  const client = await clientFor(opts.profile);

  try {
    for await (const evt of client.chats.process(chatId, { message })) {
      if (opts.json) {
        console.log(JSON.stringify(evt));
        continue;
      }
      if (evt.event === 'status_update') {
        console.log(`… ${evt.data.message}`);
      } else if (evt.event === 'message') {
        const content = (evt.data as any).content ?? (evt.data as any).message?.content ?? JSON.stringify(evt.data);
        console.log(content);
      }
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

export interface ChatsDeleteOptions {
  profile?: string;
}

export async function runChatsDelete(chatId: string, opts: ChatsDeleteOptions): Promise<void> {
  const client = await clientFor(opts.profile);
  await client.chats.delete(chatId);
  console.log(`Deleted chat ${chatId}.`);
}
