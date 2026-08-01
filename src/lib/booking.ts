import { searchDemoDeals, demoAssistantReply } from "./demo-data";
import type { Deal } from "./types";
import { parseJsonSafe, webcmdList, webcmdRun } from "./webcmd";

type AdapterRow = {
  command?: string;
  site?: string;
  name?: string;
  description?: string;
};

function detectCategory(query: string): Deal["category"] {
  const q = query.toLowerCase();
  if (/\b(flight|fly|airfare|airport)\b/.test(q)) return "flight";
  if (/\b(hotel|stay|airbnb|room)\b/.test(q)) return "hotel";
  if (/\b(train|rail|jr pass)\b/.test(q)) return "train";
  if (/\b(restaurant|dinner|reservation|omakase)\b/.test(q)) return "restaurant";
  if (/\b(event|ticket|concert|museum)\b/.test(q)) return "event";
  return "other";
}

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function extractDestination(query: string): string | null {
  const m =
    query.match(
      /\b(?:to|in|for|near)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/,
    ) ||
    query.match(
      /\b(Tokyo|Paris|London|Seoul|Osaka|Bali|NYC|New York|SF|SFO|LA|LAX)\b/i,
    );
  return m?.[1] || null;
}

function extractIataPair(query: string): { from: string; to: string } | null {
  const pair = query.match(/\b([A-Z]{3})\s*(?:→|->|to)\s*([A-Z]{3})\b/i);
  if (pair) {
    return { from: pair[1].toUpperCase(), to: pair[2].toUpperCase() };
  }
  const q = query.toLowerCase();
  if (/\b(tokyo|nrt|hnd|japan)\b/.test(q)) {
    return { from: "SFO", to: "NRT" };
  }
  if (/\b(paris|cdg)\b/.test(q)) return { from: "JFK", to: "CDG" };
  if (/\b(london|lhr)\b/.test(q)) return { from: "JFK", to: "LHR" };
  if (/\b(seoul|icn)\b/.test(q)) return { from: "SFO", to: "ICN" };
  return null;
}

function dealsFromWebcmdPayload(
  payload: unknown,
  query: string,
  providerHint?: string,
): Deal[] {
  if (!payload) return [];
  const rows = Array.isArray(payload)
    ? payload
    : typeof payload === "object" &&
        payload &&
        Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : typeof payload === "object" &&
          payload &&
          Array.isArray((payload as { results?: unknown }).results)
        ? (payload as { results: unknown[] }).results
        : [];

  return rows.slice(0, 6).map((row, index) => {
    const r = row as Record<string, unknown>;
    const title = String(
      r.title ||
        r.name ||
        r.offer ||
        r.product ||
        r.route ||
        (r.airline && r.departureAirport && r.arrivalAirport
          ? `${r.airline}: ${r.departureAirport} → ${r.arrivalAirport}`
          : null) ||
        `Result ${index + 1}`,
    );
    const priceRaw =
      r.price ?? r.price_amount ?? r.amount ?? r.fare ?? r.from_price ?? 0;
    const price =
      typeof priceRaw === "number"
        ? priceRaw
        : Number(String(priceRaw).replace(/[^0-9.]/g, "")) || 0;
    const metaParts = [
      r.meta,
      r.description,
      r.summary,
      r.offer,
      r.duration,
      r.stops != null ? `${r.stops} stop(s)` : null,
      r.distance,
      r.country,
      r.star_rating != null ? `${r.star_rating}★` : null,
    ]
      .filter(Boolean)
      .map(String);
    return {
      id: `webcmd-${index}-${title.slice(0, 24).replace(/\s+/g, "-")}`,
      title,
      provider: String(
        r.provider || r.source || r.seller || r.airline || providerHint || "webcmd",
      ),
      category: detectCategory(query),
      price,
      currency: String(r.currency || r.price_currency || "USD"),
      rating:
        typeof r.rating === "number"
          ? r.rating
          : typeof r.review_score === "number"
            ? r.review_score
            : typeof r.rating_value === "number"
              ? r.rating_value
              : undefined,
      meta: metaParts.slice(0, 3).join(" · ") || "via webcmd",
      url: typeof r.url === "string" ? r.url : undefined,
      source: "webcmd" as const,
    };
  });
}

function hasAdapter(
  adapters: AdapterRow[],
  site: string,
  name?: string,
): boolean {
  return adapters.some((a) => {
    const siteOk =
      a.site === site ||
      a.command === site ||
      (typeof a.command === "string" && a.command.startsWith(`${site}/`));
    if (!siteOk) return false;
    if (!name) return true;
    return a.name === name || a.command === `${site}/${name}`;
  });
}

