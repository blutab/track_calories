import { z } from "zod";
import type { createMcpHandler } from "mcp-handler";
import { MEALS } from "@/db/schema";
import { resolveDate, todayIso, TIME_ZONE } from "./dates";
import * as data from "./data";
import * as training from "./training";

type McpServer = Parameters<Parameters<typeof createMcpHandler>[0]>[0];

const meal = z.enum(MEALS);
const dateArg = z
  .string()
  .optional()
  .describe(`YYYY-MM-DD, "today" or "yesterday". Defaults to today in ${TIME_ZONE}.`);
const num = z.number().min(0);
const macroShape = {
  kcal: num.describe("Calories (kcal) for the whole amount eaten"),
  protein: num.describe("Protein in grams"),
  carbs: num.describe("Carbohydrates in grams"),
  fat: num.describe("Fat in grams"),
  fibre: num.default(0).describe("Fibre in grams"),
};
const targetPatch = z.object({
  kcal: num.nullable().optional(),
  protein: num.nullable().optional(),
  carbs: num.nullable().optional(),
  fat: num.nullable().optional(),
  fibre: num.nullable().optional(),
  steps: z.number().int().min(0).nullable().optional(),
});

const bandsPatch = z.object({
  kcalBandPct: z.number().gt(0).max(50).optional().describe("Calorie band half-width, % of the kcal target (8 = ±8%)"),
  weightBaselineKg: z.number().positive().nullable().optional().describe("Maintenance weight in kg; null removes the weight band"),
  weightBandKg: z.number().gt(0).max(10).optional().describe("Weight band half-width in kg (1 = baseline ±1 kg)"),
});

const BAND_WORD = { under: "below band", in: "in band", over: "above band" } as const;

function ok(summary: string, payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: summary },
      { type: "text" as const, text: JSON.stringify(payload, null, 1) },
    ],
  };
}
function fail(e: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] };
}
async function run<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    return fail(e);
  }
}

function daySummary(d: data.Day): string {
  const t = d.targets;
  const parts = [`${d.date}: ${Math.round(d.totals.kcal)}${t.kcal != null ? ` / ${t.kcal}` : ""} kcal`];
  if (t.kcal != null) {
    const left = Math.round(t.kcal - d.totals.kcal);
    parts.push(left >= 0 ? `${left} kcal left` : `${-left} kcal over`);
  }
  if (d.kcalBand) {
    const st = d.kcalStatus && !d.inProgress ? `, ${BAND_WORD[d.kcalStatus]}` : d.inProgress ? ", day in progress" : "";
    parts.push(`band ${d.kcalBand.low}–${d.kcalBand.high}${st}`);
  }
  parts.push(`protein ${d.totals.protein}${t.protein != null ? ` / ${t.protein}` : ""} g`);
  parts.push(`carbs ${d.totals.carbs} g, fat ${d.totals.fat} g, fibre ${d.totals.fibre} g`);
  if (d.steps != null) parts.push(`steps ${d.steps}${t.steps != null ? ` / ${t.steps}` : ""}`);
  if (d.weightKg != null) parts.push(`weight ${d.weightKg} kg`);
  if (d.chinupSets != null) parts.push(`chin-up sets ${d.chinupSets}`);
  return parts.join(" · ");
}

function dayPayload(d: data.Day) {
  return {
    date: d.date,
    totals: d.totals,
    targets: d.targets,
    targetOverride: d.override,
    kcalBand: d.kcalBand,
    kcalStatus: d.kcalStatus,
    inProgress: d.inProgress,
    steps: d.steps,
    weightKg: d.weightKg,
    weightAvg7Kg: d.weightAvg7Kg,
    chinupSets: d.chinupSets,
    entries: d.entries.map((e) => ({
      id: e.id,
      meal: e.meal,
      name: e.name,
      servings: e.servings,
      kcal: e.kcal,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
      fibre: e.fibre,
      note: e.note,
    })),
  };
}

