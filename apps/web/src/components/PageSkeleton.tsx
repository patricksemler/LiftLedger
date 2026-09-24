import { Skeleton } from "./Skeleton";

/** Loading fallback for lazily-loaded module pages — matches the general
 * page layout (header bar + card grid) rather than a spinner, per PLAN.md
 * "Loading = skeletons matching final layout." */
export function PageSkeleton() {
  return (
    <div className="animate-pulse p-6">
      <Skeleton className="mb-6 h-6 w-40" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} bordered className="h-32" />
        ))}
      </div>
    </div>
  );
}
