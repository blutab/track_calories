import Link from "next/link";
import { getWeek } from "@/lib/data";
import { addDays, formatDate, isIsoDate, todayIso } from "@/lib/dates";
import { WeekChart } from "@/components/WeekChart";
import { fmtInt, r0, r1, status } from "@/components/ui";

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
              {w.daysOnCalorieTarget}/{w.loggedDays} days on target
            </span>
          </div>
          <div className="metric">
            <span className="muted small">Avg protein</span>
            <span className="v num">{w.avg.protein != null ? `${r0(w.avg.protein)} g` : dash}</span>
            <span className="small muted">
              {w.daysHitProtein}/{w.loggedDays} days hit
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
            <span className="muted small">Weight change</span>
            <span className="v num">
              {w.weightChangeKg != null ? `${w.weightChangeKg > 0 ? "+" : ""}${r1(w.weightChangeKg)} kg` : dash}
            </span>
            <span className="small muted">{w.weighIns} weigh-ins</span>
          </div>
        </div>
      </section>

      <section className="card chart">
        <h2>Calories vs target</h2>
        <WeekChart days={w.days} metric="kcal" kind="cap" today={today} />
        <h2>Protein vs target</h2>
        <WeekChart days={w.days} metric="protein" kind="min" today={today} />
        <p className="hint">Bars show what you ate; the dashed line is that day&rsquo;s target.</p>
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
                const kst = has ? status(d.totals.kcal, d.targets.kcal, "cap") : "";
                return (
                  <tr key={d.date} className={d.date === today ? "today" : undefined}>
                    <td>
                      <Link href={`/?date=${d.date}`}>{formatDate(d.date, { weekday: "short", day: "numeric" })}</Link>
                    </td>
                    <td style={{ color: kst === "over" ? "var(--over)" : kst === "good" ? "var(--good)" : undefined }}>
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
