import { timingSafeEqual } from "node:crypto";
import { setDayStats } from "@/lib/data";
import { resolveDate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Steps sync from an iOS Shortcut that reads Apple Health.
 *
 *   POST /api/health-sync
 *   Authorization: Bearer <HEALTH_SYNC_TOKEN>
 *   { "steps": 8421, "date": "2026-11-08" }   // date optional, defaults to today
 *
 * Overwrites that day's steps (Health is the source of truth); weight is untouched.
 * Safe to call many times a day. Anything unauthorised gets a plain 404.
 */
function tokenMatches(header: string | null): boolean {
  const expected = process.env.HEALTH_SYNC_TOKEN;
  if (!expected || expected.length < 32 || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7).trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  if (!tokenMatches(req.headers.get("authorization"))) return new Response("Not found", { status: 404 });

  let body: { steps?: unknown; date?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  // Shortcuts may send numbers as text, sometimes with decimals or thousands separators.
  const raw = typeof body.steps === "string" ? body.steps.replace(/[\s,.](?=\d{3}\b)/g, "") : body.steps;
  const steps = typeof raw === "number" ? raw : Number(raw);
  if (raw === "" || raw == null || !Number.isFinite(steps) || steps < 0 || steps > 200_000) {
    return json({ error: "steps must be a number between 0 and 200000" }, 400);
  }

  let date: string;
  try {
    date = resolveDate(typeof body.date === "string" ? body.date.trim() : undefined);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  const saved = await setDayStats(date, { steps });
  return json({ ok: true, date, steps: saved.steps });
}
