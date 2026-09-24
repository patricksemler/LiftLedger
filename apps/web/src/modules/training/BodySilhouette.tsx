import { memo } from "react";

// Front/back anatomical body model for the muscle heatmap (PLAN-gym-expansion.md
// G3). The polygon coordinates below are vendored from react-body-highlighter
// rather than taken as a runtime dependency: that package renders its own colors
// from an exercise-frequency array, which can't express this heatmap's
// continuous `color-mix` intensity ramp, and it has no hover/active affordance.
// Vendoring the geometry keeps the artwork and lets this stay a presentational
// component driven entirely by props, same "dumb component" split as the other
// gym charts.
//
// Polygon data from https://github.com/GV79/react-body-highlighter
//
//   MIT License. Copyright (c) 2020 GV79
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy
//   of this software and associated documentation files (the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
//   to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//   copies of the Software, and to permit persons to whom the Software is
//   furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in
//   all copies or substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//   IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//   AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//   LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
//   SOFTWARE.
//
// Four deviations from the upstream data, all deliberate — see MUSCLE_REGIONS
// below for where each one lands:
//
//  1. Upstream's `trapezius` is one polygon spanning neck to mid-back. Hevy
//     splits that into `traps` (shrugs) and `upper_back` (rows/face pulls), so
//     each side is clipped at the shoulder line (y=40) into an upper half
//     (traps) and the lower descending triangle (upper_back).
//  2. Upstream's `upper-back` polygons are anatomically the lats — the wings
//     running from the armpit to the waist — so they map to `lats` here.
//  3. Upstream labels the *inner* thigh `abductors` (its own naming bug; the
//     polygons sit inboard of the midline). Those map to `adductors`, and Hevy's
//     `abductors` takes the outermost thigh strips instead.
//  4. The head polygons are dropped entirely: no Hevy group maps to them, so
//     they were pure non-interactive filler costing ~10% of the figure's height.
//
// Coordinates are pre-computed static data; regenerating them is a manual job.
// The viewBox spans y=30..201. The bottom clears both figures' calves (the
// upstream soleus polygons, y>195, having been dropped). The top deliberately
// crops *into* the neck/traps rather than starting at their true tops (y=21.7
// back, y=23.7 front): with the head gone those polygons taper to two bare
// spikes at the midline that read as horns, so the figure is cut at the
// shoulder line instead. Both groups stay visible and clickable below the cut —
// only their uppermost slivers are outside the frame. Both views share the one
// viewBox so the front and back models render at the same scale and height side
// by side; changing it rescales the figures, whose width is derived from this
// 100x171 ratio by the height the heatmap pins them to.

interface MuscleRegion {
  muscle: string;
  polygons: string[];
}

