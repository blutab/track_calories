import { and, asc, eq, gte, lte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Meal } from "@/db/schema";
import { addDays, mondayOf, todayIso } from "./dates";
import { bandStatus, DEFAULT_BANDS, kcalBand, weightBand, type Bands, type BandStatus, type Range } from "./bands";

const { targets, dayTargets, dayStats, recipes, recipeItems, foodEntries } = schema;

// ---------- types ----------

export type Macros = { kcal: number; protein: number; carbs: number; fat: number; fibre: number };
export type Targets = {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  steps: number | null;
};
export type TargetPatch = Partial<Targets>;

export type RecipeItemInput = { name: string; amount?: string | null } & Macros;
export type Recipe = {
  id: number;
  slug: string;
  name: string;
  aliases: string[];
  note: string | null;
  items: (RecipeItemInput & { id: number; position: number })[];
  totals: Macros;
};

export type Entry = {
  id: number;
  date: string;
  meal: Meal;
  name: string;
  recipeId: number | null;
  servings: number;
  note: string | null;
  createdAt: Date;
} & Macros;

export type Day = {
  date: string;
  entries: Entry[];
  totals: Macros;
  targets: Targets;
  defaultTargets: Targets;
  override: TargetPatch | null;
  steps: number | null;
  weightKg: number | null;
  /** Today in the app time zone: still being logged, so left out of weekly scores. */
  inProgress: boolean;
  /** Calorie maintenance band for this day's kcal target. */
  kcalBand: Range | null;
  /** Where intake sits against the band. `null` when nothing is logged or there is no kcal target. */
  kcalStatus: BandStatus | null;
  /** Average of weigh-ins in the 7 days ending on this date. */
  weightAvg7Kg: number | null;
};

const MACRO_KEYS = ["kcal", "protein", "carbs", "fat", "fibre"] as const;
const TARGET_KEYS = ["kcal", "protein", "carbs", "fat", "fibre", "steps"] as const;

export const r1 = (n: number) => Math.round(n * 10) / 10;
const zero = (): Macros => ({ kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 });

export function sumMacros(rows: Macros[]): Macros {
  const t = zero();
  for (const r of rows) for (const k of MACRO_KEYS) t[k] += Number(r[k]) || 0;
  for (const k of MACRO_KEYS) t[k] = r1(t[k]);
  return t;
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "recipe"
  );
}

// ---------- targets ----------

const emptyTargets = (): Targets => ({ kcal: null, protein: null, carbs: null, fat: null, fibre: null, steps: null });

function pickTargets(row: Partial<Record<keyof Targets, number | null>> | undefined): Targets {
  const t = emptyTargets();
  if (!row) return t;
  for (const k of TARGET_KEYS) t[k] = row[k] ?? null;
  return t;
}

export async function getDefaultTargets(): Promise<Targets> {
  const [row] = await getDb().select().from(targets).where(eq(targets.id, 1));
  return pickTargets(row);
}

/** Merge a patch into the defaults. `null` clears a target; omitted keys stay. */
export async function setDefaultTargets(patch: TargetPatch): Promise<Targets> {
  const next = { ...(await getDefaultTargets()) };
  for (const k of TARGET_KEYS) if (k in patch) next[k] = patch[k] ?? null;
  await getDb()
    .insert(targets)
    .values({ id: 1, ...next })
    .onConflictDoUpdate({ target: targets.id, set: { ...next, updatedAt: new Date() } });
  return next;
}

// ---------- maintenance bands ----------

export async function getBands(): Promise<Bands> {
  const [row] = await getDb().select().from(targets).where(eq(targets.id, 1));
  if (!row) return { ...DEFAULT_BANDS };
  return { kcalBandPct: row.kcalBandPct, weightBaselineKg: row.weightBaselineKg, weightBandKg: row.weightBandKg };
}

