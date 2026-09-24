import { Utensils } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Card } from "../../components/Card";
import { QueryErrorBoundary } from "../../components/QueryErrorBoundary";
import { SegmentedControl } from "../../components/SegmentedControl";
import { Skeleton } from "../../components/Skeleton";
import { useHealthRange } from "../../lib/health";
import { useLatestWeight, useProfile, useToday } from "../../lib/profile";
import { subscribeAndInvalidate } from "../../lib/queries";
import { AddMealForm } from "./AddMealForm";
import { AdherenceHeatmap, lastNDays } from "./AdherenceHeatmap";
import { EnergyBalance } from "./EnergyBalance";
import { GoalsEditor } from "./GoalsEditor";
import { MealList } from "./MealList";
import { NutritionCharts } from "./NutritionCharts";
import { SavedFoods } from "./SavedFoods";
import { TodayPanel } from "./TodayPanel";
import { TopFoods } from "./TopFoods";
import { dailyTotals, goalOn, sumMeals, topFoods } from "./derive";
import {
  nutritionQueryKeys,
  useGoalsSuspense,
  useMealsInRangeSuspense,
  useSavedFoods,
} from "./queries";

const HISTORY_DAYS = 84; // 12 weeks for the adherence calendar

function NutritionPageSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-8 p-6">
      <Skeleton className="h-6 w-28" />
      <Skeleton bordered className="h-32" />
      <Skeleton bordered className="h-56" />
      <Skeleton bordered className="h-40" />
    </div>
  );
}

function NutritionPageContent() {
  const today = useToday();
  const { data: profile } = useProfile();
  const { data: latestWeight } = useLatestWeight();
  const range = useMemo(() => lastNDays(today, HISTORY_DAYS), [today]);
  const mealsQuery = useMealsInRangeSuspense(range.from, range.to);
  const goalsQuery = useGoalsSuspense();
  const savedFoodsQuery = useSavedFoods();
  const healthQuery = useHealthRange(lastNDays(today, 14).from, today);
  const [topWindow, setTopWindow] = useState<7 | 30>(7);

  useEffect(() => {
    const subs = [
      subscribeAndInvalidate({ table: "meals", queryKey: nutritionQueryKeys.mealsPrefix }),
      subscribeAndInvalidate({ table: "meal_items", queryKey: nutritionQueryKeys.mealsPrefix }),
      subscribeAndInvalidate({ table: "nutrition_goals", queryKey: nutritionQueryKeys.goals }),
    ];
    return () => {
      for (const unsub of subs) unsub();
    };
  }, []);

  const meals = mealsQuery.data;
  const goals = goalsQuery.data;
  const currentGoal = goalOn(goals, today);
  const todayMeals = meals.filter((m) => m.local_date === today);
  const points = useMemo(
    () => dailyTotals(meals, goals, range.from, range.to),
    [meals, goals, range],
  );
  const top = useMemo(() => {
    const from = lastNDays(today, topWindow).from;
    return topFoods(meals.filter((m) => m.local_date >= from));
  }, [meals, today, topWindow]);
  const health = healthQuery.data ?? [];

  return (
    <div className="flex flex-col gap-8 p-6">
      <h1 className="text-lg font-medium text-ink">Nutrition</h1>

      <section>
        <h2 className="mb-3 text-sm font-medium text-ink">Today</h2>
        <Card>
          <TodayPanel totals={sumMeals(todayMeals)} goal={currentGoal} />
        </Card>
        {!currentGoal && (
          <p className="mt-2 text-xs text-ink-faint">
            No goal yet — pick a preset under{" "}
            <a href="#goals" className="text-accent">
              Goals
            </a>
            .
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink">Meals today</h2>
          <span className="font-mono text-xs tabular-nums text-ink-faint">
            {todayMeals.length} logged
          </span>
        </div>
        <div className="flex flex-col gap-4">
          <MealList
            meals={todayMeals}
            emptyText="Nothing logged today. Send the bot a photo or a description, or add food below."
          />
          <AddMealForm />
        </div>
      </section>

      {meals.length === 0 ? (
        <Card padding="none" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Utensils className="size-6 text-ink-faint" aria-hidden="true" />
          <p className="max-w-sm text-sm text-ink-dim">
            Trends, goal adherence and your top foods show up here once you've logged a few meals.
          </p>
        </Card>
      ) : (
        <>
          <section>
            <NutritionCharts
              points30={points.slice(-30)}
              calorieTarget={currentGoal?.calories ?? null}
              proteinTarget={currentGoal?.protein_g ?? null}
            />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-medium text-ink">Goal adherence · 12 weeks</h2>
            <AdherenceHeatmap points={points} />
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-ink">Top foods by calories</h2>
              <SegmentedControl
                options={[
                  { value: 7, label: "7d" },
                  { value: 30, label: "30d" },
                ]}
                value={topWindow}
                onChange={setTopWindow}
              />
            </div>
            <TopFoods foods={top} />
          </section>
        </>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium text-ink">Energy balance · 14 days</h2>
        {health.length > 0 ? (
          <EnergyBalance points={points} health={health} />
        ) : (
          <Card as="p" className="text-sm text-ink-faint">
            Connect Apple Health in{" "}
            <Link to="/settings#connections" className="text-accent">
              Settings
            </Link>{" "}
            to compare what you eat with what you burn.
          </Card>
        )}
      </section>

      <section id="goals">
        <h2 className="mb-3 text-sm font-medium text-ink">Goals</h2>
        <GoalsEditor
          key={currentGoal?.id ?? "none"}
          profile={profile}
          weightKg={latestWeight?.weight_kg ?? null}
          current={currentGoal}
          today={today}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-ink">Saved foods</h2>
        <SavedFoods foods={savedFoodsQuery.data} />
      </section>
    </div>
  );
}

export default function NutritionPage() {
  return (
    <QueryErrorBoundary message="Couldn't load your nutrition data.">
      <Suspense fallback={<NutritionPageSkeleton />}>
        <NutritionPageContent />
      </Suspense>
    </QueryErrorBoundary>
  );
}
