import type { HttpClient } from '../HttpClient.js';
import type {
  Chat, ChatMessage, CreateChatBody, AddMessageBody, ListChatsParams,
  ChatsPage, MessagesPage, ProcessChatEvent
} from '../types.js';

export class ChatsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListChatsParams): Promise<ChatsPage> {
    const query: Record<string, any> = { ...params };
    if (Array.isArray(params?.platform)) query.platform = params!.platform.join(',');
    const r = await this.http.get<any>('/chats', query);
    return { chats: r.chats ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  async search(query: string, opts?: { platform?: string; since?: string; until?: string; assistantId?: string; limit?: number }): Promise<Chat[]> {
    const r = await this.http.get<any>('/chats/search', { q: query, ...opts });
    return r.chats ?? [];
  }

  async create(body: CreateChatBody): Promise<Chat> {
    const r = await this.http.post<any>('/chats', body);
    return r.chat;
  }

  async get(chatId: string): Promise<Chat> {
    const r = await this.http.get<any>(`/chats/${chatId}`);
    return r.chat;
  }

  async delete(chatId: string): Promise<void> {
    await this.http.delete(`/chats/${chatId}`);
  }

  async listMessages(chatId: string, params?: { page?: number; perPage?: number }): Promise<MessagesPage> {
    const r = await this.http.get<any>(`/chats/${chatId}/messages`, params);
    return { messages: r.messages ?? [], total: r.total ?? 0, page: r.page ?? 1, perPage: r.perPage ?? 50 };
  }

  /** Saves a message WITHOUT triggering assistant processing — use process() to also get a reply. */
  async addMessage(chatId: string, body: AddMessageBody): Promise<ChatMessage> {
    const r = await this.http.post<any>(`/chats/${chatId}/messages`, body);
    return r.message;
  }

  async getMessage(chatId: string, messageId: string): Promise<ChatMessage> {
    const r = await this.http.get<any>(`/chats/${chatId}/messages/${messageId}`);
    return r.message;
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    await this.http.delete(`/chats/${chatId}/messages/${messageId}`);
  }

  async addReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    await this.http.post(`/chats/${chatId}/messages/${messageId}/reactions`, { emoji });
  }

  async removeReaction(chatId: string, messageId: string, emoji: string): Promise<void> {
    await this.http.delete(`/chats/${chatId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
  }

  /**
   * Sends a message and streams the assistant's reply live (Server-Sent
   * Events) — the CLI/agent equivalent of typing in the chat and watching
   * the response come in. Yields status_update/interim_message events as
   * they arrive, then a final `message` event; throws on an `error` event.
   *
   * @example
   *   for await (const evt of client.chats.process(chatId, { message: 'hi' })) {
   *     if (evt.event === 'message') console.log(evt.data);
   *   }
   */
  async *process(chatId: string, body?: { message?: string; files?: unknown[] }): AsyncGenerator<ProcessChatEvent> {
    for await (const raw of this.http.stream(`/chats/${chatId}/process`, body ?? {})) {
      const event = raw as ProcessChatEvent;
      yield event;
      if (event.event === 'error') {
        throw new Error(typeof event.data === 'object' && event.data && 'error' in event.data ? String((event.data as any).error) : 'Chat processing failed');
      }
    }
  }

  /** Fire-and-forget: pre-warm this chat's context so the next process() call is faster. */
  warm(chatId: string): void {
    this.http.post(`/chats/${chatId}/warm`).catch(() => {});
  }
}
