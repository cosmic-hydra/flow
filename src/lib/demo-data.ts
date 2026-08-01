import type { Deal } from "./types";

const DEMO_DEALS: Deal[] = [
  {
    id: "demo-flight-1",
    title: "SFO → NRT · nonstop evening",
    provider: "Japan Airlines",
    category: "flight",
    price: 612,
    currency: "USD",
    originalPrice: 845,
    savingsPct: 28,
    rating: 4.7,
    meta: "Depart Thu · 11h 20m · Economy",
    url: "https://www.google.com/travel/flights",
    source: "demo",
  },
  {
    id: "demo-flight-2",
    title: "SFO → NRT · 1 stop via SEA",
    provider: "Alaska / ANA",
    category: "flight",
    price: 489,
    currency: "USD",
    originalPrice: 720,
    savingsPct: 32,
    rating: 4.4,
    meta: "Depart Wed · 15h 05m · Economy",
    url: "https://www.google.com/travel/flights",
    source: "demo",
  },
  {
    id: "demo-hotel-1",
    title: "Shibuya Stream Hotel",
    provider: "Booking.com",
    category: "hotel",
    price: 148,
    currency: "USD",
    originalPrice: 210,
    savingsPct: 30,
    rating: 4.6,
    meta: "Tokyo · 2 nights · Free cancel",
    url: "https://www.booking.com",
    source: "demo",
  },
  {
    id: "demo-hotel-2",
    title: "Mitsui Garden Ginza Premier",
    provider: "Hotels.com",
    category: "hotel",
    price: 176,
    currency: "USD",
    originalPrice: 239,
    savingsPct: 26,
    rating: 4.8,
    meta: "Tokyo · 2 nights · Breakfast",
    url: "https://www.hotels.com",
    source: "demo",
  },
  {
    id: "demo-event-1",
    title: "teamLab Planets · timed entry",
    provider: "Klook",
    category: "event",
    price: 38,
    currency: "USD",
    originalPrice: 48,
    savingsPct: 21,
    rating: 4.9,
    meta: "Toyosu · Saturday afternoon",
    url: "https://www.klook.com",
    source: "demo",
  },
  {
    id: "demo-train-1",
    title: "JR Pass · 7-day ordinary",
    provider: "JR East",
    category: "train",
    price: 342,
    currency: "USD",
    originalPrice: 390,
    savingsPct: 12,
    rating: 4.5,
    meta: "Nationwide · Activate within 90 days",
    url: "https://www.jrpass.com",
    source: "demo",
  },
  {
    id: "demo-restaurant-1",
    title: "Sukiyabashi Jiro Omakase",
    provider: "TableCheck",
    category: "restaurant",
    price: 420,
    currency: "USD",
    rating: 4.9,
    meta: "Ginza · 2 seats · Sat 7:30pm",
    url: "https://www.tablecheck.com",
    source: "demo",
  },
];

function scoreDeal(deal: Deal, query: string): number {
  const q = query.toLowerCase();
  let score = 0;
  const hay = `${deal.title} ${deal.provider} ${deal.category} ${deal.meta}`.toLowerCase();
  for (const token of q.split(/\s+/).filter(Boolean)) {
    if (hay.includes(token)) score += 3;
  }
  if (q.includes("flight") && deal.category === "flight") score += 5;
  if (q.includes("hotel") && deal.category === "hotel") score += 5;
  if (q.includes("tokyo") || q.includes("nrt") || q.includes("japan")) {
    if (hay.includes("tokyo") || hay.includes("nrt") || hay.includes("japan")) {
      score += 4;
    }
  }
  if (deal.savingsPct) score += deal.savingsPct / 10;
  return score;
}

export function searchDemoDeals(query: string, limit = 4): Deal[] {
  const ranked = [...DEMO_DEALS]
    .map((d) => ({ deal: d, score: scoreDeal(d, query) }))
    .sort((a, b) => b.score - a.score || a.deal.price - b.deal.price);

  const filtered = ranked.filter((r) => r.score > 0).slice(0, limit);
  if (filtered.length > 0) return filtered.map((r) => r.deal);
  return ranked.slice(0, limit).map((r) => r.deal);
}

export function demoAssistantReply(query: string, deals: Deal[]): string {
  if (deals.length === 0) {
    return "I could not find matching deals yet. Try a destination, date window, or category (flight, hotel, event).";
  }
  const best = deals[0];
  const savings = best.savingsPct ? ` (~${best.savingsPct}% under typical fare)` : "";
  return `Found ${deals.length} strong options for “${query}”. Best pick: **${best.title}** via ${best.provider} at $${best.price}${savings}. I ranked by savings and fit — open any deal to continue, or refine with dates and budget.`;
}

export { DEMO_DEALS };
