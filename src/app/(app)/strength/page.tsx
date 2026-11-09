import Link from "next/link";
import { getStrength, syncIfStale, type ExerciseProgress } from "@/lib/training";
import { formatDate } from "@/lib/dates";
import { Sparkline } from "@/components/Sparkline";
import { fmtInt, r1 } from "@/components/ui";
import { syncHevyAction } from "../../actions";

export const maxDuration = 300;

const WINDOWS = [8, 12, 26, 52];
const dash = "–";

function fmtVal(v: number | null, unit: string) {
  if (v == null) return dash;
  if (unit === "s") return v >= 60 ? `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}` : `${Math.round(v)} s`;
  return unit === "kg" ? `${r1(v)} kg` : `${Math.round(v)}`;
}

function Change({ e }: { e: ExerciseProgress }) {
  if (e.change == null) return <span className="small muted">{e.current == null ? "Not in last 4 wks" : "New"}</span>;
  const cls = e.change > 0 ? "good" : e.change < 0 ? "over" : "";
  const sign = e.change > 0 ? "+" : "";
  return (
    <span className={`pill ${cls}`}>
      {sign}
      {e.unit === "s" ? Math.round(e.change) + " s" : e.unit === "kg" ? `${r1(e.change)} kg` : Math.round(e.change)}
      {e.changePct != null && e.unit === "kg" ? ` (${sign}${r1(e.changePct)}%)` : ""}
    </span>
  );
}

