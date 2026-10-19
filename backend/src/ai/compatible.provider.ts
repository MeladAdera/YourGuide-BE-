import {
  AiProvider,
  AiUnavailableError,
  Completion,
  Prompt,
} from './ai-provider.js';
import { withDeadline } from './deadline.js';

export interface CompatibleOptions {
  /** Up to and excluding `/chat/completions`, e.g. `https://api.z.ai/api/paas/v4`. */
  baseUrl: string;
  /** Null for an endpoint that needs none, such as a local model. */
  apiKey: string | null;
  model: string;
  /** The hard ceiling for one call. */
  timeoutMs: number;
  /** Provider-specific fields merged into the request body, e.g. Z.ai's `thinking`. */
  extraBody?: Record<string, unknown>;
}

/** `fetch`, as this adapter uses it. The unit test passes a stub. */
export type FetchLike = (
  url: string,
  init: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/**
 * Room for the answer. Arabic takes more tokens per character than English.
 * Too small, and the model stops with `finish_reason: "length"`: a 503.
 */
const MAX_TOKENS = 2048;

/**
 * Any provider that speaks the OpenAI-style chat API: Z.ai, a local or cloud
 * Ollama, Cloudflare Workers AI, Qwen, DeepSeek. No SDK: one POST with the
 * platform's `fetch`, one JSON answer. The output is asked for in JSON
 * mode (`json_object`), which every such provider understands; the exact
 * shape is then checked by `parseAdvice`, as for every provider.
 */
export class OpenAiCompatibleProvider implements AiProvider {
  constructor(
    private readonly options: CompatibleOptions,
    private readonly fetchImpl: FetchLike = (url, init) => fetch(url, init),
  ) {}

  async complete(prompt: Prompt): Promise<Completion> {
    let reply: Reply;
    try {
      reply = await withDeadline(this.options.timeoutMs, async (signal) => {
        const response = await this.fetchImpl(
          `${this.options.baseUrl}/chat/completions`,
          {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(this.body(prompt)),
            signal,
          },
        );
        if (!response.ok) {
          throw new AiUnavailableError(`HTTP ${String(response.status)}`);
        }
        let json: unknown;
        try {
          json = await response.json();
        } catch {
          throw new AiUnavailableError('not JSON');
        }
        return readReply(json);
      });
    } catch (error) {
      throw unavailable(error);
    }

    if (reply.finishReason !== 'stop') {
      throw new AiUnavailableError(`finish_reason ${reply.finishReason}`);
    }
    const text = stripFences(reply.text);
    if (text === '') {
      throw new AiUnavailableError('empty content');
    }
    return {
      text,
      model: reply.model ?? this.options.model,
      usage: reply.usage,
    };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };
    if (this.options.apiKey !== null) {
      headers.authorization = `Bearer ${this.options.apiKey}`;
    }
    return headers;
  }

  private body(prompt: Prompt): Record<string, unknown> {
    return {
      model: this.options.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
      stream: false,
      ...this.options.extraBody,
    };
  }
}

interface Reply {
  text: string;
  finishReason: string;
  model: string | undefined;
  usage: { promptTokens: number; completionTokens: number };
}

/**
 * The parts of an OpenAI-style answer this adapter reads, checked field by
 * field: a reply in another shape is "unavailable", never a crash.
 */
function readReply(json: unknown): Reply {
  const root = asObject(json);
  const choices = root?.choices;
  const choice = Array.isArray(choices) ? asObject(choices[0]) : undefined;
  const message = asObject(choice?.message);
  if (root === undefined || choice === undefined || message === undefined) {
    throw new AiUnavailableError('unexpected reply');
  }
  const usage = asObject(root.usage);
  return {
    text: textOf(message.content),
    finishReason:
      typeof choice.finish_reason === 'string' ? choice.finish_reason : 'none',
    model: typeof root.model === 'string' ? root.model : undefined,
    usage: {
      promptTokens: numberOf(usage?.prompt_tokens),
      completionTokens: numberOf(usage?.completion_tokens),
    },
  };
}

/** A string, or a list of `{ type: "text", text }` parts; anything else is empty. */
function textOf(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => asObject(part))
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part?.text as string)
    .join('');
}

/**
 * Some models wrap JSON in a Markdown fence even in JSON mode. The fence is
 * not the answer; the JSON inside it is.
 */
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function numberOf(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * A failure of the call becomes "unavailable", named by its kind. Anything
 * else is a bug in this adapter and stays a 500.
 */
function unavailable(error: unknown): unknown {
  if (error instanceof AiUnavailableError) {
    return error;
  }
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return new AiUnavailableError('Timeout');
  }
  if (error instanceof TypeError) {
    // `fetch` reports every network failure as a TypeError ("fetch failed").
    return new AiUnavailableError('ConnectionError');
  }
  return error;
}
