# LiftLedger — Implementation Plan

## Context

Phobos tried to be an everything-assistant: automations, briefs, email, forge, approvals. Its gym and nutrition dashboard was the part that actually solved a problem. LiftLedger is a focused, **multi-user** product built around that core:

- **Training**: Hevy workouts shown as a muscle heatmap body chart, progression, PRs, weekly volume and steps.
- **Nutrition**: food logged mostly through Telegram (a photo or free text), with daily and weekly calories, protein, trends, goals and goal presets.
- **Health**: weight, steps and active/resting energy from Apple Health, via the *Health Auto Export* iOS app.
- **Telegram bot**: logs food and answers grounded questions about your training and nutrition data.

**Decisions (confirmed with the user):**
- Multi-user from day one: Supabase Auth plus row-level security on every table.
- One shared LiftLedger Telegram bot, linked to an account with a deep link.
- Nutrition comes from an LLM parse plus a food-database lookup; the user's own numbers always win.
- New TypeScript Node backend (Hono) with local Supabase. **No Phobos backend code is reused.**
- Reuse the Phobos **frontend**: its look, components and pure logic. Hevy and Telegram keys from Phobos `.env.local` can be used during development.

**Where the reusable Phobos code lives:** `/Users/user/Phobos` on branch **`fix/multi-gate-confirm-and-watch-providers`** (master has no gym or nutrition modules). Read a file with `git -C /Users/user/Phobos show "fix/multi-gate-confirm-and-watch-providers:<path>"`. In zsh, keep the quotes, because `$B:path` breaks on modifiers like `:a`.

---

## Architecture

```
LiftLedger/ (pnpm monorepo, Node 22, TypeScript, Biome, Vitest)
├─ apps/web        Vite + React 19 SPA, ported from Phobos (dark theme, Tailwind v4, Recharts, TanStack Query)
├─ apps/server     Hono on Node: REST API · Telegram bot (grammY) · Health ingest · pg-boss jobs · AI layer
├─ packages/shared pure logic ported from Phobos (muscles, metrics, gym-analysis, units, fuzzy, dates, zod schemas)
└─ supabase/       local Supabase (supabase init / start), migrations, seed
```

**Data access split.** This keeps the pattern that worked in Phobos.
- **Web → Supabase directly** (anon key plus RLS) for reads and simple owned writes: meals, goals, profile, saved foods. Realtime invalidation (`subscribeAndInvalidate`) keeps the dashboard live when the bot logs a meal. The tables it listens to must be added to the `supabase_realtime` publication.
- **Web → server** (`Authorization: Bearer <supabase JWT>`, verified by the server with the project JWKS) for anything that touches secrets or third parties:
  - saving and testing API keys
  - "Sync now" for Hevy
  - creating a Telegram link code
  - rotating the Health ingest token
  - food search (USDA / Open Food Facts)
- **Server → Supabase** with the service-role key. **Every query is explicitly scoped by `user_id`**, because the service role bypasses RLS. A small `forUser(userId)` repository wrapper enforces this.

**Background jobs:** `pg-boss`, backed by the same Postgres.
- `hevy.sync`: per user, every 30 minutes, singleton per user, retries with backoff.
- `hevy.backfill`: resumable.
- `cleanup`: expired link codes and old bot history.

**Local dev:**
- `supabase start`.
- `pnpm dev` runs web and server together.
- The Telegram bot uses **long polling** locally and a **webhook** (with `secret_token`) when deployed.
- Health Auto Export needs a reachable URL: use a tunnel (cloudflared or Tailscale Funnel), or the Mac's LAN IP while on the same Wi-Fi.

---

## Secrets & integrations

- **`user_secrets`** `(user_id, kind, ciphertext, iv, auth_tag, key_version, last4, updated_at)`
  - `kind` is one of `hevy_api_key` or `ai_api_key`.
  - Encrypted with **AES-256-GCM** using `LIFTLEDGER_ENCRYPTION_KEY` from the server environment; `key_version` allows key rotation.
  - RLS is enabled with **no** policies for `authenticated`, so only the server can read it.
  - The web only ever sees a `integration_status` view: `configured`, `last4`, `last_sync_at`, `last_error`.
