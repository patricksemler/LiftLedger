// nutrition web module — PLAN.md "Module specs" -> "nutrition" (Web section)
// and "The module system" -> "Web-side contract". Registered by one line in
// `../index.ts`; never referenced by name in App.tsx/nav/overview core code.

import { Utensils } from "lucide-react";
import { lazy } from "react";
import type { WebModule } from "../types";
import { NutritionOverviewCard } from "./OverviewCard";

const NutritionPage = lazy(() => import("./NutritionPage"));

export const nutritionModule: WebModule = {
  id: "nutrition",
  title: "Nutrition",
  icon: Utensils,
  route: "/nutrition",
  page: NutritionPage,
  overviewCards: [NutritionOverviewCard],
  navOrder: 2,
};
