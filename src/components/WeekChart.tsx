import type { Day } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { r0, status } from "./ui";

function niceStep(x: number) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const n = x / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/** Bars = eaten, dashed line = that day's target. */
export function WeekChart({ days, metric, kind, today }: { days: Day[]; metric: "kcal" | "protein"; kind: "cap" | "min"; today: string }) {
  const W = 640, H = 240, padL = 64, padR = 8, padT = 12, padB = 40;
  const vals = days.map((d) => (d.entries.length ? d.totals[metric] : 0));
  const tgs = days.map((d) => d.targets[metric]);
  const max = Math.max(1, ...vals, ...tgs.filter((v): v is number => v != null)) * 1.1;
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const bw = (W - padL - padR) / 7;
  const grid: number[] = [];
  for (let g = 0; g <= top + 1e-6; g += step) grid.push(g);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric} per day this week`}>
      {grid.map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth={1} />
          <text x={padL - 6} y={y(g) + 7} textAnchor="end" fontSize={20} fill="var(--muted)" fontFamily="var(--body)">
            {r0(g)}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const x = padL + i * bw + bw * 0.18;
        const w = bw * 0.64;
        const v = vals[i];
        const tv = tgs[i];
        const st = d.entries.length ? status(v, tv, kind) : "";
        const col = st === "over" ? "var(--over)" : st === "good" ? "var(--good)" : "var(--accent)";
        const isToday = d.date === today;
        return (
          <g key={d.date}>
            {d.entries.length > 0 && <rect x={x} y={y(v)} width={w} height={Math.max(0, y(0) - y(v))} rx={4} fill={col} />}
            {tv != null && <line x1={x - 4} x2={x + w + 4} y1={y(tv)} y2={y(tv)} stroke="var(--ink)" strokeWidth={2} strokeDasharray="4 3" />}
            <text
              x={x + w / 2}
              y={H - 10}
              textAnchor="middle"
              fontSize={22}
              fill={isToday ? "var(--ink)" : "var(--muted)"}
              fontWeight={isToday ? 700 : 400}
              fontFamily="var(--body)"
            >
              {formatDate(d.date, { weekday: "narrow" })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
