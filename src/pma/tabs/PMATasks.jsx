import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { usePMA } from "../usePMAContext";
import { useProjectContext } from "../../shared/useProjectContext";
import { getEscalationLevel, getEscalationStyle, countEscalations } from "../utils/escalationLogic";

const mono = { fontFamily: "var(--font-mono)" };

export default function PMATasks() {
  const { tasks, setTasks } = usePMA();
  const { activeProject } = useProjectContext();
  const [actionItems, setActionItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [risks, setRisks] = useState([]);
  const [byAssignee, setByAssignee] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickDue, setQuickDue] = useState("");
  const [quickWho, setQuickWho] = useState("");

  useEffect(() => {
    if (!activeProject?.id) return;
    const load = async () => {
      try {
        setIsLoading(true);
        const items = await base44.entities.ActionItem.filter({ project_id: activeProject.id });
        setActionItems(items || []);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [activeProject]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const in7 = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d;
  }, [today]);

  const openActionItems = actionItems.filter((a) => ["Open", "In Progress"].includes(a.status));
  const overdue = openActionItems.filter((a) => a.due_date && new Date(a.due_date) < today);
  const dueThisWeek = openActionItems.filter(
    (a) => a.due_date && new Date(a.due_date) >= today && new Date(a.due_date) <= in7
  );
  const assignees = useMemo(() => {
    const names = new Set(openActionItems.map((a) => a.assigned_to).filter(Boolean));
    return Array.from(names);
  }, [openActionItems]);

  const updateActionItemStatus = async (id, status) => {
    try {
      await base44.entities.ActionItem.update(id, {
        status,
        resolved_date: status === "Complete" ? new Date().toISOString().split("T")[0] : null,
      });
      setActionItems((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    } catch (e) {
      console.error("Failed to update action item:", e);
    }
  };

  const toggleTask = (id) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  const removeTask = (id) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const addQuickTask = async () => {
    if (!quickTitle.trim()) return;
    try {
      const created = await base44.entities.ActionItem.create({
        project_id: activeProject?.id,
        title: quickTitle.trim(),
        assigned_to: quickWho || null,
        due_date: quickDue || null,
        status: "Open",
      });
      setActionItems((prev) => [created, ...prev]);
      setQuickTitle("");
      setQuickDue("");
      setQuickWho("");
    } catch (e) {
      console.error("Create failed", e);
    }
  };

  const escalationCount = countEscalations(actionItems, risks);

  if ((tasks.length === 0 && actionItems.length === 0) || isLoading) {
    return (
      <div style={{ textAlign: "center", padding: "20px 0", color: "rgba(160,175,210,0.4)" }}>
        <div style={{ fontSize: 12, marginBottom: 8 }}>{isLoading ? "Loading action items..." : "No tasks yet"}</div>
        <div style={{ fontSize: 10 }}>{isLoading ? "Please wait" : 'Create tasks by typing "assign X to Y"'}</div>
      </div>
    );
  }

  const groupedByAssignee = useMemo(() => {
    return openActionItems.reduce((acc, a) => {
      const key = a.assigned_to || "Unassigned";
      acc[key] = acc[key] || [];
      acc[key].push(a);
      return acc;
    }, {});
  }, [openActionItems]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {overdue.length > 0 && (
        <div
          style={{
            background: "var(--danger-muted)",
            border: "1px solid var(--danger-border)",
            borderRadius: 8,
            padding: "8px 12px",
            ...mono,
            fontSize: 10,
            color: "var(--status-error)",
          }}
        >
          ⚠ {overdue.length} ACTION ITEM{overdue.length > 1 ? "S" : ""} OVERDUE · {overdue.slice(0, 3).map((o) => o.title).join(" · ")}
        </div>
      )}

      <Section title="Due This Week">
        {dueThisWeek.length === 0 ? (
          <Empty text="No items due in next 7 days" success />
        ) : (
          dueThisWeek.map((item) => {
            const days = Math.max(0, Math.ceil((new Date(item.due_date) - today) / 86400000));
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ ...mono, fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "var(--bg-surface-high)", border: "1px solid var(--divider)" }}>
                  {item.assigned_to || "Unassigned"}
                </span>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)" }}>{item.title}</span>
                <span
                  style={{
                    marginLeft: "auto",
                    ...mono,
                    fontSize: 9,
                    color: days <= 3 ? "var(--status-error)" : "var(--status-warning)",
                    background: "var(--bg-surface-high)",
                    padding: "2px 6px",
                    borderRadius: 4,
                  }}
                >
                  {days === 0 ? "TODAY" : `${days}d`}
                </span>
              </div>
            );
          })
        )}
      </Section>

      {escalationCount > 0 && (
        <div
          style={{
            background: "rgba(255,61,61,0.10)",
            border: "1px solid rgba(255,61,61,0.25)",
            borderRadius: 8,
            padding: "8px 12px",
            ...mono,
            fontSize: 9,
            fontWeight: 700,
            color: "#FF3D3D",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          ⚡ {escalationCount} item{escalationCount > 1 ? "s" : ""} need escalation
        </div>
      )}

      <Section title="Action Items">
        {openActionItems.length === 0 ? (
          <Empty text="No open action items" />
        ) : byAssignee ? (
          Object.entries(groupedByAssignee).map(([assignee, items]) => (
            <div key={assignee} style={{ marginBottom: 8 }}>
              <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
                {assignee} · {items.length}
              </div>
              {items.map((item) => renderActionItem(item))}
            </div>
          ))
        ) : (
          openActionItems.map((item) => renderActionItem(item))
        )}
      </Section>

      {tasks.filter((t) => !t.completed).length > 0 && (
        <Section title="Quick Notes">
          {tasks
            .filter((t) => !t.completed)
            .map((task) => (
              <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} onDelete={() => removeTask(task.id)} />
            ))}
        </Section>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          padding: 10,
        }}
      >
        <input
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          placeholder="Type a task..."
          style={{
            flex: 1,
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            color: "var(--text-primary)",
            padding: "8px 10px",
            fontFamily: "var(--font-body)",
            fontSize: 12,
          }}
        />
        <select
          value={quickWho}
          onChange={(e) => setQuickWho(e.target.value)}
          style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-primary)", padding: "8px 10px", fontSize: 11 }}
        >
          <option value="">WHO</option>
          {assignees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={quickDue}
          onChange={(e) => setQuickDue(e.target.value)}
          style={{ background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 6, color: "var(--text-primary)", padding: "8px 10px", fontSize: 11 }}
        />
        <button
          onClick={addQuickTask}
          style={{
            background: "var(--accent)",
            border: "1px solid var(--accent-border)",
            color: "var(--accent-text)",
            borderRadius: 6,
            padding: "8px 12px",
            ...mono,
            fontSize: 10,
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: "0.08em",
          }}
        >
          ADD
        </button>
        <button
          onClick={() => setByAssignee((p) => !p)}
          style={{
            background: byAssignee ? "var(--accent-muted)" : "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            color: byAssignee ? "var(--accent)" : "var(--text-secondary)",
            borderRadius: 6,
            padding: "8px 10px",
            ...mono,
            fontSize: 10,
            cursor: "pointer",
          }}
        >
          {byAssignee ? "BY ASSIGNEE" : "BY DUE DATE"}
        </button>
      </div>
    </div>
  );

  function renderActionItem(item) {
    const level = getEscalationLevel(item, risks);
    const style = getEscalationStyle(level);
    const due = item.due_date ? new Date(item.due_date) : null;
    const days = due ? Math.ceil((due - today) / 86400000) : null;
    return (
      <div
        key={item.id}
        style={{
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginBottom: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              ...mono,
              fontSize: 9,
              padding: "2px 8px",
              borderRadius: 6,
              background: style.bg,
              color: style.color,
              letterSpacing: "0.08em",
            }}
          >
            {level}
          </span>
          <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>{item.title}</span>
          <span style={{ marginLeft: "auto", ...mono, fontSize: 9, color: "var(--text-muted)" }}>{item.assigned_to || "Unassigned"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, ...mono, fontSize: 10, color: "var(--text-secondary)" }}>
          <span>Due: {item.due_date || "—"}</span>
          {days !== null && <span style={{ color: days < 0 ? "var(--status-error)" : days <= 3 ? "var(--status-warning)" : "var(--text-muted)" }}>{days < 0 ? `${Math.abs(days)}d late` : `${days}d`}</span>}
          <span>Status: {item.status}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => updateActionItemStatus(item.id, item.status === "Complete" ? "Open" : "Complete")}
            style={{
              background: item.status === "Complete" ? "transparent" : "var(--success-muted)",
              border: `1px solid ${item.status === "Complete" ? "var(--border-default)" : "var(--success-border)"}`,
              color: item.status === "Complete" ? "var(--text-muted)" : "var(--status-success)",
              borderRadius: 6,
              padding: "6px 10px",
              ...mono,
              fontSize: 9,
              cursor: "pointer",
            }}
          >
            {item.status === "Complete" ? "Reopen" : "✓ Complete"}
          </button>
          <button
            onClick={() => updateActionItemStatus(item.id, "In Progress")}
            style={{
              background: "var(--accent-muted)",
              border: "1px solid var(--accent-border)",
              color: "var(--accent)",
              borderRadius: 6,
              padding: "6px 10px",
              ...mono,
              fontSize: 9,
              cursor: "pointer",
            }}
          >
            In Progress
          </button>
        </div>
      </div>
    );
  }
}

function Section({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ ...mono, fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ text, success = false }) {
  return (
    <div
      style={{
        textAlign: "left",
        padding: "8px 10px",
        border: "1px dashed var(--divider)",
        borderRadius: 6,
        ...mono,
        fontSize: 10,
        color: success ? "var(--status-success)" : "var(--text-muted)",
      }}
    >
      {success ? "✓" : "—"} {text}
    </div>
  );
}

function TaskRow({ task, onToggle, onDelete }) {
  return (
    <div
      style={{
        background: "var(--accent-muted)",
        border: "1px solid var(--accent-border)",
        borderRadius: 8,
        padding: "8px 12px",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" checked={task.completed} onChange={onToggle} style={{ marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)", fontWeight: 600 }}>{task.title}</div>
          <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{task.description}</div>
        </div>
        <button
          onClick={onDelete}
          style={{
            background: "transparent",
            border: "1px solid var(--danger-border)",
            color: "var(--status-error)",
            borderRadius: 6,
            padding: "4px 8px",
            ...mono,
            fontSize: 9,
            cursor: "pointer",
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
