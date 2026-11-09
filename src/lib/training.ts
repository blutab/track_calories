/**
 * Strength training from Hevy: sync (Hevy → Postgres) and progression analysis.
 *
 * Hevy is the source of truth; this app only reads from it. Sync uses Hevy's
 * workout events feed (updates + deletes since a cursor), so after the first
 * full import each run fetches only what changed.
 */
import { asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addDays, mondayOf, todayIso } from "./dates";

const { hevyWorkouts, hevySets, hevySync, dayStats } = schema;

const API_BASE = (process.env.HEVY_API_BASE || "https://api.hevyapp.com").replace(/\/+$/, "");
const PAGE_SIZE = 10; // Hevy's maximum
const MAX_PAGES = 500;
/** Re-read a little before the cursor so a workout saved mid-run isn't missed. */
const CURSOR_OVERLAP_MS = 10 * 60 * 1000;

export const hevyConfigured = () => Boolean(process.env.HEVY_API_KEY?.trim());

const r1 = (n: number) => Math.round(n * 10) / 10;

// ---------- Hevy API ----------

type HevySet = {
  index?: number;
  type?: string;
  weight_kg?: number | null;
  reps?: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  rpe?: number | null;
};
type HevyWorkout = {
  id?: string;
  title?: string;
  start_time?: string;
  end_time?: string;
  updated_at?: string;
  exercises?: { index?: number; title?: string; exercise_template_id?: string; sets?: HevySet[] }[];
};
type HevyEvent = { type: "updated"; workout: HevyWorkout } | { type: "deleted"; id: string; deleted_at?: string };

