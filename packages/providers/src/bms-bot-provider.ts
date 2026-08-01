import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import type { FlowConfig } from '@flow/config';
import type { BookingCategory, CheckoutResult } from '@flow/contracts';
import type {
  BookingProvider,
  ProviderCheckoutContext,
  ProviderHealth,
  ProviderSearchContext,
  ProviderSearchResult,
} from './types.js';
import { ProviderError } from './types.js';
import { WebcmdDistrictProvider } from './webcmd/district-provider.js';
import { dateInTimeZone, textValue } from './webcmd/shared.js';

const categories: readonly BookingCategory[] = ['movie'];
const resultPrefix = 'FLOW_BMS_BRIDGE_RESULT=';
const maxOutputBytes = 10 * 1024 * 1024;

interface BridgeResult {
  success: boolean;
  error?: string;
  screenshotPath?: string;
  handoffUrl?: string;
  bookingResult?: {
    bookingId?: string;
    seats?: string[];
    totalAmount?: number;
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function parseBridgeResult(value: string): BridgeResult {
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('BMS bridge returned a non-object result');
  }
  const result = parsed as Record<string, unknown>;
  if (typeof result.success !== 'boolean') {
    throw new Error('BMS bridge result is missing a boolean success field');
  }
  return parsed as BridgeResult;
}

async function runBridge(input: {
  botPath: string;
  timeoutMs: number;
  handoffTtlMs: number;
  payload: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<BridgeResult> {
  const tsxPath = resolve(input.botPath, 'node_modules', '.bin', 'tsx');
  const bridgePath = resolve(process.cwd(), 'integrations', 'bms-bot', 'bridge.ts');
  return new Promise((resolvePromise, reject) => {
    const child = spawn(tsxPath, [bridgePath], {
      cwd: input.botPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FLOW_BMS_BOT_PATH: input.botPath,
        FLOW_BMS_HANDOFF_TTL_MS: String(input.handoffTtlMs),
        NO_COLOR: '1',
      },
      shell: false,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', abort);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      child.kill('SIGTERM');
      reject(error);
    };
    const consume = (bucket: Buffer[], chunk: Buffer): void => {
      outputBytes += chunk.byteLength;
      if (outputBytes > maxOutputBytes) {
        fail(new Error('BMS bridge output exceeded the 10 MiB safety limit'));
        return;
      }
      bucket.push(chunk);
    };
    const resolveFromOutput = (): boolean => {
      const output = Buffer.concat(stdout).toString('utf8');
      const resultStart = output.lastIndexOf(resultPrefix);
      if (resultStart < 0) return false;
      const resultEnd = output.indexOf('\n', resultStart);
      if (resultEnd < 0) return false;
      const resultLine = output.slice(resultStart, resultEnd);
      try {
        const result = parseBridgeResult(resultLine.slice(resultPrefix.length));
        settled = true;
        cleanup();
        child.unref();
        const stdoutHandle = child.stdout as unknown as { unref?: () => void };
        const stderrHandle = child.stderr as unknown as { unref?: () => void };
        stdoutHandle.unref?.();
        stderrHandle.unref?.();
        child.stdout.resume();
        child.stderr.resume();
        resolvePromise(result);
        return true;
      } catch (error) {
        fail(error instanceof Error ? error : new Error('BMS bridge result was invalid'));
        return true;
      }
    };
    const abort = (): void => fail(new Error('BMS bridge was aborted'));
    const timeout = setTimeout(
      () => fail(new Error(`BMS bridge timed out after ${input.timeoutMs}ms`)),
      input.timeoutMs,
    );
    if (input.signal?.aborted === true) {
      abort();
      return;
    }
    input.signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      if (settled) return;
      consume(stdout, chunk);
      if (!settled) resolveFromOutput();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (!settled) consume(stderr, chunk);
    });
    child.on('error', fail);
    child.on('close', (exitCode) => {
      if (settled) return;
      if (exitCode === 0 && resolveFromOutput()) return;
      settled = true;
      cleanup();
      if (exitCode !== 0) {
        const errorOutput = Buffer.concat(stderr).toString('utf8').trim().slice(0, 2_000);
        reject(new Error(errorOutput || `BMS bridge exited with ${exitCode ?? 1}`));
        return;
      }
      reject(new Error('BMS bridge exited without a structured result'));
    });
    child.stdin.end(JSON.stringify(input.payload));
  });
}

export class BmsBotProvider implements BookingProvider {
  readonly id = 'bms-bot';
  readonly name = 'BookMyShow via bms-bot';
  readonly capability = {
    categories,
    search: true,
    checkout: true,
    couponApplication: false,
    scheduling: true,
  } as const;
  readonly #config: FlowConfig['bmsBot'];
  readonly #discovery: WebcmdDistrictProvider;

  constructor(config: Pick<FlowConfig, 'bmsBot' | 'webcmd'>) {
    this.#config = config.bmsBot;
    this.#discovery = new WebcmdDistrictProvider(config.webcmd);
  }

  isEnabled(): boolean {
    return this.#config.path !== undefined;
  }

  supports(category: BookingCategory): boolean {
    return category === 'movie';
  }

