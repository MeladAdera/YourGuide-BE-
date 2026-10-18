import type Groq from 'groq-sdk';
import { APIError, APIUserAbortError } from 'groq-sdk';
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from 'groq-sdk/resources/chat/completions';
import { ADVICE_SCHEMA } from './advice.js';
import { withDeadline } from './deadline.js';
import {
  AiProvider,
  AiUnavailableError,
  Completion,
  Prompt,
} from './ai-provider.js';

/** The part of the Groq client this adapter uses. The unit test passes a stub. */
export type GroqClient = Pick<Groq, 'chat'>;

export interface GroqOptions {
  /** The model id, e.g. `openai/gpt-oss-120b`. */
  model: string;
  /** The hard ceiling for one call, retries included. */
  timeoutMs: number;
}

/**
 * Room for the answer. The gpt-oss models think before they write, and the
 * thinking counts here too; Arabic also takes more tokens per character.
 * Too small, and the model stops with `finish_reason: 'length'`: a 503.
 */
const MAX_COMPLETION_TOKENS = 2048;

/** Groq, through its SDK: one chat completion in strict JSON-schema mode. */
export class GroqProvider implements AiProvider {
  constructor(
    private readonly client: GroqClient,
    private readonly options: GroqOptions,
  ) {}

  async complete(prompt: Prompt): Promise<Completion> {
    let response: ChatCompletion;
    try {
      response = await withDeadline(this.options.timeoutMs, (signal) =>
        this.client.chat.completions.create(this.request(prompt), { signal }),
      );
    } catch (error) {
      throw unavailable(error);
    }

    const choice = response.choices[0];
    if (choice === undefined) {
      throw new AiUnavailableError('no choice');
    }
    if (choice.finish_reason !== 'stop') {
      throw new AiUnavailableError(`finish_reason ${choice.finish_reason}`);
    }
    const text = choice.message.content;
    if (text === null || text.trim() === '') {
      throw new AiUnavailableError('empty content');
    }
    return {
      text,
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  private request(prompt: Prompt): ChatCompletionCreateParamsNonStreaming {
    return {
      model: this.options.model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      // Strict: Groq constrains the output to the schema token by token.
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'advice', strict: true, schema: ADVICE_SCHEMA },
      },
      // Short thinking, and none of it in the answer. The two options are
      // the ones Groq documents for gpt-oss; `reasoning_format` is not
      // supported there and would be refused.
      reasoning_effort: 'low',
      include_reasoning: false,
      max_completion_tokens: MAX_COMPLETION_TOKENS,
      temperature: 0.7,
    };
  }
}

/**
 * Every failure the SDK can raise becomes "unavailable", named by its class
 * only. Anything else is a bug in this adapter and stays a 500.
 */
function unavailable(error: unknown): unknown {
  if (error instanceof AiUnavailableError) {
    return error;
  }
  if (error instanceof APIUserAbortError) {
    // The only abort is the deadline above.
    return new AiUnavailableError('Timeout');
  }
  if (error instanceof APIError) {
    // RateLimitError, AuthenticationError, InternalServerError,
    // APIConnectionError, APIConnectionTimeoutError, ...
    return new AiUnavailableError(error.constructor.name);
  }
  return error;
}
