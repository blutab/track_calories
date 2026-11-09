import { timingSafeEqual } from "node:crypto";
import { syncHevy } from "@/lib/training";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The first import pages through the whole Hevy history.
export const maxDuration = 300;

/**
 * Pull workout changes from Hevy. Called daily by Vercel Cron (see vercel.json),
 * which sends `Authorization: Bearer <CRON_SECRET>`. Add `?full=1` to re-import everything.
 * Anything unauthorised gets a plain 404.
 */
function authorised(header: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 32 || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7).trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorised(req.headers.get("authorization"))) return new Response("Not found", { status: 404 });
  const full = new URL(req.url).searchParams.get("full") === "1";
  const result = await syncHevy({ full });
  return Response.json(result, { status: result.ok || result.skipped ? 200 : 502 });
}
