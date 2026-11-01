# Batul's Calories

A personal calorie and macro tracker. You log meals by chatting with Claude ("had my usual egg breakfast"), and the web app shows today's progress, the week against your targets, and your saved recipes. It works on your phone too, and you can add it to your home screen.

- **Web app**: Next.js 16 (App Router, server components and server actions)
- **Database**: Postgres (Neon via Vercel) with Drizzle ORM
- **Sign-in**: Google via Auth.js, limited to one email address (`ALLOWED_EMAIL`)
- **Claude integration**: an MCP endpoint at `/api/mcp/<MCP_SECRET>`, added to claude.ai as a custom connector

## How it fits together

```
Claude (chat, web or mobile) ──MCP──▶ /api/mcp/<secret> ──┐
                                                          ├──▶ src/lib/data.ts ──▶ Postgres
Browser / phone ── Google sign-in ──▶ pages + actions ─────┘
```

The pages and the MCP tools both use the same functions in `src/lib/data.ts`, so they can't drift apart.

### Data model (`src/db/schema.ts`)

| Table | What it holds |
|---|---|
| `targets` | Default daily targets (one row): kcal, protein, carbs, fat, fibre, steps. Empty = no target |
| `day_targets` | One-day overrides of those targets |
| `day_stats` | Steps and weight per day |
| `recipes` + `recipe_items` | Saved regular meals, with per-ingredient macros for one serving |
| `food_entries` | Everything logged; macros stored already multiplied by servings |

### Claude's tools (`src/lib/mcp.ts`)

`get_day`, `get_week`, `list_recipes`, `log_food`, `update_entry`, `delete_entry`, `save_recipe`, `delete_recipe`, `set_day_stats`, `set_targets`.

## Deploy (one-time setup, about 20 minutes)

### 1. Import the repo into Vercel
vercel.com → **Add New → Project** → import `blutab/track_calories`. Don't deploy yet if it asks; continue to step 2 first. (If it already deployed, that's fine: the first build will fail until the database exists.)

### 2. Add Postgres
In the Vercel project: **Storage → Create Database → Neon (Postgres)** → connect it to this project for all environments. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you.

### 3. Create the Google sign-in client
1. console.cloud.google.com → create a project (e.g. "Calories").
2. **APIs & Services → OAuth consent screen**: User type *External*. App name "Calories", your email as support and developer contact. Under **Test users**, add `blutab@gmail.com`. You can leave it in *Testing* mode.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*.
   - Authorized redirect URI: `https://<your-vercel-domain>/api/auth/callback/google`
     (e.g. `https://track-calories.vercel.app/api/auth/callback/google`)
4. Copy the client ID and client secret.

### 4. Set environment variables
Vercel project → **Settings → Environment Variables** (Production and Preview):

| Name | Value |
|---|---|
| `AUTH_SECRET` | output of `openssl rand -base64 32` (or any 32+ random characters) |
| `AUTH_GOOGLE_ID` | from step 3 |
| `AUTH_GOOGLE_SECRET` | from step 3 |
| `ALLOWED_EMAIL` | `blutab@gmail.com` |
| `MCP_SECRET` | output of `openssl rand -hex 32` (64 random characters). **Keep this private**: anyone with the full MCP URL can read and write your log |
| `APP_TIME_ZONE` | optional, defaults to `Europe/Amsterdam` |

No terminal? A password manager's generator works for both secrets: use letters and digits only, at least 40 characters.

### 5. Deploy
**Deployments → Redeploy** (or push a commit). The build (`vercel-build`) runs the database migrations, then seeds your default targets (1800 kcal, 100 g protein, 8000 steps) and the *Usual egg breakfast* recipe if they don't exist yet, then builds the app.

Open the site, sign in with Google, and you should see today's view.

### 6. Connect Claude
claude.ai → **Customize → Connectors → + → Add custom connector**
- Name: `Calories`
- URL: `https://<your-vercel-domain>/api/mcp/<MCP_SECRET>`
- No OAuth details needed.

Then, in any chat: "I had my usual egg breakfast". Connectors you add on the web also work in the Claude mobile app.

### 7. On your phone
Open the site in Safari (iPhone) → Share → **Add to Home Screen**. On Android/Chrome: menu → **Add to Home screen**.

## Local development

```bash
cp .env.example .env.local      # fill in DATABASE_URL; set DEV_SKIP_AUTH=1 to skip Google locally
npm install
npm run db:migrate
npm run db:seed
npm run dev                      # http://localhost:3000
```

To test the MCP endpoint:

```bash
MCP_URL=http://localhost:3000/api/mcp/<MCP_SECRET> npm run test:mcp
MCP_URL=... npm run test:mcp -- log_food '{"items":[{"meal":"breakfast","recipe":"my eggs"}]}'
```

After changing `src/db/schema.ts`, run `npm run db:generate` to create a migration in `drizzle/`, then commit it. The next deploy applies it.

## Security notes

- Pages and server actions require a Google session whose verified email matches `ALLOWED_EMAIL`.
- The MCP endpoint is protected by the secret in its URL. It returns 404 for anything else, and refuses to run if `MCP_SECRET` is missing or shorter than 32 characters. If the URL ever leaks, change `MCP_SECRET` in Vercel, redeploy, and update the connector URL in claude.ai.
- Upgrade path: replace the URL secret with OAuth (mcp-handler's `withMcpAuth`) if this ever needs to support more than one person.
