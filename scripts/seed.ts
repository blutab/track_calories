/**
 * Seeds default targets and the first saved recipe. Safe to re-run on every deploy:
 * nothing is written if targets or the recipe already exist.
 */
import { getDefaultTargets, setDefaultTargets, saveRecipe, getRecipeBySlug } from "@/lib/data";

const current = await getDefaultTargets();
if (Object.values(current).every((v) => v == null)) {
  await setDefaultTargets({ kcal: 1800, protein: 100, steps: 8000 });
  console.log("Default targets set: 1800 kcal, 100 g protein, 8000 steps.");
} else {
  console.log("Default targets already set, left unchanged.");
}

if (await getRecipeBySlug("usual-egg-breakfast")) {
  console.log("Usual egg breakfast already saved, left unchanged.");
  process.exit(0);
}

const r = await saveRecipe({
  slug: "usual-egg-breakfast",
  name: "Usual egg breakfast",
  aliases: ["egg breakfast", "usual breakfast", "my eggs"],
  note: "Assumes semi-skimmed (halfvolle) milk in the chai. Tea and water add ~0 kcal.",
  items: [
    { name: "Egg white", amount: "90 ml", kcal: 48, protein: 10.1, carbs: 0.7, fat: 0.2, fibre: 0 },
    { name: "Whole egg", amount: "1 large", kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8, fibre: 0 },
    { name: "Sourdough bread", amount: "30 g", kcal: 78, protein: 2.7, carbs: 15.3, fat: 0.5, fibre: 0.8 },
    { name: "Chai: semi-skimmed milk", amount: "120 ml (half of 1 cup)", kcal: 55, protein: 4.2, carbs: 5.6, fat: 1.8, fibre: 0 },
    { name: "Chai: sugar", amount: "1 tsp (4 g)", kcal: 16, protein: 0, carbs: 4, fat: 0, fibre: 0 },
  ],
});
console.log(`Recipe saved: ${r.name} (${r.totals.kcal} kcal, ${r.totals.protein} g protein).`);
process.exit(0);
