import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useProjectContext } from "@/components/shared/useProjectContext";
import ScopeItemFormModal from "@/components/scope/ScopeItemFormModal";
import ScopeItemList from "@/components/scope/ScopeItemList";

const panel = {
  background: "linear-gradient(180deg, rgba(31,33,37,0.96), rgba(12,14,17,0.98))",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

const types = ["Scope", "Exclusion", "Clarification"];
const categories = ["Structural", "Misc Metals", "Connections", "Coatings", "Erection", "Engineering", "Other"];

export default function ScopeExclusions() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [search, setSearch] = useState("");

  const { data: scopeItems = [] } = useQuery({
    queryKey: ["scope-items", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ScopeItem.filter({ project_id: projectId }, "-created_date")
        : base44.entities.ScopeItem.list("-created_date"),
    initialData: [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return scopeItems.filter((item) => {
      const typeMatch = filterType === "all" || item.item_type === filterType;
      const categoryMatch = filterCategory === "all" || item.category === filterCategory;
      const searchMatch =
        !term ||
        item.description?.toLowerCase().includes(term) ||
        item.notes?.toLowerCase().includes(term) ||
        item.added_by?.toLowerCase().includes(term);
      return typeMatch && categoryMatch && searchMatch;
    });
  }, [scopeItems, filterType, filterCategory, search]);

  const stats = useMemo(
    () => ({
      total: scopeItems.length,
      scope: scopeItems.filter((i) => i.item_type === "Scope").length,
      exclusion: scopeItems.filter((i) => i.item_type === "Exclusion").length,
      clarification: scopeItems.filter((i) => i.item_type === "Clarification").length,
    }),
    [scopeItems]
  );

  const notes = useMemo(
    () => filtered.filter((item) => item.item_type !== "Scope").slice(0, 5),
    [filtered]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section
        style={{
          ...panel,
          padding: 24,
          background:
            "radial-gradient(circle at top right, rgba(255,107,0,0.14), transparent 30%), radial-gradient(circle at left center, rgba(0,229,255,0.08), transparent 24%), linear-gradient(180deg, rgba(31,33,37,0.96), rgba(9,10,11,0.99))",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.85fr)", gap: 20 }}>
          <div>
            <div style={eyebrow}>Scope Register</div>
            <h1 style={titleStyle}>A real commercial scope command page, not a loose note list.</h1>
            <p style={bodyStyle}>
              Organize scope, exclusions, and clarifications in a format teams can review during buyout, turnover, and change management without losing commercial intent.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 18 }}>
              <MetricCard label="Total Items" value={stats.total} tone="var(--text-primary)" />
              <MetricCard label="Scope" value={stats.scope} tone="var(--status-success)" />
              <MetricCard label="Exclusions" value={stats.exclusion} tone="var(--status-error)" />
              <MetricCard label="Clarifications" value={stats.clarification} tone="var(--secondary)" />
            </div>
          </div>

          <div style={{ ...panel, padding: 18, background: "rgba(12,14,17,0.82)" }}>
            <div style={sectionLabel}>Commercial Focus</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
              {selectedProject?.name || "Portfolio Scope View"}
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
              <InfoRow label="Visible Items" value={filtered.length} />
              <InfoRow label="Open Exclusions" value={stats.exclusion} tone={stats.exclusion ? "var(--status-warning)" : "var(--text-primary)"} />
              <InfoRow label="Clarification Volume" value={stats.clarification} tone={stats.clarification ? "var(--accent)" : "var(--text-primary)"} />
            </div>
            <button onClick={() => setShowForm(true)} style={primaryBtn}>
              Create Scope Item
            </button>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 18, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ ...panel, padding: 18 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto auto", gap: 12, alignItems: "center" }}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search description, notes, or added by..."
              />
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                <option value="all">All Types</option>
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                <option value="all">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ ...panel, padding: 18 }}>
            <div style={sectionLabel}>Scope Ledger</div>
            <ScopeItemList items={filtered} />
          </div>
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ ...panel, padding: 18 }}>
            <div style={sectionLabel}>Review Queue</div>
            {notes.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {notes.map((item) => (
                  <div key={item.id} style={noteCard}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                      {item.item_type} · {item.category}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.55 }}>
                      {item.description}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
                No exclusion or clarification items are currently in the visible set.
              </div>
            )}
          </div>
        </aside>
      </section>

      {showForm && <ScopeItemFormModal projectId={projectId} onClose={() => setShowForm(false)} />}
    </div>
  );
}

function MetricCard({ label, value, tone }) {
  return (
    <div style={{ ...panel, padding: 16, background: "rgba(12,14,17,0.78)" }}>
      <div style={sectionLabel}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, lineHeight: 1, color: tone }}>{value}</div>
    </div>
  );
}

function InfoRow({ label, value, tone = "var(--text-primary)" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--divider)", paddingBottom: 8 }}>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: tone }}>{value}</span>
    </div>
  );
}

const eyebrow = {
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--secondary)",
  marginBottom: 10,
};

const titleStyle = {
  fontFamily: "var(--font-display)",
  fontSize: "clamp(30px,4vw,48px)",
  fontWeight: 800,
  lineHeight: 1.02,
  letterSpacing: "-0.04em",
  margin: 0,
  color: "var(--text-primary)",
};

const bodyStyle = {
  margin: "12px 0 0",
  maxWidth: 720,
  fontSize: 15,
  lineHeight: 1.6,
  color: "var(--text-secondary)",
};

const sectionLabel = {
  fontFamily: "var(--font-body)",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 10,
};

const primaryBtn = {
  width: "100%",
  background: "var(--accent)",
  color: "var(--on-accent)",
  border: "none",
  borderRadius: "var(--radius-btn)",
  padding: "9px 16px",
  fontFamily: "var(--font-body)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  cursor: "pointer",
};

const noteCard = {
  padding: "10px 12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid var(--divider)",
  borderRadius: "var(--radius-card)",
};
