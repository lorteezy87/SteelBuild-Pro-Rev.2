import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useProjectContext } from "../components/shared/useProjectContext";
import ProjectCloseoutForm from "@/components/closeout/ProjectCloseoutForm";
import ProjectCloseoutChecklist from "@/components/closeout/ProjectCloseoutChecklist";
import ProjectCloseoutSummary from "@/components/closeout/ProjectCloseoutSummary";

const panel = {
  background: "linear-gradient(180deg, rgba(31,33,37,0.96), rgba(12,14,17,0.98))",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-card)",
  boxShadow: "var(--shadow-card)",
};

const tabs = [
  { label: "Checklist", id: "checklist" },
  { label: "Summary", id: "summary" },
  { label: "Lessons Learned", id: "lessons" },
];

export default function ProjectCloseout() {
  const [searchParams] = useSearchParams();
  const { activeProject } = useProjectContext();
  const projectId = searchParams.get("project") || activeProject?.id || null;
  const [activeTab, setActiveTab] = useState("checklist");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list(),
    initialData: [],
  });

  const { data: closeouts = [] } = useQuery({
    queryKey: ["closeouts", projectId],
    queryFn: () =>
      projectId
        ? base44.entities.ProjectCloseout.filter({ project_id: projectId })
        : base44.entities.ProjectCloseout.list("-created_date"),
    initialData: [],
  });

  const selectedProject = projectId ? projects.find((p) => p.id === projectId) : null;
  const projectCloseout = closeouts[0] || null;
  const qc = useQueryClient();

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.ProjectCloseout.create({ ...data, project_id: data.project_id || projectId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closeouts", projectId] });
      toast.success("Closeout record created");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: (data) => base44.entities.ProjectCloseout.update(data.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closeouts", projectId] });
      toast.success("Closeout updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = (data) => {
    if (projectCloseout) updateMut.mutate({ ...data, id: projectCloseout.id });
    else createMut.mutate(data);
  };

  const progress = useMemo(() => {
    if (!projectCloseout) return { completed: 0, total: 6, percent: 0 };
    const keys = [
      "final_inspection_completed",
      "punch_list_cleared",
      "all_invoices_processed",
      "warranties_registered",
      "as_built_docs_completed",
      "permits_closed",
    ];
    const completed = keys.filter((key) => projectCloseout[key]).length;
    return { completed, total: keys.length, percent: Math.round((completed / keys.length) * 100) };
  }, [projectCloseout]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <section
        style={{
          ...panel,
          padding: 24,
          background:
            "radial-gradient(circle at top right, rgba(255,107,0,0.14), transparent 30%), radial-gradient(circle at left center, rgba(0,229,255,0.08), transparent 26%), linear-gradient(180deg, rgba(31,33,37,0.96), rgba(9,10,11,0.99))",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.7fr) minmax(280px, 0.85fr)", gap: 20 }}>
          <div>
            <div style={eyebrow}>Closeout Command</div>
            <h1 style={titleStyle}>Turn over steel projects with traceable closeout, not scattered punchlists.</h1>
            <p style={bodyStyle}>
              This page is now organized around completion pressure, handover readiness, and lessons learned so closeout can operate like a controlled final phase instead of an afterthought.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 18 }}>
              <MetricCard label="Checklist Complete" value={`${progress.percent}%`} tone="var(--accent)" />
              <MetricCard label="Completed Items" value={`${progress.completed}/${progress.total}`} tone="var(--status-success)" />
              <MetricCard label="Closeout Status" value={projectCloseout?.closeout_status || "Not Started"} tone="var(--secondary)" compact />
            </div>
          </div>

          <div style={{ ...panel, padding: 18, background: "rgba(12,14,17,0.82)" }}>
            <div style={sectionLabel}>Project Handover</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--text-primary)", marginBottom: 14 }}>
              {selectedProject?.name || "Select Project"}
            </div>
            <div style={{ display: "grid", gap: 10, marginBottom: !projectCloseout ? 16 : 0 }}>
              <InfoRow label="Completion Date" value={projectCloseout?.completion_date ? new Date(projectCloseout.completion_date).toLocaleDateString() : "Not set"} />
              <InfoRow label="Handover" value={projectCloseout?.handover_date ? new Date(projectCloseout.handover_date).toLocaleDateString() : "Not set"} />
              <InfoRow label="Client Sign-Off" value={projectCloseout?.client_sign_off_date ? new Date(projectCloseout.client_sign_off_date).toLocaleDateString() : "Pending"} tone={projectCloseout?.client_sign_off_date ? "var(--status-success)" : "var(--status-warning)"} />
            </div>
            {!projectCloseout && (
              <button
                onClick={() => {
                  const formSection = document.getElementById("closeout-create-form");
                  formSection?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                style={{
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
                }}
              >
                + Create Closeout Record
              </button>
            )}
          </div>
        </div>
      </section>

      {!projectCloseout ? (
        <section id="closeout-create-form" style={{ ...panel, padding: 20 }}>
          <div style={sectionLabel}>Start Closeout</div>
          <ProjectCloseoutForm projectId={projectId} selectedProject={selectedProject} onSave={handleSave} />
        </section>
      ) : (
        <section style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
          <aside style={{ ...panel, padding: 18 }}>
            <div style={sectionLabel}>Closeout Stages</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: "var(--radius-card)",
                    border: activeTab === tab.id ? "1px solid var(--accent-border)" : "1px solid var(--divider)",
                    background: activeTab === tab.id ? "var(--accent-muted)" : "rgba(255,255,255,0.02)",
                    color: activeTab === tab.id ? "var(--accent)" : "var(--text-secondary)",
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </aside>

          <div style={{ ...panel, padding: 18 }}>
            {activeTab === "checklist" && (
              <ProjectCloseoutChecklist
                closeout={projectCloseout}
                onUpdate={(data) => updateMut.mutate({ ...data, id: projectCloseout.id })}
              />
            )}
            {activeTab === "summary" && (
              <ProjectCloseoutSummary
                closeout={projectCloseout}
                onUpdate={(data) => updateMut.mutate({ ...data, id: projectCloseout.id })}
              />
            )}
            {activeTab === "lessons" && <ProjectCloseoutLessons closeout={projectCloseout} />}
          </div>
        </section>
      )}
    </div>
  );
}

function ProjectCloseoutLessons({ closeout }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
      <LessonCard title="Successes" tone="var(--status-success)" body={closeout.project_successes || "No successes documented yet."} />
      <LessonCard title="Challenges" tone="var(--status-warning)" body={closeout.challenges_faced || "No challenges documented yet."} />
      <LessonCard title="Recommendations" tone="var(--secondary)" body={closeout.recommendations || "No recommendations documented yet."} />
      <div style={{ ...panel, padding: 18, gridColumn: "1 / -1" }}>
        <div style={sectionLabel}>Lessons Learned</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          {closeout.lessons_learned || "No lessons learned documented yet."}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone, compact = false }) {
  return (
    <div style={{ ...panel, padding: 16, background: "rgba(12,14,17,0.78)" }}>
      <div style={sectionLabel}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: compact ? 20 : 30, fontWeight: 800, lineHeight: 1.05, color: tone }}>
        {value}
      </div>
    </div>
  );
}

function InfoRow({ label, value, tone = "var(--text-primary)" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid var(--divider)", paddingBottom: 8 }}>
      <span style={{ fontFamily: "var(--font-body)", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: tone, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function LessonCard({ title, tone, body }) {
  return (
    <div style={{ ...panel, padding: 18 }}>
      <div style={{ ...sectionLabel, color: tone }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.65 }}>{body}</div>
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