export function registerTools(server: McpServer) {
  server.registerTool(
    "get_day",
    {
      title: "Get a day's log",
      description:
        "Food entries, totals, targets (with any one-day override), steps and weight for one day. Use after logging to report progress.",
      inputSchema: z.object({ date: dateArg }),
      annotations: { readOnlyHint: true },
    },
    async ({ date }) =>
      run(async () => {
        const d0 = resolveDate(date);
        const [d, workouts] = await Promise.all([data.getDay(d0), training.getWorkoutsOn(d0).catch(() => [])]);
        const w = workouts.length ? ` · workout: ${workouts.map((x) => `${x.title} (${x.sets} sets)`).join(", ")}` : "";
        return ok(daySummary(d) + w, { ...dayPayload(d), workouts });
      }),
  );

  server.registerTool(
    "get_week",
    {
      title: "Get weekly progress",
      description:
        "Monday–Sunday summary for the week containing the date: per-day totals vs targets, averages over finished logged days (today excluded), " +
        "days inside/under/over the calorie maintenance band, steps, and the 7-day average weight against the weight band.",
      inputSchema: z.object({ date: dateArg }),
      annotations: { readOnlyHint: true },
    },
    async ({ date }) =>
      run(async () => {
        const w = await data.getWeek(resolveDate(date));
        const inProgress = w.loggedDays - w.scoredDays;
        const summary =
          `Week ${w.start} to ${w.end}: ${w.scoredDays} finished days logged${inProgress ? " (+ today in progress)" : ""}, ` +
          `avg ${w.avg.kcal ?? "–"} kcal, avg protein ${w.avg.protein ?? "–"} g, ` +
          `calorie band (±${w.bands.kcalBandPct}%): ${w.daysOnCalorieTarget} in, ${w.daysUnderCalorieBand} under, ${w.daysOverCalorieBand} over, ` +
          `protein hit ${w.daysHitProtein}/${w.scoredDays}, steps hit ${w.daysHitSteps}/${w.daysWithSteps}, ` +
          `chin-up sets ${w.chinupSetsTotal} over ${w.daysWithChinups} days` +
          (w.weightTrendKg != null ? `, 7-day avg weight ${w.weightTrendKg} kg` : "") +
          (w.weightBand
            ? ` (band ${w.weightBand.low}–${w.weightBand.high} kg${w.weightStatus ? `, ${BAND_WORD[w.weightStatus]}` : ""})`
            : w.weightTrendKg != null
              ? " (no weight baseline set)"
              : "");
        return ok(summary, {
          ...w,
          days: w.days.map((d) => ({
            date: d.date,
            totals: d.totals,
            targets: d.targets,
            kcalBand: d.kcalBand,
            kcalStatus: d.inProgress ? null : d.kcalStatus,
            inProgress: d.inProgress,
            steps: d.steps,
            weightKg: d.weightKg,
            weightAvg7Kg: d.weightAvg7Kg,
            chinupSets: d.chinupSets,
            entryCount: d.entries.length,
          })),
        });
      }),
  );

  server.registerTool(
    "list_recipes",
    {
      title: "List saved recipes",
      description:
        "Saved regular meals with ingredients and per-serving macros. Optional query matches name, slug or alias (e.g. 'usual egg breakfast'). Check this before estimating a food.",
      inputSchema: z.object({ query: z.string().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ query }) =>
      run(async () => {
        const rs = await data.listRecipes(query);
        return ok(
          rs.length ? rs.map((r) => `${r.slug}: ${r.name} — ${r.totals.kcal} kcal, ${r.totals.protein} g protein`).join("\n") : "No matching recipes.",
          rs,
        );
      }),
  );

  server.registerTool(
    "log_food",
    {
      title: "Log food",
      description:
        "Add one or more foods to a day. For a saved recipe pass `recipe` (slug, name or alias) and optional `servings`; macros are computed from the recipe. " +
        "For anything else pass `name` plus kcal/protein/carbs/fat/fibre totals for the amount eaten — confirm estimated numbers with the user before logging.",
      inputSchema: z.object({
        date: dateArg,
        items: z
          .array(
            z.union([
              z.object({
                meal,
                recipe: z.string().describe("Saved recipe slug, name or alias"),
                servings: z.number().positive().default(1),
                note: z.string().optional(),
              }),
              z.object({
                meal,
                name: z.string().min(1),
                servings: z.number().positive().default(1).describe("Informational for custom foods; macros are totals"),
                note: z.string().optional().describe("e.g. portion size, or 'estimated from photo'"),
                ...macroShape,
              }),
            ]),
          )
          .min(1),
      }),
    },
    async ({ date, items }) =>
      run(async () => {
        const d0 = resolveDate(date);
        const added = await data.logFood(d0, items as data.LogInput[]);
        const day = await data.getDay(d0);
        return ok(
          `Logged ${added.map((e) => `${e.name} (${Math.round(e.kcal)} kcal)`).join(", ")}. ${daySummary(day)}`,
          { added, day: dayPayload(day) },
        );
      }),
  );

  server.registerTool(
    "update_entry",
    {
      title: "Edit a logged entry",
      description: "Change an entry's meal, date, name, servings, note or macros. Changing servings rescales macros proportionally.",
      inputSchema: z.object({
        id: z.number().int(),
        date: z.string().optional(),
        meal: meal.optional(),
        name: z.string().optional(),
        servings: z.number().positive().optional(),
        note: z.string().nullable().optional(),
        kcal: num.optional(),
        protein: num.optional(),
        carbs: num.optional(),
        fat: num.optional(),
        fibre: num.optional(),
      }),
    },
    async ({ id, date, ...rest }) =>
      run(async () => {
        const e = await data.updateEntry(id, { ...rest, ...(date ? { date: resolveDate(date) } : {}) });
        if (!e) return fail(`No entry with id ${id}.`);
        return ok(`Updated ${e.name}: ${e.kcal} kcal.`, e);
      }),
  );

  server.registerTool(
    "delete_entry",
    {
      title: "Delete a logged entry",
      description: "Remove a food entry by id (ids come from get_day).",
      inputSchema: z.object({ id: z.number().int() }),
      annotations: { destructiveHint: true },
    },
    async ({ id }) =>
      run(async () => ((await data.deleteEntry(id)) ? ok(`Deleted entry ${id}.`, { id }) : fail(`No entry with id ${id}.`))),
  );

  server.registerTool(
    "save_recipe",
    {
      title: "Save a regular meal",
      description:
        "Create or replace a saved recipe (matched by slug, derived from name if omitted). Items are the ingredients for ONE serving with their macros; totals are computed. " +
        "Confirm the ingredient list and numbers with the user first.",
      inputSchema: z.object({
        name: z.string().min(1),
        slug: z.string().optional(),
        aliases: z.array(z.string()).default([]).describe("Other ways the user refers to it, e.g. 'my eggs'"),
        note: z.string().optional(),
        items: z.array(z.object({ name: z.string().min(1), amount: z.string().optional(), ...macroShape })).min(1),
      }),
    },
    async (input) =>
      run(async () => {
        const r = await data.saveRecipe(input);
        return ok(`Saved ${r.name} (${r.slug}): ${r.totals.kcal} kcal, ${r.totals.protein} g protein per serving.`, r);
      }),
  );

  server.registerTool(
    "delete_recipe",
    {
      title: "Delete a saved recipe",
      description: "Delete a saved recipe by slug. Past log entries keep their numbers.",
      inputSchema: z.object({ slug: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ slug }) =>
      run(async () => ((await data.deleteRecipe(slug)) ? ok(`Deleted recipe ${slug}.`, { slug }) : fail(`No recipe with slug ${slug}.`))),
  );

  server.registerTool(
    "set_day_stats",
    {
      title: "Record steps, weight or chin-up sets",
      description:
        "Set steps, body weight (kg) and/or the day's total chin-up sets (grease the groove) for a day. " +
        "Omit a field to keep it; pass null to clear it. To add a set as it happens, use log_chinups instead.",
      inputSchema: z.object({
        date: dateArg,
        steps: z.number().int().min(0).nullable().optional(),
        weightKg: z.number().positive().nullable().optional(),
        chinupSets: z.number().int().min(0).nullable().optional(),
      }),
    },
    async ({ date, steps, weightKg, chinupSets }) =>
      run(async () => {
        const d0 = resolveDate(date);
        const s = await data.setDayStats(d0, { steps, weightKg, chinupSets });
        return ok(`${d0}: steps ${s.steps ?? "–"}, weight ${s.weightKg ?? "–"} kg, chin-up sets ${s.chinupSets ?? 0}.`, {
          date: d0,
          ...s,
        });
      }),
  );

  server.registerTool(
    "log_chinups",
    {
      title: "Log chin-up sets (grease the groove)",
      description:
        "Add chin-up sets to a day's grease-the-groove count. Default adds 1 set to today. " +
        "Use a negative count to undo. Returns the day's new total.",
      inputSchema: z.object({
        date: dateArg,
        count: z.number().int().min(-50).max(50).optional(),
      }),
    },
    async ({ date, count }) =>
      run(async () => {
        const d0 = resolveDate(date);
        const total = await data.addChinupSets(d0, count ?? 1);
        return ok(`${d0}: ${total} chin-up set${total === 1 ? "" : "s"} today.`, { date: d0, chinupSets: total });
      }),
  );

  server.registerTool(
    "get_strength",
    {
      title: "Strength progression (Hevy)",
      description:
        "Strength training synced from Hevy. Per exercise: all-time PR, best in the last 4 weeks vs the 4 weeks before " +
        "(estimated 1RM in kg via Epley for loaded lifts of 1–12 reps; assisted moves use body weight minus assistance when a weigh-in is within 2 weeks; " +
        "max reps for bodyweight moves; max seconds for holds), " +
        "per-session bests over the window, weekly workouts/sets/volume, and lifts whose last-4-weeks best beats everything before. Warm-ups are ignored. " +
        "Pass `exercise` (e.g. 'squat', 'hip thrust') to focus on matching lifts. Syncs from Hevy first if data is over 30 minutes old.",
      inputSchema: z.object({
        weeks: z.number().int().min(4).max(104).default(12).describe("Window for the per-session series and weekly load"),
        exercise: z.string().optional().describe("Case-insensitive substring of the exercise title"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ weeks, exercise }) =>
      run(async () => {
        await training.syncIfStale(30);
        const r = await training.getStrength({ weeks, exercise });
        if (!r.configured && !r.totalWorkouts) return fail("Hevy isn't connected: set HEVY_API_KEY in Vercel and redeploy.");
        const top = r.exercises.slice(0, exercise ? 20 : 8).map((e) => {
          const cur = e.current != null ? `${e.current} ${e.unit}` : "not done in last 4 wks";
          const ch = e.change != null ? ` (${e.change >= 0 ? "+" : ""}${e.change} ${e.unit} vs prior 4 wks)` : "";
          return `${e.title}: ${cur}${ch}; PR ${e.pr.value} ${e.unit} on ${e.pr.date} (${e.pr.topSet})`;
        });
        const prs = r.newPrs.map((p) => `${p.date} ${p.title} ${p.value} ${p.unit} (was ${p.previous})`);
        const summary =
          `${r.totalWorkouts} Hevy workouts synced (last OK sync ${r.lastSyncOkAt?.toISOString() ?? "never"}` +
          `${r.lastSyncError ? `; last error: ${r.lastSyncError}` : ""}). ` +
          `Last ${weeks} weeks: ${r.weeks.reduce((a, w) => a + w.workouts, 0)} workouts.\n` +
          (top.length ? top.join("\n") : "No matching exercises.") +
          (prs.length ? `\nLifts with a new PR in the last 4 weeks:\n${prs.join("\n")}` : "\nNo new PRs in the last 4 weeks.");
        return ok(summary, r);
      }),
  );

  server.registerTool(
    "sync_hevy",
    {
      title: "Sync workouts from Hevy now",
      description: "Pull new, edited and deleted workouts from Hevy. Runs daily on its own; use when the user just finished a workout.",
      inputSchema: z.object({ full: z.boolean().default(false).describe("Re-import the whole Hevy history") }),
    },
    async ({ full }) =>
      run(async () => {
        const res = await training.syncHevy({ full });
        if (!res.ok && !res.skipped) return fail(`Hevy sync failed: ${res.error}`);
        return ok(
          res.skipped ? `Sync skipped: ${res.skipped}.` : `Synced from Hevy: ${res.updated} workouts updated, ${res.deleted} deleted.`,
          res,
        );
      }),
  );

  server.registerTool(
    "set_targets",
    {
      title: "Change targets",
      description:
        "Without a date: update the default daily targets. With a date: set a one-day override for that date only. " +
        "Omitted fields are unchanged; null clears a target. Pass clear_override=true with a date to go back to defaults. " +
        "`bands` (no date only) sets the maintenance bands: calorie band ±% around the kcal target, and weight baseline ± kg judged on the 7-day average.",
      inputSchema: z.object({
        date: z.string().optional(),
        clear_override: z.boolean().default(false),
        targets: targetPatch.default({}),
        bands: bandsPatch.optional(),
      }),
    },
    async ({ date, clear_override, targets, bands }) =>
      run(async () => {
        if (!date) {
          const t = Object.keys(targets).length ? await data.setDefaultTargets(targets) : await data.getDefaultTargets();
          const b = bands ? await data.setBands(bands) : await data.getBands();
          return ok(`Default targets: ${JSON.stringify(t)}. Bands: ${JSON.stringify(b)}`, { targets: t, bands: b });
        }
        if (bands) return fail("Bands apply to every day; call set_targets without a date to change them.");
        const d0 = resolveDate(date);
        const o = await data.setDayTargets(d0, clear_override ? null : targets);
        return ok(o ? `Override for ${d0}: ${JSON.stringify(o)}` : `${d0} uses default targets.`, { date: d0, override: o });
      }),
  );
}

export const SERVER_INSTRUCTIONS =
  `Batul's calorie and macro tracker. Today is ${"{today}"} (${TIME_ZONE}). ` +
  "Before estimating a food, check list_recipes for a saved match. Estimate unknown foods from standard nutrition data " +
  "(prefer Dutch NEVO values or package labels) and confirm numbers before calling log_food or save_recipe. " +
  "After logging, report the day's kcal and protein against target. " +
  "Strength training comes from Hevy (read-only): use get_strength for progression questions.";

export function instructions() {
  return SERVER_INSTRUCTIONS.replace("{today}", todayIso());
}
