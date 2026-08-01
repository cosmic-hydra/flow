import type { Message, User } from '@flow/contracts';
import type { CreateMessageInput, FlowStore } from '@flow/db';
import { describe, expect, it, vi } from 'vitest';
import type { BookingChatAgent } from './agent.js';
import { ChatService } from './chat-service.js';

const user: User = {
  id: '40000000-0000-4000-8000-000000000001',
  email: 'test@flow.local',
  displayName: 'Test user',
  timezone: 'UTC',
  createdAt: '2026-08-01T10:00:00.000Z',
};
const conversationId = '40000000-0000-4000-8000-000000000002';
const clientMessageId = '40000000-0000-4000-8000-000000000003';

describe('chat service idempotency', () => {
  it('returns the cached assistant response when a client message is retried', async () => {
    const messages: Message[] = [];
    const clientMessages = new Map<string, Message>();
    let messageSequence = 10;
    const appendMessage = async (input: CreateMessageInput) => {
      if (input.clientMessageId !== undefined) {
        const existing = clientMessages.get(input.clientMessageId);
        if (existing !== undefined) return { message: existing, created: false };
      }
      messageSequence += 1;
      const message: Message = {
        id: `40000000-0000-4000-8000-${String(messageSequence).padStart(12, '0')}`,
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        metadata: input.metadata ?? {},
        createdAt: new Date(1_785_560_000_000 + messageSequence).toISOString(),
      };
      messages.push(message);
      if (input.clientMessageId !== undefined) {
        clientMessages.set(input.clientMessageId, message);
      }
      return { message, created: true };
    };
    const store = {
      getConversation: async () => ({
        id: conversationId,
        userId: user.id,
        title: 'Test',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
      }),
      appendMessage,
      listMessages: async () => [...messages],
    } as unknown as FlowStore;
    const respond = vi.fn().mockResolvedValue({
      content: 'I found the best options.',
      bookingIds: [],
      toolCalls: [],
    });
    const agent = { respond } as unknown as BookingChatAgent;
    const service = new ChatService({ store, agent });

    const first = await service.sendMessage(user, conversationId, {
      content: 'Find two seats',
      clientMessageId,
    });
    const retried = await service.sendMessage(user, conversationId, {
      content: 'Find two seats',
      clientMessageId,
    });

    expect(respond).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: 'UTC', currentTime: expect.any(String) }),
      expect.any(Array),
    );
    expect(messages).toHaveLength(2);
    expect(retried).toEqual(first);
  });
});
