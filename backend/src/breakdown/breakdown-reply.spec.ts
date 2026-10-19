import { AiReplyError } from '../ai/advice.js';
import { parseBreakdown } from './breakdown-reply.js';

const THREE = ['Read the chapter', 'Write five queries', 'Add a WHERE to each'];

describe('parseBreakdown', () => {
  it('reads three to seven titles, trimmed, in order', () => {
    expect(parseBreakdown(JSON.stringify({ steps: THREE }))).toEqual(THREE);
    const seven = Array.from({ length: 7 }, (_, i) => `Step ${String(i + 1)}`);
    expect(parseBreakdown(JSON.stringify({ steps: seven }))).toEqual(seven);
    expect(
      parseBreakdown(
        JSON.stringify({ steps: ['  Read  the\nchapter ', ...THREE.slice(1)] }),
      ),
    ).toEqual(THREE);
  });

  it('drops a repeated title, case aside, before counting', () => {
    expect(
      parseBreakdown(JSON.stringify({ steps: [...THREE, 'read the chapter'] })),
    ).toEqual(THREE);
    expect(() =>
      parseBreakdown(JSON.stringify({ steps: ['A', 'a', 'B'] })),
    ).toThrow('too few steps');
  });

  it.each([
    ['not JSON', 'Read the chapter.'],
    ['not an object', '["a","b","c"]'],
    ['steps missing', '{"titles":["a","b","c"]}'],
    ['step not text', '{"steps":["a",2,"c"]}'],
    ['step blank', '{"steps":["a","  ","c"]}'],
    ['step too long', JSON.stringify({ steps: ['x'.repeat(201), 'b', 'c'] })],
    ['too few steps', '{"steps":["a","b"]}'],
    [
      'too many steps',
      JSON.stringify({ steps: ['1', '2', '3', '4', '5', '6', '7', '8'] }),
    ],
  ])('refuses %s', (reason, text) => {
    expect(() => parseBreakdown(text)).toThrow(AiReplyError);
    expect(() => parseBreakdown(text)).toThrow(reason);
  });
});
