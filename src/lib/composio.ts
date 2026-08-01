import { Composio } from "@composio/core";
import type { ConnectedAccount } from "./types";
import { randomUUID } from "crypto";

const DEMO_ACCOUNTS_KEY = "flow_demo_accounts";

type MemoryStore = {
  accounts: ConnectedAccount[];
  pending: Record<string, ConnectedAccount>;
};

declare global {
  var __flowAccountStore: MemoryStore | undefined;
}

function store(): MemoryStore {
  if (!globalThis.__flowAccountStore) {
    globalThis.__flowAccountStore = {
      accounts: [
        {
          id: "demo-calendar",
          toolkit: "googlecalendar",
          label: "Google Calendar (demo)",
          status: "DEMO",
        },
      ],
      pending: {},
    };
  }
  return globalThis.__flowAccountStore;
}

export function getComposioClient(): Composio | null {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return null;
  return new Composio({ apiKey });
}

export const BOOKING_TOOLKITS = [
  {
    id: "gmail",
    name: "Gmail",
    description: "Pull confirmations and travel receipts",
    icon: "mail",
  },
  {
    id: "googlecalendar",
    name: "Google Calendar",
    description: "Block trip dates and reminders",
    icon: "calendar",
  },
  {
    id: "outlook",
    name: "Outlook",
    description: "Sync Microsoft mail & calendar",
    icon: "inbox",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Share deals with your team",
    icon: "hash",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Save itineraries to a workspace",
    icon: "book",
  },
  {
    id: "stripe",
    name: "Stripe",
    description: "Track booking spend (optional)",
    icon: "credit-card",
  },
] as const;

export async function listAccounts(userId = "flow-default"): Promise<{
  accounts: ConnectedAccount[];
  mode: "composio" | "demo";
}> {
  const client = getComposioClient();
  if (!client) {
    return { accounts: store().accounts, mode: "demo" };
  }

  try {
    const connected = await client.connectedAccounts.list({
      userIds: [userId],
    });
    const items = (connected.items || []).map((item) => {
      const row = item as {
        id: string;
        status?: string;
        toolkit?: { slug?: string; name?: string };
        appName?: string;
      };
      return {
        id: row.id,
        toolkit: row.toolkit?.slug || row.appName || "unknown",
        label: row.toolkit?.name || row.appName || "Connected app",
        status: (row.status as ConnectedAccount["status"]) || "ACTIVE",
      };
    });
    return { accounts: items, mode: "composio" };
  } catch {
    return { accounts: store().accounts, mode: "demo" };
  }
}

export async function initiateConnection(
  toolkit: string,
  userId = "flow-default",
): Promise<{
  account: ConnectedAccount;
  mode: "composio" | "demo";
  message: string;
}> {
  const client = getComposioClient();

  if (!client) {
    const id = `pending-${toolkit}-${randomUUID().slice(0, 8)}`;
    const account: ConnectedAccount = {
      id,
      toolkit,
      label: `${toolkit} (link ready)`,
      status: "INITIATED",
      redirectUrl: `https://app.composio.dev/?toolkit=${encodeURIComponent(toolkit)}&user=${encodeURIComponent(userId)}`,
    };
    store().pending[id] = account;
    return {
      account,
      mode: "demo",
      message:
        "Composio API key not set — opened a demo auth link. Add COMPOSIO_API_KEY for live OAuth.",
    };
  }

  try {
    // Prefer toolkit.authorize — creates a managed auth config when needed.
    const connectionRequest = await client.toolkits.authorize(userId, toolkit);
    const redirectUrl =
      (connectionRequest as { redirectUrl?: string }).redirectUrl ||
      (connectionRequest as { redirect_url?: string }).redirect_url;
    const account: ConnectedAccount = {
      id:
        (connectionRequest as { id?: string }).id ||
        `pending-${toolkit}-${randomUUID().slice(0, 8)}`,
      toolkit,
      label: toolkit,
      status: "INITIATED",
      redirectUrl,
    };
    return {
      account,
      mode: "composio",
      message: "Open the auth link to connect your account via Composio.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    const id = `pending-${toolkit}-${randomUUID().slice(0, 8)}`;
    const account: ConnectedAccount = {
      id,
      toolkit,
      label: toolkit,
      status: "INITIATED",
      redirectUrl: `https://app.composio.dev/?toolkit=${encodeURIComponent(toolkit)}`,
    };
    return {
      account,
      mode: "demo",
      message: `Live Composio authorize failed (${message}). Using fallback auth link.`,
    };
  }
}

export function markDemoAccountConnected(toolkit: string): ConnectedAccount {
  const account: ConnectedAccount = {
    id: `demo-${toolkit}-${randomUUID().slice(0, 6)}`,
    toolkit,
    label: `${toolkit} (demo linked)`,
    status: "DEMO",
  };
  const existing = store().accounts.filter((a) => a.toolkit !== toolkit);
  store().accounts = [...existing, account];
  return account;
}

export function getDemoAccountCount(): number {
  return store().accounts.length;
}

export { DEMO_ACCOUNTS_KEY };
