import { APIConnectionTimeoutError, RateLimitError } from 'groq-sdk';
import type { ChatCompletion } from 'groq-sdk/resources/chat/completions';
import { AiUnavailableError, Prompt } from './ai-provider.js';
import { GroqClient, GroqProvider } from './groq.provider.js';

const PROMPT: Prompt = { system: 'Be kind.', user: 'I am stuck.' };

function completion(
  overrides: {
    content?: string | null;
    finish_reason?: ChatCompletion.Choice['finish_reason'];
  } = {},
): ChatCompletion {
  return {
    id: 'chatcmpl-1',
    object: 'chat.completion',
    created: 1,
    model: 'openai/gpt-oss-120b',
    choices: [
      {
        index: 0,
        logprobs: null,
        finish_reason: overrides.finish_reason ?? 'stop',
        message: {
          role: 'assistant',
          content:
            overrides.content === undefined
              ? '{"advice":"Pick one piece.","nextStep":"Open the file."}'
              : overrides.content,
        },
      },
    ],
    usage: {
      prompt_tokens: 321,
      completion_tokens: 45,
      total_tokens: 366,
    },
  };
}

function provider(
  create: (...args: unknown[]) => Promise<ChatCompletion>,
  timeoutMs = 1000,
): { provider: GroqProvider; create: ReturnType<typeof vi.fn> } {
  const mock = vi.fn(create);
  const client = {
    chat: { completions: { create: mock } },
  } as unknown as GroqClient;
  return {
    provider: new GroqProvider(client, {
      model: 'openai/gpt-oss-120b',
      timeoutMs,
    }),
    create: mock,
  };
}

describe('GroqProvider', () => {
  it('sends the prompt in strict JSON-schema mode with short reasoning', async () => {
    const { provider: groq, create } = provider(() =>
      Promise.resolve(completion()),
    );

    const result = await groq.complete(PROMPT);

    expect(result).toEqual({
      text: '{"advice":"Pick one piece.","nextStep":"Open the file."}',
      model: 'openai/gpt-oss-120b',
      usage: { promptTokens: 321, completionTokens: 45 },
    });
    expect(create).toHaveBeenCalledTimes(1);
    const [body, options] = create.mock.calls[0] as [
      Record<string, unknown>,
      { signal: AbortSignal },
    ];
    expect(body).toMatchObject({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: 'Be kind.' },
        { role: 'user', content: 'I am stuck.' },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'advice',
          strict: true,
          schema: {
            required: ['advice', 'nextStep'],
            additionalProperties: false,
          },
        },
      },
      reasoning_effort: 'low',
      include_reasoning: false,
    });
    expect(body).not.toHaveProperty('reasoning_format');
    expect(body).not.toHaveProperty('stream');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [
      'a rate limit after the retries',
      new RateLimitError(429, {}, 'rate limited', new Headers()),
    ],
    ['a connection timeout', new APIConnectionTimeoutError()],
  ])('is unavailable on %s, named by its class', async (_, error) => {
    const { provider: groq } = provider(() => Promise.reject(error));

    await expect(groq.complete(PROMPT)).rejects.toThrow(AiUnavailableError);
    await expect(groq.complete(PROMPT)).rejects.toThrow(error.constructor.name);
  });

  it('is unavailable when the model stopped for length, or answered nothing', async () => {
    const cut = provider(() =>
      Promise.resolve(
        completion({ finish_reason: 'length', content: '{"adv' }),
      ),
    );
    await expect(cut.provider.complete(PROMPT)).rejects.toThrow(
      'finish_reason length',
    );

    const empty = provider(() =>
      Promise.resolve(completion({ content: '  ' })),
    );
    await expect(empty.provider.complete(PROMPT)).rejects.toThrow(
      'empty content',
    );

    const none = provider(() =>
      Promise.resolve({ ...completion(), choices: [] }),
    );
    await expect(none.provider.complete(PROMPT)).rejects.toThrow('no choice');
  });

  it('gives up at the deadline even while the SDK is still waiting', async () => {
    const { provider: groq, create } = provider(
      () => new Promise<ChatCompletion>(() => undefined),
      20,
    );

    await expect(groq.complete(PROMPT)).rejects.toThrow('Timeout');
    const [, options] = create.mock.calls[0] as [
      unknown,
      { signal: AbortSignal },
    ];
    expect(options.signal.aborted).toBe(true);
  });

  it('lets a bug through as itself, not as unavailable', async () => {
    const { provider: groq } = provider(() =>
      Promise.reject(new TypeError('cannot read properties of undefined')),
    );

    await expect(groq.complete(PROMPT)).rejects.toThrow(TypeError);
  });
});
