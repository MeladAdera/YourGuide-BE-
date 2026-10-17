import { Advice } from '../../src/ai/advice.js';
import {
  AiProvider,
  AiUnavailableError,
  Completion,
  Prompt,
} from '../../src/ai/ai-provider.js';

/** What the fake answers unless told otherwise. */
export const FAKE_ADVICE: Advice = {
  advice:
    'Being stuck on a query is where the learning happens. Narrow it: one table, one condition, and read the result before adding anything else.',
  nextStep: 'Write one SELECT with a single WHERE on the orders table.',
};

/**
 * The model in every e2e test. It records each prompt it is given, so a
 * test can check what the model is told, and answers what the test says:
 * a fixed advice by default, any text, or a failure.
 */
export class FakeAi implements AiProvider {
  readonly calls: Prompt[] = [];
  private reply: Completion | Error = completion(JSON.stringify(FAKE_ADVICE));

  complete(prompt: Prompt): Promise<Completion> {
    this.calls.push(prompt);
    return this.reply instanceof Error
      ? Promise.reject(this.reply)
      : Promise.resolve(this.reply);
  }

  /** The prompt of the last call, or a failure if there was none. */
  get lastPrompt(): Prompt {
    const prompt = this.calls.at(-1);
    if (prompt === undefined) {
      throw new Error('The fake model was not called.');
    }
    return prompt;
  }

  answers(advice: Advice): this {
    this.reply = completion(JSON.stringify(advice));
    return this;
  }

  /** Any text, for a reply that is not an advice. */
  answersText(text: string): this {
    this.reply = completion(text);
    return this;
  }

  fails(error: Error = new AiUnavailableError('FakeDown')): this {
    this.reply = error;
    return this;
  }

  /** Back to the default answer, with no calls recorded. */
  reset(): void {
    this.calls.length = 0;
    this.reply = completion(JSON.stringify(FAKE_ADVICE));
  }
}

function completion(text: string): Completion {
  return {
    text,
    model: 'fake',
    usage: { promptTokens: 0, completionTokens: 0 },
  };
}
