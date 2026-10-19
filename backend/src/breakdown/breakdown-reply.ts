import { AiReplyError } from '../ai/advice.js';
import { MAX_STEP_TITLE } from '../steps/dto/create-step.dto.js';

/** Decided with the user on 2026-10-19: three to seven, the model decides. */
export const MIN_STEPS = 3;
export const MAX_STEPS = 7;

/**
 * The model's text → the step titles, or `AiReplyError`. Each title is
 * trimmed and must fit a step's own title rule, so the screen can create
 * the steps as they are. Repeats, case aside, are dropped before counting.
 */
export function parseBreakdown(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiReplyError('not JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AiReplyError('not an object');
  }
  const steps = (parsed as Record<string, unknown>).steps;
  if (!Array.isArray(steps)) {
    throw new AiReplyError('steps missing');
  }
  const titles: string[] = [];
  for (const step of steps) {
    if (typeof step !== 'string') {
      throw new AiReplyError('step not text');
    }
    const title = step.replace(/\s+/g, ' ').trim();
    if (title === '') {
      throw new AiReplyError('step blank');
    }
    if (title.length > MAX_STEP_TITLE) {
      throw new AiReplyError('step too long');
    }
    if (!titles.some((seen) => seen.toLowerCase() === title.toLowerCase())) {
      titles.push(title);
    }
  }
  if (titles.length < MIN_STEPS) {
    throw new AiReplyError('too few steps');
  }
  if (titles.length > MAX_STEPS) {
    throw new AiReplyError('too many steps');
  }
  return titles;
}
