import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { PLANNER_NAV_GROUPS, PLANNER_NAV_PATHS } from "./plannerNav";

type PlannerShellProps = {
  children?: ReactNode;
};

/** Fixed Planner chrome shared by every Planner route. */
export default function PlannerShell({ children }: PlannerShellProps) {
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
      </header>

      <aside className="planner-sidebar" aria-label="Planner navigation pane">
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
