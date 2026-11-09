import type { SessionBest } from "@/lib/training";

/** Per-session best over the window. The PR session in the window gets a filled dot. */
export function Sparkline({ series, label }: { series: SessionBest[]; label: string }) {
  const W = 120, H = 32, pad = 4;
  if (series.length < 2) return <svg className="spark" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" />;
  const vals = series.map((s) => s.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => pad + ((W - 2 * pad) * i) / (series.length - 1);
  const y = (v: number) => H - pad - ((H - 2 * pad) * (v - min)) / span;
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const iMax = vals.lastIndexOf(max);
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(iMax)} cy={y(max)} r={3} fill="var(--good)" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r={2.5} fill="var(--accent)" />
    </svg>
  );
}
