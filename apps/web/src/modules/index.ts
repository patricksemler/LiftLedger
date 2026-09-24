// The web module registry. App.tsx derives routes + sidebar/tab nav from this
// array — never add a per-module route or nav entry by hand elsewhere.

import { nutritionModule } from "./nutrition";
import { trainingModule } from "./training";
import type { WebModule } from "./types";

export const webModules: WebModule[] = [trainingModule, nutritionModule];