const FRONT_REGIONS: MuscleRegion[] = [
  {
    muscle: "neck",
    polygons: [
      "55.51,23.673 50.612,33.469 50.612,39.184 61.633,40 70.612,44.898 69.388,36.735 63.265,35.102 58.367,30.612",
      "28.98,44.898 30.204,37.143 36.327,35.102 41.224,30.204 44.49,24.49 48.98,33.878 48.571,39.184 37.959,39.592",
    ],
  },
  {
    muscle: "shoulders",
    polygons: [
      "78.367,53.061 79.592,47.755 79.184,41.224 75.918,37.959 71.02,36.327 72.245,42.857 71.429,47.347",
      "28.163,47.347 21.224,53.061 20,47.755 20.408,40.816 24.49,37.143 28.571,37.143 26.939,43.265",
    ],
  },
  {
    muscle: "chest",
    polygons: [
      "51.837,41.633 51.02,55.102 57.959,57.959 67.755,55.51 70.612,47.347 62.041,41.633",
      "29.796,46.531 31.429,55.51 40.816,57.959 48.163,55.102 47.755,42.041 37.551,42.041",
    ],
  },
  {
    muscle: "biceps",
    polygons: [
      "16.735,68.163 17.959,71.429 22.857,66.122 28.98,53.878 27.755,49.388 20.408,55.918",
      "71.429,49.388 70.204,54.694 76.327,66.122 81.633,71.837 82.857,68.98 78.776,55.51",
    ],
  },
  {
    muscle: "triceps",
    polygons: [
      "69.388,55.51 69.388,61.633 75.918,72.653 77.551,70.204 75.51,67.347",
      "22.449,69.388 29.796,55.51 29.796,60.816 22.857,73.061",
    ],
  },
  {
    muscle: "forearms",
    polygons: [
      "6.122,88.571 10.204,75.102 14.694,70.204 16.327,74.286 19.184,73.469 4.49,97.551 0,100",
      "84.49,69.796 83.265,73.469 80,73.061 95.102,98.367 100,100.408 93.469,89.388 89.796,76.327",
      "77.551,72.245 77.551,77.551 80.408,84.082 85.306,89.796 92.245,101.224 94.694,99.592",
      "6.939,101.224 13.469,90.612 18.776,84.082 21.633,77.143 21.224,71.837 4.898,98.776",
    ],
  },
  {
    // Hevy has no separate obliques group, so the oblique polygons fold in here.
    muscle: "abdominals",
    polygons: [
      "56.327,59.184 57.959,64.082 58.367,77.959 58.367,92.653 56.327,98.367 55.102,104.082 51.429,107.755 51.02,84.49 50.612,67.347 51.02,57.143",
      "43.673,58.776 48.571,57.143 48.98,67.347 48.571,84.49 48.163,107.347 44.49,103.673 40.816,91.429 40.816,78.367 41.224,64.49",
      "68.571,63.265 67.347,57.143 58.776,59.592 60,64.082 60.408,83.265 65.714,78.776 66.531,69.796",
      "33.878,78.367 33.061,71.837 31.02,63.265 32.245,57.143 40.816,59.184 39.184,63.265 39.184,83.673",
    ],
  },
  {
    muscle: "quadriceps",
    polygons: [
      "34.694,98.776 37.143,108.163 37.143,127.755 34.286,137.143 31.02,132.653 29.388,120 28.163,111.429 29.388,100.816 32.245,94.694",
      "63.265,105.714 64.49,100 66.939,94.694 70.204,101.224 71.02,111.837 68.163,133.061 65.306,137.551 62.449,128.571 62.041,111.429",
      "38.776,129.388 38.367,112.245 41.224,118.367 44.49,129.388 42.857,135.102 40,146.122 36.327,146.531 35.51,140",
      "59.592,145.714 55.51,128.98 60.816,113.878 61.224,130.204 64.082,139.592 62.857,146.531",
    ],
  },
  {
    // Outermost thigh strips — upstream files these under quadriceps, but Hevy
    // tracks abductors separately and this is the closest region on the figure.
    muscle: "abductors",
    polygons: [
      "32.653,138.367 26.531,145.714 25.714,136.735 25.714,127.347 26.939,114.286 29.388,133.469",
      "71.837,113.061 73.878,124.082 73.878,140.408 72.653,145.714 66.531,138.367 70.204,133.469",
    ],
  },
  {
    muscle: "adductors",
    polygons: [
      "52.653,110.204 54.286,124.898 60,110.204 62.041,100 64.898,94.286 60,92.653 56.735,104.49",
      "47.755,110.612 44.898,125.306 42.041,115.918 40.408,113.061 39.592,107.347 37.959,102.449 34.694,93.878 39.592,92.245 41.633,99.184 43.673,105.306",
    ],
  },
  {
    muscle: "calves",
    polygons: [
      "71.429,160.408 73.469,153.469 76.735,161.224 79.592,167.755 78.367,187.755 79.592,195.51 74.694,195.51",
      "24.898,194.694 27.755,164.898 28.163,160.408 26.122,154.286 24.898,157.551 22.449,161.633 20.816,167.755 22.041,188.163 20.816,195.51",
      "72.653,195.102 69.796,159.184 65.306,158.367 64.082,162.449 64.082,165.306 65.714,177.143",
      "35.51,158.367 35.918,162.449 35.918,166.939 35.102,172.245 35.102,176.735 32.245,182.041 30.612,187.347 26.939,194.694 27.347,187.755 28.163,180.408 28.571,175.51 28.98,169.796 29.796,164.082 30.204,158.776",
    ],
  },
];

