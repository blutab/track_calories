import type { Range } from "@/lib/bands";

/** Carbs/fat: within 5% over the target still counts as fine. */
const CAP_TOLERANCE = 1.05;

export const r0 = (n: number | null | undefined) => Math.round(Number(n) || 0);
export const r1 = (n: number | null | undefined) => Math.round((Number(n) || 0) * 10) / 10;
export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-GB");

export type Kind = "cap" | "min" | "band";

/**
 * "cap" = stay under (carbs, fat), "min" = reach at least (protein, fibre, steps),
 * "band" = land inside the maintenance band (calories; pass the day's band).
 */
export function status(value: number, target: number | null, kind: Kind, band?: Range | null): "" | "good" | "over" {
  if (target == null || target <= 0) return "";
  if (kind === "band" && band) return value > band.high ? "over" : value >= band.low ? "good" : "";
  const p = value / target;
  if (kind === "cap" || kind === "band") return p > CAP_TOLERANCE ? "over" : p >= 0.9 ? "good" : "";
  return p >= 1 ? "good" : "";
}

export function Bar({ value, target, kind, band }: { value: number; target: number | null; kind: Kind; band?: Range | null }) {
  if (target == null || target <= 0) return null;
  const pct = Math.min(100, (value / target) * 100);
  return (
    <div className={`bar ${status(value, target, kind, band)}`} role="presentation">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
