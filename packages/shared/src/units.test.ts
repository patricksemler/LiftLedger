import { describe, expect, it } from "vitest";
import {
  cmToFtIn,
  formatDistance,
  formatDuration,
  formatVolume,
  formatVolumeCompact,
  formatWeight,
  ftInToCm,
  kgToLb,
  lbToKg,
} from "./units.js";

describe("kgToLb / lbToKg", () => {
  it("converts the doc's exactness case: 120.20212100044454 kg -> 265 lb", () => {
    expect(kgToLb(120.20212100044454)).toBeCloseTo(265, 3);
  });

  it("round-trips", () => {
    expect(lbToKg(kgToLb(83.4))).toBeCloseTo(83.4, 5);
  });
});

describe("formatWeight", () => {
  it("formats a clean plate-load exactly, no decimals", () => {
    expect(formatWeight(120.20212100044454, "lb")).toBe("265 lb");
  });

  it("trims a trailing .0", () => {
    expect(formatWeight(45.359237, "lb")).toBe("100 lb");
  });

  it("keeps one decimal when not a whole number", () => {
    expect(formatWeight(1, "lb")).toBe("2.2 lb");
  });

  it("defaults to lb", () => {
    expect(formatWeight(45.359237)).toBe("100 lb");
  });

  it("supports kg passthrough", () => {
    expect(formatWeight(82.5, "kg")).toBe("82.5 kg");
  });
});

describe("formatVolume / formatVolumeCompact", () => {
  it("formats thousands with separators", () => {
    // 14683 kg * 2.2046226218 ≈ 32370 lb
    expect(formatVolume(14683, "lb")).toBe("32,370 lb");
  });

  it("compacts to a 'Nk' axis tick", () => {
    expect(formatVolumeCompact(14683, "lb")).toBe("32k");
  });

  it("does not compact under 1000", () => {
    expect(formatVolumeCompact(100, "lb")).toBe("220");
  });
});

describe("cmToFtIn / ftInToCm", () => {
  it("converts a known height", () => {
    // 180.34 cm = 71 in = 5'11"
    expect(cmToFtIn(180.34)).toEqual({ feet: 5, inches: 11 });
  });

  it("carries a 12-inch rounding overflow into an extra foot", () => {
    // 71.6 in rounds to 72 in, i.e. 6'0", not 5'12"
    expect(cmToFtIn(71.6 * 2.54)).toEqual({ feet: 6, inches: 0 });
  });

  it("round-trips ft/in -> cm -> ft/in", () => {
    const cm = ftInToCm(5, 11);
    expect(cmToFtIn(cm)).toEqual({ feet: 5, inches: 11 });
  });
});

describe("formatDistance", () => {
  it("renders short distances in feet", () => {
    expect(formatDistance(30, "mi")).toBe("98 ft");
  });

  it("renders long distances in miles", () => {
    expect(formatDistance(1609.344, "mi")).toBe("1 mi");
  });

  it("renders metric under 1km in meters", () => {
    expect(formatDistance(600, "m")).toBe("600 m");
  });

  it("renders metric over 1km in km", () => {
    expect(formatDistance(1500, "m")).toBe("1.50 km");
  });
});

describe("formatDuration", () => {
  it("formats under an hour as mm:ss", () => {
    expect(formatDuration(600)).toBe("10:00");
  });

  it("formats over an hour as Nh MMm", () => {
    expect(formatDuration(3900)).toBe("1h 05m");
  });
});