async function hevyGet<T>(path: string, params: Record<string, string | number>): Promise<T | null> {
  const key = process.env.HEVY_API_KEY?.trim();
  if (!key) throw new Error("HEVY_API_KEY is not set.");
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { "api-key": key, accept: "application/json" }, cache: "no-store" });
    // Hevy answers 404 for a page past the end of the list.
    if (res.status === 404) return null;
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get("retry-after")) || 2 ** attempt;
      await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new Error("Hevy rejected the API key (needs Hevy Pro; check HEVY_API_KEY).");
    if (!res.ok) throw new Error(`Hevy API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }
}

async function fetchEventsSince(since: Date): Promise<HevyEvent[]> {
  const events: HevyEvent[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await hevyGet<{ page: number; page_count: number; events: HevyEvent[] }>("/v1/workouts/events", {
      page,
      pageSize: PAGE_SIZE,
      since: since.toISOString(),
    });
    if (!body?.events?.length) break;
    events.push(...body.events);
    if (page >= (body.page_count ?? page)) break;
  }
  return events;
}

// ---------- mapping ----------

/** Epley estimate. Only meaningful for 1–12 reps with load. */
export function e1rm(weightKg: number | null | undefined, reps: number | null | undefined): number | null {
  if (!weightKg || weightKg <= 0 || !reps || reps < 1 || reps > 12) return null;
  return r1(reps === 1 ? weightKg : weightKg * (1 + reps / 30));
}

const isAssisted = (title: string) => /assist/i.test(title);

function mapWorkout(w: HevyWorkout) {
  if (!w.id || !w.start_time) return null;
  const start = new Date(w.start_time);
  if (Number.isNaN(start.getTime())) return null;
  const sets: (typeof hevySets.$inferInsert)[] = [];
  let setCount = 0;
  let volume = 0;
  for (const [ei, ex] of (w.exercises ?? []).entries()) {
    const title = (ex.title || "Exercise").trim();
    const key = ex.exercise_template_id || `title:${title.toLowerCase()}`;
    for (const [si, s] of (ex.sets ?? []).entries()) {
      const type = s.type || "normal";
      const working = type !== "warmup";
      const weight = s.weight_kg ?? null;
      const reps = s.reps != null ? Math.round(s.reps) : null;
      if (working) {
        setCount++;
        if (weight && reps && !isAssisted(title)) volume += weight * reps;
      }
      sets.push({
        workoutId: w.id,
        exerciseIndex: ex.index ?? ei,
        setIndex: s.index ?? si,
        exerciseKey: key,
        exerciseTitle: title,
        type,
        weightKg: weight,
        reps,
        distanceM: s.distance_meters ?? null,
        durationS: s.duration_seconds != null ? Math.round(s.duration_seconds) : null,
        rpe: s.rpe ?? null,
        e1rmKg: working && !isAssisted(title) ? e1rm(weight, reps) : null,
      });
    }
  }
  const end = w.end_time ? new Date(w.end_time) : null;
  return {
    workout: {
      id: w.id,
      title: (w.title || "Workout").trim(),
      date: todayIso(start),
      startTime: start,
      endTime: end && !Number.isNaN(end.getTime()) ? end : null,
      hevyUpdatedAt: w.updated_at ? new Date(w.updated_at) : null,
      setCount,
      volumeKg: Math.round(volume),
    },
    sets,
  };
}

// ---------- sync ----------

export type SyncResult = { ok: boolean; skipped?: string; updated: number; deleted: number; since: string | null; error?: string };

async function getSyncRow() {
  const [row] = await getDb().select().from(hevySync).where(eq(hevySync.id, 1));
  return row ?? null;
}

async function saveSyncRow(patch: Partial<typeof hevySync.$inferInsert>) {
  await getDb()
    .insert(hevySync)
    .values({ id: 1, ...patch })
    .onConflictDoUpdate({ target: hevySync.id, set: patch });
}

/**
 * Pull workout changes from Hevy. `full` re-imports everything (use after changing
 * how sets are stored). Safe to run concurrently: a second run that can't get the
 * lock does nothing.
 */
export async function syncHevy({ full = false }: { full?: boolean } = {}): Promise<SyncResult> {
  if (!hevyConfigured()) return { ok: false, skipped: "HEVY_API_KEY is not set", updated: 0, deleted: 0, since: null };
  const startedAt = new Date();
  const row = full ? null : await getSyncRow();
  const since = row?.cursor ? new Date(row.cursor.getTime() - CURSOR_OVERLAP_MS) : new Date(0);
  try {
    const events = await fetchEventsSince(since);
    // Events are newest first; keep only the latest event per workout.
    const latest = new Map<string, HevyEvent>();
    for (const e of events) {
      const id = e.type === "deleted" ? e.id : e.workout?.id;
      if (id && !latest.has(id)) latest.set(id, e);
    }
    const upserts = [...latest.values()]
      .filter((e): e is Extract<HevyEvent, { type: "updated" }> => e.type === "updated")
      .map((e) => mapWorkout(e.workout))
      .filter((m): m is NonNullable<typeof m> => m != null);
    const deletes = [...latest.entries()].filter(([, e]) => e.type === "deleted").map(([id]) => id);

    const applied = await getDb().transaction(async (tx) => {
      const [{ locked }] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(4801) as locked`);
      if (!locked) return false;
      if (deletes.length) await tx.delete(hevyWorkouts).where(inArray(hevyWorkouts.id, deletes));
      for (const { workout, sets } of upserts) {
        const { id, ...rest } = workout;
        await tx.insert(hevyWorkouts).values(workout).onConflictDoUpdate({ target: hevyWorkouts.id, set: rest });
        await tx.delete(hevySets).where(eq(hevySets.workoutId, id));
        for (let i = 0; i < sets.length; i += 500) await tx.insert(hevySets).values(sets.slice(i, i + 500));
      }
      return true;
    });
    if (!applied) return { ok: true, skipped: "another sync is running", updated: 0, deleted: 0, since: since.toISOString() };
    await saveSyncRow({ cursor: startedAt, lastRunAt: startedAt, lastOkAt: new Date(), lastError: null });
    return { ok: true, updated: upserts.length, deleted: deletes.length, since: since.toISOString() };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await saveSyncRow({ lastRunAt: startedAt, lastError: msg.slice(0, 500) }).catch(() => {});
    return { ok: false, updated: 0, deleted: 0, since: since.toISOString(), error: msg };
  }
}

/** Sync if the last attempt is older than `maxAgeMin`. Never throws. */
export async function syncIfStale(maxAgeMin = 30): Promise<SyncResult | null> {
  if (!hevyConfigured()) return null;
  try {
    const row = await getSyncRow();
    if (row?.lastRunAt && Date.now() - row.lastRunAt.getTime() < maxAgeMin * 60_000) return null;
    return await syncHevy();
  } catch {
    return null;
  }
}

// ---------- analysis ----------

export type ProgressKind = "e1rm" | "reps" | "duration";

export type SessionBest = {
  date: string;
  workoutTitle: string;
  /** e1RM in kg, max reps, or max seconds, depending on the exercise's kind. */
  value: number;
  /** Human-readable best set, e.g. "60 kg × 5". */
  topSet: string;
  workingSets: number;
};

export type ExerciseProgress = {
  key: string;
  title: string;
  kind: ProgressKind;
  unit: "kg" | "reps" | "s";
  sessionsInWindow: number;
  totalSessions: number;
  firstDate: string;
  lastDate: string;
  /** All-time best session. */
  pr: SessionBest;
  /** Best in the last 4 weeks, and the 4 weeks before that. */
  current: number | null;
  previous: number | null;
  change: number | null;
  changePct: number | null;
  /** Value at the start of the window (first session in it) → current. */
  windowStart: number | null;
  /** Per-session best inside the window, oldest first. */
  series: SessionBest[];
};

