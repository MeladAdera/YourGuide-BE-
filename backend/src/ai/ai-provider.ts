/**
 * The model behind the advice, as the rest of the app sees it: one call,
 * one answer. The real one is Groq (`groq.provider.ts`); the e2e tests
 * replace it with a fake through this token. A second provider (Anthropic)
 * would be one more class behind the same interface, chosen in `ai.module.ts`.
 */
export const AI_PROVIDER = 'AI_PROVIDER';

export interface Prompt {
  /** Who the model is and how it must answer: the rules and the guidance. */
  system: string;
  /** The person's data and the struggle, in a fixed order. */
  user: string;
}

export interface Completion {
  /** The model's answer, expected to be the JSON of an `Advice`. */
  text: string;
  /** The model that answered, for the log. */
  model: string;
  /** What the call cost, for the log and the rate limits. */
  usage: { promptTokens: number; completionTokens: number };
}

export interface AiProvider {
  /** Throws `AiUnavailableError` when the model cannot answer. */
  complete(prompt: Prompt): Promise<Completion>;
}

/**
 * The model could not be used: down, rate-limited after the SDK's retries,
 * timed out, or stopped before an answer. `reason` names the error class or
 * the stop reason, nothing more: nothing from the prompt or the reply.
 */
export class AiUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(`The model could not answer: ${reason}`);
    this.name = 'AiUnavailableError';
  }
}
