// Read-only tools the Q&A agent can call. All math happens here with the
// shared, tested helpers — the model only chooses tools and phrases results.
//
// Output rules (lessons from Phobos): summary first, arrays capped with an
// explicit `truncated` flag and total, weights already in the user's units.

import {
  type DatedExerciseSetWithWorkout,
  MUSCLE_SUGGESTIONS,
  addLocalDays,
  aggregateComparison,
  bestSetPerWorkout,
  compareExercises,
  detectPRs,
  epley1RM,
  exerciseKey,
  exerciseTrends,
  fuzzyMatch,
  kgToLb,
  localDateString,
  meanTrendPctChange,
  muscleLoad,
  muscleRoleFor,
  resolveMuscleQuery,
  setsTrainingMuscles,
  weightTrend,
  zonedDayStart,
} from "@liftledger/shared";
import { tool } from "ai";
import { z } from "zod";
import type { UserContext } from "../context";
import {
  type TemplateInfo,
  loadBodyweight,
  loadGoals,
  loadHealth,
  loadMeals,
  loadTemplates,
  loadTraining,
} from "./data";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

function cap<T>(items: T[], max: number) {
  return { items: items.slice(0, max), total: items.length, truncated: items.length > max };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildTools(ctx: UserContext) {
  const unit = ctx.units;
  const w = (kg: number | null | undefined) =>
    kg == null ? null : r1(unit === "lb" ? kgToLb(kg) : kg);
  const dayStartIso = (date: string) => zonedDayStart(date, ctx.timezone).toISOString();
  const localDate = (iso: string) => localDateString(new Date(iso), ctx.timezone);
  const windowStart = (weeks: number) => dayStartIso(addLocalDays(ctx.today, -(weeks * 7 - 1)));

  let templatesCache: Map<string, TemplateInfo> | null = null;
  const templates = async () => {
    templatesCache ??= await loadTemplates(ctx.userId);
    return templatesCache;
  };
  const primaryMap = (t: Map<string, TemplateInfo>) =>
    new Map([...t.values()].map((x) => [x.id, x.primary_muscle_group]));

  function resolveMuscle(query: string) {
    const selection = resolveMuscleQuery(query);
    if (!selection) {
      return {
        error: `"${query}" isn't a muscle group I know.`,
        try_one_of: MUSCLE_SUGGESTIONS.slice(0, 30),
      } as const;
    }
    return selection;
  }

  function sessionPoint(p: {
    workout_start_time: string;
    weight_kg: number;
    reps: number;
    e1rm: number;
  }) {
    return {
      date: localDate(p.workout_start_time),
      weight: w(p.weight_kg),
      reps: p.reps,
      e1rm: w(p.e1rm),
    };
  }

  /** Distinct exercises the user has logged, most-used first. */
  function exerciseIndex(sets: DatedExerciseSetWithWorkout[], t: Map<string, TemplateInfo>) {
    const byKey = new Map<
      string,
      {
        key: string;
        title: string;
        template_id: string | null;
        sets: number;
        sessions: Set<string>;
        last: string;
      }
    >();
    for (const s of sets) {
      if (s.set_type === "warmup") continue;
      const key = exerciseKey(s);
      const e = byKey.get(key) ?? {
        key,
        title: (s.exercise_template_id && t.get(s.exercise_template_id)?.title) || s.exercise_title,
        template_id: s.exercise_template_id,
        sets: 0,
        sessions: new Set<string>(),
        last: s.workout_start_time,
      };
      e.sets += 1;
      e.sessions.add(s.workout_id);
      if (s.workout_start_time > e.last) e.last = s.workout_start_time;
      byKey.set(key, e);
    }
    return [...byKey.values()].sort((a, b) => b.sets - a.sets);
  }

  return {
    list_my_exercises: tool({
      description:
        "The exercises this user has actually logged, with Hevy's muscle tags and how much they did. Use it to see which of THEIR exercises train a muscle, or to find the exact name of a lift before asking for its progress.",
      inputSchema: z.object({
        muscle: z
          .string()
          .nullable()
          .describe("Optional muscle or group to filter by, e.g. 'biceps', 'back', 'push'"),
        weeks: z
          .number()
          .int()
          .min(1)
          .max(260)
          .nullable()
          .describe("Lookback in weeks. Default 26."),
      }),
      execute: async ({ muscle, weeks }) => {
        const t = await templates();
        const { sets } = await loadTraining(ctx.userId, windowStart(weeks ?? 26));
        let selection: { label: string; groups: readonly string[] } | null = null;
        if (muscle) {
          const m = resolveMuscle(muscle);
          if ("error" in m) return m;
          selection = m;
        }
        const rows = exerciseIndex(sets, t)
          .map((e) => {
            const tpl = e.template_id ? t.get(e.template_id) : undefined;
            const role = selection ? muscleRoleFor(tpl, selection.groups) : null;
            return {
              exercise: e.title,
              primary_muscle: tpl?.primary_muscle_group ?? null,
              secondary_muscles: tpl?.secondary_muscle_groups ?? [],
              role,
              working_sets: e.sets,
              sessions: e.sessions.size,
              last_done: localDate(e.last),
            };
          })
          .filter((e) => !selection || e.role != null);
        return {
          summary: selection
            ? `${rows.length} exercises trained ${selection.label} in the last ${weeks ?? 26} weeks`
            : `${rows.length} distinct exercises in the last ${weeks ?? 26} weeks`,
          muscle_groups_covered: selection?.groups ?? null,
          exercises: cap(rows, 60),
        };
      },
    }),

    get_muscle_progress: tool({
      description:
        "How a muscle or muscle group is progressing: every set of every exercise that trains it (primary movers count fully, secondary movers at half), per-exercise strength trends, weekly volume, and a comparison with the previous window. Use for 'how are my biceps / arms / legs doing', 'all bicep exercises'. The user doesn't need to name exercises.",
      inputSchema: z.object({
        muscle: z
          .string()
          .describe(
            "Muscle or group in plain words: 'biceps', 'arms', 'upper back', 'push', 'posterior chain'",
          ),
        weeks: z.number().int().min(1).max(104).nullable().describe("Window in weeks. Default 6."),
      }),
      execute: async ({ muscle, weeks: weeksArg }) => {
        const weeks = weeksArg ?? 6;
        const m = resolveMuscle(muscle);
        if ("error" in m) return m;
        const t = await templates();
        const since = addLocalDays(ctx.today, -(weeks * 7 * 2 - 1));
        const { sets: all } = await loadTraining(ctx.userId, dayStartIso(since));
        const cut = windowStart(weeks);
        const current = setsTrainingMuscles(
          all.filter((s) => s.workout_start_time >= cut),
          t,
          m.groups,
        );
        const previous = setsTrainingMuscles(
          all.filter((s) => s.workout_start_time < cut),
          t,
          m.groups,
        );
        const loadNow = muscleLoad(current, t, m.groups);
        const loadBefore = muscleLoad(previous, t, m.groups);

        const { trends, single_session_exercises } = exerciseTrends(current, primaryMap(t));
        for (const tr of trends) {
          const tpl = tr.exercise_template_id ? t.get(tr.exercise_template_id) : undefined;
          tr.role = muscleRoleFor(tpl, m.groups) ?? undefined;
        }

        const weekly = new Map<string, { hard_sets: number; volume: number }>();
        for (const s of current) {
          if (s.set_type === "warmup") continue;
          const tpl = s.exercise_template_id ? t.get(s.exercise_template_id) : undefined;
          const credit = muscleRoleFor(tpl, m.groups) === "primary" ? 1 : 0.5;
          const d = localDate(s.workout_start_time);
          const dow = (new Date(`${d}T00:00:00`).getDay() + 6) % 7;
          const week = addLocalDays(d, -dow);
          const e = weekly.get(week) ?? { hard_sets: 0, volume: 0 };
          e.hard_sets += credit;
          e.volume += (s.weight_kg ?? 0) * (s.reps ?? 0) * credit;
          weekly.set(week, e);
        }

        return {
          summary: {
            muscle: m.label,
            hevy_groups: m.groups,
            window: `${addLocalDays(ctx.today, -(weeks * 7 - 1))} → ${ctx.today}`,
            mean_e1rm_change_pct: meanTrendPctChange(trends),
            hard_sets: loadNow.attributed_hard_sets,
            hard_sets_previous_window: loadBefore.attributed_hard_sets,
            volume: w(loadNow.attributed_volume_kg),
            volume_previous_window: w(loadBefore.attributed_volume_kg),
            sessions: loadNow.sessions,
            sessions_previous_window: loadBefore.sessions,
            units: unit,
            note: "Sets/volume credit secondary movers at 0.5.",
          },
          exercises: cap(
            trends.map((tr) => ({
              exercise: tr.exercise_title,
              role: tr.role ?? null,
              sessions: tr.sessions,
              hard_sets: tr.hard_sets,
              first: sessionPoint(tr.first_session),
              latest: sessionPoint(tr.last_session),
              best: sessionPoint(tr.best_session),
              e1rm_change_pct: tr.e1rm_pct_change,
              driver: tr.driver,
            })),
            25,
          ),
          done_only_once_in_window: single_session_exercises,
          weekly: [...weekly.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([week_of, v]) => ({ week_of, hard_sets: r1(v.hard_sets), volume: w(v.volume) })),
        };
      },
    }),

    get_exercise_progress: tool({
      description:
        "Progress on ONE exercise: best set per session, estimated 1RM trend, PRs, and whether gains came from load or volume. Fuzzy-matches the name against the exercises the user has logged; if several match, returns candidates — pick one and call again with its exact name.",
      inputSchema: z.object({
        exercise: z.string().describe("Exercise name, e.g. 'incline db press', 'squat'"),
        weeks: z.number().int().min(1).max(260).nullable().describe("Window in weeks. Default 6."),
      }),
      execute: async ({ exercise, weeks: weeksArg }) => {
        const weeks = weeksArg ?? 6;
        const t = await templates();
        const { sets: all } = await loadTraining(ctx.userId, null);
        const index = exerciseIndex(all, t);
        const match = fuzzyMatch(exercise, index, (e) => e.title, { tokenOverlap: true });
        if (match.kind === "not_found") {
          return {
            error: `No logged exercise matches "${exercise}".`,
            most_logged: index.slice(0, 25).map((e) => e.title),
          };
        }
        let chosen = match.kind === "found" ? match.candidate : null;
        if (match.kind === "ambiguous") {
          // Prefer the one clearly done most; otherwise let the model choose.
          const [a, b] = match.candidates.sort((x, y) => y.sets - x.sets);
          if (a && (!b || a.sets >= b.sets * 3)) chosen = a;
          else
            return {
              ambiguous: true,
              candidates: match.candidates.map((c) => ({
                exercise: c.title,
                working_sets: c.sets,
                last_done: localDate(c.last),
              })),
            };
        }
        if (!chosen) return { error: "No match" };
        const key = chosen.key;
        const mine = all.filter((s) => exerciseKey(s) === key);
        const cut = windowStart(weeks);
        const inWindow = mine.filter((s) => s.workout_start_time >= cut);
        const sessions = bestSetPerWorkout(inWindow).sort((a, b) =>
          a.workout_start_time.localeCompare(b.workout_start_time),
        );
        const prs = detectPRs(mine).filter((p) => p.workout_start_time >= cut);
        const allTimeBest = bestSetPerWorkout(mine).reduce<null | {
          e1rm: number;
          weight_kg: number;
          reps: number;
          workout_start_time: string;
        }>((best, s) => (!best || s.e1rm > best.e1rm ? s : best), null);
        const trend = exerciseTrends(inWindow, primaryMap(t)).trends[0] ?? null;
        const tpl = chosen.template_id ? t.get(chosen.template_id) : undefined;
        return {
          summary: {
            exercise: chosen.title,
            muscles: tpl
              ? { primary: tpl.primary_muscle_group, secondary: tpl.secondary_muscle_groups }
              : null,
            window: `${addLocalDays(ctx.today, -(weeks * 7 - 1))} → ${ctx.today}`,
            sessions_in_window: sessions.length,
            e1rm_change_pct: trend?.e1rm_pct_change ?? null,
            top_weight_change_pct: trend?.top_weight_pct_change ?? null,
            driver: trend?.driver ?? null,
            prs_in_window: prs.length,
            all_time_best: allTimeBest ? sessionPoint(allTimeBest) : null,
            units: unit,
          },
          sessions: cap(sessions.map(sessionPoint), 40),
          prs: cap(
            prs.map((p) => ({
              date: localDate(p.workout_start_time),
              weight: w(p.weight_kg),
              reps: p.reps,
              e1rm: w(p.e1rm),
              previous_best_e1rm: w(p.previous_best_e1rm),
            })),
            15,
          ),
        };
      },
    }),

    compare_periods: tool({
      description:
        "Compare the last N days of training with the N days before (e.g. this week vs last week, last 30 days vs the 30 before). Optionally scoped to a muscle or one exercise.",
      inputSchema: z.object({
        days: z.number().int().min(3).max(180).describe("Window length in days, e.g. 7, 30, 90"),
        muscle: z.string().nullable(),
        exercise: z.string().nullable(),
      }),
      execute: async ({ days, muscle, exercise }) => {
        const t = await templates();
        const start = dayStartIso(addLocalDays(ctx.today, -(days * 2 - 1)));
        const cut = dayStartIso(addLocalDays(ctx.today, -(days - 1)));
        let { sets } = await loadTraining(ctx.userId, start);
        let scope = "all training";
        if (muscle) {
          const m = resolveMuscle(muscle);
          if ("error" in m) return m;
          sets = setsTrainingMuscles(sets, t, m.groups);
          scope = m.label;
        } else if (exercise) {
          const index = exerciseIndex(sets, t);
          const match = fuzzyMatch(exercise, index, (e) => e.title, { tokenOverlap: true });
          if (match.kind !== "found") {
            return {
              error: `Couldn't pin down "${exercise}"`,
              candidates:
                match.kind === "ambiguous"
                  ? match.candidates.map((c) => c.title)
                  : index.slice(0, 20).map((c) => c.title),
            };
          }
          sets = sets.filter((s) => exerciseKey(s) === match.candidate.key);
          scope = match.candidate.title;
        }
        const previous = sets.filter((s) => s.workout_start_time < cut);
        const current = sets.filter((s) => s.workout_start_time >= cut);
        const comparisons = compareExercises(previous, current, primaryMap(t));
        const agg = aggregateComparison(previous, current, comparisons);
        return {
          summary: {
            scope,
            current: `${addLocalDays(ctx.today, -(days - 1))} → ${ctx.today}`,
            previous: `${addLocalDays(ctx.today, -(days * 2 - 1))} → ${addLocalDays(ctx.today, -days)}`,
            workouts: agg.workouts,
            hard_sets: agg.hard_sets,
            volume: {
              current: w(agg.volume_kg.current),
              previous: w(agg.volume_kg.previous),
              pct_change: agg.volume_kg.pct_change,
            },
            mean_e1rm_change_pct: agg.mean_e1rm_pct_change,
            exercises_improved: agg.exercises_improved,
            exercises_declined: agg.exercises_declined,
            new_exercises: agg.exercises_new,
            dropped_exercises: agg.exercises_dropped,
            units: unit,
          },
          exercises: cap(
            comparisons.map((c) => ({
              exercise: c.exercise_title,
              driver: c.driver,
              sessions: `${c.sessions.previous} → ${c.sessions.current}`,
              hard_sets: `${c.hard_sets.previous} → ${c.hard_sets.current}`,
              e1rm_change_pct: c.best_e1rm.pct_change,
              best_set_now: c.best_set_current
                ? { weight: w(c.best_set_current.weight_kg), reps: c.best_set_current.reps }
                : null,
              best_set_before: c.best_set_previous
                ? { weight: w(c.best_set_previous.weight_kg), reps: c.best_set_previous.reps }
                : null,
            })),
            20,
          ),
        };
      },
    }),

    get_recent_workouts: tool({
      description:
        "Workouts in a date range (default: last 7 days), each with exercises, working sets and best set.",
      inputSchema: z.object({ from: dateStr.nullable(), to: dateStr.nullable() }),
      execute: async ({ from, to }) => {
        const fromD = from ?? addLocalDays(ctx.today, -6);
        const toD = to ?? ctx.today;
        const t = await templates();
        const { workouts, sets } = await loadTraining(
          ctx.userId,
          dayStartIso(fromD),
          dayStartIso(addLocalDays(toD, 1)),
        );
        const rows = workouts.map((wk) => {
          const mine = sets.filter((s) => s.workout_id === wk.id);
          const byEx = new Map<string, DatedExerciseSetWithWorkout[]>();
          for (const s of mine) byEx.set(exerciseKey(s), [...(byEx.get(exerciseKey(s)) ?? []), s]);
          return {
            date: localDate(wk.start_time),
            title: wk.title,
            minutes: wk.end_time
              ? Math.round((Date.parse(wk.end_time) - Date.parse(wk.start_time)) / 60000)
              : null,
            exercises: [...byEx.values()].map((ss) => {
              const working = ss.filter((s) => s.set_type !== "warmup");
              const best = working.reduce<DatedExerciseSetWithWorkout | null>((b, s) => {
                const e = s.weight_kg && s.reps ? epley1RM(s.weight_kg, s.reps) : 0;
                const be = b?.weight_kg && b.reps ? epley1RM(b.weight_kg, b.reps) : -1;
                return e > be ? s : b;
              }, null);
              const first = ss[0] as DatedExerciseSetWithWorkout;
              return {
                exercise:
                  (first.exercise_template_id && t.get(first.exercise_template_id)?.title) ||
                  first.exercise_title,
                working_sets: working.length,
                best_set: best ? { weight: w(best.weight_kg), reps: best.reps } : null,
              };
            }),
          };
        });
        return {
          summary: `${rows.length} workouts from ${fromD} to ${toD}`,
          units: unit,
          workouts: cap(rows, 14),
        };
      },
    }),

    get_body_weight: tool({
      description:
        "Weigh-ins with their source (hevy, apple_health or manual) plus the smoothed trend. Use for 'what did I weigh yesterday', 'what did Hevy log', 'am I losing weight'.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(730).nullable().describe("Lookback, default 30"),
      }),
      execute: async ({ days }) => {
        const from = addLocalDays(ctx.today, -((days ?? 30) - 1));
        const rows = await loadBodyweight(ctx.userId, from);
        const byDate = new Map<string, number>();
        for (const r of rows)
          if (r.weight_kg != null && !byDate.has(r.date)) byDate.set(r.date, r.weight_kg);
        const trend = weightTrend(
          [...byDate.entries()].map(([date, weight_kg]) => ({ date, weight_kg })),
          null,
        );
        return {
          summary: trend
            ? {
                latest: w(trend.latest_kg),
                seven_day_average: w(trend.rolling_avg_kg),
                rate_per_week: w(trend.rate_kg_per_week),
                weigh_ins: trend.entry_count,
                units: unit,
              }
            : { note: "No weigh-ins in this window." },
          entries: cap(
            [...rows].reverse().map((r) => ({
              date: r.date,
              source: r.source,
              weight: w(r.weight_kg),
              body_fat_pct: r.fat_percent,
            })),
            40,
          ),
        };
      },
    }),

    get_nutrition_summary: tool({
      description:
        "Daily calories/protein/carbs/fat vs the goal that applied each day, over a date range (default last 7 days). Includes days on target (±10% calories), over, under, and unlogged days.",
      inputSchema: z.object({ from: dateStr.nullable(), to: dateStr.nullable() }),
      execute: async ({ from, to }) => {
        const fromD = from ?? addLocalDays(ctx.today, -6);
        const toD = to ?? ctx.today;
        const [meals, goals] = await Promise.all([
          loadMeals(ctx.userId, fromD, toD),
          loadGoals(ctx.userId),
        ]);
        const days: {
          date: string;
          calories: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
          meals: number;
          goal_calories: number | null;
          goal_protein_g: number | null;
          verdict: string;
        }[] = [];
        for (let d = fromD; d <= toD; d = addLocalDays(d, 1)) {
          const ms = meals.filter((m) => m.local_date === d);
          const goal = goals.find((g) => g.effective_from <= d) ?? null;
          const tot = ms.reduce(
            (a, m) => ({
              c: a.c + m.calories,
              p: a.p + m.protein_g,
              cb: a.cb + m.carbs_g,
              f: a.f + m.fat_g,
            }),
            { c: 0, p: 0, cb: 0, f: 0 },
          );
          let verdict = "not logged";
          if (ms.length > 0 && goal) {
            const ratio = tot.c / goal.calories;
            verdict = ratio > 1.1 ? "over" : ratio < 0.9 ? "under" : "on target";
          } else if (ms.length > 0) verdict = "no goal";
          days.push({
            date: d,
            calories: Math.round(tot.c),
            protein_g: Math.round(tot.p),
            carbs_g: Math.round(tot.cb),
            fat_g: Math.round(tot.f),
            meals: ms.length,
            goal_calories: goal?.calories ?? null,
            goal_protein_g: goal?.protein_g ?? null,
            verdict,
          });
        }
        const logged = days.filter((d) => d.meals > 0);
        const avg = (k: "calories" | "protein_g") =>
          logged.length ? Math.round(logged.reduce((a, d) => a + d[k], 0) / logged.length) : null;
        return {
          summary: {
            range: `${fromD} → ${toD}`,
            logged_days: logged.length,
            total_days: days.length,
            on_target: logged.filter((d) => d.verdict === "on target").length,
            over: logged.filter((d) => d.verdict === "over").length,
            under: logged.filter((d) => d.verdict === "under").length,
            protein_goal_hit_days: logged.filter(
              (d) => d.goal_protein_g && d.protein_g >= d.goal_protein_g * 0.95,
            ).length,
            avg_calories_logged_days: avg("calories"),
            avg_protein_logged_days: avg("protein_g"),
            current_goal: goals[0] ?? null,
          },
          days: cap(days, 62),
        };
      },
    }),

    get_top_foods: tool({
      description:
        "Which foods contribute the most calories over a range, how often they're eaten, what they add on days over the goal, and when in the day calories land. Use for 'what am I overeating on', 'what's stopping me hitting my goal'.",
      inputSchema: z.object({
        from: dateStr.nullable(),
        to: dateStr.nullable(),
        only_over_goal_days: z.boolean().nullable(),
      }),
      execute: async ({ from, to, only_over_goal_days }) => {
        const fromD = from ?? addLocalDays(ctx.today, -13);
        const toD = to ?? ctx.today;
        const [meals, goals] = await Promise.all([
          loadMeals(ctx.userId, fromD, toD),
          loadGoals(ctx.userId),
        ]);
        const dayTotals = new Map<string, number>();
        for (const m of meals)
          dayTotals.set(m.local_date, (dayTotals.get(m.local_date) ?? 0) + m.calories);
        const overDays = new Set(
          [...dayTotals.entries()]
            .filter(([d, c]) => {
              const g = goals.find((x) => x.effective_from <= d);
              return g ? c > g.calories * 1.1 : false;
            })
            .map(([d]) => d),
        );
        const scope = only_over_goal_days ? meals.filter((m) => overDays.has(m.local_date)) : meals;
        const foods = new Map<
          string,
          { food: string; times: number; calories: number; protein_g: number; days: Set<string> }
        >();
        const slots = {
          "morning (5-11)": 0,
          "midday (11-15)": 0,
          "afternoon (15-18)": 0,
          "evening (18-21)": 0,
          "late night (21-5)": 0,
        };
        let total = 0;
        for (const m of scope) {
          const hour = Number(
            new Intl.DateTimeFormat("en-US", {
              hour: "numeric",
              hourCycle: "h23",
              timeZone: ctx.timezone,
            }).format(new Date(m.eaten_at)),
          );
          const slot =
            hour >= 5 && hour < 11
              ? "morning (5-11)"
              : hour < 15 && hour >= 11
                ? "midday (11-15)"
                : hour < 18 && hour >= 15
                  ? "afternoon (15-18)"
                  : hour < 21 && hour >= 18
                    ? "evening (18-21)"
                    : "late night (21-5)";
          slots[slot] += m.calories;
          for (const i of m.meal_items) {
            const k = i.name.trim().toLowerCase();
            const e = foods.get(k) ?? {
              food: i.name.trim(),
              times: 0,
              calories: 0,
              protein_g: 0,
              days: new Set<string>(),
            };
            e.times += 1;
            e.calories += i.calories;
            e.protein_g += i.protein_g;
            e.days.add(m.local_date);
            foods.set(k, e);
            total += i.calories;
          }
        }
        const ranked = [...foods.values()].sort((a, b) => b.calories - a.calories);
        return {
          summary: {
            range: `${fromD} → ${toD}`,
            scope: only_over_goal_days
              ? `only the ${overDays.size} days over goal`
              : "all logged days",
            days_over_goal: overDays.size,
            logged_days: dayTotals.size,
            total_calories: Math.round(total),
            calories_by_time_of_day: Object.fromEntries(
              Object.entries(slots).map(([k, v]) => [k, Math.round(v)]),
            ),
          },
          foods: cap(
            ranked.map((f) => ({
              food: f.food,
              times: f.times,
              calories: Math.round(f.calories),
              share_pct: total > 0 ? r1((f.calories / total) * 100) : 0,
              kcal_per_protein_g: f.protein_g > 0 ? r1(f.calories / f.protein_g) : null,
              on_days: f.days.size,
            })),
            20,
          ),
        };
      },
    }),

    get_meals: tool({
      description: "Every meal and item logged on one date (default today).",
      inputSchema: z.object({ date: dateStr.nullable() }),
      execute: async ({ date }) => {
        const d = date ?? ctx.today;
        const meals = await loadMeals(ctx.userId, d, d);
        return {
          summary: `${meals.length} meals on ${d}: ${Math.round(meals.reduce((a, m) => a + m.calories, 0))} kcal, ${Math.round(meals.reduce((a, m) => a + m.protein_g, 0))} g protein`,
          meals: cap(
            meals.map((m) => ({
              time: new Intl.DateTimeFormat("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZone: ctx.timezone,
              }).format(new Date(m.eaten_at)),
              title: m.title,
              calories: Math.round(m.calories),
              protein_g: Math.round(m.protein_g),
              carbs_g: Math.round(m.carbs_g),
              fat_g: Math.round(m.fat_g),
              items: m.meal_items.map((i) =>
                `${i.quantity ?? ""} ${i.unit ?? ""} ${i.name} (${Math.round(i.calories)} kcal)`.trim(),
              ),
            })),
            20,
          ),
        };
      },
    }),

    get_health_metrics: tool({
      description:
        "Apple Health daily steps, active energy and resting energy (kcal) over a range (default last 7 days), plus averages. Empty if Apple Health isn't connected.",
      inputSchema: z.object({ from: dateStr.nullable(), to: dateStr.nullable() }),
      execute: async ({ from, to }) => {
        const fromD = from ?? addLocalDays(ctx.today, -6);
        const toD = to ?? ctx.today;
        const rows = await loadHealth(ctx.userId, fromD, toD);
        if (rows.length === 0)
          return { summary: "No Apple Health data in this range (it may not be connected)." };
        const byDate = new Map<string, Record<string, number>>();
        for (const r of rows)
          byDate.set(r.date, { ...(byDate.get(r.date) ?? {}), [r.metric]: r.value });
        const avg = (k: string) => {
          const xs = [...byDate.values()].map((v) => v[k]).filter((x): x is number => x != null);
          return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
        };
        return {
          summary: {
            range: `${fromD} → ${toD}`,
            avg_steps: avg("steps"),
            avg_active_kcal: avg("active_kcal"),
            avg_resting_kcal: avg("basal_kcal"),
          },
          days: cap(
            [...byDate.entries()].map(([date, v]) => ({ date, ...v })),
            62,
          ),
        };
      },
    }),

    get_profile_and_goals: tool({
      description:
        "The user's current goal (and recent goal history). Use for advice or when a question depends on their targets.",
      inputSchema: z.object({}),
      execute: async () => {
        const goals = await loadGoals(ctx.userId);
        return {
          current_goal: goals[0] ?? null,
          goal_history: goals.slice(0, 5),
          units: unit,
          today: ctx.today,
        };
      },
    }),
  };
}
