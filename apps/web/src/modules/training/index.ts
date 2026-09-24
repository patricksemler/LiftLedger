import { Dumbbell } from "lucide-react";
import { lazy } from "react";
import type { WebModule } from "../types";
import { TrainingOverviewCard } from "./OverviewCard";

const TrainingPage = lazy(() => import("./TrainingPage"));

export const trainingModule: WebModule = {
  id: "training",
  title: "Training",
  icon: Dumbbell,
  route: "/training",
  page: TrainingPage,
  overviewCards: [TrainingOverviewCard],
  navOrder: 1,
};
