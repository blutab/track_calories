import { listRecipes } from "@/lib/data";
import { r0, r1 } from "@/components/ui";
import { deleteRecipeAction } from "../../actions";

export default async function RecipesPage() {
  const recipes = await listRecipes();
  if (!recipes.length) {
    return (
      <section className="card">
        <h2>Saved recipes</h2>
        <p className="muted">No recipes yet. Ask Claude to save a meal you eat often, or send a photo of it.</p>
      </section>
    );
  }
  return (
    <>
      {recipes.map((r) => (
        <section className="card" key={r.slug}>
          <div className="spread">
            <h2>{r.name}</h2>
            <span className="pill num">{r0(r.totals.kcal)} kcal</span>
          </div>
          {r.aliases.length > 0 && <span className="hint">Also called: {r.aliases.join(", ")}</span>}
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>kcal</th>
                  <th>P</th>
                  <th>C</th>
                  <th>F</th>
                  <th>Fib</th>
                </tr>
              </thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.id}>
                    <td className="wrap-cell">
                      {i.name} {i.amount && <span className="muted small">{i.amount}</span>}
                    </td>
                    <td>{r0(i.kcal)}</td>
                    <td>{r1(i.protein)}</td>
                    <td>{r1(i.carbs)}</td>
                    <td>{r1(i.fat)}</td>
                    <td>{r1(i.fibre)}</td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <b>Total</b>
                  </td>
                  <td>
                    <b>{r0(r.totals.kcal)}</b>
                  </td>
                  <td>
                    <b>{r1(r.totals.protein)}</b>
                  </td>
                  <td>
                    <b>{r1(r.totals.carbs)}</b>
                  </td>
                  <td>
                    <b>{r1(r.totals.fat)}</b>
                  </td>
                  <td>
                    <b>{r1(r.totals.fibre)}</b>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {r.note && <span className="hint">{r.note}</span>}
          <details>
            <summary className="small muted">Delete recipe</summary>
            <form action={deleteRecipeAction} className="row">
              <input type="hidden" name="slug" value={r.slug} />
              <span className="small muted">Past log entries keep their numbers.</span>
              <button type="submit">Delete {r.name}</button>
            </form>
          </details>
        </section>
      ))}
    </>
  );
}
