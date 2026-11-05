import Link from "next/link";
import { getWeek } from "@/lib/data";
import { addDays, formatDate, isIsoDate, todayIso } from "@/lib/dates";
import { WeekChart } from "@/components/WeekChart";
import { fmtInt, r0, r1 } from "@/components/ui";

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const sp = await searchParams;
  const today = todayIso();
  const w = await getWeek(isIsoDate(sp.start) ? sp.start : today);
  const dash = "–";

  return (
    <>
      <section className="card">
        <div className="datebar">
          <Link className="btn icon" href={`/week?start=${addDays(w.start, -7)}`} aria-label="Previous week">
            ‹
          </Link>
          <div className="d">
            {formatDate(w.start, { day: "numeric", month: "short" })} – {formatDate(w.end, { day: "numeric", month: "short" })}
          </div>
          <Link className="btn icon" href={`/week?start=${addDays(w.start, 7)}`} aria-label="Next week">
            ›
          </Link>
        </div>
        <div className="metrics">
          <div className="metric">
            <span className="muted small">Avg calories</span>
            <span className="v num">{w.avg.kcal != null ? r0(w.avg.kcal) : dash}</span>
            <span className="small muted">
              {w.daysOnCalorieTarget}/{w.scoredDays} days in band
              {w.daysUnderCalorieBand + w.daysOverCalorieBand > 0 &&
                ` · ${w.daysUnderCalorieBand} under, ${w.daysOverCalorieBand} over`}
            </span>
          </div>
          <div className="metric">
            <span className="muted small">Avg protein</span>
            <span className="v num">{w.avg.protein != null ? `${r0(w.avg.protein)} g` : dash}</span>
            <span className="small muted">
              {w.daysHitProtein}/{w.scoredDays} days hit
            </span>
          </div>
          <div className="metric">
            <span className="muted small">Avg steps</span>
            <span className="v num">{w.avg.steps != null ? fmtInt(w.avg.steps) : dash}</span>
            <span className="small muted">
              {w.daysHitSteps}/{w.daysWithSteps} days hit
            </span>
          </div>
          <div className="metric">
            <span className="muted small">Weight, 7-day avg</span>
            <span className="v num">{w.weightTrendKg != null ? `${r1(w.weightTrendKg)} kg` : dash}</span>
            {w.weightBand ? (
              <span className={`small ${w.weightStatus === "in" ? "" : "muted"}`} style={{ color: w.weightStatus === "in" ? "var(--good)" : w.weightStatus ? "var(--over)" : undefined }}>
                {w.weightStatus === "in" ? "In band" : w.weightStatus === "over" ? "Above band" : w.weightStatus === "under" ? "Below band" : "No weigh-ins"}{" "}
                ({r1(w.weightBand.low)}–{r1(w.weightBand.high)} kg)
              </span>
            ) : (
              <span className="small muted">Set a baseline on Targets</span>
            )}
            <span className="small muted">
              {w.weighIns} weigh-ins
              {w.weightChangeKg != null && ` · ${w.weightChangeKg > 0 ? "+" : ""}${r1(w.weightChangeKg)} kg raw`}
            </span>
          </div>
        </div>
      </section>

      <section className="card chart">
        <h2>Calories vs target</h2>
        <WeekChart days={w.days} metric="kcal" kind="band" today={today} />
        <h2>Protein vs target</h2>
        <WeekChart days={w.days} metric="protein" kind="min" today={today} />
        <p className="hint">
          Bars show what you ate; the dashed line is that day&rsquo;s target. The shaded strip is the maintenance band (±
          {w.bands.kcalBandPct}%). Today isn&rsquo;t scored until it&rsquo;s over.
        </p>
      </section>

      <section className="card">
        <h2>Day by day</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>kcal</th>
                <th>Protein</th>
                <th>Carbs</th>
                <th>Fat</th>
                <th>Fibre</th>
                <th>Steps</th>
                <th>kg</th>
              </tr>
            </thead>
            <tbody>
              {w.days.map((d) => {
                const has = d.entries.length > 0;
                const kst = d.inProgress ? null : d.kcalStatus;
                return (
                  <tr key={d.date} className={d.date === today ? "today" : undefined}>
                    <td>
                      <Link href={`/?date=${d.date}`}>{formatDate(d.date, { weekday: "short", day: "numeric" })}</Link>
                    </td>
                    <td
                      style={{ color: kst === "over" ? "var(--over)" : kst === "in" ? "var(--good)" : kst === "under" ? "var(--accent)" : undefined }}
                      title={kst ? `${kst === "in" ? "In" : kst === "over" ? "Above" : "Below"} band` : undefined}
                    >
                      {has ? r0(d.totals.kcal) : dash}
                    </td>
                    <td>{has ? r0(d.totals.protein) : dash}</td>
                    <td>{has ? r0(d.totals.carbs) : dash}</td>
                    <td>{has ? r0(d.totals.fat) : dash}</td>
                    <td>{has ? r1(d.totals.fibre) : dash}</td>
                    <td>{d.steps != null ? fmtInt(d.steps) : dash}</td>
                    <td>{d.weightKg != null ? r1(d.weightKg) : dash}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