/** Merge a patch into the bands. `weightBaselineKg: null` removes the weight band. */
export async function setBands(patch: Partial<Bands>): Promise<Bands> {
  const next = { ...(await getBands()) };
  if (patch.kcalBandPct != null) {
    if (!(patch.kcalBandPct > 0 && patch.kcalBandPct <= 50)) throw new Error("kcalBandPct must be between 0 and 50.");
    next.kcalBandPct = patch.kcalBandPct;
  }
  if (patch.weightBandKg != null) {
    if (!(patch.weightBandKg > 0 && patch.weightBandKg <= 10)) throw new Error("weightBandKg must be between 0 and 10.");
    next.weightBandKg = r1(patch.weightBandKg);
  }
  if ("weightBaselineKg" in patch) next.weightBaselineKg = patch.weightBaselineKg == null ? null : r1(patch.weightBaselineKg);
  await getDb()
    .insert(targets)
    .values({ id: 1, ...next })
    .onConflictDoUpdate({ target: targets.id, set: { ...next, updatedAt: new Date() } });
  return next;
}

/** Set (merge) or clear (`null`) a one-day override. */
export async function setDayTargets(date: string, patch: TargetPatch | null): Promise<TargetPatch | null> {
  const db = getDb();
  if (patch === null) {
    await db.delete(dayTargets).where(eq(dayTargets.date, date));
    return null;
  }
  const [existing] = await db.select().from(dayTargets).where(eq(dayTargets.date, date));
  const next = pickTargets(existing);
  for (const k of TARGET_KEYS) if (k in patch) next[k] = patch[k] ?? null;
  if (TARGET_KEYS.every((k) => next[k] == null)) {
    await db.delete(dayTargets).where(eq(dayTargets.date, date));
    return null;
  }
  await db.insert(dayTargets).values({ date, ...next }).onConflictDoUpdate({ target: dayTargets.date, set: next });
  return compactTargets(next);
}

function compactTargets(t: Targets): TargetPatch {
  const out: TargetPatch = {};
  for (const k of TARGET_KEYS) if (t[k] != null) out[k] = t[k];
  return out;
}

function applyOverride(base: Targets, override: TargetPatch | null): Targets {
  const t = { ...base };
  if (override) for (const k of TARGET_KEYS) if (override[k] != null) t[k] = override[k]!;
  return t;
}

// ---------- days ----------

function toEntry(r: typeof foodEntries.$inferSelect): Entry {
  return {
    id: r.id,
    date: r.date,
    meal: r.meal,
    name: r.name,
    recipeId: r.recipeId,
    servings: r.servings,
    note: r.note,
    createdAt: r.createdAt,
    kcal: r.kcal,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    fibre: r.fibre,
  };
}

/** Load a range of days (inclusive). Days with no data are still returned. */
export async function getDays(from: string, to: string): Promise<Day[]> {
  const db = getDb();
  // Weigh-ins from 6 days earlier feed the 7-day rolling average.
  const statsFrom = addDays(from, -6);
  const [defaults, bands, entryRows, statRows, overrideRows] = await Promise.all([
    getDefaultTargets(),
    getBands(),
    db
      .select()
      .from(foodEntries)
      .where(and(gte(foodEntries.date, from), lte(foodEntries.date, to)))
      .orderBy(asc(foodEntries.date), asc(foodEntries.createdAt), asc(foodEntries.id)),
    db.select().from(dayStats).where(and(gte(dayStats.date, statsFrom), lte(dayStats.date, to))),
    db.select().from(dayTargets).where(and(gte(dayTargets.date, from), lte(dayTargets.date, to))),
  ]);
  const today = todayIso();

  const days: Day[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const entries = entryRows.filter((e) => e.date === d).map(toEntry);
    const stat = statRows.find((s) => s.date === d);
    const ovRow = overrideRows.find((o) => o.date === d);
    const override = ovRow ? compactTargets(pickTargets(ovRow)) : null;
    const t = applyOverride(defaults, override);
    const totals = sumMacros(entries);
    const band = kcalBand(t.kcal, bands.kcalBandPct);
    const windowStart = addDays(d, -6);
    const recent = statRows.filter((s) => s.weightKg != null && s.date >= windowStart && s.date <= d).map((s) => s.weightKg!);
    days.push({
      date: d,
      entries,
      totals,
      defaultTargets: defaults,
      override,
      targets: t,
      steps: stat?.steps ?? null,
      weightKg: stat?.weightKg ?? null,
      inProgress: d === today,
      kcalBand: band,
      kcalStatus: entries.length ? bandStatus(totals.kcal, band) : null,
      weightAvg7Kg: recent.length ? r1(recent.reduce((a, b) => a + b, 0) / recent.length) : null,
    });
  }
  return days;
}

