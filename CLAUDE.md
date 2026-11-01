# Notes for Claude

Personal calorie tracker for Batul (single user). Next.js 16 App Router + Drizzle/Postgres + Auth.js (Google) + MCP endpoint (mcp-handler v2).

- All reads and writes go through `src/lib/data.ts`. Pages, server actions (`src/app/actions.ts`) and MCP tools (`src/lib/mcp.ts`) are thin wrappers. Add new behaviour there first.
- Dates are `YYYY-MM-DD` strings in `APP_TIME_ZONE` (default Europe/Amsterdam). Use the helpers in `src/lib/dates.ts`; never `new Date().toISOString()` for "today".
- Food entry macros are stored already multiplied by servings. Recipe items are for one serving; recipe totals are computed, not stored.
- Next 16: route `params`/`searchParams` are Promises.
- Schema change: edit `src/db/schema.ts` → `npm run db:generate` → commit the new file in `drizzle/`. Vercel applies migrations in `vercel-build`.
- Check with `npm run typecheck` and `npm run build`. With a local Postgres and `DEV_SKIP_AUTH=1`, `npm run dev` plus `npm run test:mcp` exercises the MCP tools.