async function loadAdapters(): Promise<AdapterRow[]> {
  const list = await webcmdList();
  const adapters = parseJsonSafe<unknown>(list.stdout);
  if (!Array.isArray(adapters)) return [];
  return adapters.filter(
    (item): item is AdapterRow => Boolean(item) && typeof item === "object",
  );
}

async function runJsonCommand(
  args: string[],
  timeoutMs = 35000,
): Promise<unknown | null> {
  const result = await webcmdRun(args, timeoutMs);
  if (!result.stdout) return null;
  // YAML error envelopes from webcmd start with "ok: false"
  if (/^ok:\s*false/m.test(result.stdout)) return null;
  return parseJsonSafe<unknown>(result.stdout);
}

async function tryWebcmdSearch(query: string): Promise<{
  deals: Deal[];
  note?: string;
}> {
  const adapters = await loadAdapters();
  if (adapters.length === 0) return { deals: [] };

  const category = detectCategory(query);
  const destination = extractDestination(query);
  const attempts: Array<{ label: string; args: string[]; provider: string }> =
    [];

  if (category === "hotel" && hasAdapter(adapters, "booking", "search")) {
    const dest = destination || "Tokyo";
    attempts.push({
      label: "booking search",
      provider: "Booking.com",
      args: [
        "booking",
        "search",
        dest,
        "--checkin",
        isoDateOffset(30),
        "--checkout",
        isoDateOffset(32),
        "--currency",
        "USD",
        "--limit",
        "5",
        "-f",
        "json",
      ],
    });
  }

  if (category === "flight" && hasAdapter(adapters, "trip", "flight")) {
    const pair = extractIataPair(query) || { from: "SFO", to: "NRT" };
    attempts.push({
      label: "trip flight",
      provider: "Trip.com",
      args: [
        "trip",
        "flight",
        pair.from,
        pair.to,
        "--date",
        isoDateOffset(45),
        "--limit",
        "5",
        "-f",
        "json",
      ],
    });
  }

  if (hasAdapter(adapters, "trip", "deals")) {
    attempts.push({
      label: "trip deals",
      provider: "Trip.com",
      args: ["trip", "deals", "--limit", "8", "-f", "json"],
    });
  }

  if (destination && hasAdapter(adapters, "trip", "search")) {
    attempts.push({
      label: "trip search",
      provider: "Trip.com",
      args: ["trip", "search", destination, "-f", "json"],
    });
  }

  if (hasAdapter(adapters, "amazon", "search") && category === "other") {
    attempts.push({
      label: "amazon search",
      provider: "Amazon",
      args: ["amazon", "search", query, "--limit", "5", "-f", "json"],
    });
  }

  for (const attempt of attempts.slice(0, 3)) {
    try {
      const payload = await runJsonCommand(attempt.args, 32000);
      let deals = dealsFromWebcmdPayload(payload, query, attempt.provider);
      if (attempt.label === "trip deals" && destination) {
        const dest = destination.toLowerCase();
        const filtered = deals.filter((d) =>
          `${d.title} ${d.meta}`.toLowerCase().includes(dest),
        );
        if (filtered.length > 0) deals = filtered;
      }
      if (deals.length > 0) {
        return {
          deals,
          note: `Live via webcmd \`${attempt.label}\``,
        };
      }
    } catch {
      // try next adapter
    }
  }

  return { deals: [] };
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
    if (live.deals.length > 0) {
      const demo = searchDemoDeals(query, 2);
      const seen = new Set(live.deals.map((d) => d.title.toLowerCase()));
      const extras = demo.filter((d) => !seen.has(d.title.toLowerCase()));
      const merged = [...live.deals, ...extras].slice(0, 6);
      const best = merged[0];
      return {
        deals: merged,
        reply: `${live.note || "Pulled live signals via webcmd"} for “${query}”. Best pick: **${best.title}** via ${best.provider}${best.price ? ` at $${best.price}` : ""}. I mixed live adapters with Flow’s ranking heuristics — open a deal or refine dates/budget.`,
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
      flow: "git clone https://github.com/cosmic-hydra/flow.git && cd flow && npm install && npm run dev",
    };
  }
  if (os === "macos") {
    return {
      node: "brew install node",
      webcmd: "npm install -g @agentrhq/webcmd",
      doctor: "webcmd doctor",
      skills: "webcmd skills add",
      composio: "npm install -g @composio/cli && composio login",
      flow: "git clone https://github.com/cosmic-hydra/flow.git && cd flow && npm install && npm run dev",
    };
  }
  return {
    node: "sudo apt update && sudo apt install -y nodejs npm",
    webcmd: "npm install -g @agentrhq/webcmd",
    doctor: "webcmd doctor",
    skills: "webcmd skills add",
    composio: "npm install -g @composio/cli && composio login",
    flow: "git clone https://github.com/cosmic-hydra/flow.git && cd flow && npm install && npm run dev",
  };
}
