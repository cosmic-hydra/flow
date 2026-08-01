import { CreateConversationSchema, SendMessageSchema } from '@flow/contracts';
import type { ChatService } from '@flow/ai';
import type { FlowStore } from '@flow/db';
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../auth.js';

export function registerConversationRoutes(
  app: FastifyInstance,
  input: { store: FlowStore; chat: ChatService },
): void {
  app.get('/v1/conversations', { preHandler: app.authenticate }, async (request) => {
    const user = requireUser(request);
    return { conversations: await input.store.listConversations(user.id) };
  });

  app.post('/v1/conversations', { preHandler: app.authenticate }, async (request, reply) => {
    const user = requireUser(request);
    const body = CreateConversationSchema.parse(request.body ?? {});
    const conversation = await input.store.createConversation(user.id, body.title);
    reply.code(201);
    return { conversation };
  });

  app.get(
    '/v1/conversations/:conversationId/messages',
    { preHandler: app.authenticate },
    async (request) => {
      const user = requireUser(request);
      const { conversationId } = request.params as { conversationId: string };
      const conversation = await input.store.getConversation(user.id, conversationId);
      if (conversation === undefined) throw app.httpErrors.notFound('Conversation not found');
      return { messages: await input.store.listMessages(user.id, conversationId, 200) };
    },
  );

  app.post(
    '/v1/conversations/:conversationId/messages',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request) => {
      const user = requireUser(request);
      const { conversationId } = request.params as { conversationId: string };
      const body = SendMessageSchema.parse(request.body);
      return input.chat.sendMessage(user, conversationId, body);
    },
  );
}
