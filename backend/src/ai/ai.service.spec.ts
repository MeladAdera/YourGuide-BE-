import { Logger } from '@nestjs/common';
import type { MockInstance } from 'vitest';
import { ApiError } from '../common/api-error.js';
import { AiUnavailableError, Completion, Prompt } from './ai-provider.js';
import { AiService } from './ai.service.js';

const PROMPT: Prompt = {
  system: 'Be kind.',
  user: 'My manager said my work is worthless.',
};

function service(reply: Completion | Error): AiService {
  return new AiService({
    complete: () =>
      reply instanceof Error ? Promise.reject(reply) : Promise.resolve(reply),
  });
}

function completion(text: string): Completion {
  return {
    text,
    model: 'fake',
    usage: { promptTokens: 10, completionTokens: 5 },
  };
}

/** Silences the logger and hands back what it was told. */
function spyOnLogger(): { log: MockInstance; warn: MockInstance } {
  return {
    log: vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
    warn: vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined),
  };
}

function firstMessage(spy: MockInstance): string {
  const first: unknown = spy.mock.calls[0]?.[0];
  return typeof first === 'string' ? first : '';
}

describe('AiService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers the parsed advice and logs the model and the tokens only', async () => {
    const logger = spyOnLogger();
    const ai = service(
      completion('{"advice":"Pick one piece.","nextStep":"Open the file."}'),
    );

    await expect(ai.advise(PROMPT)).resolves.toEqual({
      advice: 'Pick one piece.',
      nextStep: 'Open the file.',
    });
    const logged = firstMessage(logger.log);
    expect(logged).toContain('model=fake');
    expect(logged).toContain('promptTokens=10');
    expect(logged).not.toContain('manager');
    expect(logged).not.toContain('Pick one piece');
  });

  it.each([
    ['the model is unavailable', new AiUnavailableError('RateLimitError')],
    ['the reply is not an advice', completion('{"advice":"x"}')],
  ])(
    'answers 503 ai.unavailable when %s, logging the cause only',
    async (_, reply) => {
      const logger = spyOnLogger();
      const ai = service(reply);

      const error = await ai.advise(PROMPT).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).getStatus()).toBe(503);
      expect((error as ApiError).getResponse()).toMatchObject({
        code: 'ai.unavailable',
      });
      const warned = firstMessage(logger.warn);
      expect(warned).toMatch(/cause=(RateLimitError|nextStep missing)/);
      expect(warned).not.toContain('manager');
    },
  );

  it('lets any other error through', async () => {
    const ai = service(new TypeError('bug'));

    await expect(ai.advise(PROMPT)).rejects.toThrow(TypeError);
  });
});