- **`integrations`** `(user_id, provider, status, config jsonb, last_sync_at, last_error)`
  - `provider` is one of `hevy`, `telegram`, `ai`, or `apple_health`.
  - The `ai` config holds `{kind: openai|anthropic|openai_compatible, base_url?, model, supports_vision, supports_tools}`.
- **Hevy (required).**
  - Onboarding can't finish until a key validates against a cheap endpoint (e.g. `/v1/workouts/count`, `api-key` header).
  - Hevy requires a Pro subscription; say so in the UI.
- **AI provider (optional; required only for the Telegram bot).**
  - Uses the Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible` for Ollama, LM Studio or any `/v1` URL). This gives one interface for tool calling, structured output and images.
  - **"Test connection"** probes three things and stores the results as capability flags: a plain completion, a tool call, and an image input. A local model without vision answers photos with "your model can't read images; describe the meal instead".
  - **SSRF guard:** if the server is hosted, reject private or loopback `base_url`s unless `ALLOW_PRIVATE_AI_URLS=true` (the self-hosted default).
  - Phobos's rule of "subscription CLIs only" doesn't apply here, because users bring their own keys.
- **Telegram (optional).**
  1. Settings → "Connect Telegram" makes the server create a one-time code (10 minutes, stored hashed).
  2. The user taps `t.me/<bot>?start=<code>`; the bot's `/start <code>` handler writes `telegram_links(user_id, chat_id unique, tg_user_id)`.
  3. Unlinked chats get a "link your account" reply. `/unlink` is available too.
  - Use a **new BotFather bot** for LiftLedger. Reusing the Phobos token conflicts with Phobos's worker, because Telegram allows one consumer per token.
- **Apple Health (optional).**
  - The server issues a per-user **ingest token** (random 32 bytes, stored as a SHA-256 hash, shown once, rotatable). The user pastes our URL and header into Health Auto Export, so it isn't a key the user gets from the app.
  - The Connections page shows copyable setup steps:
    - REST API automation, URL `<PUBLIC_BASE_URL>/ingest/health`
    - header `Authorization: Bearer <token>`
    - JSON, export version 2, *Summarize Data* on, grouped by **day**
    - date range *Since Last Sync*, *Batch Requests* on
    - metrics: steps, active energy, resting/basal energy, body mass, body fat %

Everything except Hevy degrades cleanly: missing pieces hide their widgets and show a "Connect X" empty state.

---

## Database (all in `public`; RLS `owner_all` policy using `(select auth.uid()) = user_id`)

| Table | Key columns / notes |
|---|---|
| `profiles` | user_id PK, display_name, height_cm, birth_date, sex, activity_level, timezone, units (`lb`\|`kg`), weight_source (`hevy`\|`apple_health`) |
| `exercise_templates` | **PK (user_id, hevy_id)**, title, type, primary_muscle_group, secondary_muscle_groups text[], is_custom. Per-user, so custom exercises are safe; this fixes a Phobos flaw. Trigram index on title. |
| `workouts` | PK (user_id, hevy_id), title, start_time, end_time, raw jsonb |
| `workout_sets` | id, user_id, workout_id FK cascade, exercise_template_id, exercise_title, exercise_index, set_index, set_type, weight_kg numeric, reps, rpe, duration_s, distance_m. Indexes on (user_id, workout_id) and (user_id, exercise_template_id). |
| `hevy_sync_state` | user_id PK, backfill_page, backfill_done, last_event_sync, templates_synced_at, last_error |
| `body_measurements` | PK (user_id, date, source), weight_kg, fat_percent. Where two sources report the same day, the one in `profiles.weight_source` wins. |
| `health_daily` | PK (user_id, date, metric), value numeric, unit. Metrics: `steps`, `active_kcal`, `basal_kcal`. Idempotent upsert. |
| `meals` | id, user_id, eaten_at timestamptz, **local_date** (set at insert from the user's timezone), title, source (`tg_text`\|`tg_photo`\|`dashboard`\|`repeat`), confidence, calories / protein_g / carbs_g / fat_g / fiber_g **numeric**, raw_text, parse jsonb. **No photos are stored.** |
| `meal_items` | id, meal_id FK cascade, user_id, name, brand, quantity, unit, grams, macro columns, match_source (`user`\|`saved_food`\|`usda`\|`off`\|`llm`), match_ref. Item-level rows make "what am I overeating on" answerable. |
| `saved_foods` | user's own foods ("HEB Premium Granola, 1 serving = 55 g, 240 kcal…"), created in the dashboard or from a label photo. Checked **before** any database lookup. Trigram index. |
| `nutrition_goals` | id, user_id, **effective_from** date, calories, protein_g, carbs_g, fat_g, preset, protein_g_per_lb, rationale. Keeping history means "did I hit my goal" is judged against the goal that applied that day. |
| `telegram_links`, `telegram_link_codes`, `bot_messages` (short rolling history, last ~20 turns / 48 h), `ai_calls` (tool, tokens, latency, error; for debugging) | |
| `user_secrets`, `integrations`, `health_ingest_tokens` | see above |

**Migrations** are timestamped (`supabase migration new`), so numbers can't collide the way they did in Phobos. After schema changes, run `supabase db reset` locally and generate types with `supabase gen types typescript --local > packages/shared/src/database.types.ts`.

---

## Frontend (port from Phobos, reduced scope)

**Copy and rename** (`@phobos/shared` → `@liftledger/shared`, wordmark → LIFTLEDGER):
- **Shell and theme:** `apps/web/src/index.css` (dark, amber accent tokens), `components/{AppShell,Sidebar,BottomTabs,Card,SegmentedControl,Skeleton,PageSkeleton,ErrorState,QueryErrorBoundary,RouteErrorBoundary,RequireAuth,chartTheme.ts,nav.ts}`, `lib/{auth.tsx,queries.ts,format.ts}`, `modules/{types.ts,index.ts}`.
- **Gym module → Training:**
  - `BodySilhouette.tsx` (inline SVG adapted from react-body-highlighter, MIT; keep the notice)
  - `MuscleHeatmap.tsx`, `MuscleDetails.tsx`, `WeeklyPanel.tsx`, `ExerciseProgress.tsx`, `PRFeed.tsx`, `BodyweightPanel.tsx`, `RecentWorkouts.tsx`, `OverviewCard.tsx`
  - `derive.ts` and `date.ts`, with their tests
- **Nutrition module:** `CalorieRing`, `MacroBar`, `TodayPanel`, `NutritionCharts`, `TargetsEditor`, `AddMealForm`, `MealList`, `OverviewCard`, `derive.ts`.
- **`routines/Heatmap.tsx`:** reuse as the goal-adherence calendar.
- **`packages/shared/src`:** `muscles.ts` (`HEVY_MUSCLE_GROUPS`, `MUSCLE_VOCABULARY`, `resolveMuscleQuery`), `metrics.ts` (`bmrMifflinStJeor`, `tdee`, `computeTargets`, `epley1RM`, `muscleLoadWeighted`, `detectPRs`, `weightTrend`, `progressionIndex`), `gym-analysis.ts`, `units.ts`, `fuzzy.ts`, `dates.ts`, and the useful parts of `domain.ts` (`logMealInputSchema`, `setTargetsInputSchema`, `profileUpdateSchema`). Bring all their tests along.

**Rewrite:**
- Every module's `queries.ts`, for the new tables.
- `lib/supabase.ts`.
- `SyncStatus.tsx`, which now calls `POST /api/hevy/sync` instead of the Phobos `jobs` table.
- `LoginPage` gains sign-up.

**Drop:** routines, brief, automations, exec-jobs, approvals, assistant, supplements, the micronutrient panel, and `AIStatusPanel`.

**Pages:**
1. **Overview:** today's calories/protein ring, this week's muscle heatmap thumbnail, steps today, latest weight trend, goal streak.
2. **Training:**
   - the heatmap (7/30/90 days, sets or volume, front or back)
   - clicking a muscle opens its details
   - weekly volume and streak, exercise progression, PRs, recent workouts
   - **Steps card** (7-day bars, from `health_daily`) and bodyweight
3. **Nutrition:**
   - today panel, meal list with edit, delete and "log again"
   - add meal, with food search and saved foods
   - 30-day calorie and protein charts, weekly average bars
   - adherence calendar
   - **energy balance** (intake vs. active + basal kcal, when Apple Health is connected)
   - top foods by calories over a date range
   - saved-foods manager
4. **Settings:**
   - Profile and body metrics; weight is read-only when synced
   - Goals: presets plus custom
   - Connections: Hevy (required), AI provider, Telegram, Apple Health
   - Account
5. **Onboarding wizard:** sign up → profile (height, weight, age, sex, activity, timezone) → Hevy key (required) → goal preset → optional connections. The first Hevy backfill starts in the background.

**Goal presets** (in `shared/metrics.ts`; they build on `computeTargets`, and TDEE comes from Mifflin–St Jeor × activity):

| Preset | Calories | Protein |
|---|---|---|
| Lose fat | TDEE − 20% | 1.0 g/lb bodyweight |
| Maintain | TDEE | 0.8 g/lb |
| Build muscle (lean bulk) | TDEE + 10% | **0.73 g/lb** (1.6 g/kg; the user can move it along 0.7–1.0) |
| Custom | any values | any values |

For every preset, fat is ≥ 0.3 g/lb and carbs fill the remaining calories. Every preset shows its rationale text and can be fine-tuned before saving.

---

## Telegram bot pipeline (`apps/server/src/bot/`)

```
update → linked user? → load user ctx (tz, goals, today totals)
       → router (one structured-output call): log_food | edit_food | question | other
         photos default to log_food; the router also returns is_food=false for non-food photos
       ├─ log_food / edit_food → Food pipeline
       └─ question             → Q&A agent (read-only tools)
