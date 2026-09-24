import { describe, expect, it } from "vitest";
import { muscleGroupLabel, resolveMuscleQuery } from "./muscles.js";

describe("resolveMuscleQuery", () => {
  it("resolves the plain names of single muscles", () => {
    expect(resolveMuscleQuery("biceps")).toEqual({ label: "biceps", groups: ["biceps"] });
    expect(resolveMuscleQuery("chest")).toEqual({ label: "chest", groups: ["chest"] });
  });

  it("resolves gym slang", () => {
    expect(resolveMuscleQuery("bis")?.groups).toEqual(["biceps"]);
    expect(resolveMuscleQuery("pecs")?.groups).toEqual(["chest"]);
    expect(resolveMuscleQuery("delts")?.groups).toEqual(["shoulders"]);
    expect(resolveMuscleQuery("quads")?.groups).toEqual(["quadriceps"]);
    expect(resolveMuscleQuery("hams")?.groups).toEqual(["hamstrings"]);
  });

  it("maps Hevy's snake_case spellings back from how people say them", () => {
    expect(resolveMuscleQuery("lower back")?.groups).toEqual(["lower_back"]);
    expect(resolveMuscleQuery("Lower-Back")?.groups).toEqual(["lower_back"]);
    expect(resolveMuscleQuery("abs")?.groups).toEqual(["abdominals"]);
  });

  it("expands composite groups the Hevy taxonomy has no name for", () => {
    expect(resolveMuscleQuery("arms")).toEqual({
      label: "arms",
      groups: ["biceps", "triceps", "forearms"],
    });
    expect(resolveMuscleQuery("push")?.groups).toEqual(["chest", "shoulders", "triceps"]);
    expect(resolveMuscleQuery("back")?.groups).toEqual([
      "lats",
      "upper_back",
      "lower_back",
      "traps",
    ]);
  });

  it("handles singular/plural either way round", () => {
    expect(resolveMuscleQuery("bicep")?.groups).toEqual(["biceps"]);
    expect(resolveMuscleQuery("calf")?.groups).toEqual(["calves"]);
    expect(resolveMuscleQuery("glute")?.groups).toEqual(["glutes"]);
  });

  it("finds the muscle inside a longer phrase", () => {
    expect(resolveMuscleQuery("my biceps")?.groups).toEqual(["biceps"]);
    expect(resolveMuscleQuery("bicep curls")?.groups).toEqual(["biceps"]);
  });

  it("prefers the longest match so 'lower back' isn't swallowed by 'back'", () => {
    expect(resolveMuscleQuery("how is my lower back")?.groups).toEqual(["lower_back"]);
  });

  it("returns null for something that isn't a muscle at all", () => {
    expect(resolveMuscleQuery("bench press")).toBeNull();
    expect(resolveMuscleQuery("")).toBeNull();
    expect(resolveMuscleQuery("   ")).toBeNull();
  });
});

describe("muscleGroupLabel", () => {
  it("un-snake-cases a raw group value for prose", () => {
    expect(muscleGroupLabel("lower_back")).toBe("lower back");
    expect(muscleGroupLabel("chest")).toBe("chest");
  });
});
