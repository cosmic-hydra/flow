import { NextResponse } from "next/server";
import { isWebcmdAvailable, webcmdVersion } from "@/lib/webcmd";
import { listAccounts } from "@/lib/composio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [webcmdOk, version, accounts] = await Promise.all([
    isWebcmdAvailable(),
    webcmdVersion(),
    listAccounts(),
  ]);

  return NextResponse.json({
    ok: true,
    service: "flow",
    time: new Date().toISOString(),
    webcmd: {
      available: webcmdOk,
      version: version.stdout || null,
    },
    composio: {
      configured: Boolean(process.env.COMPOSIO_API_KEY),
      mode: accounts.mode,
      accountCount: accounts.accounts.length,
    },
  });
}