export default async function StrengthPage({ searchParams }: { searchParams: Promise<{ weeks?: string; all?: string }> }) {
  const sp = await searchParams;
  const weeks = WINDOWS.includes(Number(sp.weeks)) ? Number(sp.weeks) : 12;
  const showAll = sp.all === "1";
  await syncIfStale(30);
  const r = await getStrength({ weeks });
  const qs = (p: Record<string, string | number | undefined>) =>
    "/strength?" + new URLSearchParams(Object.entries({ weeks, all: showAll ? "1" : undefined, ...p }).filter(([, v]) => v != null) as [string, string][]);

  if (!r.configured && !r.totalWorkouts) {
    return (
      <section className="card">
        <h2>Connect Hevy</h2>
        <p className="small">
          Add <code>HEVY_API_KEY</code> (Hevy → Settings → Developer, needs Hevy Pro) and <code>CRON_SECRET</code> in Vercel, then
          redeploy. Workouts sync daily, and whenever you open this page.
        </p>
      </section>
    );
  }

  const inWindow = r.weeks.reduce((a, w) => a + w.workouts, 0);
  // The current week is still in progress, so average the four full weeks before it.
  const last4 = r.weeks.slice(-5, -1);
  const perWeek4 = last4.length ? r1(last4.reduce((a, w) => a + w.workouts, 0) / last4.length) : null;
  const active = r.exercises.filter((e) => e.sessionsInWindow > 0);
  const lifts = showAll ? active : active.slice(0, 12);
  const maxSets = Math.max(1, ...r.weeks.map((w) => w.sets));

  return (
    <>
      <section className="card">
        <div className="spread">
          <h2>Strength</h2>
          <form action={syncHevyAction}>
            <button type="submit" className="small">Sync now</button>
          </form>
        </div>
        <div className="metrics">
          <div className="metric">
            <span className="muted small">Workouts / week</span>
            <span className="v num">{perWeek4 ?? dash}</span>
            <span className="small muted">last 4 full weeks</span>
          </div>
          <div className="metric">
            <span className="muted small">Workouts</span>
            <span className="v num">{inWindow}</span>
            <span className="small muted">last {weeks} weeks</span>
          </div>
          <div className="metric">
            <span className="muted small">Lifts with new PRs</span>
            <span className="v num">{r.newPrs.length}</span>
            <span className="small muted">last 4 weeks</span>
          </div>
        </div>
        {r.lastSyncError && <p className="notice">Last Hevy sync failed: {r.lastSyncError}</p>}
        <p className="hint">
          {r.lastSyncOkAt
            ? `Synced from Hevy ${r.lastSyncOkAt.toLocaleString("en-GB", { timeZone: process.env.APP_TIME_ZONE || "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
            : "Not synced yet."}{" "}
          Loaded lifts use estimated 1RM (Epley, best working set of 1–12 reps). Assisted moves count body weight minus assistance (needs a weigh-in within 2 weeks); bodyweight moves use max reps. Warm-ups are ignored.
        </p>
      </section>

      {r.newPrs.length > 0 && (
        <section className="card">
          <h2>New PRs</h2>
          {r.newPrs.slice(0, 8).map((p, i) => (
            <div key={i} className="entry" style={{ gridTemplateColumns: "1fr auto" }}>
              <div>
                <div className="name">{p.title}</div>
                <div className="small muted">
                  {formatDate(p.date, { weekday: "short", day: "numeric", month: "short" })} · {p.topSet}
                </div>
              </div>
              <span className="pill good num">
                {fmtVal(p.value, p.unit)} <span className="muted">was {fmtVal(p.previous, p.unit)}</span>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="spread">
          <h2>Lifts</h2>
          <div className="row small">
            {WINDOWS.map((w) => (
              <Link key={w} href={qs({ weeks: w })} aria-current={w === weeks ? "true" : undefined} className={w === weeks ? "pill" : "muted"}>
                {w < 52 ? `${w}w` : "1y"}
              </Link>
            ))}
          </div>
        </div>
        {lifts.length === 0 && <p className="small muted">No workouts in this window.</p>}
        {lifts.map((e) => (
          <div key={e.key} className="lift">
            <div>
              <div className="name">{e.title}</div>
              <div className="small muted num">
                Now {fmtVal(e.current, e.unit)} · PR {fmtVal(e.pr.value, e.unit)}{" "}
                <span title={e.pr.topSet}>({formatDate(e.pr.date, { day: "numeric", month: "short", year: "2-digit" })})</span>
                {" · "}
                {e.sessionsInWindow}× in {weeks < 52 ? `${weeks}w` : "1y"}
              </div>
            </div>
            <Sparkline series={e.series} label={`${e.title}: ${e.windowStart ?? ""} to ${e.series.at(-1)?.value ?? ""} ${e.unit}`} />
            <Change e={e} />
          </div>
        ))}
        {!showAll && active.length > lifts.length && (
          <Link className="small muted" href={qs({ all: "1" })}>
            Show all {active.length} exercises
          </Link>
        )}
        <p className="hint">Change compares the best of the last 4 weeks with the 4 weeks before. Green dot = best session in the window.</p>
      </section>

      <section className="card">
        <h2>Weekly load</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Week of</th>
                <th>Workouts</th>
                <th>Sets</th>
                <th style={{ width: "35%" }} aria-hidden="true"></th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {[...r.weeks].reverse().map((w) => (
                <tr key={w.start}>
                  <td>
                    <Link href={`/week?start=${w.start}`}>{formatDate(w.start, { day: "numeric", month: "short" })}</Link>
                  </td>
                  <td>{w.workouts || dash}</td>
                  <td>{w.sets || dash}</td>
                  <td aria-hidden="true">
                    <div className="bar">
                      <i style={{ width: `${(w.sets / maxSets) * 100}%` }} />
                    </div>
                  </td>
                  <td>{w.volumeKg ? `${fmtInt(w.volumeKg)} kg` : dash}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {r.recentWorkouts.length > 0 && (
        <section className="card">
          <h2>Recent workouts</h2>
          {r.recentWorkouts.map((w, i) => (
            <div key={i} className="entry" style={{ gridTemplateColumns: "1fr auto" }}>
              <div>
                <div className="name">{w.title}</div>
                <div className="small muted">
                  <Link href={`/?date=${w.date}`}>{formatDate(w.date, { weekday: "short", day: "numeric", month: "short" })}</Link>
                  {w.minutes != null && ` · ${w.minutes} min`}
                </div>
              </div>
              <span className="small muted num">
                {w.sets} sets{w.volumeKg ? ` · ${fmtInt(w.volumeKg)} kg` : ""}
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
