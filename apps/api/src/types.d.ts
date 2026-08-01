import type { User } from '@flow/contracts';

declare module 'fastify' {
  interface FastifyRequest {
    flowUser: User | null;
  }
}