export async function getDay(date: string): Promise<Day> {
  return (await getDays(date, date))[0];
}

export type WeekSummary = {
  start: string;
  end: string;
  days: Day[];
  /** Days with at least one entry, including today. */
  loggedDays: number;
  /** Logged days that are finished (today excluded). Averages and band scores use these. */
  scoredDays: number;
  avg: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fibre: number | null; steps: number | null };
  bands: Bands;
  /** Scored days with intake inside the calorie band. */
  daysOnCalorieTarget: number;
  daysUnderCalorieBand: number;
  daysOverCalorieBand: number;
  daysHitProtein: number;
  daysHitSteps: number;
  daysWithSteps: number;
  weightChangeKg: number | null;
  weighIns: number;
  /** 7-day rolling average at the week's last weigh-in. */
  weightTrendKg: number | null;
  weightBand: Range | null;
  weightStatus: BandStatus | null;
};

export async function getWeek(anyDateInWeek: string): Promise<WeekSummary> {
  const start = mondayOf(anyDateInWeek);
  const end = addDays(start, 6);
  const [days, bands] = await Promise.all([getDays(start, end), getBands()]);
  const logged = days.filter((d) => d.entries.length > 0);
  const scored = logged.filter((d) => !d.inProgress);
  const withSteps = days.filter((d) => d.steps != null && !d.inProgress);
  const weights = days.filter((d) => d.weightKg != null);
  const avgOf = (vals: number[]) => (vals.length ? r1(vals.reduce((a, b) => a + b, 0) / vals.length) : null);
  const lastWeighIn = weights[weights.length - 1];
  const weightTrendKg = lastWeighIn?.weightAvg7Kg ?? null;
  const wBand = weightBand(bands);
  return {
    start,
    end,
    days,
    loggedDays: logged.length,
    scoredDays: scored.length,
    avg: {
      kcal: avgOf(scored.map((d) => d.totals.kcal)),
      protein: avgOf(scored.map((d) => d.totals.protein)),
      carbs: avgOf(scored.map((d) => d.totals.carbs)),
      fat: avgOf(scored.map((d) => d.totals.fat)),
      fibre: avgOf(scored.map((d) => d.totals.fibre)),
      steps: avgOf(withSteps.map((d) => d.steps!)),
    },
    bands,
    daysOnCalorieTarget: scored.filter((d) => d.kcalStatus === "in").length,
    daysUnderCalorieBand: scored.filter((d) => d.kcalStatus === "under").length,
    daysOverCalorieBand: scored.filter((d) => d.kcalStatus === "over").length,
    daysHitProtein: scored.filter((d) => d.targets.protein != null && d.totals.protein >= d.targets.protein).length,
    daysHitSteps: withSteps.filter((d) => d.targets.steps != null && d.steps! >= d.targets.steps).length,
    daysWithSteps: withSteps.length,
    weightChangeKg: weights.length >= 2 ? r1(lastWeighIn.weightKg! - weights[0].weightKg!) : null,
    weighIns: weights.length,
    weightTrendKg,
    weightBand: wBand,
    weightStatus: bandStatus(weightTrendKg, wBand),
  };
}

