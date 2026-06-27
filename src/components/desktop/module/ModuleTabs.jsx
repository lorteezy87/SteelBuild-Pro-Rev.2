/**
 * ModuleTabs — in-module tabs synced to a URL query param (default "x_tab"),
 * preserving the existing hub routing convention.
 */
import React from "react";
import { useSearchParams } from "react-router-dom";

export default function ModuleTabs({ tabs, param = "x_tab", defaultTab }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const active = searchParams.get(param) || defaultTab || (tabs[0] && tabs[0].id);

  const select = (id) => {
    const next = new URLSearchParams(searchParams);
    next.set(param, id);
    setSearchParams(next, { replace: true });
  };

  return (
    <nav className="desk-module-tabs" aria-label="Section tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`desk-module-tab${t.id === active ? " is-active" : ""}`}
          aria-current={t.id === active ? "page" : undefined}
          onClick={() => select(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