export type NewPr = { date: string; title: string; kind: ProgressKind; unit: string; value: number; previous: number; topSet: string };

export type WeekLoad = { start: string; workouts: number; sets: number; volumeKg: number };

export type StrengthReport = {
  configured: boolean;
  lastSyncOkAt: Date | null;
  lastSyncError: string | null;
  windowWeeks: number;
  windowStart: string;
  totalWorkouts: number;
  recentWorkouts: { date: string; title: string; sets: number; volumeKg: number; minutes: number | null }[];
  weeks: WeekLoad[];
  exercises: ExerciseProgress[];
  /** Exercises whose best in the last 4 weeks beats every session before that. One per exercise. */
  newPrs: NewPr[];
};

const UNIT = { e1rm: "kg", reps: "reps", duration: "s" } as const;

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(Math.round(s % 60)).padStart(2, "0")}` : `${Math.round(s)} s`;
}

type SetRow = {
  workoutId: string;
  date: string;
  workoutTitle: string;
  key: string;
  title: string;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  e1rmKg: number | null;
};

function kindFor(sets: SetRow[]): ProgressKind | null {
  if (sets.some((s) => s.e1rmKg != null)) return "e1rm";
  if (sets.some((s) => (s.reps ?? 0) > 0)) return "reps";
  if (sets.some((s) => (s.durationS ?? 0) > 0)) return "duration";
  return null;
}

function bestOf(sets: SetRow[], kind: ProgressKind): { value: number; topSet: string } | null {
  let best: { value: number; topSet: string } | null = null;
  for (const s of sets) {
    let v: number | null = null;
    let label = "";
    if (kind === "e1rm" && s.e1rmKg != null) {
      v = s.e1rmKg;
      label = isAssisted(s.title) ? `${s.reps} reps, ${r1(s.weightKg!)} kg assist` : `${r1(s.weightKg!)} kg × ${s.reps}`;
    } else if (kind === "reps" && s.reps) {
      v = s.reps;
      label = s.weightKg ? `${s.reps} reps (${r1(s.weightKg)} kg${isAssisted(s.title) ? " assist" : ""})` : `${s.reps} reps`;
    } else if (kind === "duration" && s.durationS) {
      v = s.durationS;
      label = fmtDuration(s.durationS);
    }
    if (v != null && (!best || v > best.value)) best = { value: v, topSet: label };
  }
  return best;
}

const pct = (a: number, b: number) => (b ? r1(((a - b) / b) * 100) : null);

/**
 * Strength progression from synced Hevy data. `exercise` filters by title
 * (case-insensitive substring). Warm-up sets are ignored throughout.
 */
export async function getStrength({ weeks = 12, exercise }: { weeks?: number; exercise?: string } = {}): Promise<StrengthReport> {
  const db = getDb();
  const today = todayIso();
  const windowStart = addDays(mondayOf(today), -7 * (weeks - 1));
  const last4 = addDays(today, -27);
  const prev4 = addDays(today, -55);

  const [syncRow, workouts, rawSets, weighIns] = await Promise.all([
    getSyncRow(),
    db.select().from(hevyWorkouts).orderBy(asc(hevyWorkouts.startTime)),
    db
      .select({
        workoutId: hevySets.workoutId,
        date: hevyWorkouts.date,
        workoutTitle: hevyWorkouts.title,
        key: hevySets.exerciseKey,
        title: hevySets.exerciseTitle,
        weightKg: hevySets.weightKg,
        reps: hevySets.reps,
        durationS: hevySets.durationS,
        e1rmKg: hevySets.e1rmKg,
      })
      .from(hevySets)
      .innerJoin(hevyWorkouts, eq(hevySets.workoutId, hevyWorkouts.id))
      .where(sql`${hevySets.type} <> 'warmup'`)
      .orderBy(asc(hevyWorkouts.startTime), asc(hevySets.exerciseIndex), asc(hevySets.setIndex)),
    db.select({ date: dayStats.date, kg: dayStats.weightKg }).from(dayStats).where(isNotNull(dayStats.weightKg)).orderBy(asc(dayStats.date)),
  ]);

  // Assisted moves: score the load actually lifted, body weight minus assistance,
  // using the nearest weigh-in within two weeks. Without one they fall back to max reps.
  const bodyWeightOn = (date: string): number | null => {
    let best: { gap: number; kg: number } | null = null;
    for (const w of weighIns) {
      const gap = Math.abs(Date.parse(w.date) - Date.parse(date)) / 864e5;
      if (gap <= 14 && (!best || gap < best.gap)) best = { gap, kg: w.kg! };
    }
    return best?.kg ?? null;
  };
  const setRows: SetRow[] = rawSets.map((s) => {
    if (!isAssisted(s.title) || s.weightKg == null) return s;
    const bw = bodyWeightOn(s.date);
    return { ...s, e1rmKg: bw != null && bw > s.weightKg ? e1rm(bw - s.weightKg, s.reps) : null };
  });

  // Weekly load over the window.
  const weekList: WeekLoad[] = [];
  for (let w = windowStart; w <= today; w = addDays(w, 7)) weekList.push({ start: w, workouts: 0, sets: 0, volumeKg: 0 });
  for (const w of workouts) {
    if (w.date < windowStart) continue;
    const wk = weekList.find((x) => x.start === mondayOf(w.date));
    if (wk) {
      wk.workouts++;
      wk.sets += w.setCount;
      wk.volumeKg += w.volumeKg;
    }
  }

  // Group sets by exercise, then by workout (session).
  const byExercise = new Map<string, SetRow[]>();
  for (const s of setRows) {
    const list = byExercise.get(s.key);
    if (list) list.push(s);
    else byExercise.set(s.key, [s]);
  }

  const q = exercise?.trim().toLowerCase();
  const exercises: ExerciseProgress[] = [];
  const newPrs: NewPr[] = [];
  for (const [key, sets] of byExercise) {
    const title = sets[sets.length - 1].title;
    if (q && !title.toLowerCase().includes(q)) continue;
    const kind = kindFor(sets);
    if (!kind) continue;

    const sessions: SessionBest[] = [];
    const byWorkout = new Map<string, SetRow[]>();
    for (const s of sets) {
      const l = byWorkout.get(s.workoutId);
      if (l) l.push(s);
      else byWorkout.set(s.workoutId, [s]);
    }
    for (const ws of byWorkout.values()) {
      const b = bestOf(ws, kind);
      if (b) sessions.push({ date: ws[0].date, workoutTitle: ws[0].workoutTitle, value: b.value, topSet: b.topSet, workingSets: ws.length });
    }
    if (!sessions.length) continue;

    // All-time PR: earliest session that reached the maximum.
    let pr = sessions[0];
    for (const s of sessions) if (s.value > pr.value) pr = s;
    const before = sessions.filter((s) => s.date < last4);
    const recent = sessions.filter((s) => s.date >= last4);
    if (before.length && recent.length) {
      const prevBest = Math.max(...before.map((s) => s.value));
      const top = recent.reduce((a, b) => (b.value > a.value ? b : a));
      if (top.value > prevBest)
        newPrs.push({ date: top.date, title, kind, unit: UNIT[kind], value: top.value, previous: prevBest, topSet: top.topSet });
    }
    const maxIn = (from: string, to: string) => {
      const v = sessions.filter((s) => s.date >= from && s.date <= to).map((s) => s.value);
      return v.length ? Math.max(...v) : null;
    };
    const current = maxIn(last4, today);
    const previous = maxIn(prev4, addDays(last4, -1));
    const series = sessions.filter((s) => s.date >= windowStart);
    exercises.push({
      key,
      title,
      kind,
      unit: UNIT[kind],
      sessionsInWindow: series.length,
      totalSessions: sessions.length,
      firstDate: sessions[0].date,
      lastDate: sessions[sessions.length - 1].date,
      pr,
      current,
      previous,
      change: current != null && previous != null ? r1(current - previous) : null,
      changePct: current != null && previous != null ? pct(current, previous) : null,
      windowStart: series[0]?.value ?? null,
      series,
    });
  }

  exercises.sort((a, b) => b.sessionsInWindow - a.sessionsInWindow || b.lastDate.localeCompare(a.lastDate));
  newPrs.sort((a, b) => b.date.localeCompare(a.date));

  return {
    configured: hevyConfigured(),
    lastSyncOkAt: syncRow?.lastOkAt ?? null,
    lastSyncError: syncRow?.lastError ?? null,
    windowWeeks: weeks,
    windowStart,
    totalWorkouts: workouts.length,
    recentWorkouts: workouts
      .slice(-5)
      .reverse()
      .map((w) => ({
        date: w.date,
        title: w.title,
        sets: w.setCount,
        volumeKg: w.volumeKg,
        minutes: w.endTime ? Math.round((w.endTime.getTime() - w.startTime.getTime()) / 60_000) : null,
      })),
    weeks: weekList,
    exercises,
    newPrs,
  };
}

/** Workouts on one day, for the Today view and get_day. */
export async function getWorkoutsOn(date: string) {
  return getDb()
    .select({ id: hevyWorkouts.id, title: hevyWorkouts.title, sets: hevyWorkouts.setCount, volumeKg: hevyWorkouts.volumeKg })
    .from(hevyWorkouts)
    .where(eq(hevyWorkouts.date, date))
    .orderBy(asc(hevyWorkouts.startTime));
}
