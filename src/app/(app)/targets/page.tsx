import { getDefaultTargets } from "@/lib/data";
import { saveDefaultTargetsAction } from "../../actions";

const FIELDS = [
  ["kcal", "Calories (kcal)"],
  ["protein", "Protein (g)"],
  ["carbs", "Carbs (g)"],
  ["fat", "Fat (g)"],
  ["fibre", "Fibre (g)"],
  ["steps", "Steps"],
] as const;

export default async function TargetsPage() {
  const t = await getDefaultTargets();
  return (
    <section className="card">
      <h2>Default daily targets</h2>
      <p className="hint">
        Used every day unless you adjust a single day on the Today tab. Leave a box empty for no target.
      </p>
      <form action={saveDefaultTargetsAction} className="row">
        {FIELDS.map(([k, l]) => (
          <label className="field" htmlFor={`tg-${k}`} key={k}>
            {l}
            <input id={`tg-${k}`} name={k} type="number" min="0" step={k === "steps" ? 1 : 0.1} defaultValue={t[k] ?? ""} />
          </label>
        ))}
        <button className="primary" type="submit">
          Save targets
        </button>
      </form>
    </section>
  );
}
