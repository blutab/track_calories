import Link from "next/link";
import { MEALS } from "@/db/schema";
import { getDay, listRecipes } from "@/lib/data";
import { addDays, currentHour, formatDate, isIsoDate, todayIso } from "@/lib/dates";
import { Bar, fmtInt, r0, r1, status } from "@/components/ui";
import {
  addCustomEntryAction,
  addRecipeEntryAction,
  deleteEntryAction,
  saveDayTargetsAction,
  saveStatsAction,
} from "../actions";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const today = todayIso();
  const date = isIsoDate(sp.date) ? sp.date : today;
  const [d, recipes] = await Promise.all([getDay(date), listRecipes()]);
  const t = d.targets;
  const kcalLeft = t.kcal != null ? t.kcal - d.totals.kcal : null;
  const kst = status(d.totals.kcal, t.kcal, "band", d.kcalBand);
  const h = currentHour();
  const defaultMeal = h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack";

  const macroRows = [
    { k: "protein", label: "Protein", kind: "min" },
    { k: "carbs", label: "Carbs", kind: "cap" },
    { k: "fat", label: "Fat", kind: "cap" },
    { k: "fibre", label: "Fibre", kind: "min" },
  ] as const;

  return (
    <>
      <section className="card" aria-label="Day summary">
        <div className="datebar">
          <Link className="btn icon" href={`/?date=${addDays(date, -1)}`} aria-label="Previous day">
            ‹
          </Link>
          <div className="d">
            {date === today ? "Today · " : ""}
            {formatDate(date, { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <Link className="btn icon" href={`/?date=${addDays(date, 1)}`} aria-label="Next day">
            ›
          </Link>
        </div>
        {date !== today && (
          <div style={{ textAlign: "center" }}>
            <Link href="/" className="small muted">
              Back to today
            </Link>
          </div>
        )}
        <div className="hero">
          <div className="big num">
            {r0(d.totals.kcal)}
            <small> / {t.kcal != null ? r0(t.kcal) : "–"} kcal</small>
          </div>
          {kcalLeft == null ? (
            <span className="pill">No calorie target</span>
          ) : kcalLeft >= 0 ? (
            <span className={`pill ${kst}`}>{r0(kcalLeft)} kcal left</span>
          ) : (
            <span className={`pill ${kst}`}>{r0(-kcalLeft)} kcal over</span>
          )}
        </div>
        <Bar value={d.totals.kcal} target={t.kcal} kind="band" band={d.kcalBand} />
        {d.kcalBand && (
          <p className="hint" style={{ margin: 0 }}>
            Maintenance band {fmtInt(d.kcalBand.low)}–{fmtInt(d.kcalBand.high)} kcal
          </p>
        )}
        <div className="metrics">
          {macroRows.map(({ k, label, kind }) => (
            <div className="metric" key={k}>
              <span className="muted small">{label}</span>
              <span className="v num">
                {r1(d.totals[k])}{" "}
                <span className="muted small">{t[k] != null ? `/ ${r0(t[k])} g` : "g"}</span>
              </span>
              <Bar value={d.totals[k]} target={t[k]} kind={kind} />
            </div>
          ))}
          <div className="metric">
            <span className="muted small">Steps</span>
            <span className="v num">
              {d.steps != null ? fmtInt(d.steps) : "–"}{" "}
              {t.steps != null && <span className="muted small">/ {fmtInt(t.steps)}</span>}
            </span>
            <Bar value={d.steps ?? 0} target={t.steps} kind="min" />
          </div>
          <div className="metric">
            <span className="muted small">Weight</span>
            <span className="v num">
              {d.weightKg != null ? (
                <>
                  {r1(d.weightKg)} <span className="muted small">kg</span>
                </>
              ) : (
                "–"
              )}
            </span>
          </div>
        </div>
        {d.override && <span className="hint">Targets are adjusted for this day.</span>}
      </section>

      <section className="card" aria-label="Food log">
        <div className="spread">
          <h2>Food log</h2>
          <span className="muted small num">{d.entries.length} items</span>
        </div>
        {d.entries.length === 0 ? (
          <p className="muted">Nothing logged yet. Tell Claude what you ate, or add it below.</p>
        ) : (
          <div>
            {MEALS.map((m) => {
              const list = d.entries.filter((e) => e.meal === m);
              if (!list.length) return null;
              const mk = list.reduce((a, e) => a + e.kcal, 0);
              return (
                <div key={m}>
                  <div className="meal-h spread">
                    <span>{m}</span>
                    <span className="num">{r0(mk)} kcal</span>
                  </div>
                  {list.map((e) => (
                    <div className="entry" key={e.id}>
                      <div>
                        <div className="name">
                          {e.name}
                          {e.servings !== 1 && <span className="muted small"> × {r1(e.servings)}</span>}
                        </div>
                        <div className="muted small num">
                          P {r1(e.protein)} · C {r1(e.carbs)} · F {r1(e.fat)} · Fib {r1(e.fibre)} g
                          {e.note ? ` · ${e.note}` : ""}
                        </div>
                      </div>
                      <div className="num" style={{ fontWeight: 700 }}>
                        {r0(e.kcal)}
                      </div>
                      <form action={deleteEntryAction}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="link" type="submit" aria-label={`Remove ${e.name}`}>
                          ✕
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {recipes.length > 0 && (
          <details>
            <summary>Add a saved recipe</summary>
            <form action={addRecipeEntryAction} className="row">
              <input type="hidden" name="date" value={date} />
              <label className="field grow" htmlFor="qa-recipe">
                Recipe
                <select id="qa-recipe" name="recipe">
                  {recipes.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.name} ({r0(r.totals.kcal)} kcal)
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor="qa-meal">
                Meal
                <select id="qa-meal" name="meal" defaultValue={defaultMeal}>
                  {MEALS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor="qa-serv">
                Servings
                <input id="qa-serv" name="servings" type="number" step="0.25" min="0.25" defaultValue={1} />
              </label>
              <button className="primary" type="submit">
                Add
              </button>
            </form>
          </details>
        )}

        <details>
          <summary>Add something else</summary>
          <form action={addCustomEntryAction} className="row">
            <input type="hidden" name="date" value={date} />
            <label className="field grow" htmlFor="c-name">
              Food
              <input id="c-name" name="name" className="wide" required placeholder="e.g. Apple" />
            </label>
            <label className="field" htmlFor="c-meal">
              Meal
              <select id="c-meal" name="meal" defaultValue={defaultMeal}>
                {MEALS.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            {(
              [
                ["kcal", "kcal"],
                ["protein", "Protein g"],
                ["carbs", "Carbs g"],
                ["fat", "Fat g"],
                ["fibre", "Fibre g"],
              ] as const
            ).map(([k, l]) => (
              <label className="field" htmlFor={`c-${k}`} key={k}>
                {l}
                <input id={`c-${k}`} name={k} type="number" step="0.1" min="0" required={k === "kcal"} />
              </label>
            ))}
            <button className="primary" type="submit">
              Add
            </button>
          </form>
        </details>
      </section>

      <section className="card" aria-label="Steps and weight">
        <h2>Steps &amp; weight</h2>
        <form action={saveStatsAction} className="row">
          <input type="hidden" name="date" value={date} />
          <label className="field" htmlFor="sw-steps">
            Steps
            <input id="sw-steps" name="steps" type="number" min="0" step="1" defaultValue={d.steps ?? ""} />
          </label>
          <label className="field" htmlFor="sw-weight">
            Weight (kg)
            <input id="sw-weight" name="weight" type="number" min="0" step="0.1" defaultValue={d.weightKg ?? ""} />
          </label>
          <button type="submit">Save</button>
        </form>
        <details open={Boolean(d.override)}>
          <summary>Adjust targets for this day only</summary>
          <form action={saveDayTargetsAction} className="row">
            <input type="hidden" name="date" value={date} />
            {(
              [
                ["kcal", "Calories"],
                ["protein", "Protein g"],
                ["steps", "Steps"],
              ] as const
            ).map(([k, l]) => (
              <label className="field" htmlFor={`ov-${k}`} key={k}>
                {l}
                <input
                  id={`ov-${k}`}
                  name={k}
                  type="number"
                  min="0"
                  defaultValue={d.override?.[k] ?? ""}
                  placeholder={d.defaultTargets[k] != null ? String(d.defaultTargets[k]) : ""}
                />
              </label>
            ))}
            <button type="submit">Save</button>
            {d.override && (
              <button type="submit" name="clear" value="1">
                Use defaults
              </button>
            )}
          </form>
        </details>
      </section>
    </>
  );
}
