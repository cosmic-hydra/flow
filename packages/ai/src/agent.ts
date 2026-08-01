import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import type { FlowConfig } from '@flow/config';
import type { Message } from '@flow/contracts';
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
    if (this.#client === undefined) return this.#localResponse(history);

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

  #localResponse(history: readonly Message[]): AgentResponse {
    const lastUserMessage = [...history].reverse().find((message) => message.role === 'user');
    const request = lastUserMessage?.content ?? '';
    return {
      content:
        request.length === 0
          ? 'Tell me what you want to book, when, where, your budget, and any seat or timing constraints.'
          : 'I saved your message, but natural-language booking is offline because OPENAI_API_KEY is not configured. You can still create, schedule, search, approve, and execute bookings through the structured interface; add the key to enable the chat planner.',
      bookingIds: [],
      toolCalls: [],
    };
  }
}
