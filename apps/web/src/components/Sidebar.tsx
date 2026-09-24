import { NavLink } from "react-router";
import type { NavItem } from "./nav";

export function Sidebar({ navItems }: { navItems: NavItem[] }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface-1 md:flex">
      <div className="flex items-center gap-2 border-b border-border px-5 py-5">
        <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
        <span className="font-mono text-sm font-medium tracking-[0.2em] text-ink">LIFTLEDGER</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.id}
            to={item.route}
            end={item.route === "/"}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-surface-2 text-ink"
                  : "text-ink-dim hover:bg-surface-2/60 hover:text-ink",
              ].join(" ")
            }
          >
            <item.icon className="size-4 shrink-0" aria-hidden="true" />
            {item.title}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
