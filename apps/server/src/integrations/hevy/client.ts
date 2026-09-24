// Minimal Hevy public API client (https://api.hevyapp.com/docs). Requires a
// Hevy Pro account. Page sizes are tiny (10 for workouts/events/body
// measurements, 100 for templates), so callers page sequentially and we
// throttle to ~1 request/second per key with backoff on 429/5xx.

const BASE_URL = "https://api.hevyapp.com";
const MIN_INTERVAL_MS = 1000;
const MAX_RETRIES = 4;

export interface HevySet {
  index: number;
  type: string | null;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
}

export interface HevyExercise {
  index: number;
  title: string;
  exercise_template_id: string | null;
  sets: HevySet[];
}

export interface HevyWorkout {
  id: string;
  title: string | null;
  description: string | null;
  start_time: string;
  end_time: string | null;
  updated_at: string | null;
  created_at: string | null;
  exercises: HevyExercise[];
}

export interface HevyTemplate {
  id: string;
  title: string;
  type: string | null;
  primary_muscle_group: string | null;
  secondary_muscle_groups: string[] | null;
  equipment?: string | null;
  is_custom: boolean;
}

export interface HevyBodyMeasurement {
  date: string;
  weight_kg: number | null;
  fat_percent: number | null;
}

export type HevyEvent =
  | { type: "updated"; workout: HevyWorkout }
  | { type: "deleted"; id: string; deleted_at?: string };

export interface Page<T> {
  page: number;
  page_count: number;
  items: T[];
}

export class HevyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HevyClient {
  private lastRequestAt = 0;

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly minIntervalMs = MIN_INTERVAL_MS,
  ) {}

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

    for (let attempt = 0; ; attempt++) {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();

      const res = await this.fetchImpl(url, {
        headers: { "api-key": this.apiKey, accept: "application/json" },
      });
      if (res.ok) return (await res.json()) as T;
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000,
        );
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new HevyError(
          "Hevy rejected the API key (it needs an active Hevy Pro plan).",
          res.status,
        );
      }
      throw new HevyError(`Hevy ${path} failed with ${res.status}`, res.status);
    }
  }

  /** Hevy answers 404 for a page past the end instead of an empty page. */
  private async page<T>(
    path: string,
    key: string,
    page: number,
    pageSize: number,
    extra: Record<string, string> = {},
  ): Promise<Page<T>> {
    try {
      const body = await this.get<Record<string, unknown>>(path, { page, pageSize, ...extra });
      return {
        page: Number(body.page ?? page),
        page_count: Number(body.page_count ?? 0),
        // An empty events page comes back as `{ workouts: [] }` with no
        // `events` key — treat any missing list as empty.
        items: (body[key] as T[] | undefined) ?? [],
      };
    } catch (e) {
      if (e instanceof HevyError && e.status === 404)
        return { page, page_count: page - 1, items: [] };
      throw e;
    }
  }

  async workoutCount(): Promise<number> {
    const body = await this.get<{ workout_count: number }>("/v1/workouts/count");
    return body.workout_count;
  }

  workouts(page: number) {
    return this.page<HevyWorkout>("/v1/workouts", "workouts", page, 10);
  }

  events(since: string, page: number) {
    return this.page<HevyEvent>("/v1/workouts/events", "events", page, 10, { since });
  }

  templates(page: number) {
    return this.page<HevyTemplate>("/v1/exercise_templates", "exercise_templates", page, 100);
  }

  bodyMeasurements(page: number) {
    return this.page<HevyBodyMeasurement>("/v1/body_measurements", "body_measurements", page, 10);
  }
}
