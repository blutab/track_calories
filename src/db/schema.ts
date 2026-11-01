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
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("targets_single_row", sql`${t.id} = 1`)],
);

/** One-day target overrides. Any non-null column replaces the default for that date. */
export const dayTargets = pgTable("day_targets", {
  date: date("date").primaryKey(),
  ...targetCols,
});

/** Steps and body weight per day. */
export const dayStats = pgTable("day_stats", {
  date: date("date").primaryKey(),
  steps: integer("steps"),
  weightKg: doublePrecision("weight_kg"),
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
