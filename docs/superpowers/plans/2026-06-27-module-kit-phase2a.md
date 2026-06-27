# Module Kit (Phase 2A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared, reusable module design-language kit (header, section card, stat tile, status pill, data table, states, tabs) that every Phase 2 module redesign composes from — so all ~31 screens stay consistent.

**Architecture:** A new `src/components/desktop/module/` component kit + supporting classes in `src/styles/desktop.css`, scoped under `[data-skin="desktop"]` with light/contrast variants. Components are small, prop-driven, theme/density/a11y-aware, and behavior-free (pure presentation). The photo header reuses the existing launcher photo via `photoFor(page)`; icons via `getPageIcon(page)`.

**Tech Stack:** React 18, react-router 6 (`useSearchParams` for tabs), Vitest + @testing-library/react (jsdom), the existing CSS token system + Phase 1 `desktop.css` tokens. No new runtime deps.

**Spec:** `docs/superpowers/specs/2026-06-27-module-design-language-phase2-design.md`

**Scope note:** This plan = the KIT only. Rebuilding the Detailing Control Center flagship onto the kit is **Plan 2B** (separate, authored after this lands). Per-module redesigns follow as their own cycles.

---

## Conventions (every task)

- Windows PowerShell. Vitest: `npx vitest run <file> --maxWorkers=2 2>&1 | Select-Object -Last 40` then `Write-Host "EXIT: $LASTEXITCODE"`.
- Component test files start with `// @vitest-environment jsdom`.
- Shared, dirty checkout: stage ONLY the explicit paths per task; never `git add -A`.
- Work on branch `claude/desktop-redesign`. Do not push.
- A PostToolUse SQL-linter hook may print a harmless "can't open file check-sql-files.py" error on writes — ignore it.

## File structure

Created under `src/components/desktop/module/`:
- `StatTile.jsx` — labeled KPI value, tone-colored.
- `StatusPill.jsx` — small status chip.
- `SectionCard.jsx` — glass content card (header + body).
- `DataTable.jsx` — refined table (columns/rows, empty + loading).
- `ModuleTabs.jsx` — query-param-synced in-module tabs.
- `ModuleHeader.jsx` — photo-accent identity band (icon + title + stats + actions + tabs slot).
- `states/EmptyState.jsx`, `states/ErrorState.jsx`, `states/PermissionDenied.jsx`, `states/LoadingSkeleton.jsx`.
- `index.js` — barrel re-export.
- Tests under `src/components/desktop/module/__tests__/`.

Modified:
- `src/styles/desktop.css` — append the module-kit classes (`.desk-stat`, `.desk-section-card`, `.desk-status-pill`, `.desk-table`, `.desk-module-tabs`, `.desk-module-header`, `.desk-state`) + light/contrast variants.

---

### Task 1: Module-kit styles in desktop.css

**Files:**
- Modify: `src/styles/desktop.css` (append at end)

- [ ] **Step 1: Append the kit styles**

Add to the END of `src/styles/desktop.css`:

