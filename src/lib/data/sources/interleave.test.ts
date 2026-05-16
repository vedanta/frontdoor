import { describe, expect, it } from 'vitest';
import { interleave } from './interleave';

describe('interleave', () => {
  it('returns [] for empty input', () => {
    expect(interleave([], 5)).toEqual([]);
    expect(interleave([['a']], 0)).toEqual([]);
    expect(interleave([['a']], -1)).toEqual([]);
  });

  it('single group: takes first `total`', () => {
    expect(interleave([['a', 'b', 'c', 'd']], 2)).toEqual(['a', 'b']);
    expect(interleave([['a', 'b']], 5)).toEqual(['a', 'b']); // can't exceed available
  });

  it('multi-group: round-robins across groups', () => {
    const result = interleave(
      [
        ['nyt-1', 'nyt-2', 'nyt-3'],
        ['bbc-1', 'bbc-2', 'bbc-3'],
        ['npr-1', 'npr-2', 'npr-3'],
      ],
      6,
    );
    expect(result).toEqual(['nyt-1', 'bbc-1', 'npr-1', 'nyt-2', 'bbc-2', 'npr-2']);
  });

  it('multi-group: skips exhausted groups, keeps drawing from the others', () => {
    const result = interleave(
      [
        ['a-1'], // only 1
        ['b-1', 'b-2', 'b-3'],
      ],
      4,
    );
    expect(result).toEqual(['a-1', 'b-1', 'b-2', 'b-3']);
  });

  it('total greater than the sum of items: returns everything in round-robin order', () => {
    const result = interleave([['a', 'b'], ['c']], 100);
    expect(result).toEqual(['a', 'c', 'b']);
  });
});
