import {
  AiReplyError,
  MAX_ADVICE_LENGTH,
  MAX_NEXT_STEP_LENGTH,
  parseAdvice,
} from './advice.js';

describe('parseAdvice', () => {
  it('reads the two fields and trims them', () => {
    const text = JSON.stringify({
      advice: '  Pick the smallest piece.  ',
      nextStep: 'Write one SELECT.\n',
    });

    expect(parseAdvice(text)).toEqual({
      advice: 'Pick the smallest piece.',
      nextStep: 'Write one SELECT.',
    });
  });

  it('accepts text at the length caps', () => {
    const text = JSON.stringify({
      advice: 'a'.repeat(MAX_ADVICE_LENGTH),
      nextStep: 'b'.repeat(MAX_NEXT_STEP_LENGTH),
    });

    expect(parseAdvice(text).advice).toHaveLength(MAX_ADVICE_LENGTH);
  });

  it.each([
    ['not JSON', 'Pick the smallest piece.'],
    ['not an object', '"just a string"'],
    ['not an object', '["advice", "nextStep"]'],
    ['advice missing', '{ "nextStep": "x" }'],
    ['advice missing', '{ "advice": 42, "nextStep": "x" }'],
    ['advice blank', '{ "advice": "   ", "nextStep": "x" }'],
    ['nextStep missing', '{ "advice": "x" }'],
    ['nextStep blank', '{ "advice": "x", "nextStep": "" }'],
    [
      'advice too long',
      JSON.stringify({
        advice: 'a'.repeat(MAX_ADVICE_LENGTH + 1),
        nextStep: 'x',
      }),
    ],
    [
      'nextStep too long',
      JSON.stringify({
        advice: 'x',
        nextStep: 'b'.repeat(MAX_NEXT_STEP_LENGTH + 1),
      }),
    ],
  ])('refuses %s', (reason, text) => {
    expect(() => parseAdvice(text)).toThrow(AiReplyError);
    expect(() => parseAdvice(text)).toThrow(reason);
  });
});