```css
/* ── Phase 2 module kit ─────────────────────────────────────────── */
[data-skin="desktop"] .desk-stat { display: flex; flex-direction: column; gap: 1px; }
[data-skin="desktop"] .desk-stat__label { font-size: 9px; letter-spacing: .4px; color: var(--text-muted); text-transform: uppercase; }
[data-skin="desktop"] .desk-stat__value { font-size: 20px; font-weight: 500; line-height: 1; color: var(--text-primary); }
[data-skin="desktop"] .desk-stat--gold .desk-stat__value { color: #e0b030; }
[data-skin="desktop"] .desk-stat--blue .desk-stat__value { color: #5b9bf0; }
[data-skin="desktop"] .desk-stat--teal .desk-stat__value { color: #37c4a6; }
[data-skin="desktop"] .desk-stat--green .desk-stat__value { color: #5fce7a; }
[data-skin="desktop"] .desk-stat--amber .desk-stat__value { color: #f0b24a; }
[data-skin="desktop"] .desk-stat--danger .desk-stat__value { color: #f0655a; }

[data-skin="desktop"] .desk-status-pill { font-size: 10px; font-weight: 500; padding: 2px 9px; border-radius: 11px; display: inline-block; background: rgba(255,255,255,.08); color: var(--text-secondary); }
[data-skin="desktop"] .desk-status-pill--open { background: rgba(240,138,60,.18); color: #f0a35c; }
[data-skin="desktop"] .desk-status-pill--review { background: rgba(91,155,240,.18); color: #7fb3f5; }
[data-skin="desktop"] .desk-status-pill--done { background: rgba(95,206,122,.18); color: #7ed694; }
[data-skin="desktop"] .desk-status-pill--danger { background: rgba(240,101,90,.18); color: #f08a80; }

[data-skin="desktop"] .desk-section-card { border-radius: 12px; border: 1px solid var(--desk-window-edge); background: var(--desk-window-bg); overflow: hidden; }
[data-skin="desktop"] .desk-section-card__head { display: flex; align-items: center; gap: 7px; padding: 9px 12px; border-bottom: 1px solid var(--divider, rgba(48,54,61,.6)); color: var(--text-secondary); font-size: 12px; font-weight: 500; }
[data-skin="desktop"] .desk-section-card__title { flex: 0 1 auto; }
[data-skin="desktop"] .desk-section-card__action { margin-left: auto; font-size: 11px; color: var(--text-muted); }
[data-skin="desktop"] .desk-section-card__body { padding: 12px; }

[data-skin="desktop"] .desk-table { width: 100%; border-collapse: collapse; font-size: 12px; }
[data-skin="desktop"] .desk-table th { text-align: left; font-size: 9px; letter-spacing: .5px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; padding: 6px 10px; border-bottom: 1px solid var(--divider, rgba(48,54,61,.6)); }
[data-skin="desktop"] .desk-table td { padding: 8px 10px; border-bottom: 1px solid var(--divider, rgba(48,54,61,.45)); color: var(--text-secondary); }
[data-skin="desktop"] .desk-table tbody tr:hover td { background: var(--nav-hover-bg, rgba(255,255,255,.04)); }
[data-skin="desktop"] .desk-table .is-num { text-align: right; font-variant-numeric: tabular-nums; }

[data-skin="desktop"] .desk-module-tabs { display: flex; gap: 2px; padding: 0 12px; }
[data-skin="desktop"] .desk-module-tab { background: none; border: none; cursor: pointer; padding: 9px 12px; font-size: 12px; color: var(--text-muted); border-bottom: 2px solid transparent; font-family: var(--font-body); }
[data-skin="desktop"] .desk-module-tab:hover { color: var(--text-secondary); }
[data-skin="desktop"] .desk-module-tab.is-active { color: var(--accent); border-bottom-color: var(--accent); }

[data-skin="desktop"] .desk-module-header { position: relative; overflow: hidden; border-bottom: 1px solid var(--desk-window-edge); background: linear-gradient(150deg, #222b3a 0%, #141c26 55%, #0a0e15 100%); }
[data-skin="desktop"] .desk-module-header__photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
[data-skin="desktop"] .desk-module-header__scrim { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(8,11,16,.4) 0%, rgba(8,11,16,.25) 45%, rgba(8,11,16,.82) 100%); }
[data-skin="desktop"] .desk-module-header__main { position: relative; z-index: 2; display: flex; align-items: center; gap: 14px; padding: 14px 16px; min-height: 72px; }
[data-skin="desktop"] .desk-module-header__id { display: flex; align-items: center; gap: 13px; }
[data-skin="desktop"] .desk-module-header__title { margin: 0; font-size: 20px; font-weight: 500; color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
[data-skin="desktop"] .desk-module-header__subtitle { margin: 1px 0 0; font-size: 11px; color: #cfd8e4; }
[data-skin="desktop"] .desk-module-header__right { margin-left: auto; display: flex; align-items: center; gap: 16px; }
[data-skin="desktop"] .desk-module-header__stats { display: flex; gap: 16px; }
[data-skin="desktop"] .desk-module-header__stats .desk-stat__label { color: #cfd8e4; }
[data-skin="desktop"] .desk-module-header__stats .desk-stat__value { color: #fff; }
[data-skin="desktop"] .desk-module-header__actions { display: flex; gap: 8px; }
[data-skin="desktop"] .desk-module-header__tabs { position: relative; z-index: 2; background: rgba(8,11,16,.35); }

[data-skin="desktop"] .desk-state { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 8px; padding: 36px 20px; color: var(--text-muted); }
[data-skin="desktop"] .desk-state__title { font-size: 14px; font-weight: 500; color: var(--text-secondary); }
[data-skin="desktop"] .desk-state__msg { font-size: 12px; color: var(--text-muted); max-width: 360px; }
[data-skin="desktop"] .desk-skeleton { background: linear-gradient(90deg, rgba(255,255,255,.04), rgba(255,255,255,.08), rgba(255,255,255,.04)); background-size: 200% 100%; border-radius: 6px; animation: desk-shimmer 1.3s ease-in-out infinite; }
@keyframes desk-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
[data-motion="reduced"] [data-skin="desktop"] .desk-skeleton { animation: none; }

@media (max-width: 720px) {
  [data-skin="desktop"] .desk-module-header__main { flex-direction: column; align-items: flex-start; gap: 10px; }
  [data-skin="desktop"] .desk-module-header__right { margin-left: 0; flex-wrap: wrap; }
}
```

