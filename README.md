# LiftLedger

A focused training + nutrition + health dashboard:

- **Training** from Hevy: a muscle heatmap body chart, weekly volume and streak, exercise progression, PRs, recent workouts, bodyweight and steps.
- **Nutrition** logged from Telegram (a photo or free text) or the dashboard. It tracks daily and weekly calories and protein against goals, with presets computed from your profile, a goal-adherence calendar, top foods, and an energy balance chart.
- **Health** from Apple Health via the *Health Auto Export* iOS app: steps, active and resting energy, weigh-ins.
- **A Telegram bot** that logs meals and answers questions grounded in your data ("how have my biceps progressed over 6 weeks?", "what am I overeating on?").

Hevy is the one required connection. The AI model, Telegram and Apple Health are optional, and each missing piece just hides its widgets.

The full design is in [`docs/PLAN.md`](docs/PLAN.md).

## Layout

| Path | What it is |
|---|---|
| `apps/web` | Vite + React 19 dashboard (UI ported from Phobos). It talks to Supabase directly for the user's own rows (protected by RLS) and to the server for anything involving secrets. |
| `apps/server` | Hono service: REST API, Hevy sync jobs (pg-boss), Health ingest, the Telegram bot, and the food and Q&A AI pipelines. |
| `packages/shared` | Pure, tested domain logic: muscle taxonomy, strength metrics, goal presets, units, dates. |
| `supabase/` | Migrations, the RLS smoke test and local config. The local stack runs on ports **5542x**. |

## Local setup

Prerequisites: Node 22+, pnpm 10, Docker, and the Supabase CLI.

```bash
pnpm install
```

```bash
supabase start
```

```bash
pnpm db:reset
```

Then:

1. Copy `apps/server/.env.example` to `apps/server/.env.local`. Fill it in with the values from `supabase status`, plus a new key from `openssl rand -base64 32`.
2. Copy `apps/web/.env.example` to `apps/web/.env.local` and add the anon key.
3. Start the server (port 8790) and the web app (http://localhost:5180):

```bash
pnpm dev
```

Sign up, then open the confirmation email in the local mail catcher at http://127.0.0.1:55424. Password-reset emails land there too. Then follow the onboarding. You need a Hevy Pro API key from hevy.com → Settings → Developer.

### Optional pieces

- **Telegram:** create a bot with @BotFather and set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` and `TELEGRAM_MODE=polling`. In production, set `TELEGRAM_MODE=webhook` with `TELEGRAM_WEBHOOK_SECRET` and a public `PUBLIC_BASE_URL`. Use a dedicated bot: Telegram allows one consumer per token.
- **AI model:** chosen per user in Settings → Connections. **Codex CLI** runs `codex exec` on the server with the ChatGPT account signed in to Codex there (no API key; your ChatGPT plan's limits; self-hosted only, turn off with `CODEX_CLI_ENABLED=false`). The other options are Anthropic, OpenAI, or any OpenAI-compatible URL such as Ollama (`http://localhost:11434/v1`) or LM Studio. "Test & save" probes for tool calling (needed for Q&A) and image input (needed for meal photos).
- **USDA FoodData Central:** `DEMO_KEY` is limited to about 30 requests an hour. Get a free key at https://fdc.nal.usda.gov/api-key-signup/ and set `USDA_FDC_API_KEY`.
- **Apple Health:** Settings → Connections → Set up Apple Health shows the URL and bearer token to paste into Health Auto Export. Your phone has to reach the server: use a tunnel (cloudflared, Tailscale Funnel) or the Mac's LAN IP.

## Deploying to Vercel

The hosted instance runs as one Vercel project: the web app as static files and the server as a single function behind `/api`, `/ingest`, `/telegram` and `/cron` (`apps/server/src/vercel.ts`). Vercel has no worker process, so pg-boss isn't used there:

- Hevy syncs run after the response (`waitUntil`), one per user at a time under a lease on `hevy_sync_state`.
- The dashboard asks for a sync on open when the last one is over 30 minutes old, and `/cron/daily` syncs everyone once a day (Hobby plans only allow daily crons) and cleans up expired rows.
- The Telegram bot is webhook-only. The webhook acknowledges first and handles the update afterwards, so a slow model call can't make Telegram re-send a meal.

Build and deploy from your machine with the Vercel CLI linked to the project:

```bash
pnpm deploy:vercel
```

That runs `scripts/build-vercel.mjs`, which produces prebuilt output (Build Output API) and then uploads it. The web build reads `apps/web/.env.production`, where `VITE_API_URL` is empty (same origin) and `VITE_HOSTED=true` hides the self-host-only AI options. The function reads the server variables from the Vercel project: the same ones as `.env.example` minus `DATABASE_URL`, plus `CRON_SECRET`, `TELEGRAM_MODE=webhook`, `ALLOW_PRIVATE_AI_URLS=false` and `CODEX_CLI_ENABLED=false`.

Apply new migrations to the hosted database with `supabase db push`. After changing the webhook secret or domain, point Telegram at `https://<domain>/telegram/webhook` with `setWebhook` and the `secret_token`. A local server polling the same bot token removes the webhook when it starts, so develop against a separate bot.

## Commands

Run everything (typecheck, lint, tests, build):

```bash
pnpm verify
```

Run the RLS and meal-trigger smoke test against local Supabase:

```bash
pnpm db:test
```

Regenerate the database types after a migration:

```bash
pnpm db:types
```

Send the bot a message without Telegram (this writes to the DB):

```bash
pnpm --filter @liftledger/server simulate --email you@example.com "2 eggs and toast"
```

Run one Q&A tool directly, with no model involved:

```bash
pnpm --filter @liftledger/server tools --email you@example.com get_muscle_progress '{"muscle":"biceps","weeks":6}'
```

Score food parsing against the connected model:

```bash
pnpm --filter @liftledger/server eval:food --email you@example.com
```

## How the bot answers "all my bicep work"

Every Hevy exercise template, custom ones included, carries `primary_muscle_group` and `secondary_muscle_groups`. "Biceps", "arms" or "pull" resolve through a muscle vocabulary (`packages/shared/src/muscles.ts`) to Hevy groups. The tools then gather every set that trains those groups, counting secondary movers at half, and compute per-exercise trends with the shared, tested helpers. The model picks the tools and writes the reply; it never does the math.
