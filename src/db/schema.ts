import {
  pgTable,
  serial,
  integer,
  text,
  date,
  doublePrecision,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Nutrition columns shared by recipe items and food entries. Grams, except kcal. */
const macros = {
  kcal: doublePrecision("kcal").notNull().default(0),
  protein: doublePrecision("protein").notNull().default(0),
  carbs: doublePrecision("carbs").notNull().default(0),
  fat: doublePrecision("fat").notNull().default(0),
  fibre: doublePrecision("fibre").notNull().default(0),
};

/** Optional target columns. NULL means "no target". */
const targetCols = {
  kcal: doublePrecision("kcal"),
  protein: doublePrecision("protein"),
  carbs: doublePrecision("carbs"),
  fat: doublePrecision("fat"),
  fibre: doublePrecision("fibre"),
  steps: integer("steps"),
};

/** Default daily targets. Single row with id = 1. */
export const targets = pgTable(
  "targets",
  {
    id: integer("id").primaryKey().default(1),
    ...targetCols,
    /** Calorie band half-width, % of the kcal target (8 = ±8%). */
    kcalBandPct: doublePrecision("kcal_band_pct").notNull().default(8),
    /** Maintenance weight; NULL = no weight band. */
    weightBaselineKg: doublePrecision("weight_baseline_kg"),
    /** Weight band half-width in kg. */
    weightBandKg: doublePrecision("weight_band_kg").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("targets_single_row", sql`${t.id} = 1`)],
);

/** One-day target overrides. Any non-null column replaces the default for that date. */
export const dayTargets = pgTable("day_targets", {
  date: date("date").primaryKey(),
  ...targetCols,
});

/** Steps, body weight and grease-the-groove chin-up sets per day. */
export const dayStats = pgTable("day_stats", {
  date: date("date").primaryKey(),
  steps: integer("steps"),
  weightKg: doublePrecision("weight_kg"),
  /** Grease the groove: number of chin-up sets done that day. */
  chinupSets: integer("chinup_sets"),
});

export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recipeItems = pgTable(
  "recipe_items",
  {
    id: serial("id").primaryKey(),
    recipeId: integer("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    name: text("name").notNull(),
    amount: text("amount"),
    ...macros,
  },
  (t) => [index("recipe_items_recipe_idx").on(t.recipeId)],
);

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

/** Every logged food. Macros are stored already multiplied by servings. */
export const foodEntries = pgTable(
  "food_entries",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    meal: text("meal").$type<Meal>().notNull(),
    name: text("name").notNull(),
    recipeId: integer("recipe_id").references(() => recipes.id, { onDelete: "set null" }),
    servings: doublePrecision("servings").notNull().default(1),
    ...macros,
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("food_entries_date_idx").on(t.date),
    check("food_entries_meal_check", sql`${t.meal} in ('breakfast','lunch','dinner','snack')`),
  ],
);

// ---------- Hevy (strength training), synced read-only from the Hevy API ----------

/** One Hevy workout. `id` is Hevy's UUID; `date` is the start day in the app time zone. */
export const hevyWorkouts = pgTable(
  "hevy_workouts",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    date: date("date").notNull(),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }),
    /** Hevy's own last-updated time for the workout. */
    hevyUpdatedAt: timestamp("hevy_updated_at", { withTimezone: true }),
    /** Working sets only (warm-ups excluded). */
    setCount: integer("set_count").notNull().default(0),
    /** Sum of weight × reps over working sets, kg. */
    volumeKg: doublePrecision("volume_kg").notNull().default(0),
  },
  (t) => [index("hevy_workouts_date_idx").on(t.date)],
);

/** Every logged set. Replaced as a whole whenever its workout changes in Hevy. */
export const hevySets = pgTable(
  "hevy_sets",
  {
    id: serial("id").primaryKey(),
    workoutId: text("workout_id")
      .notNull()
      .references(() => hevyWorkouts.id, { onDelete: "cascade" }),
    exerciseIndex: integer("exercise_index").notNull(),
    setIndex: integer("set_index").notNull(),
    /** Hevy exercise template id; falls back to the title when Hevy sends none. */
    exerciseKey: text("exercise_key").notNull(),
    exerciseTitle: text("exercise_title").notNull(),
    /** normal | warmup | dropset | failure */
    type: text("type").notNull().default("normal"),
    weightKg: doublePrecision("weight_kg"),
    reps: integer("reps"),
    distanceM: doublePrecision("distance_m"),
    durationS: integer("duration_s"),
    rpe: doublePrecision("rpe"),
    /** Estimated one-rep max (Epley), working sets of 1–12 reps with weight only. */
    e1rmKg: doublePrecision("e1rm_kg"),
  },
  (t) => [index("hevy_sets_workout_idx").on(t.workoutId), index("hevy_sets_exercise_idx").on(t.exerciseKey)],
);

/** Sync bookkeeping. Single row with id = 1. */
export const hevySync = pgTable(
  "hevy_sync",
  {
    id: integer("id").primaryKey().default(1),
    /** Ask Hevy for events since this time on the next run. */
    cursor: timestamp("cursor", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
    lastError: text("last_error"),
  },
  (t) => [check("hevy_sync_single_row", sql`${t.id} = 1`)],
);
