import type { ChatCompletionResponse } from '@mistralai/mistralai/models/components';
import {
  ConnectionError,
  MistralError,
  RequestTimeoutError,
} from '@mistralai/mistralai/models/errors';
import { AiUnavailableError, Prompt } from './ai-provider.js';
import { MistralClient, MistralProvider } from './mistral.provider.js';

const PROMPT: Prompt = { system: 'Be kind.', user: 'I am stuck.' };
const ANSWER = '{"advice":"Pick one piece.","nextStep":"Open the file."}';

function completion(
  overrides: {
    content?: ChatCompletionResponse['choices'][number]['message'] extends
      infer M | undefined
      ? M extends { content?: infer C }
        ? C
        : never
      : never;
    finishReason?: ChatCompletionResponse['choices'][number]['finishReason'];
  } = {},
): ChatCompletionResponse {
  return {
    id: 'cmpl-1',
    object: 'chat.completion',
    created: 1,
    model: 'mistral-medium-2604',
    usage: { promptTokens: 321, completionTokens: 45, totalTokens: 366 },
    choices: [
      {
        index: 0,
        finishReason: overrides.finishReason ?? 'stop',
        message: {
          role: 'assistant',
          content: 'content' in overrides ? overrides.content : ANSWER,
        },
      },
    ],
  };
}

function httpError(status: number): MistralError {
  return new MistralError('refused', {
    response: new Response('{"message":"refused"}', { status }),
    request: new Request('https://api.mistral.ai/v1/chat/completions'),
    body: '{"message":"refused"}',
  });
}

function provider(
  complete: (...args: unknown[]) => Promise<ChatCompletionResponse>,
  timeoutMs = 1000,
): { provider: MistralProvider; complete: ReturnType<typeof vi.fn> } {
  const mock = vi.fn(complete);
  const client = { chat: { complete: mock } } as unknown as MistralClient;
  return {
    provider: new MistralProvider(client, {
      model: 'mistral-medium-latest',
      timeoutMs,
    }),
    complete: mock,
  };
}

describe('MistralProvider', () => {
  it('sends the prompt in strict JSON-schema mode without thinking', async () => {
    const { provider: mistral, complete } = provider(() =>
      Promise.resolve(completion()),
    );

    const result = await mistral.complete(PROMPT);

    expect(result).toEqual({
      text: ANSWER,
      model: 'mistral-medium-2604',
      usage: { promptTokens: 321, completionTokens: 45 },
    });
    expect(complete).toHaveBeenCalledTimes(1);
    const [body, options] = complete.mock.calls[0] as [
      Record<string, unknown>,
      { timeoutMs: number; fetchOptions: { signal: AbortSignal } },
    ];
    expect(body).toMatchObject({
      model: 'mistral-medium-latest',
      messages: [
        { role: 'system', content: 'Be kind.' },
        { role: 'user', content: 'I am stuck.' },
      ],
      responseFormat: {
        type: 'json_schema',
        jsonSchema: {
          name: 'advice',
          strict: true,
          schemaDefinition: {
            required: ['advice', 'nextStep'],
            additionalProperties: false,
          },
        },
      },
      reasoningEffort: 'none',
    });
    expect(body).not.toHaveProperty('stream');
    expect(options.timeoutMs).toBe(1000);
    expect(options.fetchOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('reads the text chunks when the answer comes as chunks', async () => {
    const { provider: mistral } = provider(() =>
      Promise.resolve(
        completion({
          content: [
            { type: 'thinking', thinking: [{ type: 'text', text: 'hmm' }] },
            { type: 'text', text: '{"advice":"A.",' },
            { type: 'text', text: '"nextStep":"B."}' },
          ],
        }),
      ),
    );

    await expect(mistral.complete(PROMPT)).resolves.toMatchObject({
      text: '{"advice":"A.","nextStep":"B."}',
    });
  });

  it.each([
    ['a rate limit after the retries', httpError(429), 'MistralError 429'],
    ['a refused location', httpError(403), 'MistralError 403'],
    ['a connection failure', new ConnectionError('down'), 'ConnectionError'],
    ['a request timeout', new RequestTimeoutError('slow'), 'Timeout'],
  ])('is unavailable on %s, named by its cause', async (_, error, reason) => {
    const { provider: mistral } = provider(() => Promise.reject(error));

    await expect(mistral.complete(PROMPT)).rejects.toThrow(AiUnavailableError);
    await expect(mistral.complete(PROMPT)).rejects.toThrow(reason);
  });

  it('is unavailable when the model stopped for length, or answered nothing', async () => {
    const cut = provider(() =>
      Promise.resolve(completion({ finishReason: 'length', content: '{"adv' })),
    );
    await expect(cut.provider.complete(PROMPT)).rejects.toThrow(
      'finish_reason length',
    );

    const empty = provider(() =>
      Promise.resolve(completion({ content: null })),
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
    const { provider: mistral, complete } = provider(
      () => new Promise<ChatCompletionResponse>(() => undefined),
      20,
    );

    await expect(mistral.complete(PROMPT)).rejects.toThrow('Timeout');
    const [, options] = complete.mock.calls[0] as [
      unknown,
      { fetchOptions: { signal: AbortSignal } },
    ];
    expect(options.fetchOptions.signal.aborted).toBe(true);
  });

  it('lets a bug through as itself, not as unavailable', async () => {
    const { provider: mistral } = provider(() =>
      Promise.reject(new TypeError('cannot read properties of undefined')),
    );

    await expect(mistral.complete(PROMPT)).rejects.toThrow(TypeError);
  });
});
