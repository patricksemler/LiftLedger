import type { ActivityLevel, Sex, Units, WeightSource } from "@liftledger/shared";
import { cmToFtIn, formatWeight, ftInToCm, lbToKg, localDateString } from "@liftledger/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useActionState, useId, useRef, useState } from "react";
import { Card } from "../../components/Card";
import { type LatestWeight, type ProfileRow, useUpdateProfile } from "../../lib/profile";
import { supabase } from "../../lib/supabase";

const ACTIVITY_LEVELS: { value: ActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary — little to no exercise" },
  { value: "light", label: "Light — exercise 1–3 days/week" },
  { value: "moderate", label: "Moderate — exercise 3–5 days/week" },
  { value: "active", label: "Active — exercise 6–7 days/week" },
  { value: "very_active", label: "Very active — hard exercise + physical job" },
];

interface FormFields {
  display_name: string;
  weight_lb: string;
  units: Units;
  weight_source: WeightSource;
  height_ft: string;
  height_in: string;
  birth_date: string;
  sex: Sex | "";
  activity_level: ActivityLevel | "";
  timezone: string;
}

type SubmitResult = { status: "idle" } | { status: "success" } | { status: "error" };

function fieldsFromProfile(profile: ProfileRow | null): FormFields {
  const heightFtIn = profile?.height_cm != null ? cmToFtIn(profile.height_cm) : null;
  return {
    display_name: profile?.display_name ?? "",
    weight_lb: "",
    units: (profile?.units as Units | undefined) ?? "lb",
    weight_source: (profile?.weight_source as WeightSource | undefined) ?? "hevy",
    height_ft: heightFtIn ? String(heightFtIn.feet) : "",
    height_in: heightFtIn ? String(heightFtIn.inches) : "",
    birth_date: profile?.birth_date ?? "",
    sex: (profile?.sex as Sex | null) ?? "",
    activity_level: (profile?.activity_level as ActivityLevel | null) ?? "",
    timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

const inputClass =
  "w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-accent";
const labelClass = "mb-1 block text-xs text-ink-dim";
/** Read-only counterpart to `inputClass` — same box metrics so the synced
 * weight lines up with the editable fields beside it, but visibly inert: it
 * keeps the card's own background instead of an input's fill, with dimmer
 * text and no focus ring. */
const readOnlyClass =
  "w-full rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm text-ink-dim";

/** Profile form. Height is entered in ft+in and stored in cm. Weight comes
 * from Hevy / Apple Health weigh-ins; until one exists the user can type a
 * weigh-in here, stored as a manual body measurement that synced ones
 * outrank. The caller keys this on `profile.updated_at` so a change from
 * elsewhere remounts it with fresh values. */
export function ProfileForm({
  profile,
  latestWeight,
  submitLabel = "Save profile",
  onSaved,
}: {
  profile: ProfileRow | null;
  latestWeight: LatestWeight | null;
  submitLabel?: string;
  onSaved?: () => void;
}) {
  const update = useUpdateProfile();
  const queryClient = useQueryClient();
  const syncedWeight = latestWeight && latestWeight.source !== "manual" ? latestWeight : null;
  const [fields, setFields] = useState<FormFields>(() => fieldsFromProfile(profile));
  const [fieldError, setFieldError] = useState<{ field: keyof FormFields; message: string } | null>(
    null,
  );
  const heightRef = useRef<HTMLInputElement>(null);
  const ids = {
    height: useId(),
    birth: useId(),
    name: useId(),
    weight: useId(),
    sex: useId(),
    activity: useId(),
    timezone: useId(),
  };

  function set<K extends keyof FormFields>(key: K, value: FormFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  const [result, formAction, isPending] = useActionState<SubmitResult>(
    async () => {
      setFieldError(null);

      const feetRaw = fields.height_ft.trim();
      const inchesRaw = fields.height_in.trim();
      let height: number | null = null;
      if (feetRaw !== "" || inchesRaw !== "") {
        const feet = feetRaw === "" ? 0 : Number(feetRaw);
        const inches = inchesRaw === "" ? 0 : Number(inchesRaw);
        if (!Number.isFinite(feet) || !Number.isFinite(inches) || feet < 0 || inches < 0) {
          setFieldError({ field: "height_ft", message: "Enter a valid height." });
          heightRef.current?.focus();
          return { status: "idle" };
        }
        if (inches >= 12) {
          setFieldError({ field: "height_in", message: "Inches must be 0–11." });
          heightRef.current?.focus();
          return { status: "idle" };
        }
        height = ftInToCm(feet, inches);
      }

      const weightLb = fields.weight_lb.trim() === "" ? null : Number(fields.weight_lb);
      if (weightLb != null && (!Number.isFinite(weightLb) || weightLb < 50 || weightLb > 700)) {
        setFieldError({ field: "weight_lb", message: "Enter your weight in pounds." });
        return { status: "idle" };
      }

      try {
        if (weightLb != null && profile) {
          const { error } = await supabase.from("body_measurements").upsert({
            user_id: profile.user_id,
            date: localDateString(new Date(), fields.timezone || profile.timezone),
            source: "manual",
            weight_kg: Math.round(lbToKg(weightLb) * 10) / 10,
          });
          if (error) throw error;
          void queryClient.invalidateQueries({ queryKey: ["profile", "latest_weight"] });
          void queryClient.invalidateQueries({ queryKey: ["training", "bodyweight"] });
        }
        await update.mutateAsync({
          display_name: fields.display_name.trim() || null,
          units: fields.units,
          weight_source: fields.weight_source,
          height_cm: height,
          birth_date: fields.birth_date.trim() === "" ? null : fields.birth_date,
          sex: fields.sex === "" ? null : fields.sex,
          activity_level: fields.activity_level === "" ? null : fields.activity_level,
          timezone: fields.timezone.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
        onSaved?.();
        return { status: "success" };
      } catch {
        return { status: "error" };
      }
    },
    { status: "idle" },
  );

  const heightError = fieldError?.field === "height_ft" || fieldError?.field === "height_in";

  return (
    <Card as="form" action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={ids.name}>
            Name
          </label>
          <input
            id={ids.name}
            autoComplete="given-name"
            value={fields.display_name}
            onChange={(e) => set("display_name", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor={ids.height}>
            Height
          </label>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-1">
              <input
                ref={heightRef}
                id={ids.height}
                name="height_ft"
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={0}
                step="1"
                placeholder="5"
                value={fields.height_ft}
                onChange={(e) => set("height_ft", e.target.value)}
                aria-invalid={heightError}
                aria-describedby={heightError ? `${ids.height}-error` : undefined}
                className={`${inputClass} tabular-nums`}
              />
              <span className="text-sm text-ink-faint">ft</span>
            </div>
            <div className="flex flex-1 items-center gap-1">
              <input
                name="height_in"
                type="number"
                inputMode="numeric"
                autoComplete="off"
                min={0}
                max={11}
                step="1"
                placeholder="11"
                value={fields.height_in}
                onChange={(e) => set("height_in", e.target.value)}
                aria-invalid={heightError}
                className={`${inputClass} tabular-nums`}
              />
              <span className="text-sm text-ink-faint">in</span>
            </div>
          </div>
          {heightError && (
            <p id={`${ids.height}-error`} role="alert" className="mt-1 text-xs text-negative">
              {fieldError?.message}
            </p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor={ids.weight}>
            Weight
          </label>
          {syncedWeight ? (
            <>
              <p className={`${readOnlyClass} tabular-nums`}>
                {formatWeight(syncedWeight.weight_kg, fields.units)}
              </p>
              <p className="mt-1 text-[11px] text-ink-faint">
                From {syncedWeight.source === "hevy" ? "Hevy" : "Apple Health"} on{" "}
                {syncedWeight.date} — log a new weigh-in there to update it.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                <input
                  id={ids.weight}
                  type="number"
                  inputMode="decimal"
                  min={50}
                  placeholder={
                    latestWeight ? String(Math.round(latestWeight.weight_kg * 2.20462)) : "180"
                  }
                  value={fields.weight_lb}
                  onChange={(e) => set("weight_lb", e.target.value)}
                  aria-invalid={fieldError?.field === "weight_lb"}
                  className={`${inputClass} tabular-nums`}
                />
                <span className="text-sm text-ink-faint">lb</span>
              </div>
              <p className="mt-1 text-[11px] text-ink-faint">
                {fieldError?.field === "weight_lb" ? (
                  <span className="text-negative">{fieldError.message}</span>
                ) : latestWeight ? (
                  `Last entered ${latestWeight.date}. Weigh-ins from Hevy or Apple Health replace this.`
                ) : (
                  "Weigh-ins from Hevy or Apple Health will replace this once they sync."
                )}
              </p>
            </>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor={ids.birth}>
            Birth date
          </label>
          <input
            id={ids.birth}
            name="birth_date"
            type="date"
            autoComplete="bday"
            value={fields.birth_date}
            onChange={(e) => set("birth_date", e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor={ids.sex}>
            Sex
          </label>
          <select
            id={ids.sex}
            name="sex"
            value={fields.sex}
            onChange={(e) => set("sex", e.target.value as Sex | "")}
            className={inputClass}
          >
            <option value="">Not set</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor={ids.activity}>
            Activity level
          </label>
          <select
            id={ids.activity}
            name="activity_level"
            value={fields.activity_level}
            onChange={(e) => set("activity_level", e.target.value as ActivityLevel | "")}
            className={inputClass}
          >
            <option value="">Not set</option>
            {ACTIVITY_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor={ids.timezone}>
            Timezone
          </label>
          <input
            id={ids.timezone}
            name="timezone"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. America/New_York"
            value={fields.timezone}
            onChange={(e) => set("timezone", e.target.value)}
            className={`${inputClass} font-mono`}
          />
          <p className="mt-1 text-[11px] text-ink-faint">
            IANA name — defines "today" for the dashboard and the bot.
          </p>
        </div>

        <div>
          <p className={labelClass}>Units</p>
          <select
            aria-label="Units"
            value={fields.units}
            onChange={(e) => set("units", e.target.value as Units)}
            className={inputClass}
          >
            <option value="lb">Pounds (lb)</option>
            <option value="kg">Kilograms (kg)</option>
          </select>
        </div>

        <div>
          <p className={labelClass}>Preferred weight source</p>
          <select
            aria-label="Preferred weight source"
            value={fields.weight_source}
            onChange={(e) => set("weight_source", e.target.value as WeightSource)}
            className={inputClass}
          >
            <option value="hevy">Hevy</option>
            <option value="apple_health">Apple Health</option>
          </select>
          <p className="mt-1 text-[11px] text-ink-faint">
            Used when both report a weigh-in on the same day.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {isPending ? "Saving…" : submitLabel}
        </button>
        <output aria-live="polite" className="text-xs text-ink-faint">
          {result.status === "success" && !isPending ? "Saved." : null}
          {result.status === "error" ? "Couldn't save — try again." : null}
        </output>
      </div>
    </Card>
  );
}
