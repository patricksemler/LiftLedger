import { describe, expect, it, vi } from "vitest";
import { HevyClient, type HevyWorkout } from "./client";
import { setRows, unknownTemplateIds, workoutRow } from "./normalize";

const workout: HevyWorkout = {
  id: "w1",
  title: "Push",
  description: null,
  start_time: "2026-09-20T15:00:00Z",
  end_time: "2026-09-20T16:00:00Z",
  updated_at: "2026-09-20T16:05:00Z",
  created_at: "2026-09-20T16:05:00Z",
  exercises: [
    {
      index: 0,
      title: "Bench Press (Barbell)",
      exercise_template_id: "79D0BB3A",
      sets: [
        {
          index: 0,
          type: "warmup",
          weight_kg: 60,
          reps: 10,
          distance_meters: null,
          duration_seconds: null,
          rpe: null,
        },
        {
          index: 1,
          type: "normal",
          weight_kg: 100,
          reps: 5,
          distance_meters: null,
          duration_seconds: null,
          rpe: 8,
        },
      ],
    },
    { index: 1, title: "Custom Curl", exercise_template_id: "CUSTOM1", sets: [] },
  ],
};

describe("normalize", () => {
  it("flattens sets with exercise context", () => {
    const rows = setRows("u", workout);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      user_id: "u",
      workout_id: "w1",
      exercise_title: "Bench Press (Barbell)",
      set_type: "normal",
      weight_kg: 100,
      reps: 5,
    });
    expect(workoutRow("u", workout)).toMatchObject({
      id: "w1",
      hevy_updated_at: workout.updated_at,
    });
  });

  it("finds template ids we haven't cached", () => {
    expect(unknownTemplateIds([workout], new Set(["79D0BB3A"]))).toEqual(["CUSTOM1"]);
  });
});

describe("HevyClient", () => {
  function fakeFetch(responses: Array<{ status: number; body?: unknown }>) {
    const queue = [...responses];
    return vi.fn(async () => {
      const r = queue.shift() ?? { status: 500 };
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
    }) as unknown as typeof fetch;
  }

  it("normalizes an empty events page that has no `events` key", async () => {
    const client = new HevyClient(
      "k",
      fakeFetch([{ status: 200, body: { page: 1, page_count: 0, workouts: [] } }]),
      0,
    );
    expect(await client.events("2026-01-01T00:00:00Z", 1)).toEqual({
      page: 1,
      page_count: 0,
      items: [],
    });
  });

  it("treats 404 past the last page as empty", async () => {
    const client = new HevyClient("k", fakeFetch([{ status: 404 }]), 0);
    expect((await client.workouts(7)).items).toEqual([]);
  });

  it("retries 429 then succeeds", async () => {
    const f = fakeFetch([{ status: 429 }, { status: 200, body: { workout_count: 3 } }]);
    const client = new HevyClient("k", f, 0);
    vi.useFakeTimers({ shouldAdvanceTime: true, advanceTimeDelta: 500 });
    expect(await client.workoutCount()).toBe(3);
    vi.useRealTimers();
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("explains an auth failure", async () => {
    const client = new HevyClient("k", fakeFetch([{ status: 401 }]), 0);
    await expect(client.workoutCount()).rejects.toThrow(/Hevy Pro/);
  });
});
