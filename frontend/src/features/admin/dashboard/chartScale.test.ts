import { niceMax, niceTicks } from './chartScale';

describe('chart scale', () => {
  it.each([
    [0, 1],
    [1, 1],
    [3, 5],
    [7, 10],
    [12, 20],
    [344.13, 500],
    [1980, 2000],
    [5001, 10000],
  ])('rounds %s up to %s', (value, top) => {
    expect(niceMax(value)).toBe(top);
  });

  it('keeps counts on whole ticks', () => {
    expect(niceTicks(10, true)).toEqual([0, 5, 10]);
    expect(niceTicks(1, true)).toEqual([0, 1]);
    expect(niceTicks(1, false)).toEqual([0, 0.5, 1]);
  });
});
