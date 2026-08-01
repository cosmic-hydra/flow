import { randomUUID } from 'node:crypto';

export interface ConnectedAccount {
  id: string;
  toolkit: string;
  label: string;
  status: 'ACTIVE' | 'INITIATED' | 'DEMO' | 'FAILED';
  redirectUrl?: string;
}

export interface ToolkitDefinition {
  id: string;
  name: string;
  description: string;
}

export const BOOKING_TOOLKITS: readonly ToolkitDefinition[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Pull confirmations and travel receipts',
  },
  {
    id: 'googlecalendar',
    name: 'Google Calendar',
    description: 'Block trip dates and reminders',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Sync Microsoft mail and calendar',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Share deals with your team',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Save itineraries to a workspace',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Track booking spend (optional)',
  },
] as const;

interface MemoryStore {
  accounts: ConnectedAccount[];
}

declare global {
  var __flowAccountStore: MemoryStore | undefined;
}

function store(): MemoryStore {
  if (globalThis.__flowAccountStore === undefined) {
    globalThis.__flowAccountStore = {
      accounts: [
        {
          id: 'demo-calendar',
          toolkit: 'googlecalendar',
          label: 'Google Calendar (demo)',
          status: 'DEMO',
        },
      ],
    };
  }
  return globalThis.__flowAccountStore;
}

export function isComposioConfigured(apiKey?: string): boolean {
  return apiKey !== undefined && apiKey.trim() !== '';
}

async function getComposioClient(apiKey?: string): Promise<
  | {
      connectedAccounts: { list: (input: { userIds: string[] }) => Promise<{ items?: unknown[] }> };
      toolkits: { authorize: (userId: string, toolkit: string) => Promise<unknown> };
    }
  | undefined
> {
  if (!isComposioConfigured(apiKey) || apiKey === undefined) return undefined;
  try {
    const module = await import('@composio/core');
    const Composio = module.Composio as new (input: { apiKey: string }) => {
      connectedAccounts: { list: (input: { userIds: string[] }) => Promise<{ items?: unknown[] }> };
      toolkits: { authorize: (userId: string, toolkit: string) => Promise<unknown> };
    };
    return new Composio({ apiKey });
  } catch {
    return undefined;
  }
}

export async function listAccounts(
  apiKey?: string,
  userId = 'flow-default',
): Promise<{ accounts: ConnectedAccount[]; mode: 'composio' | 'demo' }> {
  const client = await getComposioClient(apiKey);
  if (client === undefined) {
    return { accounts: store().accounts, mode: 'demo' };
  }

  try {
    const connected = await client.connectedAccounts.list({ userIds: [userId] });
    const items = (connected.items ?? []).map((item) => {
      const row = item as {
        id: string;
        status?: string;
        toolkit?: { slug?: string; name?: string };
        appName?: string;
      };
      const status =
        row.status === 'ACTIVE' || row.status === 'INITIATED' || row.status === 'FAILED'
          ? row.status
          : 'ACTIVE';
      return {
        id: row.id,
        toolkit: row.toolkit?.slug ?? row.appName ?? 'unknown',
        label: row.toolkit?.name ?? row.appName ?? 'Connected app',
        status,
      } satisfies ConnectedAccount;
    });
    return { accounts: items, mode: 'composio' };
  } catch {
    return { accounts: store().accounts, mode: 'demo' };
  }
}

export async function initiateConnection(
  toolkit: string,
  apiKey?: string,
  userId = 'flow-default',
): Promise<{
  account: ConnectedAccount;
  mode: 'composio' | 'demo';
  message: string;
}> {
  const client = await getComposioClient(apiKey);
  if (client === undefined) {
    const account: ConnectedAccount = {
      id: `pending-${toolkit}-${randomUUID().slice(0, 8)}`,
      toolkit,
      label: `${toolkit} (link ready)`,
      status: 'INITIATED',
      redirectUrl: `https://app.composio.dev/?toolkit=${encodeURIComponent(toolkit)}&user=${encodeURIComponent(userId)}`,
    };
    return {
      account,
      mode: 'demo',
      message:
        'Composio API key not set — opened a demo auth link. Add COMPOSIO_API_KEY for live OAuth, or connect via Composio MCP in Cursor.',
    };
  }

  try {
    const connectionRequest = await client.toolkits.authorize(userId, toolkit);
    const payload = connectionRequest as {
      id?: string;
      redirectUrl?: string;
      redirect_url?: string;
    };
    const account: ConnectedAccount = {
      id: payload.id ?? `pending-${toolkit}-${randomUUID().slice(0, 8)}`,
      toolkit,
      label: toolkit,
      status: 'INITIATED',
      ...(payload.redirectUrl !== undefined || payload.redirect_url !== undefined
        ? { redirectUrl: payload.redirectUrl ?? payload.redirect_url }
        : {}),
    };
    return {
      account,
      mode: 'composio',
      message: 'Open the auth link to connect your account via Composio.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    const account: ConnectedAccount = {
      id: `pending-${toolkit}-${randomUUID().slice(0, 8)}`,
      toolkit,
      label: toolkit,
      status: 'INITIATED',
      redirectUrl: `https://app.composio.dev/?toolkit=${encodeURIComponent(toolkit)}`,
    };
    return {
      account,
      mode: 'demo',
      message: `Live Composio authorize failed (${message}). Using fallback auth link.`,
    };
  }
}

export function markDemoAccountConnected(toolkit: string): ConnectedAccount {
  const account: ConnectedAccount = {
    id: `demo-${toolkit}-${randomUUID().slice(0, 6)}`,
    toolkit,
    label: `${toolkit} (demo linked)`,
    status: 'DEMO',
  };
  const existing = store().accounts.filter((item) => item.toolkit !== toolkit);
  store().accounts = [...existing, account];
  return account;
}
