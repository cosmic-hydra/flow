import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './primitives.js';

export const MessageRoleSchema = z.enum(['user', 'assistant', 'tool', 'system']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageSchema = z
  .object({
    id: IdSchema,
    conversationId: IdSchema,
    role: MessageRoleSchema,
    content: z.string().max(100_000),
    toolName: z.string().max(100).optional(),
    toolCallId: z.string().max(200).optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: IsoDateTimeSchema,
  })
  .strict();
export type Message = z.infer<typeof MessageSchema>;

export const ConversationSchema = z
  .object({
    id: IdSchema,
    userId: IdSchema,
    title: z.string().trim().min(1).max(200),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type Conversation = z.infer<typeof ConversationSchema>;

export const CreateConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(200).default('New booking'),
  })
  .strict();

export const SendMessageSchema = z
  .object({
    content: z.string().trim().min(1).max(20_000),
    clientMessageId: z.uuid().optional(),
  })
  .strict();
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const ChatResponseSchema = z
  .object({
    message: MessageSchema,
    bookingIds: z.array(IdSchema),
    toolCalls: z.array(
      z
        .object({
          name: z.string(),
          status: z.enum(['succeeded', 'failed']),
        })
        .strict(),
    ),
  })
  .strict();
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
