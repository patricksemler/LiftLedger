import { Dumbbell, HeartPulse, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { Link, Navigate } from "react-router";
import { Card } from "../components/Card";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { useAuth } from "../lib/auth";
import { MacroBar } from "../modules/nutrition/MacroBar";
import { BodySilhouette } from "../modules/training/BodySilhouette";

// Illustrative 30-day set counts for the demo figure — a plausible
// push/pull/legs split, not anyone's real data.
const DEMO_SETS: Record<string, number> = {
  quadriceps: 16,
  chest: 14,
  lats: 13,
  shoulders: 12,
  glutes: 12,
  upper_back: 11,
  triceps: 10,
  hamstrings: 10,
  biceps: 9,
  abdominals: 7,
  calves: 6,
  traps: 5,
  lower_back: 5,
  forearms: 4,
  adductors: 4,
  abductors: 3,
  neck: 0,
};
const DEMO_MAX = Math.max(...Object.values(DEMO_SETS));

// Same accent `color-mix` ramp as the real heatmap (MuscleHeatmap.getFill).
function demoFill(muscle: string): string {
  const v = DEMO_SETS[muscle] ?? 0;
  if (v <= 0) return "var(--color-surface-2)";
  const pct = Math.round(15 + (v / DEMO_MAX) * 80);
  return `color-mix(in srgb, var(--color-accent) ${pct}%, var(--color-surface-2))`;
}

function muscleLabel(muscle: string): string {
  const s = muscle.replace("_", " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ctaPrimary =
  "inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90";
const ctaSecondary =
  "inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm text-ink-dim transition-colors hover:border-border-strong hover:text-ink";

/** Public landing page for logged-out visitors. Signed-in users skip straight
 * to the dashboard. The body model is the real `BodySilhouette` fed sample
 * data, so what's shown here is exactly what the Training page renders. */
export function LandingPage() {
  const { session, loading } = useAuth();
  const [active, setActive] = useState<string | null>("chest");

  const toggle = useCallback(
    (muscle: string) => setActive((prev) => (prev === muscle ? null : muscle)),
    [],
  );

  if (!loading && session) return <Navigate to="/" replace />;

  return (
    <div className="min-h-dvh bg-surface-0">
      <SiteHeader />

      <main>
        <section className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)] items-center gap-10 px-4 pt-8 pb-16 md:px-8 md:pt-16 md:pb-24 lg:grid-cols-[1fr_auto] lg:gap-12">
          <div className="max-w-xl">
            <p className="mb-4 font-mono text-xs tracking-[0.15em] text-accent uppercase">
              Training · Nutrition · Health
            </p>
            <h1 className="mb-5 text-4xl font-semibold tracking-tight text-balance text-ink md:text-5xl">
              Every set and every meal, in one ledger.
            </h1>
            <p className="mb-8 text-base leading-relaxed text-pretty text-ink-dim">
              LiftLedger turns your Hevy workouts into a muscle heatmap, logs meals from a quick
              Telegram message or photo, and pulls in Apple Health, so what you train and what you
              eat finally sit side by side.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/login?mode=signup" className={ctaPrimary}>
                Create an account
              </Link>
              <Link to="/login" className={ctaSecondary}>
                Sign in
              </Link>
            </div>
            <p className="mt-6 text-xs text-ink-faint">
              Only Hevy is required. Telegram, Apple Health and your own AI key are optional.
            </p>
          </div>

          <BodyDemo active={active} onToggle={toggle} />
        </section>

        <section className="border-t border-border">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-16 md:grid-cols-3 md:px-8 md:py-20">
            <Feature
              icon={Dumbbell}
              title="Training"
              body="Workouts sync from Hevy automatically. See volume by muscle, streaks, progression and PRs."
            >
              <PrRows />
            </Feature>
            <Feature
              icon={Utensils}
              title="Nutrition"
              body="Text or photograph a meal to the Telegram bot. It's matched against food databases and logged."
            >
              <ChatSnippet />
            </Feature>
            <Feature
              icon={HeartPulse}
              title="Health"
              body="Steps, energy and weigh-ins from Apple Health, alongside everything else."
            >
              <StepsBars />
            </Feature>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function BodyDemo({
  active,
  onToggle,
}: {
  active: string | null;
  onToggle: (muscle: string) => void;
}) {
  const sets = active ? (DEMO_SETS[active] ?? 0) : 0;

  return (
    // Two figures side by side need ~146px each at 250px tall, which with p-4
    // just fits a 375px phone; larger screens get the roomier size.
    <Card padding="none" className="mx-auto w-full max-w-md p-4 sm:p-6 lg:w-[440px]">
      <div className="mb-4 flex items-baseline justify-between">
        <span className="text-xs text-ink-dim">Muscle heatmap</span>
        <span className="font-mono text-xs text-ink-faint">last 30d · sets</span>
      </div>

      <div className="flex h-[250px] justify-center gap-2 sm:h-[340px]">
        <BodySilhouette
          view="front"
          getFill={demoFill}
          activeMuscle={active}
          onMuscleClick={onToggle}
          className="h-full w-auto"
        />
        <BodySilhouette
          view="back"
          getFill={demoFill}
          activeMuscle={active}
          onMuscleClick={onToggle}
          className="h-full w-auto"
        />
      </div>

      <div className="mt-5 flex h-10 items-center justify-between gap-4 border-t border-border pt-4">
        {active ? (
          <>
            <span className="text-sm text-ink">{muscleLabel(active)}</span>
            <span className="font-mono text-sm tabular-nums text-accent">
              {sets} {sets === 1 ? "set" : "sets"}
            </span>
          </>
        ) : (
          <span className="text-sm text-ink-faint">Tap a muscle to see its sets.</span>
        )}
      </div>
    </Card>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <Card padding="lg" className="flex flex-col">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-accent" aria-hidden="true" />
        <h2 className="text-sm font-medium text-ink">{title}</h2>
      </div>
      <p className="mb-6 text-sm leading-relaxed text-ink-dim">{body}</p>
      <div className="mt-auto" aria-hidden="true">
        {children}
      </div>
    </Card>
  );
}

const PRS = [
  { name: "Bench press", value: "100 kg × 5", pr: true },
  { name: "Back squat", value: "140 kg × 3", pr: false },
  { name: "Weighted pull-up", value: "+20 kg × 8", pr: true },
];

function PrRows() {
  return (
    <ul className="divide-y divide-border rounded-md border border-border bg-surface-0">
      {PRS.map((row) => (
        <li key={row.name} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="truncate text-xs text-ink-dim">{row.name}</span>
          <span className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums text-ink">
            {row.value}
            {row.pr && (
              <span className="rounded-sm bg-accent-dim px-1 text-[10px] text-accent-strong">
                PR
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ChatSnippet() {
  return (
    <div className="flex flex-col gap-2">
      <div className="self-end rounded-md rounded-br-sm bg-surface-3 px-3 py-1.5 text-xs text-ink">
        chicken burrito bowl, no rice
      </div>
      <div className="self-start rounded-md rounded-bl-sm border border-border bg-surface-0 px-3 py-1.5 font-mono text-xs text-ink-dim">
        Logged · 640 kcal · 52 g protein
      </div>
      <div className="mt-2">
        <MacroBar label="Protein today" consumed={132} target={160} />
      </div>
    </div>
  );
}

const STEPS = [6200, 8400, 7100, 10300, 5600, 9200, 11800];

function StepsBars() {
  const max = Math.max(...STEPS);
  return (
    <div>
      <div className="flex h-20 items-end gap-1.5">
        {STEPS.map((s, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static, never reordered
            key={i}
            className={`flex-1 rounded-sm ${i === STEPS.length - 1 ? "bg-accent" : "bg-surface-3"}`}
            style={{ height: `${(s / max) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <span className="text-xs text-ink-faint">Steps, last 7 days</span>
        <span className="font-mono text-xs tabular-nums text-ink">11,800</span>
      </div>
    </div>
  );
}
