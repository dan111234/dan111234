// Money and weight rounding. Amounts stay full precision except where docs/04 says "round2".

/** Half-up to cents on the decimal value, so 24.99 × 0.15 = 3.7485 -> 3.75 despite float error. */
export function round2(value: number): number {
  return Math.round(Number((value * 100).toFixed(6))) / 100;
}

/** Truncates to two decimals (docs/04 §2-2: weight used for fee table lookups). */
export function floor2(value: number): number {
  return Math.floor(Number((value * 100).toFixed(6))) / 100;
}
