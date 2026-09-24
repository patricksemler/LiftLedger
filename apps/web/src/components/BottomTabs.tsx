import { NavLink } from "react-router";
import type { NavItem } from "./nav";

export function BottomTabs({ navItems }: { navItems: NavItem[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-surface-1 md:hidden">
      {navItems.map((item) => (
        <NavLink
          key={item.id}
          to={item.route}
          end={item.route === "/"}
          className={({ isActive }) =>
            [
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
              isActive ? "text-accent" : "text-ink-faint",
            ].join(" ")
          }
        >
          <item.icon className="size-5" aria-hidden="true" />
          {item.title}
        </NavLink>
      ))}
    </nav>
  );
}
