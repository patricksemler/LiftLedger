// Ported from apps/worker/src/modules/{routines,gym}/match.test.ts
// (REFACTOR_PLAN.md Phase 2 step 3) — same expectations against the shared
// staged matcher, parameterized by a name extractor.
import { describe, expect, it } from "vitest";
import { fuzzyMatch } from "./fuzzy.js";

interface Candidate {
  id: string;
  name: string;
}

const getName = (c: Candidate) => c.name;

describe("fuzzyMatch — base pipeline (no tokenOverlap)", () => {
  const candidates: Candidate[] = [
    { id: "1", name: "Go to the gym" },
    { id: "2", name: "Take supplements" },
    { id: "3", name: "Read 20 minutes" },
  ];

  it("matches an exact name", () => {
    const result = fuzzyMatch("Go to the gym", candidates, getName);
    expect(result).toEqual({ kind: "found", candidate: { id: "1", name: "Go to the gym" } });
  });

  it("matches case-insensitively", () => {
    const result = fuzzyMatch("TAKE SUPPLEMENTS", candidates, getName);
    expect(result).toEqual({ kind: "found", candidate: { id: "2", name: "Take supplements" } });
  });

  it("matches a partial substring of a stored name", () => {
    const result = fuzzyMatch("gym", candidates, getName);
    expect(result).toEqual({ kind: "found", candidate: { id: "1", name: "Go to the gym" } });
  });

  it("matches when the query is a superstring of the stored name", () => {
    const result = fuzzyMatch("read 20 minutes please", candidates, getName);
    expect(result).toEqual({ kind: "found", candidate: { id: "3", name: "Read 20 minutes" } });
  });

  it("returns ambiguous candidates when multiple partial matches exist", () => {
    const ambiguousCandidates: Candidate[] = [
      { id: "1", name: "Gym cardio" },
      { id: "2", name: "Gym strength" },
    ];
    const result = fuzzyMatch("gym", ambiguousCandidates, getName);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates).toEqual(ambiguousCandidates);
    }
  });

  it("returns not_found when nothing matches, even with shared words", () => {
    // "curl bicep" shares no substring with any candidate, and tokenOverlap
    // is off, so this must NOT fall back to word-overlap ranking.
    const result = fuzzyMatch("meditate", candidates, getName);
    expect(result).toEqual({ kind: "not_found" });
  });

  it("returns not_found for an empty/whitespace query", () => {
    expect(fuzzyMatch("   ", candidates, getName)).toEqual({ kind: "not_found" });
  });
});

describe("fuzzyMatch — tokenOverlap stage (gym exercise matching)", () => {
  interface ExerciseCandidate {
    id: string;
    title: string;
  }
  const getTitle = (c: ExerciseCandidate) => c.title;
  const templates: ExerciseCandidate[] = [
    { id: "1", title: "Bench Press (Barbell)" },
    { id: "2", title: "Incline Bench Press (Barbell)" },
    { id: "3", title: "Squat (Barbell)" },
    { id: "4", title: "Deadlift (Barbell)" },
    { id: "5", title: "Bicep Curl (Dumbbell)" },
  ];

  it("matches an exact (case-insensitive) title", () => {
    const result = fuzzyMatch("squat (barbell)", templates, getTitle, { tokenOverlap: true });
    expect(result).toEqual({ kind: "found", candidate: templates[2] });
  });

  it("matches a unique substring in either direction", () => {
    const result = fuzzyMatch("deadlift", templates, getTitle, { tokenOverlap: true });
    expect(result).toEqual({ kind: "found", candidate: templates[3] });
  });

  it("returns ambiguous candidates when multiple templates share a substring", () => {
    const result = fuzzyMatch("bench press", templates, getTitle, { tokenOverlap: true });
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates.map((c) => c.id).sort()).toEqual(["1", "2"]);
    }
  });

  it("returns not_found when nothing shares any word", () => {
    expect(fuzzyMatch("plyometric box jump", templates, getTitle, { tokenOverlap: true })).toEqual({
      kind: "not_found",
    });
  });

  it("falls back to word-overlap ranking beyond substring matching", () => {
    const result = fuzzyMatch("curl bicep", templates, getTitle, { tokenOverlap: true });
    expect(result).toEqual({ kind: "found", candidate: templates[4] });
  });

  it("returns ambiguous when several candidates tie on word-overlap score", () => {
    const pressVariants: ExerciseCandidate[] = [
      { id: "a", title: "Overhead Press (Barbell)" },
      { id: "b", title: "Shoulder Press (Barbell)" },
    ];
    const result = fuzzyMatch("military press", pressVariants, getTitle, { tokenOverlap: true });
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.candidates.map((c) => c.id).sort()).toEqual(["a", "b"]);
    }
  });
});