- [ ] **Step 2: Verify build**

Run: `node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 12`
Expected: EXIT 0.

- [ ] **Step 3: Commit**

```powershell
git add src/styles/desktop.css
git commit -m "feat(module-kit): add Phase 2 module-kit styles to desktop.css" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: StatTile

**Files:**
- Create: `src/components/desktop/module/StatTile.jsx`
- Test: `src/components/desktop/module/__tests__/StatTile.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import StatTile from "@/components/desktop/module/StatTile";

describe("StatTile", () => {
  it("renders label and value", () => {
    const { getByText } = render(<StatTile label="Open RFIs" value={14} />);
    expect(getByText("Open RFIs")).toBeTruthy();
    expect(getByText("14")).toBeTruthy();
  });
  it("applies the tone modifier class", () => {
    const { container } = render(<StatTile label="Overdue" value={3} tone="danger" />);
    expect(container.querySelector(".desk-stat--danger")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (`npx vitest run src/components/desktop/module/__tests__/StatTile.test.jsx --maxWorkers=2`)

- [ ] **Step 3: Create `src/components/desktop/module/StatTile.jsx`**

```jsx
/**
 * StatTile — a labeled KPI value, colored by semantic/phase tone.
 * Used in ModuleHeader clusters and in-page KPI strips.
 */
import React from "react";

const TONES = new Set(["neutral", "gold", "blue", "teal", "green", "amber", "danger"]);

export default function StatTile({ label, value, tone = "neutral" }) {
  const t = TONES.has(tone) ? tone : "neutral";
  return (
    <div className={`desk-stat desk-stat--${t}`}>
      <div className="desk-stat__label">{label}</div>
      <div className="desk-stat__value">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run test — expect PASS (2)**

- [ ] **Step 5: Commit**

```powershell
git add src/components/desktop/module/StatTile.jsx src/components/desktop/module/__tests__/StatTile.test.jsx
git commit -m "feat(module-kit): add StatTile" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: StatusPill

**Files:**
- Create: `src/components/desktop/module/StatusPill.jsx`
- Test: `src/components/desktop/module/__tests__/StatusPill.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import StatusPill from "@/components/desktop/module/StatusPill";

describe("StatusPill", () => {
  it("renders children and tone class", () => {
    const { getByText, container } = render(<StatusPill tone="open">Open</StatusPill>);
    expect(getByText("Open")).toBeTruthy();
    expect(container.querySelector(".desk-status-pill--open")).toBeTruthy();
  });
  it("falls back to neutral for unknown tone", () => {
    const { container } = render(<StatusPill tone="weird">X</StatusPill>);
    expect(container.querySelector(".desk-status-pill")).toBeTruthy();
    expect(container.querySelector(".desk-status-pill--weird")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Create `src/components/desktop/module/StatusPill.jsx`**

```jsx
/**
 * StatusPill — small status chip. tone: open | review | done | danger | neutral.
 */
import React from "react";

const TONES = new Set(["open", "review", "done", "danger"]);

export default function StatusPill({ tone = "neutral", children }) {
  const mod = TONES.has(tone) ? ` desk-status-pill--${tone}` : "";
  return <span className={`desk-status-pill${mod}`}>{children}</span>;
}
```

- [ ] **Step 4: Run test — expect PASS (2)**

- [ ] **Step 5: Commit**

```powershell
git add src/components/desktop/module/StatusPill.jsx src/components/desktop/module/__tests__/StatusPill.test.jsx
git commit -m "feat(module-kit): add StatusPill" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: SectionCard

**Files:**
- Create: `src/components/desktop/module/SectionCard.jsx`
- Test: `src/components/desktop/module/__tests__/SectionCard.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import SectionCard from "@/components/desktop/module/SectionCard";

describe("SectionCard", () => {
  it("renders title, header action, and children", () => {
    const { getByText } = render(
      <SectionCard title="Steel execution" headerAction={<a href="#">View all</a>}>
        <p>body</p>
      </SectionCard>,
    );
    expect(getByText("Steel execution")).toBeTruthy();
    expect(getByText("View all")).toBeTruthy();
    expect(getByText("body")).toBeTruthy();
  });
  it("omits the header when no title or action", () => {
    const { container, getByText } = render(<SectionCard><p>only</p></SectionCard>);
    expect(container.querySelector(".desk-section-card__head")).toBeNull();
    expect(getByText("only")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Create `src/components/desktop/module/SectionCard.jsx`**

```jsx
/**
 * SectionCard — the universal glass content card. Header (icon + title +
 * optional action) over body. No card-in-card nesting.
 */
import React from "react";

export default function SectionCard({ title, icon: Icon, headerAction, className = "", children }) {
  const hasHead = title || headerAction || Icon;
  return (
    <section className={`desk-section-card ${className}`.trim()}>
      {hasHead && (
        <header className="desk-section-card__head">
          {Icon ? <Icon size={16} strokeWidth={1.8} aria-hidden="true" /> : null}
          {title ? <span className="desk-section-card__title">{title}</span> : null}
          {headerAction ? <span className="desk-section-card__action">{headerAction}</span> : null}
        </header>
      )}
      <div className="desk-section-card__body">{children}</div>
    </section>
  );
}
```

- [ ] **Step 4: Run test — expect PASS (2)**

- [ ] **Step 5: Commit**

```powershell
git add src/components/desktop/module/SectionCard.jsx src/components/desktop/module/__tests__/SectionCard.test.jsx
git commit -m "feat(module-kit): add SectionCard" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: States kit (EmptyState, ErrorState, PermissionDenied, LoadingSkeleton)

**Files:**
- Create: `src/components/desktop/module/states/EmptyState.jsx`, `ErrorState.jsx`, `PermissionDenied.jsx`, `LoadingSkeleton.jsx`
- Test: `src/components/desktop/module/__tests__/states.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import EmptyState from "@/components/desktop/module/states/EmptyState";
import ErrorState from "@/components/desktop/module/states/ErrorState";
import PermissionDenied from "@/components/desktop/module/states/PermissionDenied";
import LoadingSkeleton from "@/components/desktop/module/states/LoadingSkeleton";

describe("states kit", () => {
  it("EmptyState renders title, message, and CTA", () => {
    const onAct = vi.fn();
    const { getByText } = render(<EmptyState title="No RFIs yet" message="Create your first RFI." action={{ label: "New RFI", onClick: onAct }} />);
    expect(getByText("No RFIs yet")).toBeTruthy();
    expect(getByText("Create your first RFI.")).toBeTruthy();
    fireEvent.click(getByText("New RFI"));
    expect(onAct).toHaveBeenCalled();
  });
  it("ErrorState shows message and Retry when onRetry given", () => {
    const onRetry = vi.fn();
    const { getByText } = render(<ErrorState message="Something went wrong." onRetry={onRetry} />);
    fireEvent.click(getByText("Retry"));
    expect(onRetry).toHaveBeenCalled();
  });
  it("PermissionDenied renders a default message", () => {
    const { getByText } = render(<PermissionDenied />);
    expect(getByText(/don.t have access/i)).toBeTruthy();
  });
  it("LoadingSkeleton renders the requested number of skeleton rows", () => {
    const { container } = render(<LoadingSkeleton rows={4} />);
    expect(container.querySelectorAll(".desk-skeleton").length).toBe(4);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Create the four files**

`src/components/desktop/module/states/EmptyState.jsx`:
```jsx
import React from "react";
import { Inbox } from "lucide-react";

export default function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="desk-state" role="status">
      <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
      {title ? <div className="desk-state__title">{title}</div> : null}
      {message ? <div className="desk-state__msg">{message}</div> : null}
      {action ? (
        <button type="button" onClick={action.onClick} style={{ marginTop: 4, fontSize: 12, color: "var(--text-primary)", background: "var(--bg-surface)", border: "1px solid var(--border-default, var(--border))", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
```

`src/components/desktop/module/states/ErrorState.jsx`:
```jsx
import React from "react";
import { AlertTriangle } from "lucide-react";

export default function ErrorState({ title = "Couldn't load this", message, onRetry }) {
  return (
    <div className="desk-state" role="alert">
      <AlertTriangle size={28} strokeWidth={1.5} aria-hidden="true" style={{ color: "var(--status-error, #f0655a)" }} />
      <div className="desk-state__title">{title}</div>
      {message ? <div className="desk-state__msg">{message}</div> : null}
      {onRetry ? (
        <button type="button" onClick={onRetry} style={{ marginTop: 4, fontSize: 12, color: "var(--text-primary)", background: "var(--bg-surface)", border: "1px solid var(--border-default, var(--border))", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
```

`src/components/desktop/module/states/PermissionDenied.jsx`:
```jsx
import React from "react";
import { Lock } from "lucide-react";

export default function PermissionDenied({ message = "You don't have access to this." }) {
  return (
    <div className="desk-state" role="status">
      <Lock size={28} strokeWidth={1.5} aria-hidden="true" />
      <div className="desk-state__title">Access denied</div>
      <div className="desk-state__msg">{message}</div>
    </div>
  );
}
```

`src/components/desktop/module/states/LoadingSkeleton.jsx`:
```jsx
import React from "react";

export default function LoadingSkeleton({ rows = 3, height = 16 }) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="desk-skeleton" style={{ height }} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test — expect PASS (4)**

- [ ] **Step 5: Commit**

```powershell
git add src/components/desktop/module/states/ src/components/desktop/module/__tests__/states.test.jsx
git commit -m "feat(module-kit): add states kit (empty/error/permission/skeleton)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: DataTable

**Files:**
- Create: `src/components/desktop/module/DataTable.jsx`
- Test: `src/components/desktop/module/__tests__/DataTable.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import DataTable from "@/components/desktop/module/DataTable";

const COLS = [
  { key: "num", label: "RFI #" },
  { key: "subject", label: "Subject" },
  { key: "days", label: "Days", align: "num" },
  { key: "status", label: "Status", render: (r) => <em>{r.status}</em> },
];

describe("DataTable", () => {
  it("renders headers and rows", () => {
    const rows = [{ id: 1, num: "RFI-129", subject: "Beam", days: 4, status: "Open" }];
    const { getByText } = render(<DataTable columns={COLS} rows={rows} rowKey="id" />);
    expect(getByText("RFI #")).toBeTruthy();
    expect(getByText("RFI-129")).toBeTruthy();
    expect(getByText("Open")).toBeTruthy(); // via render()
  });
  it("shows the empty state when no rows", () => {
    const { getByText } = render(<DataTable columns={COLS} rows={[]} rowKey="id" emptyMessage="No RFIs." />);
    expect(getByText("No RFIs.")).toBeTruthy();
  });
  it("shows a loading skeleton when loading", () => {
    const { container } = render(<DataTable columns={COLS} rows={[]} rowKey="id" loading />);
    expect(container.querySelector(".desk-skeleton")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Create `src/components/desktop/module/DataTable.jsx`**

```jsx
/**
 * DataTable — refined table. columns: [{ key, label, align?: "num", render?(row) }].
 * rows: array; rowKey: field name for React keys. Shows LoadingSkeleton when
 * `loading`, EmptyState message when no rows. Presentation only — sorting,
 * paging, and virtualization stay with the caller for large data sets.
 */
import React from "react";
import LoadingSkeleton from "./states/LoadingSkeleton";
import EmptyState from "./states/EmptyState";

export default function DataTable({ columns, rows, rowKey = "id", loading = false, emptyMessage = "Nothing here yet." }) {
  if (loading) {
    return <div style={{ padding: 12 }}><LoadingSkeleton rows={5} /></div>;
  }
  if (!rows || rows.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }
  return (
    <table className="desk-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.align === "num" ? "is-num" : undefined}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[rowKey]}>
            {columns.map((c) => (
              <td key={c.key} className={c.align === "num" ? "is-num" : undefined}>
                {c.render ? c.render(row) : row[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test — expect PASS (3)**

- [ ] **Step 5: Commit**

```powershell
git add src/components/desktop/module/DataTable.jsx src/components/desktop/module/__tests__/DataTable.test.jsx
git commit -m "feat(module-kit): add DataTable" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: ModuleTabs

**Files:**
- Create: `src/components/desktop/module/ModuleTabs.jsx`
- Test: `src/components/desktop/module/__tests__/ModuleTabs.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ModuleTabs from "@/components/desktop/module/ModuleTabs";

const TABS = [
  { id: "drawings", label: "Drawings" },
  { id: "submittals", label: "Submittals" },
];

function wrap(ui, initial = "/") {
  return render(<MemoryRouter initialEntries={[initial]}>{ui}</MemoryRouter>);
}

describe("ModuleTabs", () => {
  it("defaults active to the first tab when no param", () => {
    const { getByText } = wrap(<ModuleTabs tabs={TABS} />);
    expect(getByText("Drawings").getAttribute("aria-current")).toBe("page");
  });
  it("reflects the active tab from the query param", () => {
    const { getByText } = wrap(<ModuleTabs tabs={TABS} />, "/?x_tab=submittals");
    expect(getByText("Submittals").getAttribute("aria-current")).toBe("page");
  });
  it("sets the query param on click", () => {
    const { getByText } = wrap(<ModuleTabs tabs={TABS} />);
    fireEvent.click(getByText("Submittals"));
    expect(getByText("Submittals").getAttribute("aria-current")).toBe("page");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Create `src/components/desktop/module/ModuleTabs.jsx`**

```jsx
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
```

- [ ] **Step 4: Run test — expect PASS (3)**

- [ ] **Step 5: Commit**

```powershell
git add src/components/desktop/module/ModuleTabs.jsx src/components/desktop/module/__tests__/ModuleTabs.test.jsx
git commit -m "feat(module-kit): add ModuleTabs (query-param synced)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: ModuleHeader

**Files:**
- Create: `src/components/desktop/module/ModuleHeader.jsx`
- Test: `src/components/desktop/module/__tests__/ModuleHeader.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ModuleHeader from "@/components/desktop/module/ModuleHeader";

describe("ModuleHeader", () => {
  it("renders title, subtitle, and stat cluster", () => {
    const { getByText, getByRole } = render(
      <ModuleHeader page="RFIs" title="RFIs" subtitle="Requests for information"
        stats={[{ label: "Open", value: 14, tone: "gold" }, { label: "Overdue", value: 3, tone: "danger" }]} />,
    );
    expect(getByRole("heading", { name: "RFIs" })).toBeTruthy();
    expect(getByText("Requests for information")).toBeTruthy();
    expect(getByText("Open")).toBeTruthy();
    expect(getByText("14")).toBeTruthy();
  });
  it("renders the photo as a background img when one is provided", () => {
    const { container } = render(
      <ModuleHeader page="RFIs" title="RFIs" photoSrc="/photos/desktop/RFIs.webp" />,
    );
    const img = container.querySelector("img.desk-module-header__photo");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toContain("RFIs.webp");
  });
  it("renders actions and a tabs slot via children", () => {
    const { getByText } = render(
      <ModuleHeader page="RFIs" title="RFIs" actions={<button>New RFI</button>}>
        <div>TABS</div>
      </ModuleHeader>,
    );
    expect(getByText("New RFI")).toBeTruthy();
    expect(getByText("TABS")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Create `src/components/desktop/module/ModuleHeader.jsx`**

```jsx
/**
 * ModuleHeader — the photo-accent identity band that opens every module page.
 * Reuses the module's launcher photo (photoFor) as a darkened banner; falls
 * back to a dark gradient when none exists. Icon + title + subtitle on the
 * left; KPI stat cluster + actions on the right; optional tabs via children.
 * White text on the dark band in both themes (mirrors ModuleTile).
 */
import React, { useState } from "react";
import { getPageIcon } from "@/config/pageIcons";
import { photoFor } from "@/config/launcherConfig";
import StatTile from "./StatTile";

export default function ModuleHeader({ page, title, subtitle, stats = [], actions, photoSrc, children }) {
  const Icon = getPageIcon(page);
  const photo = photoSrc ?? photoFor(page);
  const [imgFailed, setImgFailed] = useState(false);
  const showPhoto = !!photo && !imgFailed;

  return (
    <header className="desk-module-header">
      {showPhoto && (
        <img
          className="desk-module-header__photo"
          src={photo}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      )}
      <span className="desk-module-header__scrim" aria-hidden="true" />
      <div className="desk-module-header__main">
        <div className="desk-module-header__id">
          <Icon size={28} color="#fff" strokeWidth={1.6} aria-hidden="true" style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.65))" }} />
          <div>
            <h1 className="desk-module-header__title">{title}</h1>
            {subtitle ? <p className="desk-module-header__subtitle">{subtitle}</p> : null}
          </div>
        </div>
        <div className="desk-module-header__right">
          {stats.length > 0 && (
            <div className="desk-module-header__stats">
              {stats.map((s) => <StatTile key={s.label} label={s.label} value={s.value} tone={s.tone} />)}
            </div>
          )}
          {actions ? <div className="desk-module-header__actions">{actions}</div> : null}
        </div>
      </div>
      {children ? <div className="desk-module-header__tabs">{children}</div> : null}
    </header>
  );
}
```

- [ ] **Step 4: Run test — expect PASS (3)**

- [ ] **Step 5: Commit**

```powershell
git add src/components/desktop/module/ModuleHeader.jsx src/components/desktop/module/__tests__/ModuleHeader.test.jsx
git commit -m "feat(module-kit): add ModuleHeader (photo-accent band)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Barrel export + full validation

**Files:**
- Create: `src/components/desktop/module/index.js`

- [ ] **Step 1: Create `src/components/desktop/module/index.js`**

```js
export { default as ModuleHeader } from "./ModuleHeader";
export { default as SectionCard } from "./SectionCard";
export { default as StatTile } from "./StatTile";
export { default as StatusPill } from "./StatusPill";
export { default as DataTable } from "./DataTable";
export { default as ModuleTabs } from "./ModuleTabs";
export { default as EmptyState } from "./states/EmptyState";
export { default as ErrorState } from "./states/ErrorState";
export { default as PermissionDenied } from "./states/PermissionDenied";
export { default as LoadingSkeleton } from "./states/LoadingSkeleton";
```

- [ ] **Step 2: Run the full kit test suite**

Run: `npx vitest run src/components/desktop/module --maxWorkers=2 2>&1 | Select-Object -Last 30`
Expected: all kit tests PASS.

- [ ] **Step 3: Validation ladder**

Run each, expect EXIT 0:
```powershell
npm run lint 2>&1 | Select-Object -Last 20; Write-Host "EXIT: $LASTEXITCODE"
npm run typecheck:strict 2>&1 | Select-Object -Last 12; Write-Host "EXIT: $LASTEXITCODE"
npm run typecheck:noimplicitany 2>&1 | Select-Object -Last 12; Write-Host "EXIT: $LASTEXITCODE"
npx vitest run --maxWorkers=2 2>&1 | Select-Object -Last 12; Write-Host "EXIT: $LASTEXITCODE"
node ./node_modules/vite/bin/vite.js build 2>&1 | Select-Object -Last 12; Write-Host "EXIT: $LASTEXITCODE"
```

- [ ] **Step 4: Commit**

```powershell
git add src/components/desktop/module/index.js
git commit -m "feat(module-kit): add barrel export; kit complete" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage (§4 kit):** ModuleHeader (Task 8) ✓; SectionCard (Task 4) ✓; StatTile (Task 2) ✓; DataTable + StatusPill (Tasks 6, 3) ✓; States kit (Task 5) ✓; in-module tabs (Task 7) ✓; layout/tokens + light/contrast/motion variants (Task 1 CSS) ✓; charts = used inside SectionCard (no new component needed — documented) ✓; theming/density/a11y (Task 1 media query + focus rings from Phase 1 desktop.css + roles/headings in components) ✓. Flagship (§5) = Plan 2B, intentionally out of scope.

**Placeholder scan:** none — every component + test has complete code.

**Type/name consistency:** class names in Task 1 CSS (`desk-stat`, `desk-stat__label/__value`, `desk-stat--{tone}`, `desk-status-pill[--tone]`, `desk-section-card[__head/__title/__action/__body]`, `desk-table`/`is-num`, `desk-module-tabs`/`desk-module-tab`/`is-active`, `desk-module-header[__photo/__scrim/__main/__id/__title/__subtitle/__right/__stats/__actions/__tabs]`, `desk-state[__title/__msg]`, `desk-skeleton`) match every consuming component (Tasks 2–8). Component prop names (`page`, `title`, `subtitle`, `stats:[{label,value,tone}]`, `actions`, `photoSrc`, `columns:[{key,label,align,render}]`, `rows`, `rowKey`, `loading`, `emptyMessage`, `tabs:[{id,label}]`, `param`, `defaultTab`) are consistent across tests + implementations. `StatTile` tone set matches the CSS `--{tone}` classes. `ModuleHeader` reuses `photoFor`/`getPageIcon` (real exports, verified in Phase 1).
