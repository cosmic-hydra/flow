import { randomUUID } from 'node:crypto';
import {
  ChatResponseSchema,
  type ChatResponse,
  type Message,
  type SendMessageInput,
  type User,
} from '@flow/contracts';
import { DomainError } from '@flow/core';
import type { FlowStore } from '@flow/db';
import type { BookingChatAgent } from './agent.js';

export class ChatService {
  readonly #store: FlowStore;
  readonly #agent: BookingChatAgent;

  constructor(input: { store: FlowStore; agent: BookingChatAgent }) {
    this.#store = input.store;
    this.#agent = input.agent;
  }

  async sendMessage(
    user: User,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<ChatResponse> {
    const conversation = await this.#store.getConversation(user.id, conversationId);
    if (conversation === undefined) throw new Error('Conversation not found');
    const messageInput: {
      conversationId: string;
      role: 'user';
      content: string;
      clientMessageId?: string;
    } = { conversationId, role: 'user', content: input.content };
    if (input.clientMessageId !== undefined) messageInput.clientMessageId = input.clientMessageId;
    const appended = await this.#store.appendMessage(messageInput);
    let history = await this.#store.listMessages(user.id, conversationId, 100);
    if (!appended.created && input.clientMessageId !== undefined) {
      const cached = this.#cachedResponse(history, input.clientMessageId);
      if (cached !== undefined) return cached;
      if (Date.now() - Date.parse(appended.message.createdAt) < 5 * 60_000) {
        throw new DomainError(
          'chat_request_in_progress',
          'This message is already being processed',
        );
      }
      history = await this.#store.listMessages(user.id, conversationId, 100);
    }
    const response = await this.#agent.respond(
      {
        userId: user.id,
        conversationId,
        timezone: user.timezone,
        currentTime: new Date().toISOString(),
      },
      history,
    );
    const { message } = await this.#store.appendMessage({
      conversationId,
      role: 'assistant',
      content: response.content,
      metadata: {
        responseId: randomUUID(),
        clientMessageId: input.clientMessageId,
        bookingIds: response.bookingIds,
        toolCalls: response.toolCalls,
      },
    });
    return { message, bookingIds: response.bookingIds, toolCalls: response.toolCalls };
  }

  #cachedResponse(messages: readonly Message[], clientMessageId: string): ChatResponse | undefined {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role !== 'assistant' || message.metadata.clientMessageId !== clientMessageId) {
        continue;
      }
      const parsed = ChatResponseSchema.safeParse({
        message,
        bookingIds: message.metadata.bookingIds,
        toolCalls: message.metadata.toolCalls,
      });
      if (parsed.success) return parsed.data;
    }
    return undefined;
  }
}