```

**Food pipeline** (`bot/food/`):
1. **Parse** (structured output) → `items[{name, brand?, quantity, unit, grams_est, user_values{calories?,protein_g?,carbs_g?,fat_g?}, search_query}]`. Photos use vision to identify items and estimate portions. The photo is held **in memory only** and never written anywhere.
2. **Resolve each item, in order.** Stop at the first hit:
   1. **user-stated values** (they override the fields they cover)
   2. **`saved_foods`** (trigram match)
   3. the user's **recent meal_items** (recall: "my usual oatmeal")
   4. **USDA FoodData Central** `/fdc/v1/foods/search`: Foundation/SR Legacy for generic foods, Branded for brands. Free key; 1,000 requests/hour per IP.
   5. **Open Food Facts** search for branded or store items (e.g. HEB)
   6. **LLM estimate**, as a last resort, with confidence `low`
   - When there are several database candidates, one batched LLM call picks the best candidate per item and converts the unit (cups, servings, grams) using the food's serving size and household units.
3. **Validate.** Check calories against 4P + 4C + 9F (±15%) and apply plausibility bounds. Implausible input the user typed (e.g. "1 cup black beans … 200 g protein") is **kept as stated, with a warning** in the reply.
4. **Save** the `meals` row plus `meal_items`.
5. **Reply** with each item and its source, the meal total, and "today: 1,640 / 2,400 kcal · 112 / 180 g protein".
   - Inline buttons: **Undo**, **×2 servings**, **Edit**.
   - Edits ("actually it was 2 servings", "remove the rice") go through `edit_food` against the last meal.

**Q&A agent** (`bot/agent/`):
- An AI SDK tool loop, capped at about 6 steps.
- The system prompt is static so it can be cached. Today's local date and the user's timezone go in the user turn.
- Tools are read-only. `user_id` is injected on the server side and is never a tool argument.
- Each tool returns a **summary first, then capped arrays, with an explicit `truncated` flag**. This avoids the Phobos failure where results were silently cut off.

| Tool | Answers |
|---|---|
| `list_my_exercises(muscle?)` | the user's exercises with Hevy muscle tags and set counts |
| `get_muscle_progress(muscle_query, weeks)` | "how are my arms trending", "all bicep work": resolves through `resolveMuscleQuery`, then every set whose template has that muscle as primary or secondary (weighted 1.0 / 0.5), with weekly sets, volume and e1RM trend per exercise |
| `get_exercise_progress(exercise_query, weeks)` | "progress on incline DB press over 6 weeks": `fuzzyMatch` + trigram, ties broken by the user's history, e1RM/top set/PRs and a volume-vs-strength *driver* |
| `compare_periods(a, b, muscle?/exercise?)` | "this month vs last" |
| `get_recent_workouts(range)` | "what did I do Tuesday" |
| `get_body_weight(range)` | "what did Hevy log for my weight yesterday": includes source |
| `get_nutrition_summary(range)` | daily totals vs. the goal in effect each day, days hit, averages |
| `get_top_foods(range, only_over_goal_days?)` | "what am I overeating on": aggregates `meal_items` by name, contribution to surplus, time-of-day patterns |
| `get_meals(date)` / `get_health_metrics(metric, range)` | meal detail, steps, energy |
| `get_profile_and_goals()` | context for advice |

**Embeddings aren't needed for v1.**
- **Muscle questions:** every Hevy exercise template, custom ones included, already carries `primary_muscle_group` and `secondary_muscle_groups`. "Biceps" resolves through the alias vocabulary to a Hevy group, then to the sets. The user never has to name an exercise.
- **Exercise-name questions:** the user's distinct exercise list (usually under 200) is small enough for `list_my_exercises` to hand to the LLM, which then uses its own knowledge.
- **Later option:** add `pgvector` if food recall ("that chipotle bowl last week") or finer muscle heads (long vs. short head, upper vs. lower chest, via a curated `exercise_muscle_overrides` table) turn out to be needed.

**Without an AI provider:** the bot answers only `/today`, `/week` and `/link`, and suggests connecting a model. The dashboard stays fully usable: manual entry plus food search works with no AI at all.

---

## Syncs (`apps/server/src/integrations/`)

**Hevy** (base `https://api.hevyapp.com`, header `api-key`; copy Phobos's `.claude/skills/hevy-api/SKILL.md` with its bundled OpenAPI spec into `LiftLedger/.claude/skills/` as reference):
- **Backfill:** `/v1/workouts?page&pageSize=10`, resumable using `backfill_page`.
- **Incremental:** `/v1/workouts/events?since=`.
  - An `updated` event upserts the workout and replaces its sets.
  - A `deleted` event removes it.
  - An empty page may come back as `{workouts: []}` with no `events` key; normalize that.
