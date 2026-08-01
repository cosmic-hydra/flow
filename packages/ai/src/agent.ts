import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { FlowConfig } from '@flow/config';
import type { CreateBookingInput, Message } from '@flow/contracts';
import { bookingAgentInstructions } from './prompt.js';
import {
  bookingAgentTools,
  isBookingAgentToolName,
  parseToolArguments,
  type BookingAgentToolName,
} from './tools.js';

export interface ChatToolContext {
  userId: string;
  conversationId: string;
  timezone: string;
  currentTime: string;
}

export interface ChatToolExecutor {
  execute(
    name: BookingAgentToolName,
    argumentsValue: unknown,
    context: ChatToolContext,
  ): Promise<unknown>;
}

export interface AgentToolTrace {
  name: BookingAgentToolName;
  status: 'succeeded' | 'failed';
}

export interface AgentResponse {
  content: string;
  bookingIds: string[];
  toolCalls: AgentToolTrace[];
}

function safetyIdentifier(userId: string): string {
  return createHash('sha256').update(`flow:${userId}`).digest('hex');
}

function collectBookingIds(value: unknown, output: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectBookingIds(item, output);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  if (typeof record.bookingId === 'string' && uuidPattern.test(record.bookingId)) {
    output.add(record.bookingId);
  }
  if (
    typeof record.id === 'string' &&
    uuidPattern.test(record.id) &&
    record.intent !== undefined &&
    record.automation !== undefined
  ) {
    output.add(record.id);
  }
  for (const entryValue of Object.values(record)) {
    collectBookingIds(entryValue, output);
  }
}

function detectCategory(text: string): CreateBookingInput['intent']['category'] {
  const value = text.toLowerCase();
  if (/\b(flight|flights|airfare|airport|iata)\b/u.test(value)) return 'flight';
  if (/\b(train|rail|jr pass)\b/u.test(value)) return 'train';
  if (/\b(hotel|stay|lodging|airbnb)\b/u.test(value)) return 'hotel';
  if (/\b(movie|cinema|showtimes?|seats?)\b/u.test(value)) return 'movie';
  if (/\b(restaurant|dinner|lunch|reservation|table)\b/u.test(value)) return 'restaurant';
  if (/\b(event|tickets?|concert|show)\b/u.test(value)) return 'event';
  if (/\b(rental|car hire)\b/u.test(value)) return 'rental';
  if (/\b(appointment|doctor|clinic)\b/u.test(value)) return 'appointment';
  return 'generic';
}

function detectBudget(text: string): { amountMinor: number; currency: string } | undefined {
  const usd = text.match(/\$\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/u);
  if (usd?.[1] !== undefined) {
    return { amountMinor: Math.round(Number(usd[1].replace(/,/gu, '')) * 100), currency: 'USD' };
  }
  const inr = text.match(/₹\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/u);
  if (inr?.[1] !== undefined) {
    return { amountMinor: Math.round(Number(inr[1].replace(/,/gu, '')) * 100), currency: 'INR' };
  }
  return undefined;
}

function buildLocalBookingInput(
  request: string,
  context: ChatToolContext,
): CreateBookingInput | undefined {
  const trimmed = request.trim();
  if (trimmed.length < 8) return undefined;
  if (
    !/\b(book|find|search|compare|reserve|schedule|flight|movie|hotel|restaurant|train)\b/iu.test(
      trimmed,
    )
  ) {
    return undefined;
  }

  const category = detectCategory(trimmed);
  const now = Date.parse(context.currentTime);
  const start = new Date(now + 14 * 24 * 60 * 60_000);
  start.setUTCHours(8, 0, 0, 0);
  const end = new Date(start.getTime() + 12 * 60 * 60_000);
  const researchAt = new Date(context.currentTime).toISOString();
  const deadline = new Date(start.getTime() - 60 * 60_000).toISOString();
  const budget = detectBudget(trimmed);
  const title =
    trimmed.length > 80 ? `${trimmed.slice(0, 77).trim()}…` : trimmed.replace(/\s+/gu, ' ');

  const intent: CreateBookingInput['intent'] = {
    category,
    title,
    description: trimmed,
    partySize: /\bfor\s+(\d+)\b/iu.test(trimmed)
      ? Number(/\bfor\s+(\d+)\b/iu.exec(trimmed)?.[1] ?? 1)
      : 1,
    preferredProviders: ['demo'],
    excludedProviders: [],
    constraints: [],
    metadata: { source: 'local_planner' },
    timeWindow: {
      start: start.toISOString(),
      end: end.toISOString(),
      timezone: context.timezone || 'UTC',
    },
  };
  if (budget !== undefined) intent.budget = budget;
  if (category === 'flight') {
    intent.origin = { label: 'Bengaluru', code: 'BLR', city: 'Bengaluru' };
    intent.destination = { label: 'Singapore', code: 'SIN', city: 'Singapore' };
  }

  return {
    intent,
    automation: {
      researchAt,
      deadline,
      refreshIntervalMinutes: 60,
      maxCouponAttempts: 8,
      autoExecuteWithinApproval: false,
    },
  };
}

