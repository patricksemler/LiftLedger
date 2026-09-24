---
name: hevy-api
description: Reference for the Hevy workout tracker public API (api.hevyapp.com) — auth, endpoints, pagination limits, field names, and sync strategy. Use when integrating with Hevy, syncing workouts, fetching exercise history, routines, or body measurements.
metadata:
  author: project
  version: "1.0.0"
  source: https://api.hevyapp.com/docs/ (OpenAPI spec bundled in references/openapi-spec.json)
---

# Hevy API

Public REST API for Hevy (workout tracker). **Requires a Hevy Pro subscription.**

- Base URL: `https://api.hevyapp.com`
- Auth: `api-key: <uuid>` HTTP header on every request. The user generates the key at https://hevy.com/settings?developer
- All timestamps are ISO 8601. Weights are **kilograms** (`weight_kg`). API version is 0.0.1 — treat as unstable; store raw responses alongside normalized data.
- The full OpenAPI spec is in `references/openapi-spec.json` — consult it for exact schemas before writing client code.

## Critical gotchas

1. **Tiny page sizes.** `/v1/workouts`, `/v1/routines`, `/v1/routine_folders`: `pageSize` max is **10**. `/v1/exercise_templates`: max is **100**. Backfilling a large workout history means many sequential requests — throttle politely (e.g. ~1 req/sec) and persist progress so a backfill can resume.
2. **Incremental sync exists — use it.** `GET /v1/workouts/events?since=<ISO8601>&page=&pageSize=` returns `updated` events (full workout payload) and `deleted` events (`id`, `deleted_at`). Store a `last_synced_at` watermark and poll events instead of re-listing all workouts. Only backfill via `/v1/workouts` once.
3. **Exercise identity** is `exercise_template_id` (stable), not the display `title`. Fetch `/v1/exercise_templates` once and cache locally (id, title, type, primary_muscle_group, secondary_muscle_groups, equipment, is_custom) to resolve names and muscle groups.
4. **No webhooks.** Polling is the only sync mechanism.

## Endpoints

### Workouts
- `GET /v1/workouts?page=&pageSize=` — paginated list (`page`, `page_count`, `workouts[]`)
- `GET /v1/workouts/count` — `{ workout_count }`
- `GET /v1/workouts/events?since=&page=&pageSize=` — incremental change feed (see above)
- `GET /v1/workouts/{workoutId}` — single workout
- `POST /v1/workouts` / `PUT /v1/workouts/{workoutId}` — create/update (body: `{ workout: { title, description, start_time, end_time, is_private, exercises[] } }`)

Workout object: `id`, `title`, `description`, `start_time`, `end_time`, `created_at`, `updated_at`, `exercises[]`.
Exercise: `index`, `title`, `notes`, `exercise_template_id`, `supersets_id`, `sets[]`.
Set: `index`, `type` (`warmup` | `normal` | `failure` | `dropset`), `weight_kg`, `reps`, `distance_meters`, `duration_seconds`, `rpe`, `custom_metric`. Non-applicable fields are null (e.g. cardio has no `weight_kg`).

### Exercise history
- `GET /v1/exercise_history/{exerciseTemplateId}?start_date=&end_date=` — flat list of every set of that exercise across workouts: `workout_id`, `workout_title`, `workout_start_time`, `weight_kg`, `reps`, `rpe`, `set_type`, etc. Ideal for per-lift progression charts without local aggregation.

### Exercise templates
- `GET /v1/exercise_templates?page=&pageSize=` (max 100) — `id`, `title`, `type`, `primary_muscle_group`, `secondary_muscle_groups`, `is_custom`
- `GET /v1/exercise_templates/{id}` — single template
- `POST /v1/exercise_templates` — create custom exercise (`exercise_type` one of: weight_reps, reps_only, bodyweight_reps, bodyweight_assisted_reps, duration, weight_duration, distance_duration, short_distance_weight). 403 when custom-exercise limit is hit.

Muscle groups: abdominals, shoulders, biceps, triceps, forearms, quadriceps, hamstrings, calves, glutes, abductors, adductors, lats, upper_back, traps, lower_back, chest, cardio, neck, full_body, other.

### Routines (Hevy's workout plans — distinct from any app-level "routines" concept)
- `GET /v1/routines?page=&pageSize=` — `id`, `title`, `folder_id`, `notes`, `exercises[]` (routine sets have `rep_range: {start, end}` instead of `reps`)
- `GET/PUT /v1/routines/{routineId}`, `POST /v1/routines` (403 when routine limit exceeded)
- `GET /v1/routine_folders?page=&pageSize=`, `GET /v1/routine_folders/{id}`, `POST /v1/routine_folders`

### Body measurements
- `GET /v1/body_measurements?page=&pageSize=` (max 10)
- `GET /v1/body_measurements/{date}` (YYYY-MM-DD), `POST` (409 if date exists), `PUT /v1/body_measurements/{date}` (overwrites ALL fields — send the complete object)
- Fields: `date`, `weight_kg`, `lean_mass_kg`, `fat_percent`, plus circumference fields (`neck_cm`, `chest_cm`, `waist`, `hips`, `left_thigh`, ...)

### User
- `GET /v1/user/info` — `{ data: { id, name, url } }`. Good endpoint for validating an API key.

## Common derived metrics

- **Set volume**: `weight_kg × reps` per set; weekly volume = sum over sets in the week, optionally grouped by `primary_muscle_group` via the template cache.
- **Estimated 1RM (Epley)**: `weight_kg × (1 + reps / 30)` — compute per set, take max per workout per exercise for progression charts. Skip `warmup` sets.
- **PR detection**: compare each new set's weight×reps (or e1RM) against the historical max for that `exercise_template_id`.