- **Templates:** `/v1/exercise_templates?pageSize=100`. Refresh **daily and whenever a set references an unknown template id**, which fixes the Phobos bug where templates never refreshed.
- **Body measurements:** `/v1/body_measurements`. There's no events feed, so re-read page 1 on every sync and upsert.
- **Throttle:** at most one request per second per key, with 429 / 5xx exponential backoff.

**Health Auto Export:**
- `POST /ingest/health` with the bearer token → hash lookup → user.
- Body limit about 50 MB; parse `data.metrics[]` → `{name, units, data[{date, qty}]}` (date format `yyyy-MM-dd HH:mm:ss Z`) and convert to the user's local date.
- Map these metrics: `step_count` → steps, `active_energy` → active_kcal, `basal_energy_burned` → basal_kcal, `weight_body_mass` → body_measurements (source `apple_health`), `body_fat_percentage`. Normalize kJ to kcal and lb to kg.
- Ignore unknown metrics and dietary energy, to avoid double-counting food.
- Always return 200 with counts, so the app doesn't retry-storm.
- **Capture one real payload first** and save it as a test fixture; confirm the metric names against it before finalizing the mapping.

---

## Phases

0. **Scaffold.**
   - pnpm workspace, Biome, tsconfig base, `supabase init`/`start`.
   - Port `packages/shared` along with its tests.
   - Port the web shell and theme; the login page renders.
   - Copy the hevy-api skill.
