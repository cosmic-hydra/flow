import { NextResponse } from "next/server";
import { searchBookings } from "@/lib/booking";
import { SearchRequestSchema } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = SearchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await searchBookings(parsed.data.query, {
    forceDemo: parsed.data.demo,
  });

  return NextResponse.json({
    ok: true,
    query: parsed.data.query,
    ...result,
  });
}
