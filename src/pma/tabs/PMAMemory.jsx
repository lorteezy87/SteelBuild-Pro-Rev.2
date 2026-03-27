import React, { useEffect, useMemo, useState } from "react";
import { usePMA } from "../usePMAContext";
import DecisionTrail from "./DecisionTrail";
import ActiveAssumptions from "./ActiveAssumptions";
import { useProjectContext } from "@/components/shared/useProjectContext";

const mono = { fontFamily: "var(--font-mono)" };

export default function PMAMemory() {
  const { pmMemory, pinnedMessages, setPinnedMessages, projectSnapshot, conversationHistory, lastRefreshed } = usePMA();
  const { activeProject } = useProjectContext();

  const [instructions, setInstructions] = useState(() => {
    try {
      return localStorage.getItem("pma_custom_instructions") || "";
    } catch {
      return "";
    }
  });
  const [pmNotes, setPMNotes] = useState(() => {
    try {
      return localStorage.getItem(`pma-notes-${activeProject?.id || "global"}`) || "";
    } catch {
      return "";
    }
  });
  const [savedConfirm, setSavedConfirm] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(`pma-notes-${activeProject?.id || "global"}`, pmNotes);
        setSavedConfirm(true);
        setTimeout(() => setSavedConfirm(false), 1200);
      } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [pmNotes, activeProject?.id]);

  const contextSummary = useMemo(() => {
    if (!projectSnapshot) return null;
    const overdueRFIs = projectSnapshot.rfis?.filter((r) => r.date_required && new Date(r.date_required) < new Date() && !["Answered", "Closed"].includes(r.status)) || [];
    const activeWPs = projectSnapshot.workPackages?.filter((w) => w.status === "In Progress") || [];
    const lateDeliveries = projectSnapshot.deliveries?.filter((d) => d.scheduled_date && new Date(d.scheduled_date) < new Date() && d.status !== "Delivered") || [];
    const pendingCOs = projectSnapshot.changeOrders?.filter((c) => ["Submitted", "Under Review"].includes(c.status)) || [];
    return {
      project: projectSnapshot.project?.name,
      phase: projectSnapshot.project?.phase,
      rfis: projectSnapshot.rfis?.length || 0,
      overdueRFIs: overdueRFIs.length,
      wps: projectSnapshot.workPackages?.length || 0,
      activeWPs: activeWPs.length,
      deliveries: projectSnapshot.deliveries?.length || 0,
      lateDeliveries: lateDeliveries.length,
      changeOrders: projectSnapshot.changeOrders?.length || 0,
      pendingCOs: pendingCOs.length,
      lastRefreshed,
      chatMessages: conversationHistory.length,
      role: pmMemory?.role,
    };
  }, [projectSnapshot, pmMemory, conversationHistory.length, lastRefreshed]);

  const handleSaveInstructions = () => {
    try {
      localStorage.setItem("pma_custom_instructions", instructions);
      setSavedConfirm(true);
      setTimeout(() => setSavedConfirm(false), 3000);
    } catch (err) {
      console.error("Save failed:", err);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {activeProject && <DecisionTrail projectId={activeProject.id} />}
      {activeProject && <ActiveAssumptions projectId={activeProject.id} />}

      {/* Pinned messages */}
      {pinnedMessages.length > 0 && (
        <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.15)", borderRadius: 8, padding: 10 }}>
          <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
            📌 Pinned from Chat
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pinnedMessages.map((msg, idx) => (
              <div key={idx} style={{ position: "relative", padding: "8px 10px", background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                <button
                  onClick={() => setPinnedMessages((prev) => prev.filter((_, i) => i !== idx))}
                  style={{ position: "absolute", top: 6, right: 6, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}
                  title="Unpin"
                >
                  ×
                </button>
                {msg.content}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scratchpad */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8, padding: 10 }}>
        <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
          My Notes
        </div>
        <textarea
          value={pmNotes}
          onChange={(e) => setPMNotes(e.target.value)}
          rows={8}
          placeholder="Type anything... meeting notes, reminders, ideas. Auto-saved."
          style={{
            width: "100%",
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            color: "var(--text-primary)",
            padding: "10px",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            lineHeight: 1.5,
            resize: "vertical",
          }}
        />
        {savedConfirm && <div style={{ ...mono, fontSize: 9, color: "var(--status-success)", marginTop: 4 }}>Saved</div>}
      </div>

      {/* Context summary */}
      {contextSummary && (
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8, padding: 10 }}>
          <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
            What PMA Knows Right Now
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            <li>Project: {contextSummary.project || "—"} | Phase: {contextSummary.phase || "—"}</li>
            <li>{contextSummary.rfis} RFIs loaded ({contextSummary.overdueRFIs} overdue)</li>
            <li>{contextSummary.wps} Work packages ({contextSummary.activeWPs} active)</li>
            <li>{contextSummary.deliveries} Deliveries ({contextSummary.lateDeliveries} late)</li>
            <li>{contextSummary.changeOrders} Change Orders ({contextSummary.pendingCOs} pending)</li>
            <li>Last briefing: {contextSummary.lastRefreshed ? new Date(contextSummary.lastRefreshed).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</li>
            <li>Chat history: {contextSummary.chatMessages} messages</li>
            <li>Role: {contextSummary.role || "—"}</li>
          </ul>
        </div>
      )}

      {/* Custom Instructions */}
      <div>
        <div
          style={{
            ...mono,
            fontSize: 8,
            fontWeight: 700,
            color: "var(--accent)",
            letterSpacing: "0.08em",
            marginBottom: 8,
            textTransform: "uppercase",
          }}
        >
          📝 Custom Instructions
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            background: "var(--accent-muted)",
            border: "1px solid var(--accent-border)",
            borderRadius: 8,
            padding: 8,
          }}
        >
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Tell PMA how you work..."
            rows={8}
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "var(--bg-input)",
              border: "1px solid var(--accent-border)",
              borderRadius: 6,
              padding: "8px 10px",
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 10,
              lineHeight: 1.4,
              outline: "none",
              resize: "vertical",
            }}
          />
          <button
            onClick={handleSaveInstructions}
            style={{
              marginTop: 6,
              width: "100%",
              background: savedConfirm ? "rgba(0,214,143,0.15)" : "linear-gradient(135deg,var(--accent),var(--secondary))",
              border: "1px solid",
              borderColor: savedConfirm ? "var(--success-border)" : "var(--accent-border)",
              borderRadius: 8,
              padding: "9px 20px",
              color: savedConfirm ? "var(--status-success)" : "white",
              ...mono,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.10em",
              cursor: "pointer",
            }}
          >
            {savedConfirm ? "✓ SAVED" : "↑ SAVE INSTRUCTIONS"}
          </button>
        </div>
      </div>

      <button
        onClick={() => {
          if (window.confirm("Clear all custom instructions?")) {
            localStorage.removeItem("pma_custom_instructions");
            setInstructions("");
          }
        }}
        style={{
          background: "rgba(255,61,61,0.10)",
          border: "1px solid rgba(255,61,61,0.2)",
          borderRadius: 6,
          padding: "6px 12px",
          color: "var(--status-error)",
          ...mono,
          fontSize: 9,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        CLEAR INSTRUCTIONS
      </button>
    </div>
  );
}
