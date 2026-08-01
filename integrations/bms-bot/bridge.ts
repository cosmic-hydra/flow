import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface BookingFlowInstance {
  initialize(headless?: boolean): Promise<void>;
  attemptBooking(config: unknown): Promise<unknown>;
  cleanup(): Promise<void>;
}

interface BookingFlowConstructor {
  new (): BookingFlowInstance;
}

interface BrowserPage {
  url(): string;
  locator(selector: string): { innerText(): Promise<string> };
  once(event: 'close', listener: () => void): void;
  off(event: 'close', listener: () => void): void;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function amountFromPageText(value: string): number | undefined {
  const patterns = [
    /Amount\s+Payable\s*(?:₹|INR)?\s*([\d,]+(?:\.\d{1,2})?)/iu,
    /Total\s+Payable\s*(?:₹|INR)?\s*([\d,]+(?:\.\d{1,2})?)/iu,
  ];
  for (const pattern of patterns) {
    const matched = value.match(pattern)?.[1];
    if (matched === undefined) continue;
    const amount = Number(matched.replaceAll(',', ''));
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  return undefined;
}

async function enrichResult(flow: BookingFlowInstance, value: unknown): Promise<unknown> {
  const result = record(value);
  const bookingResult = record(result?.bookingResult);
  const internalPage = (flow as unknown as { page?: BrowserPage }).page;
  if (result === undefined || bookingResult === undefined || internalPage === undefined) {
    return value;
  }
  try {
    const pageText = await internalPage.locator('body').innerText();
    const totalAmount =
      typeof bookingResult.totalAmount === 'number'
        ? bookingResult.totalAmount
        : amountFromPageText(pageText);
    const currentUrl = internalPage.url();
    const handoffUrl =
      URL.canParse(currentUrl) && new URL(currentUrl).protocol === 'https:'
        ? currentUrl
        : undefined;
    return {
      ...result,
      bookingResult: {
        ...bookingResult,
        ...(totalAmount === undefined ? {} : { totalAmount }),
      },
      ...(handoffUrl === undefined ? {} : { handoffUrl }),
    };
  } catch {
    return value;
  }
}

function handoffTtlMs(): number {
  const configured = Number(process.env.FLOW_BMS_HANDOFF_TTL_MS ?? 600_000);
  return Number.isFinite(configured)
    ? Math.min(1_800_000, Math.max(60_000, Math.round(configured)))
    : 600_000;
}

function needsVisibleHandoff(value: unknown): boolean {
  const result = record(value);
  const bookingResult = record(result?.bookingResult);
  return result?.success === true && bookingResult?.bookingId === 'PENDING_PAYMENT';
}

async function holdVisibleHandoff(flow: BookingFlowInstance, ttlMs: number): Promise<void> {
  const page = (flow as unknown as { page?: BrowserPage }).page;
  if (page === undefined) return;
  await new Promise<void>((resolvePromise) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.off('SIGINT', finish);
      process.off('SIGTERM', finish);
      page.off('close', finish);
      resolvePromise();
    };
    const timer = setTimeout(finish, ttlMs);
    process.once('SIGINT', finish);
    process.once('SIGTERM', finish);
    page.once('close', finish);
  });
}

const botPath = process.env.FLOW_BMS_BOT_PATH;
if (botPath === undefined || botPath.trim() === '') {
  throw new Error('FLOW_BMS_BOT_PATH is required');
}

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) {
  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
}
const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
const moduleUrl = pathToFileURL(join(botPath, 'src', 'automation', 'bookingFlow.ts')).href;
const imported = (await import(moduleUrl)) as Record<string, unknown>;
const candidate = imported.BookingFlow;
if (typeof candidate !== 'function') {
  throw new Error('The configured bms-bot does not export BookingFlow');
}

const BookingFlow = candidate as BookingFlowConstructor;
const flow = new BookingFlow();
let result: unknown;
try {
  await flow.initialize(false);
  result = await enrichResult(flow, await flow.attemptBooking(payload));
  // Emit before the bounded handoff lease so the Flow worker can persist the result immediately.
  process.stdout.write(`FLOW_BMS_BRIDGE_RESULT=${JSON.stringify(result)}\n`);
  if (needsVisibleHandoff(result)) await holdVisibleHandoff(flow, handoffTtlMs());
} finally {
  await flow.cleanup();
}
