import { spawn } from 'node:child_process';
import type { FlowConfig } from '@flow/config';
import { ProviderError } from '../types.js';

export interface WebcmdInvocation {
  providerId: string;
  site: string;
  command: string;
  positionals?: readonly string[];
  options?: Readonly<Record<string, string | number | boolean | undefined>>;
  access: 'read' | 'write';
  signal?: AbortSignal;
}

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

const maxOutputBytes = 5 * 1024 * 1024;
const safeSegmentPattern = /^[a-z][a-z0-9-]*$/;

function assertSafeSegment(segment: string, label: string): void {
  if (!safeSegmentPattern.test(segment)) {
    throw new Error(`Unsafe webcmd ${label}: ${segment}`);
  }
}

function serializeOptions(
  options: Readonly<Record<string, string | number | boolean | undefined>>,
): string[] {
  const output: string[] = [];
  for (const [name, value] of Object.entries(options)) {
    assertSafeSegment(name, 'option');
    if (value === undefined || value === false) continue;
    output.push(`--${name}`);
    if (value !== true) output.push(String(value));
  }
  return output;
}

async function runProcess(
  executable: string,
  args: readonly string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
      shell: false,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;

    const finishWithError = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      child.kill('SIGTERM');
      reject(error);
    };
    const consume = (bucket: Buffer[], chunk: Buffer): void => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxOutputBytes) {
        finishWithError(new Error('webcmd output exceeded the 5 MiB safety limit'));
        return;
      }
      bucket.push(chunk);
    };
    const abort = (): void => finishWithError(new Error('webcmd invocation was aborted'));
    const timeout = setTimeout(
      () => finishWithError(new Error(`webcmd timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );

    if (signal?.aborted === true) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => consume(stdout, chunk));
    child.stderr.on('data', (chunk: Buffer) => consume(stderr, chunk));
    child.on('error', finishWithError);
    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      resolve({
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        exitCode: exitCode ?? 1,
      });
    });
  });
}

export class WebcmdRunner {
  readonly #config: FlowConfig['webcmd'];

  constructor(config: FlowConfig['webcmd']) {
    this.#config = config;
  }

  async version(): Promise<string> {
    const result = await runProcess(this.#config.path, ['--version'], 10_000);
    if (result.exitCode !== 0) throw new Error(result.stderr || 'webcmd version check failed');
    return result.stdout.trim();
  }

  async runJson(invocation: WebcmdInvocation): Promise<unknown> {
    assertSafeSegment(invocation.site, 'site');
    assertSafeSegment(invocation.command, 'command');
    const args = [
      '--profile',
      this.#config.profile,
      invocation.site,
      invocation.command,
      ...(invocation.positionals ?? []),
      ...serializeOptions(invocation.options ?? {}),
      '--trace',
      invocation.access === 'write' ? 'retain-on-failure' : 'off',
      '-f',
      'json',
    ];

    let result: ProcessResult;
    try {
      result = await runProcess(this.#config.path, args, this.#config.timeoutMs, invocation.signal);
    } catch (error) {
      throw new ProviderError({
        providerId: invocation.providerId,
        code: 'webcmd_process_failed',
        message: error instanceof Error ? error.message : 'webcmd process failed',
        retryable: true,
      });
    }
    if (result.exitCode !== 0) {
      throw new ProviderError({
        providerId: invocation.providerId,
        code: 'webcmd_command_failed',
        message: result.stderr.trim().slice(0, 2_000) || `webcmd exited with ${result.exitCode}`,
        retryable: true,
        details: { site: invocation.site, command: invocation.command, exitCode: result.exitCode },
      });
    }

    try {
      return JSON.parse(result.stdout) as unknown;
    } catch {
      throw new ProviderError({
        providerId: invocation.providerId,
        code: 'webcmd_invalid_json',
        message: 'webcmd returned output that was not valid JSON',
        retryable: true,
        details: { site: invocation.site, command: invocation.command },
      });
    }
  }
}