const BACK_REGIONS: MuscleRegion[] = [
  {
    muscle: "traps",
    polygons: [
      "44.681,21.702 47.66,21.702 47.234,38.298 47.261,40 34.468,40 31.064,36.596 39.149,33.191 43.83,27.234",
      "52.34,21.702 55.745,21.702 56.596,27.234 60.851,32.766 68.936,36.596 65.154,40 53.137,40 53.191,38.298",
    ],
  },
  {
    muscle: "upper_back",
    polygons: [
      "47.261,40 47.66,64.681 38.298,53.191 35.319,40.851 34.468,40",
      "65.154,40 64.681,40.426 61.702,53.191 52.34,64.681 53.137,40",
    ],
  },
  {
    muscle: "lats",
    polygons: [
      "31.064,38.723 28.085,48.936 28.511,55.319 34.043,75.319 47.234,71.064 47.234,66.383 36.596,54.043 33.617,41.277",
      "68.936,38.723 71.915,49.362 71.489,56.17 65.957,75.319 52.766,71.064 52.766,66.383 63.404,54.468 66.383,41.702",
    ],
  },
  {
    muscle: "shoulders",
    polygons: [
      "29.362,37.021 22.979,39.149 17.447,44.255 18.298,53.617 24.255,49.362 27.234,46.383",
      "71.064,37.021 78.298,39.574 82.553,44.681 81.702,53.617 74.894,48.936 72.34,45.106",
    ],
  },
  {
    muscle: "triceps",
    polygons: [
      "26.809,49.787 17.872,55.745 14.468,72.34 16.596,81.702 21.702,63.83 26.809,55.745",
      "73.617,50.213 82.128,55.745 85.957,73.191 83.404,82.128 77.872,62.979 73.191,55.745",
      "26.809,58.298 26.809,68.511 22.979,75.319 19.149,77.447 22.553,65.532",
      "72.766,58.298 77.021,64.681 80.426,77.447 76.596,75.319 72.766,68.936",
    ],
  },
  {
    muscle: "forearms",
    polygons: [
      "86.383,75.745 91.064,83.404 93.191,94.043 100,106.383 96.17,104.255 88.085,89.362 84.255,83.83",
      "13.617,75.745 8.936,83.83 6.809,93.617 0,106.383 3.83,104.255 12.34,88.511 15.745,82.979",
      "81.277,79.574 77.447,77.872 79.149,84.681 91.064,103.83 93.191,108.936 94.468,104.681",
      "18.723,79.574 22.128,77.872 20.851,84.255 9.362,102.979 6.809,108.511 5.106,104.681",
    ],
  },
  {
    muscle: "lower_back",
    polygons: [
      "47.66,72.766 34.468,77.021 35.319,83.404 49.362,102.128 46.809,82.979",
      "52.34,72.766 65.532,77.021 64.681,83.404 50.638,102.128 53.191,83.83",
    ],
  },
  {
    muscle: "glutes",
    polygons: [
      "44.681,99.574 30.213,108.511 29.787,118.723 31.489,125.957 47.234,121.277 49.362,114.894",
      "55.319,99.149 51.064,114.468 52.34,120.851 68.085,125.957 69.787,119.149 69.362,108.511",
    ],
  },
  {
    muscle: "adductors",
    polygons: [
      "48.085,122.979 44.681,122.979 41.277,125.532 45.106,144.255 48.511,135.745 48.936,129.362",
      "51.915,122.553 55.745,123.404 59.149,125.957 54.894,144.255 51.915,136.17 51.064,129.362",
    ],
  },
  {
    muscle: "hamstrings",
    polygons: [
      "28.936,122.128 31.064,129.362 36.596,125.957 35.319,135.319 34.468,150.213 29.362,158.298 28.936,146.809 27.66,141.277 27.234,131.489",
      "71.489,121.702 69.362,128.936 63.83,125.957 65.532,136.596 66.383,150.213 71.064,158.298 71.489,147.66 72.766,142.128 73.617,131.915",
      "38.723,125.532 44.255,145.957 40.426,166.809 36.17,152.766 37.021,135.319",
      "61.702,125.532 63.404,136.17 64.255,153.191 60,166.809 56.17,146.383",
    ],
  },
  {
    muscle: "calves",
    polygons: [
      "29.362,160.426 28.511,167.234 24.681,179.574 23.83,192.766 25.532,197.021 28.511,193.191 29.787,180 31.915,171.064 31.915,166.809",
      "37.447,165.106 35.319,167.66 33.191,171.915 31.064,180.426 30.213,191.915 34.043,200 38.723,190.638 39.149,168.936",
      "62.979,165.106 61.277,168.511 61.702,190.638 66.383,199.574 70.638,191.915 68.936,179.574 66.809,170.213",
      "70.638,160.426 72.34,168.511 75.745,179.149 76.596,192.766 74.468,196.596 72.34,193.617 70.638,179.574 68.085,168.085",
    ],
  },
];

