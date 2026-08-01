import { NextResponse } from "next/server";
import {
  isWebcmdAvailable,
  parseJsonSafe,
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

  const doctorJson = parseJsonSafe<Record<string, unknown>>(doctor.stdout);

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
      doctorOk: doctor.ok,
      doctor: doctorJson || {
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
  });
}
