import { NextResponse } from "next/server";
import { searchBookings } from "@/lib/booking";
import { ChatRequestSchema } from "@/lib/types";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const message = parsed.data.message.trim();
  const lower = message.toLowerCase();

  if (
    /^(hi|hello|hey|help|what can you do)\b/.test(lower) ||
    lower.length < 8
  ) {
    return NextResponse.json({
      ok: true,
      message: {
        id: randomUUID(),
        role: "assistant",
        content:
          "I am Flow — tell me what to book. Try “Tokyo flights under $650 next month”, “Shibuya hotel 2 nights”, or “teamLab tickets Saturday”. I search via webcmd adapters and rank the best deals.",
        createdAt: new Date().toISOString(),
      },
    });
  }

  const result = await searchBookings(message);
  return NextResponse.json({
    ok: true,
    message: {
      id: randomUUID(),
      role: "assistant",
      content: result.reply,
      deals: result.deals,
      createdAt: new Date().toISOString(),
    },
    source: result.source,
    webcmdError: result.webcmdError,
  });
}
