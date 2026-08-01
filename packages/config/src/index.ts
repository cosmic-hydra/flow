import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

function loadRepositoryEnvironment(): void {
  let directory = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    const packagePath = join(directory, 'package.json');
    if (existsSync(packagePath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packagePath, 'utf8')) as {
          name?: unknown;
        };
        if (packageJson.name === '@flow/root') {
          const environmentPath = join(directory, '.env');
          if (existsSync(environmentPath)) process.loadEnvFile(environmentPath);
          return;
        }
      } catch {
        return;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

const EmptyToUndefined = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value.trim() === '' ? undefined : value.trim()));

const BooleanString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true');

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    FLOW_HOST: z.string().default('127.0.0.1'),
    FLOW_PORT: z.coerce.number().int().min(1).max(65_535).default(4010),
    FLOW_WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    FLOW_DATABASE_URL: z.string().url().default('postgres://flow:flow@localhost:5432/flow'),
    FLOW_AUTH_MODE: z.enum(['development', 'required']).default('development'),
    FLOW_SESSION_SECRET: EmptyToUndefined,
    FLOW_SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 365)
      .default(168),
    FLOW_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    OPENAI_API_KEY: EmptyToUndefined,
    FLOW_OPENAI_MODEL: z.string().trim().min(1).default('gpt-5.6-sol'),
    FLOW_OPENAI_REASONING_EFFORT: z
      .enum(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
      .default('medium'),
    FLOW_ENABLE_WEB_DEAL_RESEARCH: BooleanString,
    FLOW_WEBCMD_PATH: z.string().trim().min(1).default('webcmd'),
    FLOW_WEBCMD_PROFILE: z.string().trim().min(1).max(80).default('flow'),
    FLOW_WEBCMD_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(45_000),
    FLOW_ENABLE_WEBCMD: BooleanString,
    FLOW_BMS_BOT_PATH: EmptyToUndefined,
    FLOW_BMS_BOT_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(900_000).default(180_000),
    FLOW_BMS_BOT_HANDOFF_TTL_MS: z.coerce
      .number()
      .int()
      .min(60_000)
      .max(1_800_000)
      .default(600_000),
    FLOW_UIPATH_BASE_URL: EmptyToUndefined,
    FLOW_UIPATH_ACCESS_TOKEN: EmptyToUndefined,
    FLOW_UIPATH_FOLDER_ID: EmptyToUndefined,
    FLOW_UIPATH_RELEASE_KEY: EmptyToUndefined,
    FLOW_WORKER_ID: EmptyToUndefined,
    FLOW_WORKER_POLL_MS: z.coerce.number().int().min(250).max(60_000).default(2_000),
    FLOW_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
    FLOW_JOB_LEASE_SECONDS: z.coerce.number().int().min(30).max(3_600).default(120),
    FLOW_MAX_COUPON_ATTEMPTS: z.coerce.number().int().min(0).max(25).default(8),
  })
  .passthrough();

