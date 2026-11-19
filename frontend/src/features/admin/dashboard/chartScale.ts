// A "nice" top for a value axis: 1, 2 or 5 times a power of ten, so the
// gridlines land on round numbers.
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((s) => s * power >= value) ?? 10;
  return step * power;
}

// Whole numbers stay whole on the axis (no "0.5 policies").
export function niceTicks(top: number, integer: boolean): number[] {
  const middle = top / 2;
  return integer && !Number.isInteger(middle) ? [0, top] : [0, middle, top];
}
