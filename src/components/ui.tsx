import { CALORIE_TOLERANCE } from "@/lib/data";

export const r0 = (n: number | null | undefined) => Math.round(Number(n) || 0);
export const r1 = (n: number | null | undefined) => Math.round((Number(n) || 0) * 10) / 10;
export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-GB");

/** "cap" = stay under (calories), "min" = reach at least (protein, steps). */
export function status(value: number, target: number | null, kind: "cap" | "min"): "" | "good" | "over" {
  if (target == null || target <= 0) return "";
  const p = value / target;
  if (kind === "cap") return p > CALORIE_TOLERANCE ? "over" : p >= 0.9 ? "good" : "";
  return p >= 1 ? "good" : "";
}

export function Bar({ value, target, kind }: { value: number; target: number | null; kind: "cap" | "min" }) {
  if (target == null || target <= 0) return null;
  const pct = Math.min(100, (value / target) * 100);
  return (
    <div className={`bar ${status(value, target, kind)}`} role="presentation">
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
