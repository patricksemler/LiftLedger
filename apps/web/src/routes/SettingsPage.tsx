import { type ReactNode, Suspense, useActionState, useEffect } from "react";
import { QueryErrorBoundary } from "../components/QueryErrorBoundary";
import { Skeleton } from "../components/Skeleton";
import { profileQueryKeys, useLatestWeight, useProfile, useToday } from "../lib/profile";
import { subscribeAndInvalidate } from "../lib/queries";
import { supabase } from "../lib/supabase";
import { GoalsEditor } from "../modules/nutrition/GoalsEditor";
import { goalOn } from "../modules/nutrition/derive";
import { useGoalsSuspense } from "../modules/nutrition/queries";
import { ConnectionsPanel } from "./settings/Connections";
import { ProfileForm } from "./settings/ProfileForm";

function Section({
  id,
  title,
  hint,
  children,
}: { id?: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id}>
      <h2 className="mb-1 text-sm font-medium text-ink">{title}</h2>
      {hint && <p className="mb-3 text-xs text-ink-faint">{hint}</p>}
      <QueryErrorBoundary message={`Couldn't load ${title.toLowerCase()}.`}>
        <Suspense fallback={<Skeleton bordered className="h-48 animate-pulse" />}>
          {children}
        </Suspense>
      </QueryErrorBoundary>
    </section>
  );
}

function ProfileSection() {
  const { data: profile } = useProfile();
  const { data: latestWeight } = useLatestWeight();
  useEffect(
    () =>
      subscribeAndInvalidate({
        table: "body_measurements",
        queryKey: profileQueryKeys.latestWeight,
      }),
    [],
  );
  return <ProfileForm key={profile.updated_at} profile={profile} latestWeight={latestWeight} />;
}

function GoalsSection() {
  const { data: profile } = useProfile();
  const { data: latestWeight } = useLatestWeight();
  const { data: goals } = useGoalsSuspense();
  const today = useToday();
  const current = goalOn(goals, today);
  return (
    <GoalsEditor
      key={current?.id ?? "none"}
      profile={profile}
      weightKg={latestWeight?.weight_kg ?? null}
      current={current}
      today={today}
    />
  );
}

function SignOutSection() {
  const [, signOutAction, isPending] = useActionState(async () => {
    await supabase.auth.signOut();
    return null;
  }, null);

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-ink">Account</h2>
      <form action={signOutAction}>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-ink transition-colors hover:bg-surface-3 disabled:opacity-40"
        >
          {isPending ? "Signing out…" : "Sign out"}
        </button>
      </form>
    </section>
  );
}

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-8 p-6">
      <h1 className="text-lg font-medium text-ink">Settings</h1>
      <Section
        title="Profile"
        hint="Used to compute goal presets and to decide what “today” means."
      >
        <ProfileSection />
      </Section>
      <Section
        title="Goals"
        hint="Daily calorie and macro targets. Changes apply from today onward."
      >
        <GoalsSection />
      </Section>
      <Section
        id="connections"
        title="Connections"
        hint="Keys are encrypted on the server and never shown again after you save them."
      >
        <ConnectionsPanel />
      </Section>
      <SignOutSection />
    </div>
  );
}
