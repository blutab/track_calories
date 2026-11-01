import { timingSafeEqual } from "node:crypto";
import { createMcpHandler } from "mcp-handler";
import { registerTools, instructions } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * MCP endpoint for Claude. The URL contains a long random secret (MCP_SECRET),
 * which acts as the credential: https://<app>/api/mcp/<MCP_SECRET>
 * Anything else gets a plain 404 so the endpoint isn't discoverable.
 */
function secretMatches(given: string): boolean {
  const expected = process.env.MCP_SECRET;
  if (!expected || expected.length < 32) return false; // refuse to run with a weak or missing secret
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const notFound = () => new Response("Not found", { status: 404 });

async function handle(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!secretMatches(secret)) return notFound();
  // Built per request so the server instructions carry today's date.
  const handler = createMcpHandler(registerTools, {
    serverInfo: { name: "batul-calories", version: "0.1.0" },
    instructions: instructions(),
  });
  return handler(req);
}

export { handle as GET, handle as POST, handle as DELETE };
