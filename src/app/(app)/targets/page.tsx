import { getBands, getDefaultTargets } from "@/lib/data";
import { kcalBand, weightBand } from "@/lib/bands";
import { saveBandsAction, saveDefaultTargetsAction } from "../../actions";

const FIELDS = [
  ["kcal", "Calories (kcal)"],
  ["protein", "Protein (g)"],
  ["carbs", "Carbs (g)"],
  ["fat", "Fat (g)"],
  ["fibre", "Fibre (g)"],
  ["steps", "Steps"],
] as const;

export default async function TargetsPage() {
  const [t, b] = await Promise.all([getDefaultTargets(), getBands()]);
  const kb = kcalBand(t.kcal, b.kcalBandPct);
  const wb = weightBand(b);
  return (
    <>
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

    <section className="card">
      <h2>Maintenance bands</h2>
      <p className="hint">
        A day counts as on target when calories land inside the band. Weight is judged on the 7-day average, not single
        weigh-ins.
      </p>
      <form action={saveBandsAction} className="row">
        <label className="field" htmlFor="bd-kcal">
          Calorie band (± %)
          <input id="bd-kcal" name="kcalBandPct" type="number" min="1" max="50" step={0.5} defaultValue={b.kcalBandPct} required />
        </label>
        <label className="field" htmlFor="bd-base">
          Weight baseline (kg)
          <input id="bd-base" name="weightBaselineKg" type="number" min="0" step={0.1} defaultValue={b.weightBaselineKg ?? ""} />
        </label>
        <label className="field" htmlFor="bd-wband">
          Weight band (± kg)
          <input id="bd-wband" name="weightBandKg" type="number" min="0.1" max="10" step={0.1} defaultValue={b.weightBandKg} required />
        </label>
        <button className="primary" type="submit">
          Save bands
        </button>
      </form>
      <p className="hint">
        {kb ? `Calories: ${kb.low}–${kb.high} kcal. ` : "Set a calorie target to get a calorie band. "}
        {wb ? `Weight: ${wb.low}–${wb.high} kg.` : "Leave the baseline empty for no weight band."}
      </p>
    </section>
    </>
  );
}
