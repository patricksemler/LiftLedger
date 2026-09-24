import { Card } from "../../components/Card";
import { InlineErrorState } from "../../components/ErrorState";
import { useToday } from "../../lib/profile";
import { TodayPanel } from "./TodayPanel";
import { goalOn, sumMeals } from "./derive";
import { useGoals, useMealsInRange } from "./queries";

/** Today's calorie ring + macro bars on the Overview grid. */
export function NutritionOverviewCard() {
  const today = useToday();
  const mealsQuery = useMealsInRange(today, today);
  const goalsQuery = useGoals();
  const loading = mealsQuery.isLoading || goalsQuery.isLoading;
  const isError = mealsQuery.isError || goalsQuery.isError;
  const goal = goalOn(goalsQuery.data ?? [], today);

  return (
    <Card>
      <h2 className="mb-3 text-sm font-medium text-ink">Today's nutrition</h2>
      {loading ? (
        <div className="flex items-center gap-4">
          <div className="size-24 shrink-0 animate-pulse rounded-full bg-surface-2" />
          <div className="flex flex-1 flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 rounded bg-surface-2" />
            ))}
          </div>
        </div>
      ) : isError ? (
        <InlineErrorState
          onRetry={() => {
            void mealsQuery.refetch();
            void goalsQuery.refetch();
          }}
        />
      ) : (
        <TodayPanel totals={sumMeals(mealsQuery.data ?? [])} goal={goal} />
      )}
    </Card>
  );
}