export class BookingChatAgent {
  readonly #client?: OpenAI;
  readonly #config: FlowConfig['openai'];
  readonly #executor: ChatToolExecutor;

  constructor(input: { config: FlowConfig['openai']; executor: ChatToolExecutor }) {
    this.#config = input.config;
    this.#executor = input.executor;
    if (input.config.apiKey !== undefined) {
      this.#client = new OpenAI({ apiKey: input.config.apiKey });
    }
  }

  async respond(context: ChatToolContext, history: readonly Message[]): Promise<AgentResponse> {
    if (this.#client === undefined) return this.#localResponse(context, history);

    const input: OpenAI.Responses.ResponseInput = history
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-60)
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }));
    const trace: AgentToolTrace[] = [];
    const bookingIds = new Set<string>();

    for (let turn = 0; turn < 8; turn += 1) {
      const response = await this.#client.responses.create({
        model: this.#config.model,
        instructions: `${bookingAgentInstructions}\n\nRuntime context:\n- Current time: ${context.currentTime}\n- User timezone: ${context.timezone}\nResolve relative dates against this context and write the timezone into every booking time window.`,
        input,
        tools: bookingAgentTools as unknown as OpenAI.Responses.Tool[],
        store: false,
        reasoning: { effort: this.#config.reasoningEffort },
        text: { verbosity: 'medium' },
        safety_identifier: safetyIdentifier(context.userId),
      });
      input.push(...(response.output as unknown as OpenAI.Responses.ResponseInputItem[]));
      const calls = response.output.filter((item) => item.type === 'function_call');
      if (calls.length === 0) {
        return {
          content: response.output_text || 'I could not produce a booking response.',
          bookingIds: [...bookingIds],
          toolCalls: trace,
        };
      }

      for (const call of calls) {
        if (!isBookingAgentToolName(call.name)) {
          input.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify({ ok: false, error: 'Unknown tool requested' }),
          });
          continue;
        }
        const name = call.name;
        try {
          const rawArguments = JSON.parse(call.arguments) as unknown;
          const parsedArguments = parseToolArguments(name, rawArguments);
          const result = await this.#executor.execute(name, parsedArguments, context);
          collectBookingIds(result, bookingIds);
          trace.push({ name, status: 'succeeded' });
          input.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify({ ok: true, result }),
          });
        } catch (error) {
          trace.push({ name, status: 'failed' });
          input.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : 'Tool execution failed',
            }),
          });
        }
      }
    }

    return {
      content:
        'I reached the tool-call limit before finishing. Your saved booking state is unchanged.',
      bookingIds: [...bookingIds],
      toolCalls: trace,
    };
  }

  async #localResponse(
    context: ChatToolContext,
    history: readonly Message[],
  ): Promise<AgentResponse> {
    const lastUserMessage = [...history].reverse().find((message) => message.role === 'user');
    const request = lastUserMessage?.content ?? '';
    if (request.trim() === '') {
      return {
        content:
          'Tell me what you want to book, when, where, your budget, and any seat or timing constraints.',
        bookingIds: [],
        toolCalls: [],
      };
    }

    const plan = buildLocalBookingInput(request, context);
    if (plan === undefined) {
      return {
        content:
          'I can create a structured booking from chat even without OPENAI_API_KEY. Try something like “Find flights from Bengaluru to Singapore under $650” or use Structured booking.',
        bookingIds: [],
        toolCalls: [],
      };
    }

    const trace: AgentToolTrace[] = [];
    const bookingIds = new Set<string>();
    try {
      const created = await this.#executor.execute('create_booking', plan, context);
      collectBookingIds(created, bookingIds);
      trace.push({ name: 'create_booking', status: 'succeeded' });
      const bookingId = [...bookingIds][0];
      if (bookingId !== undefined) {
        const searched = await this.#executor.execute('search_booking', { bookingId }, context);
        collectBookingIds(searched, bookingIds);
        trace.push({ name: 'search_booking', status: 'succeeded' });
        const offers =
          searched !== null &&
          typeof searched === 'object' &&
          'offers' in searched &&
          Array.isArray((searched as { offers?: unknown }).offers)
            ? (searched as { offers: unknown[] }).offers.length
            : 0;
        return {
          content: `Created a ${plan.intent.category} booking and ranked ${offers} offer${offers === 1 ? '' : 's'} with the demo provider. Open Bookings to compare totals and approve checkout — the chat planner is using the local fallback until OPENAI_API_KEY is set.`,
          bookingIds: [...bookingIds],
          toolCalls: trace,
        };
      }
    } catch (error) {
      trace.push({ name: 'create_booking', status: 'failed' });
      return {
        content: `I tried to create a booking from your request, but it failed: ${error instanceof Error ? error.message : 'unknown error'}. Use Structured booking for full control.`,
        bookingIds: [...bookingIds],
        toolCalls: trace,
      };
    }

    return {
      content: 'I created a booking request. Open Bookings to continue search and approval.',
      bookingIds: [...bookingIds],
      toolCalls: trace,
    };
  }
}
