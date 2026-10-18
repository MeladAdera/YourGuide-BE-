import type { Mistral } from '@mistralai/mistralai';
import type {
  ChatCompletionResponse,
  ContentChunk,
} from '@mistralai/mistralai/models/components';
import {
  HTTPClientError,
  MistralError,
  RequestAbortedError,
  RequestTimeoutError,
  SDKValidationError,
} from '@mistralai/mistralai/models/errors';
import { ADVICE_SCHEMA } from './advice.js';
import {
  AiProvider,
  AiUnavailableError,
  Completion,
  Prompt,
} from './ai-provider.js';
import { withDeadline } from './deadline.js';

/** The part of the Mistral client this adapter uses. The unit test passes a stub. */
export type MistralClient = Pick<Mistral, 'chat'>;

export interface MistralOptions {
  /** The model id, e.g. `mistral-medium-latest`. */
  model: string;
  /** The hard ceiling for one call, retries included. */
  timeoutMs: number;
}

/**
 * Room for the answer. Arabic takes more tokens per character than English.
 * Too small, and the model stops with `finishReason: 'length'`: a 503.
 */
const MAX_TOKENS = 2048;

/** Mistral, through its SDK: one chat completion in strict JSON-schema mode. */
export class MistralProvider implements AiProvider {
  constructor(
    private readonly client: MistralClient,
    private readonly options: MistralOptions,
  ) {}

  async complete(prompt: Prompt): Promise<Completion> {
    let response: ChatCompletionResponse;
    try {
      response = await withDeadline(this.options.timeoutMs, (signal) =>
        this.client.chat.complete(
          {
            model: this.options.model,
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            // Strict: the output is constrained to the schema.
            responseFormat: {
              type: 'json_schema',
              jsonSchema: {
                name: 'advice',
                schemaDefinition: ADVICE_SCHEMA,
                strict: true,
              },
            },
            // Minimal thinking, none of it in the answer: the content comes
            // back as one string. Advice is not a maths problem.
            reasoningEffort: 'none',
            maxTokens: MAX_TOKENS,
            temperature: 0.7,
          },
          {
            timeoutMs: this.options.timeoutMs,
            retryCodes: ['429', '5XX'],
            fetchOptions: { signal },
          },
        ),
      );
    } catch (error) {
      throw unavailable(error);
    }

    const choice = response.choices[0];
    if (choice === undefined) {
      throw new AiUnavailableError('no choice');
    }
    if (choice.finishReason !== 'stop') {
      throw new AiUnavailableError(`finish_reason ${choice.finishReason}`);
    }
    const text = textOf(choice.message?.content);
    if (text.trim() === '') {
      throw new AiUnavailableError('empty content');
    }
    return {
      text,
      model: response.model,
      usage: {
        promptTokens: response.usage.promptTokens ?? 0,
        completionTokens: response.usage.completionTokens ?? 0,
      },
    };
  }
}

/**
 * The answer is one string, or a list of chunks when the model was asked to
 * show its thinking. Only the text chunks are the answer.
 */
function textOf(content: string | ContentChunk[] | null | undefined): string {
  if (typeof content === 'string') {
    return content;
  }
  if (content === null || content === undefined) {
    return '';
  }
  return content
    .flatMap((chunk) => (chunk.type === 'text' ? [chunk.text] : []))
    .join('');
}

/**
 * Every failure the SDK can raise becomes "unavailable", named by its class
 * (and status, for an HTTP answer). Anything else is a bug and stays a 500.
 */
function unavailable(error: unknown): unknown {
  if (error instanceof AiUnavailableError) {
    return error;
  }
  if (
    error instanceof RequestTimeoutError ||
    error instanceof RequestAbortedError
  ) {
    // The only abort is the deadline.
    return new AiUnavailableError('Timeout');
  }
  if (error instanceof HTTPClientError) {
    // ConnectionError, InvalidRequestError, UnexpectedClientError
    return new AiUnavailableError(error.constructor.name);
  }
  if (error instanceof MistralError) {
    // Any HTTP error answer: 401, 403, 422, 429, 5xx; also a reply the SDK
    // could not read (ResponseValidationError).
    return new AiUnavailableError(
      `${error.constructor.name} ${String(error.statusCode)}`,
    );
  }
  if (error instanceof SDKValidationError) {
    return new AiUnavailableError(error.constructor.name);
  }
  return error;
}