export interface FlowConfig {
  environment: 'development' | 'test' | 'production';
  server: {
    host: string;
    port: number;
    webOrigin: string;
    logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  };
  database: {
    url: string;
  };
  auth: {
    mode: 'development' | 'required';
    sessionSecret?: string;
    sessionTtlHours: number;
  };
  openai: {
    apiKey?: string;
    model: string;
    reasoningEffort: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    webDealResearchEnabled: boolean;
  };
  webcmd: {
    enabled: boolean;
    path: string;
    profile: string;
    timeoutMs: number;
  };
  bmsBot: {
    path?: string;
    timeoutMs: number;
    handoffTtlMs: number;
  };
  uiPath: {
    baseUrl?: string;
    accessToken?: string;
    folderId?: string;
    releaseKey?: string;
  };
  worker: {
    id: string;
    pollMs: number;
    concurrency: number;
    leaseSeconds: number;
  };
  deals: {
    maxCouponAttempts: number;
  };
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): FlowConfig {
  if (environment === process.env) loadRepositoryEnvironment();
  const parsed = EnvironmentSchema.parse(environment);

  if (parsed.NODE_ENV === 'production' && parsed.FLOW_AUTH_MODE !== 'required') {
    throw new Error('FLOW_AUTH_MODE must be required in production');
  }
  if (
    parsed.FLOW_AUTH_MODE === 'required' &&
    (parsed.FLOW_SESSION_SECRET === undefined || parsed.FLOW_SESSION_SECRET.length < 32)
  ) {
    throw new Error(
      'FLOW_SESSION_SECRET must contain at least 32 characters when auth is required',
    );
  }

  const uiPathValues = [
    parsed.FLOW_UIPATH_BASE_URL,
    parsed.FLOW_UIPATH_ACCESS_TOKEN,
    parsed.FLOW_UIPATH_FOLDER_ID,
    parsed.FLOW_UIPATH_RELEASE_KEY,
  ];
  const configuredUiPathValues = uiPathValues.filter((value) => value !== undefined).length;
  if (configuredUiPathValues !== 0 && configuredUiPathValues !== uiPathValues.length) {
    throw new Error('All FLOW_UIPATH_* settings are required when the UiPath provider is enabled');
  }

  const auth: FlowConfig['auth'] = {
    mode: parsed.FLOW_AUTH_MODE,
    sessionTtlHours: parsed.FLOW_SESSION_TTL_HOURS,
  };
  if (parsed.FLOW_SESSION_SECRET !== undefined) auth.sessionSecret = parsed.FLOW_SESSION_SECRET;

  const openai: FlowConfig['openai'] = {
    model: parsed.FLOW_OPENAI_MODEL,
    reasoningEffort: parsed.FLOW_OPENAI_REASONING_EFFORT,
    webDealResearchEnabled: parsed.FLOW_ENABLE_WEB_DEAL_RESEARCH,
  };
  if (parsed.OPENAI_API_KEY !== undefined) openai.apiKey = parsed.OPENAI_API_KEY;

  const bmsBot: FlowConfig['bmsBot'] = {
    timeoutMs: parsed.FLOW_BMS_BOT_TIMEOUT_MS,
    handoffTtlMs: parsed.FLOW_BMS_BOT_HANDOFF_TTL_MS,
  };
  if (parsed.FLOW_BMS_BOT_PATH !== undefined) bmsBot.path = parsed.FLOW_BMS_BOT_PATH;

  const uiPath: FlowConfig['uiPath'] = {};
  if (parsed.FLOW_UIPATH_BASE_URL !== undefined) uiPath.baseUrl = parsed.FLOW_UIPATH_BASE_URL;
  if (parsed.FLOW_UIPATH_ACCESS_TOKEN !== undefined) {
    uiPath.accessToken = parsed.FLOW_UIPATH_ACCESS_TOKEN;
  }
  if (parsed.FLOW_UIPATH_FOLDER_ID !== undefined) uiPath.folderId = parsed.FLOW_UIPATH_FOLDER_ID;
  if (parsed.FLOW_UIPATH_RELEASE_KEY !== undefined) {
    uiPath.releaseKey = parsed.FLOW_UIPATH_RELEASE_KEY;
  }

  return {
    environment: parsed.NODE_ENV,
    server: {
      host: parsed.FLOW_HOST,
      port: parsed.FLOW_PORT,
      webOrigin: parsed.FLOW_WEB_ORIGIN,
      logLevel: parsed.FLOW_LOG_LEVEL,
    },
    database: { url: parsed.FLOW_DATABASE_URL },
    auth,
    openai,
    webcmd: {
      enabled: parsed.FLOW_ENABLE_WEBCMD,
      path: parsed.FLOW_WEBCMD_PATH,
      profile: parsed.FLOW_WEBCMD_PROFILE,
      timeoutMs: parsed.FLOW_WEBCMD_TIMEOUT_MS,
    },
    bmsBot,
    uiPath,
    worker: {
      id: parsed.FLOW_WORKER_ID ?? `worker-${randomUUID()}`,
      pollMs: parsed.FLOW_WORKER_POLL_MS,
      concurrency: parsed.FLOW_WORKER_CONCURRENCY,
      leaseSeconds: parsed.FLOW_JOB_LEASE_SECONDS,
    },
    deals: { maxCouponAttempts: parsed.FLOW_MAX_COUPON_ATTEMPTS },
  };
}

export function redactedConfig(config: FlowConfig): Record<string, unknown> {
  return {
    environment: config.environment,
    server: config.server,
    database: { configured: config.database.url.length > 0 },
    auth: { mode: config.auth.mode, sessionTtlHours: config.auth.sessionTtlHours },
    openai: {
      configured: config.openai.apiKey !== undefined,
      model: config.openai.model,
      webDealResearchEnabled: config.openai.webDealResearchEnabled,
    },
    webcmd: { ...config.webcmd },
    bmsBot: { configured: config.bmsBot.path !== undefined },
    uiPath: { configured: config.uiPath.baseUrl !== undefined },
    worker: config.worker,
    deals: config.deals,
  };
}
