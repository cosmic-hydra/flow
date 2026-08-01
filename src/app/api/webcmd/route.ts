import { NextResponse } from "next/server";
import {
  isDoctorHealthy,
  parseJsonSafe,
  webcmdDoctor,
  webcmdList,
  webcmdRun,
  webcmdVersion,
} from "@/lib/webcmd";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "status";

  if (action === "version") {
    const result = await webcmdVersion();
    return NextResponse.json({ ok: result.ok, result });
  }

  if (action === "doctor") {
    const result = await webcmdDoctor();
    return NextResponse.json({
      ok: isDoctorHealthy(result),
      result,
      summary: result.stdout,
      parsed: parseJsonSafe(result.stdout),
    });
  }

  if (action === "list") {
    const result = await webcmdList();
    return NextResponse.json({
      ok: result.ok,
      result,
      parsed: parseJsonSafe(result.stdout),
    });
  }

  const [version, doctor, list] = await Promise.all([
    webcmdVersion(),
    webcmdDoctor(),
    webcmdList(),
  ]);

  const listParsed = parseJsonSafe(list.stdout);
  const adapterCount = Array.isArray(listParsed) ? listParsed.length : null;

  return NextResponse.json({
    ok: version.ok || Boolean(version.stdout),
    version: version.stdout,
    doctor: {
      ok: isDoctorHealthy(doctor),
      summary: doctor.stdout,
      parsed: parseJsonSafe(doctor.stdout),
      stderr: doctor.stderr,
    },
    list: {
      ok: list.ok,
      count: adapterCount,
      parsed: listParsed,
      stderr: list.stderr,
    },
  });
}

const RunSchema = z.object({
  args: z.array(z.string().min(1).max(200)).min(1).max(20),
  timeoutMs: z.number().int().positive().max(120000).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Block obviously dangerous shells; webcmd args only.
  const banned = /[;&|`$<>]/;
  if (parsed.data.args.some((a) => banned.test(a))) {
    return NextResponse.json(
      { ok: false, error: "Unsafe characters in arguments" },
      { status: 400 },
    );
  }

  const result = await webcmdRun(parsed.data.args, parsed.data.timeoutMs);
  return NextResponse.json({
    ok: result.ok,
    result,
    parsed: parseJsonSafe(result.stdout),
  });
}