1. **Accounts and connections.**
   - Migrations: profiles, integrations, user_secrets, RLS.
   - Server skeleton: Hono, JWT verification, `forUser`, crypto helper, and a pg-boss runner.
   - Sign-up, the onboarding wizard, Settings → Connections, and a Hevy key test.
2. **Training.**
   - Hevy client, sync jobs and tables.
   - Port the Training page on top of new `queries.ts`.
   - Sync-now button and status.
3. **Nutrition core.**
   - Tables for meals, items, saved foods and goals, plus goal presets.
   - Food search endpoint (USDA / Open Food Facts).
   - Nutrition page: manual add/edit, charts, adherence calendar, top foods.
4. **AI and Telegram logging.**
   - AI SDK provider abstraction and capability test.
   - Bot linking, router, and food pipeline with Undo / Edit / ×2.
   - Realtime updates on the dashboard.
5. **Q&A agent.** The tool set above, the result-shaping rules, and the `ai_calls` log.
6. **Apple Health.** Ingest tokens and endpoint, setup instructions in the UI, steps and energy-balance widgets, and the weight-source preference.
7. **Hardening.**
   - Golden-set evals: about 40 food messages with expected macro ranges, and about 25 questions with expected tool calls or answers, runnable against any configured provider.
   - Rate limiting on ingest and bot.
   - README and `.env.example`.