/** `undefined` leaves a value as is; `null` clears it. */
export async function setDayStats(date: string, patch: { steps?: number | null; weightKg?: number | null }) {
  const db = getDb();
  const [existing] = await db.select().from(dayStats).where(eq(dayStats.date, date));
  const next = {
    steps: patch.steps !== undefined ? (patch.steps == null ? null : Math.round(patch.steps)) : (existing?.steps ?? null),
    weightKg: patch.weightKg !== undefined ? (patch.weightKg == null ? null : r1(patch.weightKg)) : (existing?.weightKg ?? null),
  };
  if (next.steps == null && next.weightKg == null) {
    await db.delete(dayStats).where(eq(dayStats.date, date));
  } else {
    await db.insert(dayStats).values({ date, ...next }).onConflictDoUpdate({ target: dayStats.date, set: next });
  }
  return next;
}

// ---------- recipes ----------

async function loadRecipes(where?: ReturnType<typeof eq>): Promise<Recipe[]> {
  const db = getDb();
  const rows = await db.select().from(recipes).where(where).orderBy(asc(recipes.name));
  if (!rows.length) return [];
  const items = await db
    .select()
    .from(recipeItems)
    .where(inArray(recipeItems.recipeId, rows.map((r) => r.id)))
    .orderBy(asc(recipeItems.position), asc(recipeItems.id));
  return rows.map((r) => {
    const its = items
      .filter((i) => i.recipeId === r.id)
      .map((i) => ({
        id: i.id,
        position: i.position,
        name: i.name,
        amount: i.amount,
        kcal: i.kcal,
        protein: i.protein,
        carbs: i.carbs,
        fat: i.fat,
        fibre: i.fibre,
      }));
    return { id: r.id, slug: r.slug, name: r.name, aliases: r.aliases, note: r.note, items: its, totals: sumMacros(its) };
  });
}

export async function listRecipes(query?: string): Promise<Recipe[]> {
  const all = await loadRecipes();
  if (!query?.trim()) return all;
  const q = query.trim().toLowerCase();
  return all.filter(
    (r) => r.slug.includes(slugify(q)) || r.name.toLowerCase().includes(q) || r.aliases.some((a) => a.toLowerCase().includes(q)),
  );
}

export async function getRecipeBySlug(slug: string): Promise<Recipe | null> {
  return (await loadRecipes(eq(recipes.slug, slug)))[0] ?? null;
}

export async function getRecipeById(id: number): Promise<Recipe | null> {
  return (await loadRecipes(eq(recipes.id, id)))[0] ?? null;
}

/** Create or replace a recipe (matched by slug). Items are replaced as a whole. */
export async function saveRecipe(input: {
  slug?: string;
  name: string;
  aliases?: string[];
  note?: string | null;
  items: RecipeItemInput[];
}): Promise<Recipe> {
  if (!input.items.length) throw new Error("A recipe needs at least one item.");
  const slug = slugify(input.slug || input.name);
  const db = getDb();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(recipes)
      .values({ slug, name: input.name.trim(), aliases: input.aliases ?? [], note: input.note ?? null })
      .onConflictDoUpdate({
        target: recipes.slug,
        set: { name: input.name.trim(), aliases: input.aliases ?? [], note: input.note ?? null, updatedAt: new Date() },
      })
      .returning({ id: recipes.id });
    await tx.delete(recipeItems).where(eq(recipeItems.recipeId, row.id));
    await tx.insert(recipeItems).values(
      input.items.map((it, i) => ({
        recipeId: row.id,
        position: i,
        name: it.name.trim(),
        amount: it.amount ?? null,
        kcal: r1(it.kcal),
        protein: r1(it.protein),
        carbs: r1(it.carbs),
        fat: r1(it.fat),
        fibre: r1(it.fibre ?? 0),
      })),
    );
  });
  return (await getRecipeBySlug(slug))!;
}