  async health(): Promise<ProviderHealth> {
    if (this.#config.path === undefined) {
      return { available: false, message: 'FLOW_BMS_BOT_PATH is not configured' };
    }
    try {
      await Promise.all([
        access(resolve(this.#config.path, 'src', 'automation', 'bookingFlow.ts')),
        access(resolve(this.#config.path, 'node_modules', '.bin', 'tsx')),
        access(resolve(process.cwd(), 'integrations', 'bms-bot', 'bridge.ts')),
      ]);
      return { available: true, message: 'Pinned external BMS Bot checkout bridge is ready' };
    } catch {
      return {
        available: false,
        message: 'BMS Bot is present but has not been bootstrapped; see docs/providers/bms-bot.md',
      };
    }
  }

  async search(context: ProviderSearchContext): Promise<ProviderSearchResult> {
    if (!this.#discovery.isEnabled()) {
      return {
        offers: [],
        diagnostics: [
          {
            providerId: this.id,
            level: 'warning',
            code: 'bms_discovery_unavailable',
            message: 'BMS checkout is configured, but webcmd is required for movie discovery.',
            retryable: false,
          },
        ],
        deferredRuns: [],
      };
    }
    const result = await this.#discovery.search(context);
    return {
      offers: result.offers.map((offer) => ({
        ...offer,
        providerId: this.id,
        providerName: this.name,
        attributes: { ...offer.attributes, discoveryProvider: 'webcmd:district' },
      })),
      diagnostics: result.diagnostics.map((diagnostic) => ({ ...diagnostic, providerId: this.id })),
      deferredRuns: [],
    };
  }

  async prepareCheckout(context: ProviderCheckoutContext): Promise<CheckoutResult> {
    if (this.#config.path === undefined) {
      throw new ProviderError({
        providerId: this.id,
        code: 'bms_bot_unconfigured',
        message: 'FLOW_BMS_BOT_PATH is not configured',
        retryable: false,
      });
    }
    const health = await this.health();
    if (!health.available) {
      throw new ProviderError({
        providerId: this.id,
        code: 'bms_bot_unavailable',
        message: health.message,
        retryable: false,
      });
    }
    const intent = context.booking.intent;
    const metadata = intent.metadata;
    const bookingDate =
      intent.timeWindow === undefined
        ? undefined
        : dateInTimeZone(intent.timeWindow.start, intent.timeWindow.timezone);
    const city = intent.venue?.city ?? intent.destination?.city ?? intent.venue?.label;
    if (city === undefined) {
      throw new ProviderError({
        providerId: this.id,
        code: 'bms_city_missing',
        message: 'BookMyShow checkout requires a city',
        retryable: false,
      });
    }
    const theatres = stringArray(metadata.theatres);
    const discoveredTheatre = textValue(context.offer.attributes, 'cinema');
    if (theatres.length === 0 && discoveredTheatre !== undefined) theatres.push(discoveredTheatre);
    const contactEmail = typeof metadata.contactEmail === 'string' ? metadata.contactEmail : '';
    const contactPhone = typeof metadata.contactPhone === 'string' ? metadata.contactPhone : '';
    const seatPreference = intent.seatPreference;
    const payload: Record<string, unknown> = {
      movieName: intent.title,
      city,
      theatres,
      preferredTimes: [textValue(context.offer.attributes, 'time')].filter(
        (value): value is string => value !== undefined,
      ),
      preferredFormats: stringArray(metadata.preferredFormats),
      preferredLanguages: stringArray(metadata.preferredLanguages),
      preferredScreens: stringArray(metadata.preferredScreens),
      date:
        bookingDate === undefined
          ? undefined
          : String(Number(bookingDate.slice('YYYY-MM-'.length))),
      seatPrefs: {
        count: seatPreference?.count ?? intent.partySize,
        avoidBottomRows: seatPreference?.avoidFrontRows ?? 2,
        preferCenter: seatPreference?.preferCenter ?? true,
        needAdjacent: seatPreference?.together ?? true,
        category: seatPreference?.preferredClasses[0],
      },
      userEmail: contactEmail,
      userPhone: contactPhone,
      giftCards: [],
    };

    let result: BridgeResult;
    try {
      result = await runBridge({
        botPath: this.#config.path,
        timeoutMs: this.#config.timeoutMs,
        handoffTtlMs: this.#config.handoffTtlMs,
        payload,
        ...(context.signal === undefined ? {} : { signal: context.signal }),
      });
    } catch (error) {
      throw new ProviderError({
        providerId: this.id,
        code: 'bms_bridge_failed',
        message: error instanceof Error ? error.message : 'BMS bridge failed',
        retryable: true,
      });
    }
    if (!result.success) {
      throw new ProviderError({
        providerId: this.id,
        code: 'bms_booking_preparation_failed',
        message: result.error ?? 'BMS Bot could not prepare checkout',
        retryable: true,
      });
    }
    const totalAmount = result.bookingResult?.totalAmount;
    if (totalAmount === undefined || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new ProviderError({
        providerId: this.id,
        code: 'bms_checkout_total_missing',
        message: 'BMS Bot did not expose a verifiable final total',
        retryable: true,
      });
    }
    const multiplier =
      context.offer.finalPrice.currency === 'JPY' || context.offer.finalPrice.currency === 'KRW'
        ? 1
        : 100;
    const handoffUrl =
      result.handoffUrl !== undefined &&
      URL.canParse(result.handoffUrl) &&
      new URL(result.handoffUrl).protocol === 'https:'
        ? result.handoffUrl
        : undefined;
    return {
      status: 'awaiting_user_action',
      providerId: this.id,
      externalReference: result.bookingResult?.bookingId ?? context.offer.externalId,
      finalPrice: {
        amountMinor: Math.round(totalAmount * multiplier),
        currency: context.offer.finalPrice.currency,
      },
      ...(result.bookingResult?.seats === undefined ? {} : { seats: result.bookingResult.seats }),
      nextAction: 'The browser is at the payment step. Review the total and complete payment.',
      ...(handoffUrl === undefined ? {} : { handoffUrl }),
      providerPayload: {
        screenshotCaptured: result.screenshotPath !== undefined,
        upstreamTotalAmount: totalAmount,
      },
    };
  }
}
