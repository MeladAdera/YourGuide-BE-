import { AiUnavailableError, Prompt } from './ai-provider.js';
import { FetchLike, OpenAiCompatibleProvider } from './compatible.provider.js';

const PROMPT: Prompt = { system: 'Be kind.', user: 'I am stuck.' };
const ANSWER = '{"advice":"Pick one piece.","nextStep":"Open the file."}';

function reply(
  overrides: { content?: unknown; finish_reason?: string } = {},
): Record<string, unknown> {
  return {
    id: 'cmpl-1',
    model: 'glm-4.7-flash',
    choices: [
      {
        index: 0,
        finish_reason: overrides.finish_reason ?? 'stop',
        message: {
          role: 'assistant',
          content: 'content' in overrides ? overrides.content : ANSWER,
        },
      },
    ],
    usage: { prompt_tokens: 321, completion_tokens: 45, total_tokens: 366 },
  };
}

function json(
  body: unknown,
  status = 200,
): Pick<Response, 'ok' | 'status' | 'json'> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  };
}

function provider(
  fetchImpl: FetchLike,
  options: Partial<
    ConstructorParameters<typeof OpenAiCompatibleProvider>[0]
  > = {},
): { provider: OpenAiCompatibleProvider; fetch: ReturnType<typeof vi.fn> } {
  const mock = vi.fn(fetchImpl);
  return {
    provider: new OpenAiCompatibleProvider(
      {
        baseUrl: 'https://api.z.ai/api/paas/v4',
        apiKey: 'zai_test',
        model: 'glm-4.7-flash',
        timeoutMs: 1000,
        extraBody: { thinking: { type: 'disabled' } },
        ...options,
      },
      mock,
    ),
    fetch: mock,
  };
}

function sentRequest(mock: ReturnType<typeof vi.fn>): {
  url: string;
  init: RequestInit & { headers: Record<string, string> };
  body: Record<string, unknown>;
} {
  const [url, init] = mock.mock.calls[0] as [
    string,
    RequestInit & { headers: Record<string, string>; body: string },
  ];
  return { url, init, body: JSON.parse(init.body) as Record<string, unknown> };
}

describe('OpenAiCompatibleProvider', () => {
  it('posts the prompt in JSON mode with the key, and reads the answer and the usage', async () => {
    const { provider: compatible, fetch } = provider(() =>
      Promise.resolve(json(reply())),
    );

    const result = await compatible.complete(PROMPT);

    expect(result).toEqual({
      text: ANSWER,
      model: 'glm-4.7-flash',
      usage: { promptTokens: 321, completionTokens: 45 },
    });
    const { url, init, body } = sentRequest(fetch);
    expect(url).toBe('https://api.z.ai/api/paas/v4/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer zai_test');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(body).toEqual({
      model: 'glm-4.7-flash',
      messages: [
        { role: 'system', content: 'Be kind.' },
        { role: 'user', content: 'I am stuck.' },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2048,
      temperature: 0.7,
      stream: false,
      thinking: { type: 'disabled' },
    });
  });

  it('sends no authorization header when the endpoint needs no key', async () => {
    const { provider: local, fetch } = provider(
      () => Promise.resolve(json(reply())),
      { apiKey: null, extraBody: undefined },
    );

    await local.complete(PROMPT);

    const { init, body } = sentRequest(fetch);
    expect(init.headers).not.toHaveProperty('authorization');
    expect(body).not.toHaveProperty('thinking');
  });

  it('unwraps a Markdown fence and joins text parts', async () => {
    const fenced = provider(() =>
      Promise.resolve(json(reply({ content: '```json\n' + ANSWER + '\n```' }))),
    );
    await expect(fenced.provider.complete(PROMPT)).resolves.toMatchObject({
      text: ANSWER,
    });

    const parts = provider(() =>
      Promise.resolve(
        json(
          reply({
            content: [
              { type: 'text', text: '{"advice":"A.",' },
              { type: 'text', text: '"nextStep":"B."}' },
            ],
          }),
        ),
      ),
    );
    await expect(parts.provider.complete(PROMPT)).resolves.toMatchObject({
      text: '{"advice":"A.","nextStep":"B."}',
    });
  });

  it.each([
    ['a rate limit', json({ error: { code: 1302 } }, 429), 'HTTP 429'],
    ['a wrong key', json({ error: { code: 1000 } }, 401), 'HTTP 401'],
    ['a refused location', json({}, 403), 'HTTP 403'],
    ['a server error', json({}, 500), 'HTTP 500'],
    [
      'a body that is not JSON',
      {
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('bad')),
      },
      'not JSON',
    ],
    ['a reply in another shape', json({ output: 'hi' }), 'unexpected reply'],
    ['a reply with no choices', json({ choices: [] }), 'unexpected reply'],
    [
      'a model that stopped for length',
      json(reply({ finish_reason: 'length', content: '{"adv' })),
      'finish_reason length',
    ],
    ['an empty answer', json(reply({ content: '   ' })), 'empty content'],
    ['a null answer', json(reply({ content: null })), 'empty content'],
  ])('is unavailable on %s', async (_, response, reason) => {
    const { provider: compatible } = provider(() => Promise.resolve(response));

    await expect(compatible.complete(PROMPT)).rejects.toThrow(
      AiUnavailableError,
    );
    await expect(compatible.complete(PROMPT)).rejects.toThrow(reason);
  });

  it('is unavailable when the network fails, named as a connection error', async () => {
    const { provider: compatible } = provider(() =>
      Promise.reject(new TypeError('fetch failed')),
    );

    await expect(compatible.complete(PROMPT)).rejects.toThrow(
      'ConnectionError',
    );
  });

  it('gives up at the deadline even while the endpoint is still silent', async () => {
    const { provider: compatible, fetch } = provider(
      () => new Promise(() => undefined),
      { timeoutMs: 20 },
    );

    await expect(compatible.complete(PROMPT)).rejects.toThrow('Timeout');
    expect(sentRequest(fetch).init.signal?.aborted).toBe(true);
  });

  it('lets a bug through as itself, not as unavailable', async () => {
    const { provider: compatible } = provider(() =>
      Promise.reject(new RangeError('bug')),
    );

    await expect(compatible.complete(PROMPT)).rejects.toThrow(RangeError);
  });
});
