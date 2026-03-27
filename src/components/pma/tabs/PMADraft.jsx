import React, { useState } from "react";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { usePMA } from "../usePMAContext";
import { base44 } from "@/api/base44Client";

const DRAFT_TYPES = [
  { id: "weekly", label: "Weekly Update", icon: "📊", desc: "Full project status to GC", recipient: "GC / Owner" },
  { id: "rfi_status", label: "RFI Status Report", icon: "📋", desc: "Open/overdue RFI summary", recipient: "EOR / GC" },
  { id: "delay_notice", label: "Delay Notice", icon: "⚠", desc: "Formal notification of delay", recipient: "GC / Owner" },
  { id: "delivery_alert", label: "Delivery Alert", icon: "🚛", desc: "Upcoming / late deliveries", recipient: "Field Super" },
  { id: "co_justification", label: "CO Justification", icon: "💰", desc: "Change order memo", recipient: "GC / Owner" },
  { id: "submittal_followup", label: "Submittal Follow-Up", icon: "📐", desc: "Chase overdue EOR response", recipient: "EOR" },
  { id: "fab_status", label: "Fab Status Report", icon: "🏗", desc: "Shop production update", recipient: "PM / Owner" },
  { id: "meeting_minutes", label: "Meeting Minutes", icon: "📝", desc: "Action items + decisions", recipient: "All Parties" },
  { id: "custom", label: "Custom", icon: "✏", desc: "You describe what you need", recipient: "Custom" },
];

export default function PMADraft() {
  const { activeProject } = useProjectContext();
  const { projectSnapshot, generateInsights } = usePMA();

  const [draftType, setDraftType] = useState("weekly");
  const [recipient, setRecipient] = useState(DRAFT_TYPES[0].recipient);
  const [customContext, setCustomContext] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const buildPrompt = () => {
    const data = JSON.stringify(projectSnapshot || {}, null, 2);
    const ctx = customContext ? `Extra context: ${customContext}\n` : "";
    switch (draftType) {
      case "weekly":
        return `${ctx}Write a professional weekly project status update email for ${activeProject?.name}. Include: WORK IN PROGRESS, SUBMITTALS/RFIs, UPCOMING DELIVERIES, SCHEDULE, ISSUES/ACTIONS REQUIRED. No placeholders. Recipient: ${recipient}\nDATA:${data}`;
      case "rfi_status":
        return `${ctx}Write an RFI status report email listing all open RFIs, calling out overdue items with dates. Reference actual RFI numbers. Recipient: ${recipient}\nDATA:${data}`;
      case "delay_notice":
        return `${ctx}Draft a formal delay notice letter for ${activeProject?.name}, referencing causes from data (overdue RFIs, late deliveries, approval delays). Formal contract language.\nDATA:${data}`;
      case "delivery_alert":
        return `${ctx}Delivery coordination email listing deliveries due in the next 7 days with dates, vendor, tonnage, issues. Actions needed for receiving. Recipient: ${recipient}\nDATA:${data}`;
      case "co_justification":
        return `${ctx}Change order justification memo for ${activeProject?.name}. Summarize pending COs, basis, value. Professional tone.\nDATA:${data}`;
      case "submittal_followup":
        return `${ctx}Professional follow-up email to the EOR for overdue submittals. Reference numbers and days overdue. Firm but professional. Recipient: ${recipient}\nDATA:${data}`;
      case "fab_status":
        return `${ctx}Fabrication status report: WPs in progress with %, recently completed WPs and tonnage, upcoming releases, shop issues/holds.\nDATA:${data}`;
      case "meeting_minutes":
        return `${ctx}Generate production meeting minutes template for ${activeProject?.name}. Include: Date, Attendees (blank), Project Status Summary using data, Open Action Items, Decisions Needed, Next Meeting. Professional format.\nDATA:${data}`;
      case "custom":
      default:
        return `${ctx}${customContext}\nUse real project data where helpful.\nDATA:${data}`;
    }
  };

  const generate = async () => {
    setIsGenerating(true);
    try {
      const prompt = buildPrompt();
      const res = await base44.functions.invoke("anthropicProxy", { prompt });
      const text = typeof res === "string" ? res : res?.text || res?.content || res?.response || "";
      setDraftContent(text);
      setIsEditing(false);
    } catch (e) {
      setDraftContent("Could not generate draft.");
    } finally {
      setIsGenerating(false);
    }
  };

  const selected = DRAFT_TYPES.find((d) => d.id === draftType);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {DRAFT_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => {
              setDraftType(type.id);
              setRecipient(type.recipient);
            }}
            style={{
              border: "1px solid " + (draftType === type.id ? "var(--accent-border)" : "var(--border-default)"),
              background: draftType === type.id ? "var(--accent-muted)" : "var(--bg-surface)",
              borderRadius: 8,
              padding: 10,
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 18, marginBottom: 4 }}>{type.icon}</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>{type.label}</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)" }}>{type.desc}</div>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 8, padding: 12 }}>
        <label style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em" }}>TO:</label>
        <input value={recipient} onChange={(e) => setRecipient(e.target.value)} style={{ padding: "8px 10px", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-primary)" }} />

        <label style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em" }}>ADDITIONAL CONTEXT:</label>
        <textarea value={customContext} onChange={(e) => setCustomContext(e.target.value)} rows={3} placeholder="Any specific details to include? (optional)" style={{ padding: 10, background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-primary)", fontFamily: "var(--font-body)" }} />

        <button
          onClick={generate}
          disabled={isGenerating}
          style={{
            marginTop: 6,
            background: "var(--accent)",
            border: "1px solid var(--accent-border)",
            color: "#002E6A",
            borderRadius: 8,
            padding: "10px 16px",
            ...mono,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: isGenerating ? "not-allowed" : "pointer",
            opacity: isGenerating ? 0.6 : 1,
          }}
        >
          {isGenerating ? "Generating..." : `✦ Generate ${selected?.label || "Draft"}`}
        </button>
      </div>

      {draftContent && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            readOnly={!isEditing}
            rows={12}
            style={{
              width: "100%",
              background: "rgba(0,0,0,0.2)",
              border: "1px solid rgba(139,92,246,0.2)",
              borderRadius: 8,
              padding: 12,
              color: "var(--text-primary)",
              fontFamily: "var(--font-body)",
              fontSize: 12,
              lineHeight: 1.7,
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                navigator.clipboard.writeText(draftContent || "");
              }}
              style={btnStyle}
            >
              📋 Copy
            </button>
            <button onClick={generate} style={btnStyle}>
              🔄 Regenerate
            </button>
            <button
              onClick={() => {
                const mailto = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(selected?.label || "Project Update")}&body=${encodeURIComponent(draftContent)}`;
                window.location.href = mailto;
              }}
              style={btnStyle}
            >
              📧 Open in Mail
            </button>
            <button
              onClick={() => setIsEditing((p) => !p)}
              style={btnStyle}
            >
              ✏ {isEditing ? "Stop Editing" : "Edit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: 6,
  padding: "6px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  cursor: "pointer",
  color: "var(--text-primary)",
};
