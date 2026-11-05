/**
 * Maintenance bands. Pure helpers, no database access, so UI components can import them.
 *
 * Calorie band: a day is "in" when intake is within ±pct of that day's kcal target.
 * Weight band: the 7-day rolling average weight is "in" when within ±bandKg of the baseline.
 */

export type Bands = {
  /** Half-width of the calorie band as a percentage of the day's kcal target, e.g. 8 = ±8%. */
  kcalBandPct: number;
  /** Maintenance weight. `null` = no weight band yet. */
  weightBaselineKg: number | null;
  /** Half-width of the weight band in kg, e.g. 1 = baseline ±1 kg. */
  weightBandKg: number;
};

export const DEFAULT_BANDS: Bands = { kcalBandPct: 8, weightBaselineKg: null, weightBandKg: 1 };

export type Range = { low: number; high: number };
export type BandStatus = "under" | "in" | "over";

const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;

export function kcalBand(target: number | null, pct: number): Range | null {
  if (target == null || target <= 0) return null;
  return { low: r0(target * (1 - pct / 100)), high: r0(target * (1 + pct / 100)) };
}

export function weightBand(b: Bands): Range | null {
  if (b.weightBaselineKg == null) return null;
  return { low: r1(b.weightBaselineKg - b.weightBandKg), high: r1(b.weightBaselineKg + b.weightBandKg) };
}

export function bandStatus(value: number | null, range: Range | null): BandStatus | null {
  if (value == null || range == null) return null;
  if (value < range.low) return "under";
  if (value > range.high) return "over";
  return "in";
}
