import { Inject, Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../common/api-error.js';
import { Advice, AiReplyError, parseAdvice } from './advice.js';
import { AI_PROVIDER, AiUnavailableError } from './ai-provider.js';
import type { AiProvider, Prompt } from './ai-provider.js';

/**
 * Asks the model and checks its answer. The one place a model failure
 * becomes an API error (503 `ai.unavailable`), and the one place that logs
 * a call: the model, the time, the tokens, the error class. Never the
 * prompt, never the reply: both hold what the person wrote.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  /** The advice behind "I'm struggling". */
  advise(prompt: Prompt): Promise<Advice> {
    return this.ask(prompt, parseAdvice);
  }

  /**
   * One call: the model answers, `parse` turns the text into the expected
   * shape or throws `AiReplyError`. Any failure is 503 `ai.unavailable`.
   */
  async ask<T>(prompt: Prompt, parse: (text: string) => T): Promise<T> {
    const startedAt = Date.now();
    try {
      const completion = await this.provider.complete(prompt);
      const result = parse(completion.text);
      this.logger.log(
        `advice ok model=${completion.model} ms=${elapsed(startedAt)} ` +
          `promptTokens=${String(completion.usage.promptTokens)} ` +
          `completionTokens=${String(completion.usage.completionTokens)}`,
      );
      return result;
    } catch (error) {
      if (
        error instanceof AiUnavailableError ||
        error instanceof AiReplyError
      ) {
        this.logger.warn(
          `advice failed cause=${error.reason} ms=${elapsed(startedAt)}`,
        );
        throw new ApiError('ai.unavailable');
      }
      throw error;
    }
  }
}

function elapsed(startedAt: number): string {
  return String(Date.now() - startedAt);
}
