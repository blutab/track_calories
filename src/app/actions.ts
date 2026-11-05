"use server";

import { revalidatePath } from "next/cache";
import { isSignedIn } from "@/auth";
import { MEALS, type Meal } from "@/db/schema";
import { resolveDate } from "@/lib/dates";
import * as data from "@/lib/data";

async function guard() {
  if (!(await isSignedIn())) throw new Error("Not signed in");
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** Empty → null, otherwise a non-negative number. */
function optNum(f: FormData, k: string): number | null {
  const v = str(f, k);
  if (v === "") return null;
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${k} must be a number`);
  return n;
}
const meal = (f: FormData): Meal => {
  const m = str(f, "meal") as Meal;
  return MEALS.includes(m) ? m : "snack";
};
function done() {
  revalidatePath("/", "layout");
}

export async function deleteEntryAction(f: FormData) {
  await guard();
  await data.deleteEntry(Number(str(f, "id")));
  done();
}

export async function addRecipeEntryAction(f: FormData) {
  await guard();
  await data.logFood(resolveDate(str(f, "date")), [
    { meal: meal(f), recipe: str(f, "recipe"), servings: optNum(f, "servings") || 1 },
  ]);
  done();
}

export async function addCustomEntryAction(f: FormData) {
  await guard();
  const name = str(f, "name");
  if (!name) throw new Error("Name is required");
  await data.logFood(resolveDate(str(f, "date")), [
    {
      meal: meal(f),
      name,
      kcal: optNum(f, "kcal") ?? 0,
      protein: optNum(f, "protein") ?? 0,
      carbs: optNum(f, "carbs") ?? 0,
      fat: optNum(f, "fat") ?? 0,
      fibre: optNum(f, "fibre") ?? 0,
    },
  ]);
  done();
}

export async function saveStatsAction(f: FormData) {
  await guard();
  await data.setDayStats(resolveDate(str(f, "date")), { steps: optNum(f, "steps"), weightKg: optNum(f, "weight") });
  done();
}

export async function saveDayTargetsAction(f: FormData) {
  await guard();
  const date = resolveDate(str(f, "date"));
  if (str(f, "clear") === "1") await data.setDayTargets(date, null);
  else await data.setDayTargets(date, { kcal: optNum(f, "kcal"), protein: optNum(f, "protein"), steps: optNum(f, "steps") });
  done();
}

export async function saveDefaultTargetsAction(f: FormData) {
  await guard();
  await data.setDefaultTargets({
    kcal: optNum(f, "kcal"),
    protein: optNum(f, "protein"),
    carbs: optNum(f, "carbs"),
    fat: optNum(f, "fat"),
    fibre: optNum(f, "fibre"),
    steps: optNum(f, "steps"),
  });
  done();
}

export async function saveBandsAction(f: FormData) {
  await guard();
  await data.setBands({
    kcalBandPct: optNum(f, "kcalBandPct") ?? undefined,
    weightBaselineKg: optNum(f, "weightBaselineKg"),
    weightBandKg: optNum(f, "weightBandKg") ?? undefined,
  });
  done();
}

export async function deleteRecipeAction(f: FormData) {
  await guard();
  await data.deleteRecipe(str(f, "slug"));
  done();
}
