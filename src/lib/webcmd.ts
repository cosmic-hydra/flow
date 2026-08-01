import { spawn } from "child_process";
import path from "path";

export type WebcmdResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  command: string[];
};

const WEBCMD_BIN =
  process.env.WEBCMD_BIN ||
  path.join(process.cwd(), "node_modules", ".bin", "webcmd");

function runProcess(
  bin: string,
  args: string[],
  timeoutMs = 45000,
): Promise<WebcmdResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: "0" },
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      resolve({
        ok: code === 0,
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        durationMs: Date.now() - started,
        command: [bin, ...args],
      });
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += "\n[timeout] webcmd command exceeded time limit";
      finish(124);
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      stderr += err.message;
      finish(1);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish(code);
    });
  });
}

export async function webcmdDoctor(): Promise<WebcmdResult> {
  return runProcess(WEBCMD_BIN, ["doctor", "--json"], 20000);
}

export async function webcmdList(): Promise<WebcmdResult> {
  return runProcess(WEBCMD_BIN, ["list", "-f", "json"], 30000);
}

export async function webcmdVersion(): Promise<WebcmdResult> {
  return runProcess(WEBCMD_BIN, ["--version"], 10000);
}

export async function webcmdRun(
  args: string[],
  timeoutMs = 60000,
): Promise<WebcmdResult> {
  const safe = args.filter((a) => typeof a === "string" && a.length > 0);
  if (safe.length === 0) {
    return {
      ok: false,
      code: 2,
      stdout: "",
      stderr: "No webcmd arguments provided",
      durationMs: 0,
      command: [WEBCMD_BIN],
    };
  }
  return runProcess(WEBCMD_BIN, safe, timeoutMs);
}

export async function isWebcmdAvailable(): Promise<boolean> {
  const result = await webcmdVersion();
  return result.ok || Boolean(result.stdout);
}

export function parseJsonSafe<T>(raw: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    const start = raw.indexOf("{");
    const startArr = raw.indexOf("[");
    const idx =
      start === -1
        ? startArr
        : startArr === -1
          ? start
          : Math.min(start, startArr);
    if (idx === -1) return null;
    try {
      return JSON.parse(raw.slice(idx)) as T;
    } catch {
      return null;
    }
  }
}
