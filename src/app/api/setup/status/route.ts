import { NextResponse } from "next/server";
import {
  isDoctorHealthy,
  isWebcmdAvailable,
  webcmdDoctor,
  webcmdVersion,
} from "@/lib/webcmd";
import { listAccounts } from "@/lib/composio";
import { buildSetupCommands } from "@/lib/booking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function detectOsFromUa(ua: string | null): "macos" | "windows" | "linux" | "unknown" {
  if (!ua) return "unknown";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macos";
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux|X11/i.test(ua)) return "linux";
  return "unknown";
}

export async function GET(request: Request) {
  const ua = request.headers.get("user-agent");
  const os = detectOsFromUa(ua);
  const [available, version, doctor, accounts] = await Promise.all([
    isWebcmdAvailable(),
    webcmdVersion(),
    webcmdDoctor(),
    listAccounts(),
  ]);

  return NextResponse.json({
    ok: true,
    os,
    commands: buildSetupCommands(os === "unknown" ? "macos" : os),
    runtime: {
      node: process.version,
      platform: process.platform,
      ready: true,
    },
    webcmd: {
      available,
      version: version.stdout || null,
      doctorOk: isDoctorHealthy(doctor),
      doctor: {
        stdout: doctor.stdout,
        stderr: doctor.stderr,
        code: doctor.code,
      },
    },
    accounts: {
      mode: accounts.mode,
      items: accounts.accounts,
      count: accounts.accounts.length,
    },
    composioConfigured: Boolean(process.env.COMPOSIO_API_KEY),
    mcp: {
      server: "Composio",
      tools: [
        "COMPOSIO_SEARCH_TOOLS",
        "COMPOSIO_MANAGE_CONNECTIONS",
        "COMPOSIO_WAIT_FOR_CONNECTIONS",
      ],
      hint: "In Cursor, enable the Composio MCP server, then ask: “Connect my Gmail with Composio”.",
    },
  });
}
