import type { FlowConfig } from '@flow/config';
import { TokenLoginSchema, type User } from '@flow/contracts';
import type { FlowStore } from '@flow/db';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export const sessionCookieName = 'flow_session';

function bearerToken(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization === undefined) return undefined;
  const [scheme, token] = authorization.split(' ', 2);
  return scheme?.toLowerCase() === 'bearer' && token !== undefined ? token : undefined;
}

function sessionToken(
  request: FastifyRequest,
  sessionSecret: string | undefined,
): string | undefined {
  const cookie = request.cookies[sessionCookieName];
  if (cookie === undefined) return undefined;
  if (sessionSecret === undefined) return cookie;
  const unsigned = request.unsignCookie(cookie);
  return unsigned.valid ? unsigned.value : undefined;
}

export function registerAuthentication(input: {
  app: FastifyInstance;
  store: FlowStore;
  config: FlowConfig;
}): void {
  const { app, store, config } = input;
  app.decorateRequest('flowUser', null);

  app.decorate('authenticate', async (request: FastifyRequest): Promise<void> => {
    let user: User | undefined;
    if (config.auth.mode === 'development') {
      user = await store.ensureDevelopmentUser();
    } else {
      const cookieToken = sessionToken(request, config.auth.sessionSecret);
      if (cookieToken !== undefined) user = await store.authenticateSession(cookieToken);
      const token = bearerToken(request);
      if (user === undefined && token !== undefined) {
        user = token.startsWith('flow_session_')
          ? await store.authenticateSession(token)
          : await store.authenticateApiToken(token);
      }
    }
    if (user === undefined) throw app.httpErrors.unauthorized('Authentication required');
    request.flowUser = user;
  });

  app.post('/v1/auth/token', async (request, reply) => {
    const body = TokenLoginSchema.parse(request.body);
    const user = await store.authenticateApiToken(body.token);
    if (user === undefined) throw app.httpErrors.unauthorized('Invalid or expired token');
    const session = await store.createSession(user.id, config.auth.sessionTtlHours);
    reply.setCookie(sessionCookieName, session.token, {
      path: '/',
      httpOnly: true,
      secure: config.environment === 'production',
      sameSite: 'strict',
      signed: config.auth.sessionSecret !== undefined,
      expires: new Date(session.expiresAt),
    });
    return { user, expiresAt: session.expiresAt };
  });

  app.post(
    '/v1/auth/logout',
    { preHandler: app.authenticate },
    async (request, reply): Promise<{ ok: true }> => {
      const token = sessionToken(request, config.auth.sessionSecret);
      if (token !== undefined) await store.revokeSession(token);
      reply.clearCookie(sessionCookieName, { path: '/' });
      return { ok: true };
    },
  );

  app.get(
    '/v1/auth/me',
    { preHandler: app.authenticate },
    async (request): Promise<{ user: User }> => ({ user: requireUser(request) }),
  );
}

export function requireUser(request: FastifyRequest): User {
  if (request.flowUser === null) throw new Error('Authentication invariant failed');
  return request.flowUser;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate(request: FastifyRequest): Promise<void>;
  }
}
