/** A few sentences: about 200 words, in English or Arabic. */
export const MAX_ADVICE_LENGTH = 1200;
/** One concrete action: one or two lines. */
export const MAX_NEXT_STEP_LENGTH = 300;

/** What the model answers with, and what `POST /struggles` saves. */
export interface Advice {
  advice: string;
  nextStep: string;
}

/**
 * The shape the model must answer in, as a JSON schema. In Groq's strict
 * mode the output is constrained token by token to this shape: every
 * property required, no other property allowed.
 */
export const ADVICE_SCHEMA = {
  type: 'object',
  properties: {
    advice: { type: 'string' },
    nextStep: { type: 'string' },
  },
  required: ['advice', 'nextStep'],
  additionalProperties: false,
} as const;

/** The model answered, but not with an `Advice`. `reason` says which rule failed. */
export class AiReplyError extends Error {
  constructor(readonly reason: string) {
    super(`The model's reply is not an advice: ${reason}`);
    this.name = 'AiReplyError';
  }
}

/**
 * The model's text → an `Advice`, or `AiReplyError`. This is the boundary
 * check PROJECT.md §11 asks for: a reply is validated like a request body.
 */
export function parseAdvice(text: string): Advice {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiReplyError('not JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AiReplyError('not an object');
  }
  const reply = parsed as Record<string, unknown>;
  return {
    advice: field(reply, 'advice', MAX_ADVICE_LENGTH),
    nextStep: field(reply, 'nextStep', MAX_NEXT_STEP_LENGTH),
  };
}

function field(
  reply: Record<string, unknown>,
  name: keyof Advice,
  maxLength: number,
): string {
  const value = reply[name];
  if (typeof value !== 'string') {
    throw new AiReplyError(`${name} missing`);
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new AiReplyError(`${name} blank`);
  }
  if (trimmed.length > maxLength) {
    throw new AiReplyError(`${name} too long`);
  }
  return trimmed;
}
