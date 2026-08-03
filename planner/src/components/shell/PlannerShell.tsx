import { useContext, useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { PlannerSessionContext } from "@planner/app/PlannerSessionContext";
import { PLANNER_NAV_GROUPS, PLANNER_NAV_PATHS } from "./plannerNav";

type PlannerShellProps = {
  children?: ReactNode;
};

/** Fixed Planner chrome shared by every Planner route. */
export default function PlannerShell({ children }: PlannerShellProps) {
  const session = useContext(PlannerSessionContext);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const phoenixDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date());

  useEffect(() => {
    if (!isNavigationOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsNavigationOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isNavigationOpen]);

  return (
    <div className="planner-shell">
      <header className="planner-topbar">
        <NavLink to="/" className="planner-brand" aria-label="SteelBuild Planner home">
          <span className="planner-brand__mark" aria-hidden="true">F</span>
          <div className="planner-brand__identity">
            <h1>STEELBUILD-PLANNER</h1>
            <span>Construction Action &amp; Lookahead Control</span>
          </div>
        </NavLink>
        <div className="planner-topbar__actions">
          <span className="planner-topbar__context">{session.userLabel} · {phoenixDate}</span>
          <button
            className="planner-button planner-nav-toggle"
            type="button"
            aria-controls="planner-sidebar"
            aria-expanded={isNavigationOpen}
            aria-label={isNavigationOpen ? "Close Planner navigation" : "Open Planner navigation"}
            onClick={() => setIsNavigationOpen((open) => !open)}
          >
            Menu
          </button>
          <button className="planner-button planner-sign-out" type="button" onClick={() => void session.signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <aside id="planner-sidebar" className="planner-sidebar" data-open={isNavigationOpen || undefined} aria-label="Planner navigation pane">
        <nav className="planner-nav" aria-label="Planner navigation">
          {PLANNER_NAV_GROUPS.map((group) => (
            <section className="planner-nav__group" key={group.label} aria-labelledby={`planner-nav-${group.label}`}>
              <h2 id={`planner-nav-${group.label}`}>{group.label}</h2>
              <ul>
                {group.items.map((label) => (
                  <li key={label}>
                    <NavLink
                      to={PLANNER_NAV_PATHS[label]}
                      end={label === "Command Center"}
                      className="planner-nav__link"
                      onClick={() => setIsNavigationOpen(false)}
                    >
                      <span className="planner-nav__indicator" aria-hidden="true" />
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </aside>

      <main className="planner-main" aria-label="SteelBuild Planner workspace">
        {children}
      </main>
    </div>
  );
}
