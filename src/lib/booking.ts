import { searchDemoDeals, demoAssistantReply } from "./demo-data";
import type { Deal } from "./types";
import { parseJsonSafe, webcmdList, webcmdRun } from "./webcmd";

function detectCategory(query: string): Deal["category"] {
  const q = query.toLowerCase();
  if (/\b(flight|fly|airfare|airport)\b/.test(q)) return "flight";
  if (/\b(hotel|stay|airbnb|room)\b/.test(q)) return "hotel";
  if (/\b(train|rail|jr pass)\b/.test(q)) return "train";
  if (/\b(restaurant|dinner|reservation|omakase)\b/.test(q)) return "restaurant";
  if (/\b(event|ticket|concert|museum)\b/.test(q)) return "event";
  return "other";
}

function dealsFromWebcmdPayload(payload: unknown, query: string): Deal[] {
  if (!payload) return [];
  const rows = Array.isArray(payload)
    ? payload
    : typeof payload === "object" &&
        payload &&
        Array.isArray((payload as { items?: unknown }).items)
      ? ((payload as { items: unknown[] }).items)
      : typeof payload === "object" &&
          payload &&
          Array.isArray((payload as { results?: unknown }).results)
        ? ((payload as { results: unknown[] }).results)
        : [];

  return rows.slice(0, 6).map((row, index) => {
    const r = row as Record<string, unknown>;
    const title =
      String(r.title || r.name || r.product || r.route || `Result ${index + 1}`);
    const priceRaw = r.price ?? r.amount ?? r.fare ?? 0;
    const price =
      typeof priceRaw === "number"
        ? priceRaw
        : Number(String(priceRaw).replace(/[^0-9.]/g, "")) || 0;
    return {
      id: `webcmd-${index}-${title.slice(0, 24)}`,
      title,
      provider: String(r.provider || r.source || r.seller || "webcmd"),
      category: detectCategory(query),
      price,
      currency: String(r.currency || "USD"),
      meta: String(r.meta || r.description || r.summary || "via webcmd"),
      url: typeof r.url === "string" ? r.url : undefined,
      source: "webcmd" as const,
    };
  });
}

async function tryWebcmdSearch(query: string): Promise<Deal[]> {
  // Prefer adapters that are useful for shopping / booking style queries.
  const list = await webcmdList();
  const adapters = parseJsonSafe<unknown>(list.stdout);
  const names: string[] = [];
  if (Array.isArray(adapters)) {
    for (const item of adapters) {
      if (typeof item === "string") names.push(item);
      else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const n = obj.name || obj.id || obj.command;
        if (typeof n === "string") names.push(n);
      }
    }
  }

  const preferred = ["amazon", "skyscanner", "reddit", "hn", "hackernews"];
  const target =
    preferred.find((p) => names.some((n) => n.toLowerCase().includes(p))) ||
    names.find((n) => /amazon|sky|flight|book/i.test(n));

  if (!target) return [];

  // amazon search is a common public adapter; keep args conservative.
  const base = target.split(/\s+/)[0];
  const result = await webcmdRun(
    [base, "search", query, "--limit", "5", "-f", "json"],
    35000,
  );
  if (!result.ok && !result.stdout) return [];
  const payload = parseJsonSafe<unknown>(result.stdout);
  return dealsFromWebcmdPayload(payload, query);
}

export async function searchBookings(
  query: string,
  options?: { forceDemo?: boolean },
): Promise<{
  deals: Deal[];
  reply: string;
  source: "webcmd" | "demo" | "hybrid";
  webcmdError?: string;
}> {
  if (options?.forceDemo || process.env.FLOW_FORCE_DEMO === "1") {
    const deals = searchDemoDeals(query);
    return {
      deals,
      reply: demoAssistantReply(query, deals),
      source: "demo",
    };
  }

  try {
    const live = await tryWebcmdSearch(query);
    if (live.length > 0) {
      const demo = searchDemoDeals(query, 2);
      const merged = [...live, ...demo].slice(0, 6);
      return {
        deals: merged,
        reply: `Pulled live signals via webcmd and ranked them with Flow’s deal heuristics for “${query}”.`,
        source: "hybrid",
      };
    }
  } catch (err) {
    const deals = searchDemoDeals(query);
    return {
      deals,
      reply: demoAssistantReply(query, deals),
      source: "demo",
      webcmdError: err instanceof Error ? err.message : "webcmd failed",
    };
  }

  const deals = searchDemoDeals(query);
  return {
    deals,
    reply: demoAssistantReply(query, deals),
    source: "demo",
  };
}

export function buildSetupCommands(os: "macos" | "windows" | "linux") {
  if (os === "windows") {
    return {
      node: "winget install OpenJS.NodeJS.LTS",
      webcmd: "npm install -g @agentrhq/webcmd",
      doctor: "webcmd doctor",
      skills: "webcmd skills add",
      composio: "npm install -g @composio/cli && composio login",
    };
  }
  if (os === "macos") {
    return {
      node: "brew install node",
      webcmd: "npm install -g @agentrhq/webcmd",
      doctor: "webcmd doctor",
      skills: "webcmd skills add",
      composio: "npm install -g @composio/cli && composio login",
    };
  }
  return {
    node: "sudo apt update && sudo apt install -y nodejs npm",
    webcmd: "npm install -g @agentrhq/webcmd",
    doctor: "webcmd doctor",
    skills: "webcmd skills add",
    composio: "npm install -g @composio/cli && composio login",
  };
}
