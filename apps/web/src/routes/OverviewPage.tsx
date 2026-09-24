import { Card } from "../components/Card";
import { useProfileMaybe } from "../lib/profile";
import { webModules } from "../modules";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function OverviewPage() {
  const overviewCards = webModules.flatMap((m) => m.overviewCards ?? []);
  const profile = useProfileMaybe();
  const name = profile.data?.display_name;

  return (
    <div className="p-6">
      <h1 className="mb-6 text-lg font-medium text-ink">
        {greeting()}
        {name ? `, ${name}` : ""}
      </h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {overviewCards.map((OverviewCard, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: cards are a stable, registry-ordered list
          <OverviewCard key={i} />
        ))}
        {overviewCards.length === 0 && <Card>Nothing here yet.</Card>}
      </div>
    </div>
  );
}