export async function deleteRecipe(slug: string): Promise<boolean> {
  const res = await getDb().delete(recipes).where(eq(recipes.slug, slug)).returning({ id: recipes.id });
  return res.length > 0;
}

// ---------- food entries ----------

export type LogInput =
  | { meal: Meal; recipe: string; servings?: number; note?: string | null }
  | ({ meal: Meal; name: string; servings?: number; note?: string | null } & Macros);

/**
 * Log one or more foods on a date. A recipe entry is looked up by slug, name or alias and
 * scaled by servings. A custom entry's macros are the totals for what was eaten.
 */
export async function logFood(date: string, inputs: LogInput[]): Promise<Entry[]> {
  if (!inputs.length) throw new Error("Nothing to log.");
  const all = await loadRecipes();
  const rows: (typeof foodEntries.$inferInsert)[] = [];
  for (const inp of inputs) {
    const servings = inp.servings ?? 1;
    if (!(servings > 0)) throw new Error("servings must be greater than 0.");
    if ("recipe" in inp) {
      const q = inp.recipe.trim().toLowerCase();
      const r =
        all.find((x) => x.slug === slugify(q)) ??
        all.find((x) => x.name.toLowerCase() === q || x.aliases.some((a) => a.toLowerCase() === q));
      if (!r) throw new Error(`No saved recipe matches "${inp.recipe}". Use list_recipes to see what's saved.`);
      rows.push({
        date,
        meal: inp.meal,
        name: r.name,
        recipeId: r.id,
        servings,
        kcal: r1(r.totals.kcal * servings),
        protein: r1(r.totals.protein * servings),
        carbs: r1(r.totals.carbs * servings),
        fat: r1(r.totals.fat * servings),
        fibre: r1(r.totals.fibre * servings),
        note: inp.note ?? null,
      });
    } else {
      rows.push({
        date,
        meal: inp.meal,
        name: inp.name.trim(),
        servings,
        kcal: r1(inp.kcal),
        protein: r1(inp.protein),
        carbs: r1(inp.carbs),
        fat: r1(inp.fat),
        fibre: r1(inp.fibre ?? 0),
        note: inp.note ?? null,
      });
    }
  }
  const inserted = await getDb().insert(foodEntries).values(rows).returning();
  return inserted.map(toEntry);
}

export async function deleteEntry(id: number): Promise<boolean> {
  const res = await getDb().delete(foodEntries).where(eq(foodEntries.id, id)).returning({ id: foodEntries.id });
  return res.length > 0;
}

/** Edit an entry. Changing servings on a recipe entry rescales its macros. */
export async function updateEntry(
  id: number,
  patch: Partial<{ date: string; meal: Meal; name: string; servings: number; note: string | null } & Macros>,
): Promise<Entry | null> {
  const db = getDb();
  const [cur] = await db.select().from(foodEntries).where(eq(foodEntries.id, id));
  if (!cur) return null;
  const set: Partial<typeof foodEntries.$inferInsert> = {};
  if (patch.date) set.date = patch.date;
  if (patch.meal) set.meal = patch.meal;
  if (patch.name) set.name = patch.name.trim();
  if (patch.note !== undefined) set.note = patch.note;
  if (patch.servings != null && patch.servings !== cur.servings) {
    if (!(patch.servings > 0)) throw new Error("servings must be greater than 0.");
    const f = patch.servings / cur.servings;
    set.servings = patch.servings;
    for (const k of MACRO_KEYS) set[k] = r1(cur[k] * f);
  }
  for (const k of MACRO_KEYS) if (patch[k] != null) set[k] = r1(patch[k]!);
  if (!Object.keys(set).length) return toEntry(cur);
  const [row] = await db.update(foodEntries).set(set).where(eq(foodEntries.id, id)).returning();
  return toEntry(row);
}
