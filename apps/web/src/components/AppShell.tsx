import { Outlet } from "react-router";
import { BottomTabs } from "./BottomTabs";
import { Sidebar } from "./Sidebar";
import { useNavItems } from "./nav";

/**
 * The authenticated app frame: sidebar nav on desktop, bottom tabs on
 * mobile (<768px). Both are derived from the same nav item list — built
 * from the module registry plus the two core routes (Overview, Settings) —
 * so adding/removing a module never touches this file.
 */
export function AppShell() {
  const navItems = useNavItems();

  return (
    <div className="flex min-h-dvh">
      <Sidebar navItems={navItems} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 pb-16 md:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomTabs navItems={navItems} />
    </div>
  );
}