## Environment

- **server:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `LIFTLEDGER_ENCRYPTION_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `USDA_FDC_API_KEY`, `PUBLIC_BASE_URL`, `ALLOW_PRIVATE_AI_URLS`
- **web:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`

The dev test user's Hevy key comes from Phobos `.env.local` (`HEVY_API_KEY`), and is entered through the onboarding UI rather than kept in the server environment.

## Verification

- **Unit (Vitest):**
  - the ported shared tests (muscles, metrics, fuzzy, units, dates)
  - food pipeline resolution order, override rules and the macro sanity check, run on recorded USDA and Open Food Facts fixtures
  - the Health payload parser, on the captured fixture
  - Hevy event normalization
  - AES-GCM round-trip
- **Database:** `supabase db reset`, then an RLS test in which user A can't select, update or delete user B's rows in any table, and `authenticated` can't read `user_secrets`.
- **Integration:**
  - Onboard a test user with the real Hevy key; confirm backfill fills `workouts`/`workout_sets`/`exercise_templates` and that the heatmap renders. Check it in the Browser pane at the Vite dev URL.
  - Edit a workout in Hevy, then confirm the next incremental sync reflects the change.
- **Telegram:**
  1. Link through the deep link.
  2. Send "3 servings of heb premium granola", "1 cup black beans", and a meal photo; confirm meals and items are written with sources, the dashboard updates live, and Undo works.
  3. Ask "how have my biceps progressed over 6 weeks", "have I been hitting my calorie goal — what am I overeating on", and "what was my weight in Hevy yesterday"; check each answer against SQL.
- **Health:** `curl` the captured payload to `/ingest/health` with the token; steps appear on Training and the energy balance on Nutrition. Then run it from the iPhone through a tunnel.
- **Degradation:** a user with only Hevy connected sees no errors, just "Connect" empty states.
