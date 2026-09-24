// The web-side module contract — PLAN.md "The module system" -> "Web-side
// contract". App.tsx builds react-router routes and the sidebar/tab nav from
// `webModules` in modules/index.ts; the overview page flat-maps
// `overviewCards`. Core must NEVER reference a module by name.

import type { LucideIcon } from "lucide-react";
import type { ComponentType, LazyExoticComponent } from "react";

export interface WebModule {
  id: string;
  title: string;
  icon: LucideIcon;
  route: string;
  page: LazyExoticComponent<ComponentType>;
  /** Rendered on the home page grid. */
  overviewCards?: ComponentType[];
  navOrder: number;
}
