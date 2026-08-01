import { NextResponse } from "next/server";
import {
  BOOKING_TOOLKITS,
  initiateConnection,
  listAccounts,
  markDemoAccountConnected,
} from "@/lib/composio";
import { ConnectAccountSchema } from "@/lib/types";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const accounts = await listAccounts();
  return NextResponse.json({
    ok: true,
    toolkits: BOOKING_TOOLKITS,
    ...accounts,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const actionSchema = z.object({
    action: z.enum(["connect", "demo-link"]).default("connect"),
  });
  const actionParsed = actionSchema.safeParse(body);
  const action = actionParsed.success ? actionParsed.data.action : "connect";

  const parsed = ConnectAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (action === "demo-link") {
    const account = markDemoAccountConnected(parsed.data.toolkit);
    return NextResponse.json({
      ok: true,
      mode: "demo",
      account,
      message: `Linked ${parsed.data.toolkit} in demo mode.`,
    });
  }

  const result = await initiateConnection(
    parsed.data.toolkit,
    parsed.data.userId || "flow-default",
  );

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
