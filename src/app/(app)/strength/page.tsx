import Link from "next/link";
import { getStrength, syncIfStale, PATTERNS, type ExerciseProgress } from "@/lib/training";
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
  return unit === "kg" ? `${r1(v)} kg` : `${Math.round(v)} reps`;
}

const shortDate = (d: string) => formatDate(d, { day: "numeric", month: "short", year: "2-digit" });

function Trend({ e }: { e: ExerciseProgress }) {
  if (e.status === "new") return <span className="small muted">Building</span>;
  if (e.trendPct == null) return null;
  const cls = e.status === "up" ? "good" : e.status === "down" ? "over" : "";
  const arrow = e.status === "up" ? "↑" : e.status === "down" ? "↓" : "→";
  return (
    <span className={`pill ${cls} num`}>
      {arrow} {e.trendPct > 0 ? "+" : ""}
      {Math.round(e.trendPct)}%
    </span>
  );
}

function LiftRow({ e, windowLabel }: { e: ExerciseProgress; windowLabel: string }) {
  return (
    <div className="lift">
      <div>
        <div className="name">{e.title}</div>
        <div className="small muted num">
          Now {fmtVal(e.current, e.unit)} · PR {fmtVal(e.pr.value, e.unit)}{" "}
          <span title={e.pr.topSet}>({shortDate(e.pr.date)})</span>
          {" · "}
          {e.sessionsInWindow}× in {windowLabel}
        </div>
      </div>
      <Sparkline
        series={e.weekly}
        label={`${e.title}: weekly best from ${e.weekly[0]?.value ?? ""} to ${e.weekly.at(-1)?.value ?? ""} ${e.unit}`}
      />
      <Trend e={e} />
    </div>
  );
}

export default async function StrengthPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const sp = await searchParams;
  const weeks = WINDOWS.includes(Number(sp.weeks)) ? Number(sp.weeks) : 12;
  const windowLabel = weeks < 52 ? `${weeks}w` : "1y";
  await syncIfStale(30);
  const r = await getStrength({ weeks });

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

  // The current week is still in progress, so average the four full weeks before it.
  const last4 = r.weeks.slice(-5, -1);
  const perWeek4 = last4.length ? r1(last4.reduce((a, w) => a + w.workouts, 0) / last4.length) : null;
  const inWindow = r.exercises.filter((e) => e.sessionsInWindow > 0);
  const active = inWindow.filter((e) => e.status !== "inactive");
  const inactive = inWindow.filter((e) => e.status === "inactive");
  const attention = active.filter((e) => e.attention);
  const maxSets = Math.max(1, ...r.weeks.map((w) => w.sets));
  const s = r.summary;
  const tracked = s.up + s.flat + s.down;

  return (
    <>
      <section className="card">
        <div className="spread">
          <h2>Strength</h2>
          <form action={syncHevyAction}>
            <button type="submit" className="small">Sync now</button>
          </form>
        </div>
        <div className="row small" style={{ margin: "6px 0 10px" }}>
          <span className="muted">Trend over</span>
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={`/strength?weeks=${w}`}
              aria-current={w === weeks ? "true" : undefined}
              className={w === weeks ? "pill" : "muted"}
            >
              {w < 52 ? `${w}w` : "1y"}
            </Link>
          ))}
        </div>
        <div className="metrics">
          <div className="metric">
            <span className="muted small">Getting stronger</span>
            <span className="v num" style={{ color: s.up ? "var(--good)" : undefined }}>{s.up}</span>
            <span className="small muted">of {tracked} lifts</span>
          </div>
          <div className="metric">
            <span className="muted small">Holding</span>
            <span className="v num">{s.flat}</span>
            <span className="small muted">within ±3%</span>
          </div>
          <div className="metric">
            <span className="muted small">Slipping</span>
            <span className="v num" style={{ color: s.down ? "var(--over)" : undefined }}>{s.down}</span>
            <span className="small muted">trending down</span>
          </div>
          <div className="metric">
            <span className="muted small">Workouts / week</span>
            <span className="v num">{perWeek4 ?? dash}</span>
            <span className="small muted">last 4 full weeks</span>
          </div>
        </div>
        {r.lastSyncError && <p className="notice">Last Hevy sync failed: {r.lastSyncError}</p>}
        <p className="hint">
          {r.lastSyncOkAt
            ? `Synced from Hevy ${r.lastSyncOkAt.toLocaleString("en-GB", { timeZone: process.env.APP_TIME_ZONE || "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`
            : "Not synced yet."}{" "}
          Trend = change in weekly best across the last {windowLabel} (needs 4+ weeks of data
          {s.new ? `; ${s.new} newer lift${s.new === 1 ? " is" : "s are"} still building` : ""}). Loaded lifts use estimated 1RM
          (Epley, best working set of 1–12 reps); assisted moves count body weight minus assistance; bodyweight moves count total
          reps across working sets; holds use the longest hold. Warm-ups are ignored.
        </p>
      </section>

      {attention.length > 0 && (
        <section className="card">
          <h2>Needs attention</h2>
          {attention.map((e) => (
            <div key={e.key} className="entry" style={{ gridTemplateColumns: "1fr auto" }}>
              <div>
                <div className="name">{e.title}</div>
                <div className="small muted">{e.attention}</div>
              </div>
              <span className="small muted num" title={e.pr.topSet}>
                {fmtVal(e.current, e.unit)} <span className="muted">/ PR {fmtVal(e.pr.value, e.unit)}</span>
              </span>
            </div>
          ))}
        </section>
      )}

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
        <h2>Lifts</h2>
        {active.length === 0 && <p className="small muted">No lifts in the last 4 weeks.</p>}
        {PATTERNS.map(({ key, label }) => {
          const group = active.filter((e) => e.pattern === key);
          if (!group.length) return null;
          return (
            <div key={key} className="lift-group">
              <h3>{label}</h3>
              {group.map((e) => (
                <LiftRow key={e.key} e={e} windowLabel={windowLabel} />
              ))}
            </div>
          );
        })}
        {inactive.length > 0 && (
          <details className="lift-group">
            <summary className="small">Not done in the last 4 weeks ({inactive.length})</summary>
            {inactive.map((e) => (
              <div key={e.key} className="entry" style={{ gridTemplateColumns: "1fr auto" }}>
                <div>
                  <div className="name">{e.title}</div>
                  <div className="small muted">Last done {shortDate(e.lastDate)}</div>
                </div>
                <span className="small muted num" title={e.pr.topSet}>PR {fmtVal(e.pr.value, e.unit)}</span>
              </div>
            ))}
          </details>
        )}
        <p className="hint">Sparklines show the best session of each week, so lighter and heavier days don&apos;t zigzag. Green dot = best week in the window.</p>
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
