import { Home, Settings as SettingsIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { webModules } from "../modules";

export interface NavItem {
  id: string;
  title: string;
  icon: LucideIcon;
  route: string;
}

/**
 * The full nav list: Overview (core, always first) + every registered
 * module in navOrder + Settings (core, always last). Never hardcode a
 * module name here — this is the one place core reads the registry.
 */
export function useNavItems(): NavItem[] {
  const moduleItems: NavItem[] = [...webModules]
    .sort((a, b) => a.navOrder - b.navOrder)
    .map((m) => ({ id: m.id, title: m.title, icon: m.icon, route: m.route }));

  return [
    { id: "overview", title: "Overview", icon: Home, route: "/" },
    ...moduleItems,
    { id: "settings", title: "Settings", icon: SettingsIcon, route: "/settings" },
  ];
}
