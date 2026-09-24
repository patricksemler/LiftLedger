import { Suspense, useState } from "react";
import { Navigate, useNavigate } from "react-router";

import { PageSkeleton } from "../components/PageSkeleton";
import {
  useIntegration,
  useLatestWeight,
  useProfile,
  useToday,
  useUpdateProfile,
} from "../lib/profile";
import { GoalsEditor } from "../modules/nutrition/GoalsEditor";
import { goalOn } from "../modules/nutrition/derive";
import { useGoalsSuspense } from "../modules/nutrition/queries";
import {
  AiConnection,
  AppleHealthConnection,
  HevyConnection,
  TelegramConnection,
} from "./settings/Connections";
import { ProfileForm } from "./settings/ProfileForm";

const STEPS = ["About you", "Connect Hevy", "Your goal", "Extras"] as const;

function Steps({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap gap-4 text-xs">
      {STEPS.map((label, i) => (
        <li
          key={label}
          className={i === step ? "text-accent" : i < step ? "text-ink-dim" : "text-ink-faint"}
        >
          <span className="font-mono">{i + 1}.</span> {label}
        </li>
      ))}
    </ol>
  );
}

function OnboardingContent() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { data: latestWeight } = useLatestWeight();
  const { data: goals } = useGoalsSuspense();
  const hevy = useIntegration("hevy");
  const today = useToday();
  const updateProfile = useUpdateProfile();
  const [step, setStep] = useState(0);

  if (profile.onboarded_at && hevy) return <Navigate to="/" replace />;

  async function finish() {
    await updateProfile.mutateAsync({ onboarded_at: new Date().toISOString() });
    navigate("/", { replace: true });
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
        <span className="font-mono text-sm font-medium tracking-[0.2em] text-ink">LIFTLEDGER</span>
      </div>
      <Steps step={step} />

      {step === 0 && (
        <>
          <div>
            <h1 className="text-lg font-medium text-ink">
              Welcome{profile.display_name ? `, ${profile.display_name}` : ""}
            </h1>
            <p className="text-sm text-ink-dim">
              These power your calorie and protein presets. You can change them any time.
            </p>
          </div>
          <ProfileForm
            key={profile.updated_at}
            profile={profile}
            latestWeight={latestWeight}
            submitLabel="Continue"
            onSaved={() => setStep(1)}
          />
        </>
      )}

      {step === 1 && (
        <>
          <div>
            <h1 className="text-lg font-medium text-ink">Connect Hevy</h1>
            <p className="text-sm text-ink-dim">
              LiftLedger reads your workouts from Hevy — it's the one required connection.
            </p>
          </div>
          <HevyConnection />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="rounded-md border border-border bg-surface-2 px-4 py-2 text-sm text-ink"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!hevy}
              onClick={() => setStep(2)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div>
            <h1 className="text-lg font-medium text-ink">Pick a goal</h1>
            <p className="text-sm text-ink-dim">
              Presets are computed from your profile. Tweak anything before saving.
            </p>
          </div>
          <GoalsEditor
            profile={profile}
            weightKg={latestWeight?.weight_kg ?? null}
            current={goalOn(goals, today)}
            today={today}
            onSaved={() => setStep(3)}
          />
          <button
            type="button"
            onClick={() => setStep(3)}
            className="self-start text-xs text-ink-faint hover:text-ink"
          >
            Skip for now
          </button>
        </>
      )}

      {step === 3 && (
        <>
          <div>
            <h1 className="text-lg font-medium text-ink">Optional extras</h1>
            <p className="text-sm text-ink-dim">
              Log food from Telegram and pull in steps and energy from Apple Health. Everything
              works without these — set them up now or later in Settings.
            </p>
          </div>
          <AiConnection />
          <TelegramConnection />
          <AppleHealthConnection />
          <button
            type="button"
            onClick={() => void finish()}
            disabled={updateProfile.isPending}
            className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40"
          >
            Go to my dashboard
          </button>
        </>
      )}
    </div>
  );
}

export function OnboardingPage() {
  return (
    <div className="min-h-dvh bg-surface-0">
      <Suspense fallback={<PageSkeleton />}>
        <OnboardingContent />
      </Suspense>
    </div>
  );
}

/** Sends users who haven't finished onboarding (or lost their Hevy
 * connection) to the wizard. Hevy is the one hard requirement. */
export function RequireOnboarded({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OnboardedGate>{children}</OnboardedGate>
    </Suspense>
  );
}

function OnboardedGate({ children }: { children: React.ReactNode }) {
  const { data: profile } = useProfile();
  const hevy = useIntegration("hevy");
  if (!profile.onboarded_at || !hevy) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