// Knees: no Hevy group maps to them, so they render in a flat neutral tone
// purely so the legs read as legs. Non-interactive. (The head used to live here
// too — see deviation 4 above.)
const FRONT_BASE_POLYGONS = [
  "33.878,140 34.694,143.265 35.51,147.347 36.327,151.02 35.102,156.735 29.796,156.735 27.347,152.653 27.347,147.347 30.204,144.082",
  "65.714,140 72.245,147.755 72.245,152.245 69.796,157.143 64.898,156.735 62.857,151.02",
];

const BACK_BASE_POLYGONS = [
  "34.468,153.191 31.064,159.149 33.617,166.383 37.447,162.553",
  "66.383,153.617 62.979,162.979 66.809,166.383 69.362,159.149",
];

export interface BodySilhouetteProps {
  view: "front" | "back";
  getFill: (muscle: string) => string;
  activeMuscle: string | null;
  onMuscleClick: (muscle: string) => void;
  /** Sizing is the caller's call — the heatmap drives these by height so the
   * card's height is fixed and the figures' width follows the aspect ratio. */
  className?: string;
}

/** One front or back body model, muscle-group regions filled by `getFill` (the
 * heatmap's intensity ramp) and wired for tap/click via `onMuscleClick`. A
 * region is several disjoint polygons — the body's left and right copies of a
 * muscle, plus any heads it's drawn in — which all read the same intensity,
 * since Hevy doesn't distinguish sides. Selection is click-only (no hover), so
 * the readout stays put while the pointer moves across the figure; keyboard
 * users get the same toggle via Enter/Space on a focused region.
 *
 * Memoized: the heatmap re-renders on every muscle tap (both figures share
 * `activeMuscle`), but a tap only changes stroke on the two selected polygons
 * — everything else re-painting ~200 static polygons for nothing. */
function BodySilhouetteComponent({
  view,
  getFill,
  activeMuscle,
  onMuscleClick,
  className,
}: BodySilhouetteProps) {
  const regions = view === "front" ? FRONT_REGIONS : BACK_REGIONS;
  const basePolygons = view === "front" ? FRONT_BASE_POLYGONS : BACK_BASE_POLYGONS;

  return (
    <svg
      viewBox="0 30 100 171"
      // biome-ignore lint/a11y/useSemanticElements: rule suggests <fieldset>, which can't be an SVG child
      role="group"
      aria-label={`${view} muscle heatmap`}
      className={className}
    >
      {basePolygons.map((points) => (
        <polygon
          key={points}
          points={points}
          fill="var(--color-surface-2)"
          stroke="var(--color-surface-0)"
          strokeWidth={0.4}
        />
      ))}
      {regions.map((region) => {
        const isActive = activeMuscle === region.muscle;
        return (
          <g
            key={region.muscle}
            // biome-ignore lint/a11y/useSemanticElements: rule suggests <button>, which can't be an SVG child
            role="button"
            tabIndex={0}
            aria-label={region.muscle.replace("_", " ")}
            aria-pressed={isActive}
            fill={getFill(region.muscle)}
            stroke={isActive ? "var(--color-accent-strong)" : "var(--color-surface-0)"}
            strokeWidth={isActive ? 1 : 0.4}
            style={{ cursor: "pointer", transition: "fill 150ms ease" }}
            onClick={() => onMuscleClick(region.muscle)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onMuscleClick(region.muscle);
              }
            }}
          >
            <title>{region.muscle.replace("_", " ")}</title>
            {region.polygons.map((points) => (
              <polygon key={points} points={points} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

export const BodySilhouette = memo(BodySilhouetteComponent);
