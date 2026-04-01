import React from "react";
import { ContentBox, Meta, Pill, Section } from "./RFISections";
import { BIC_COLORS, PRIORITY_CFG, STATUS_CFG, daysOpen, isClosed, isOverdue, mono, statusColumns } from "./rfiConfig";

function ModalShell({ open, title, children, onClose, width = 520 }) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: width,
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          boxShadow: "0 24px 80px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid var(--divider)" }}>
          <div style={{ ...mono, fontSize: 10, color: "var(--text-primary)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700 }}>{title}</div>
          <button
            onClick={onClose}
            style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", borderRadius: 4, padding: "4px 8px", cursor: "pointer", ...mono, fontSize: 8 }}
          >
            Close
          </button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface-low)",
        color: "var(--text-primary)",
        borderRadius: 4,
        padding: "8px 10px",
        fontSize: 12,
        ...(props.style || {}),
      }}
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface-low)",
        color: "var(--text-primary)",
        borderRadius: 4,
        padding: "8px 10px",
        fontSize: 12,
        ...(props.style || {}),
      }}
    />
  );
}

function Textarea(props) {
  return (
    <textarea
      {...props}
      style={{
        width: "100%",
        minHeight: 150,
        border: "1px solid var(--border-default)",
        background: "var(--bg-surface-low)",
        color: "var(--text-primary)",
        borderRadius: 4,
        padding: "8px 10px",
        fontSize: 12,
        resize: "vertical",
        ...(props.style || {}),
      }}
    />
  );
}

export function RFICommandBar({
  projectName,
  scopedCount,
  openCount,
  repairNumbersMut,
  numberingIssues,
  view,
  setView,
  setShowBulkAdd,
  setEditingRFI,
  setShowForm,
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
      <div>
        <div style={{ ...mono, fontSize: 10, color: "var(--accent)", letterSpacing: "0.14em", textTransform: "uppercase" }}>RFI Hub</div>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 18, color: "var(--text-primary)", fontWeight: 600 }}>{projectName}</div>
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>{scopedCount} total · {openCount} open</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {numberingIssues > 0 && (
          <button
            onClick={() => repairNumbersMut.mutate()}
            disabled={repairNumbersMut.isPending}
            style={{ border: "1px solid var(--status-warning)", background: "var(--warning-muted)", color: "var(--status-warning)", borderRadius: 4, padding: "8px 10px", cursor: "pointer", ...mono, fontSize: 9 }}
          >
            {repairNumbersMut.isPending ? "Repairing..." : `Repair Numbers (${numberingIssues})`}
          </button>
        )}
        <div style={{ display: "inline-flex", border: "1px solid var(--border-default)", borderRadius: 4, overflow: "hidden" }}>
          {["LIST", "BOARD"].map((mode) => (
            <button
              key={mode}
              onClick={() => setView(mode)}
              style={{
                border: "none",
                borderRight: mode === "LIST" ? "1px solid var(--border-default)" : "none",
                background: view === mode ? "var(--accent-muted)" : "var(--bg-surface)",
                color: view === mode ? "var(--accent)" : "var(--text-secondary)",
                padding: "8px 12px",
                cursor: "pointer",
                ...mono,
                fontSize: 9,
              }}
            >
              {mode}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowBulkAdd(true)}
          style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-primary)", borderRadius: 4, padding: "8px 10px", cursor: "pointer", ...mono, fontSize: 9 }}
        >
          Bulk Add
        </button>
        <button
          onClick={() => {
            setEditingRFI(null);
            setShowForm(true);
          }}
          style={{ border: "1px solid var(--accent-border)", background: "var(--accent-muted)", color: "var(--accent)", borderRadius: 4, padding: "8px 10px", cursor: "pointer", ...mono, fontSize: 9 }}
        >
          New RFI
        </button>
      </div>
    </div>
  );
}

export function RFIKpiStrip({ kpis, setFilterStatus, setFilterPriority }) {
  const cards = [
    { label: "Open", value: kpis.open, color: "var(--status-warning)", onClick: () => setFilterStatus("Open") },
    { label: "Overdue", value: kpis.overdue, color: "var(--status-error)", onClick: () => setFilterStatus("overdue") },
    { label: "Due This Week", value: kpis.dueThisWeek, color: "var(--accent)", onClick: () => setFilterStatus("all") },
    { label: "Critical", value: kpis.critical, color: "var(--status-error)", onClick: () => setFilterPriority("Critical") },
    { label: "Cost Exposure", value: `$${Number(kpis.costExposure || 0).toLocaleString()}`, color: "var(--status-warning)" },
    { label: "Schedule Exposure", value: `${kpis.scheduleDays || 0}d`, color: "var(--status-error)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 1, background: "var(--divider)", borderBottom: "1px solid var(--divider)" }}>
      {cards.map((card) => (
        <button
          key={card.label}
          onClick={card.onClick}
          style={{ border: "none", background: "var(--bg-surface)", textAlign: "left", padding: "12px 14px", cursor: card.onClick ? "pointer" : "default" }}
        >
          <div style={{ ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>{card.label}</div>
          <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: card.color, marginTop: 6 }}>{card.value}</div>
        </button>
      ))}
    </div>
  );
}

export function RFIOverdueStrip({ overdueList, setSelectedRFI }) {
  if (!overdueList?.length) return null;
  return (
    <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--divider)", background: "rgba(255,61,61,0.08)", display: "flex", gap: 8, alignItems: "center", overflowX: "auto" }}>
      <div style={{ ...mono, fontSize: 8, color: "var(--status-error)", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", flexShrink: 0 }}>
        Overdue
      </div>
      {overdueList.map((rfi) => (
        <button
          key={rfi.id}
          onClick={() => setSelectedRFI(rfi)}
          style={{ border: "1px solid rgba(255,61,61,0.25)", background: "var(--bg-surface)", color: "var(--text-primary)", borderRadius: 999, padding: "4px 8px", cursor: "pointer", ...mono, fontSize: 8, whiteSpace: "nowrap" }}
        >
          {rfi.rfi_number} · {rfi.title}
        </button>
      ))}
    </div>
  );
}

export function RFIFilterBar({
  search,
  setSearch,
  filterStatus,
  setFilterStatus,
  filterPriority,
  setFilterPriority,
  filterBIC,
  setFilterBIC,
  sortField,
  setSortField,
  sortDir,
  setSortDir,
  overdueFirst,
  setOverdueFirst,
  filtered,
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) repeat(6, minmax(120px, 1fr)) auto", gap: 8, padding: "10px 12px", borderBottom: "1px solid var(--divider)", background: "var(--bg-sidebar)" }}>
      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search RFIs..." />
      <Select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)}>
        <option value="all">All Statuses</option>
        <option value="overdue">Overdue</option>
        {statusColumns.map((status) => <option key={status} value={status}>{status}</option>)}
      </Select>
      <Select value={filterPriority} onChange={(event) => setFilterPriority(event.target.value)}>
        <option value="all">All Priorities</option>
        {Object.keys(PRIORITY_CFG).map((priority) => <option key={priority} value={priority}>{priority}</option>)}
      </Select>
      <Select value={filterBIC} onChange={(event) => setFilterBIC(event.target.value)}>
        <option value="all">All BIC</option>
        {Object.keys(BIC_COLORS).map((bic) => <option key={bic} value={bic}>{bic}</option>)}
      </Select>
      <Select value={sortField} onChange={(event) => setSortField(event.target.value)}>
        <option value="date_required">Sort: Due Date</option>
        <option value="submitted_date">Sort: Submitted</option>
        <option value="priority">Sort: Priority</option>
        <option value="status">Sort: Status</option>
        <option value="rfi_number">Sort: Number</option>
      </Select>
      <Select value={sortDir} onChange={(event) => setSortDir(event.target.value)}>
        <option value="asc">Ascending</option>
        <option value="desc">Descending</option>
      </Select>
      <label style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border-default)", borderRadius: 4, padding: "0 10px", background: "var(--bg-surface-low)", color: "var(--text-secondary)", ...mono, fontSize: 9 }}>
        <input type="checkbox" checked={overdueFirst} onChange={(event) => setOverdueFirst(event.target.checked)} style={{ accentColor: "var(--accent)" }} />
        Overdue first
      </label>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", ...mono, fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em" }}>
        {filtered.length} visible
      </div>
    </div>
  );
}

export function RFIBulkActionBar({ selectedIds, filtered, toggleSelectAllVisible, setShowBulkEdit, bulkDeleteMut }) {
  if (!filtered.length) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 12px", borderBottom: "1px solid var(--divider)", background: "var(--bg-surface)" }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, ...mono, fontSize: 9, color: "var(--text-secondary)" }}>
        <input type="checkbox" checked={filtered.length > 0 && filtered.every((rfi) => selectedIds.has(rfi.id))} onChange={toggleSelectAllVisible} style={{ accentColor: "var(--accent)" }} />
        Select visible
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{selectedIds.size} selected</div>
        <button onClick={() => setShowBulkEdit(true)} disabled={!selectedIds.size} style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-primary)", borderRadius: 4, padding: "6px 8px", cursor: selectedIds.size ? "pointer" : "not-allowed", ...mono, fontSize: 8 }}>
          Bulk Edit
        </button>
        <button onClick={() => bulkDeleteMut.mutate()} disabled={!selectedIds.size || bulkDeleteMut.isPending} style={{ border: "1px solid rgba(255,61,61,0.25)", background: "rgba(255,61,61,0.08)", color: "var(--status-error)", borderRadius: 4, padding: "6px 8px", cursor: selectedIds.size ? "pointer" : "not-allowed", ...mono, fontSize: 8 }}>
          {bulkDeleteMut.isPending ? "Deleting..." : "Delete Selected"}
        </button>
      </div>
    </div>
  );
}

export function RFIBulkEditModal({ open, onClose, bulkEditData, setBulkEditData, selectedCount, bulkEditMut }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Bulk Edit RFIs">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <div>
          <FieldLabel>Status</FieldLabel>
          <Select value={bulkEditData.status} onChange={(event) => setBulkEditData((prev) => ({ ...prev, status: event.target.value }))}>
            <option value="">No change</option>
            {statusColumns.map((status) => <option key={status} value={status}>{status}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>Priority</FieldLabel>
          <Select value={bulkEditData.priority} onChange={(event) => setBulkEditData((prev) => ({ ...prev, priority: event.target.value }))}>
            <option value="">No change</option>
            {Object.keys(PRIORITY_CFG).map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>Ball In Court</FieldLabel>
          <Select value={bulkEditData.ball_in_court} onChange={(event) => setBulkEditData((prev) => ({ ...prev, ball_in_court: event.target.value }))}>
            <option value="">No change</option>
            {Object.keys(BIC_COLORS).map((bic) => <option key={bic} value={bic}>{bic}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>Due Date</FieldLabel>
          <Input type="date" value={bulkEditData.date_required} onChange={(event) => setBulkEditData((prev) => ({ ...prev, date_required: event.target.value }))} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <FieldLabel>Assigned To</FieldLabel>
          <Input value={bulkEditData.assigned_to} onChange={(event) => setBulkEditData((prev) => ({ ...prev, assigned_to: event.target.value }))} placeholder="Assignee name" />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>{selectedCount} RFIs selected</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", borderRadius: 4, padding: "8px 10px", cursor: "pointer", ...mono, fontSize: 8 }}>Cancel</button>
          <button onClick={() => bulkEditMut.mutate(bulkEditData)} disabled={bulkEditMut.isPending || !selectedCount} style={{ border: "1px solid var(--accent-border)", background: "var(--accent-muted)", color: "var(--accent)", borderRadius: 4, padding: "8px 10px", cursor: "pointer", ...mono, fontSize: 8 }}>
            {bulkEditMut.isPending ? "Updating..." : "Apply"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function RFIBulkAddModal({ open, onClose, bulkAddData, setBulkAddData, projects, bulkAddMut }) {
  return (
    <ModalShell open={open} onClose={onClose} title="Bulk Add RFIs" width={640}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <div>
          <FieldLabel>Project</FieldLabel>
          <Select value={bulkAddData.project_id} onChange={(event) => setBulkAddData((prev) => ({ ...prev, project_id: event.target.value }))}>
            <option value="">Select project</option>
            {(projects || []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>Due Date</FieldLabel>
          <Input type="date" value={bulkAddData.date_required} onChange={(event) => setBulkAddData((prev) => ({ ...prev, date_required: event.target.value }))} />
        </div>
        <div>
          <FieldLabel>Priority</FieldLabel>
          <Select value={bulkAddData.priority} onChange={(event) => setBulkAddData((prev) => ({ ...prev, priority: event.target.value }))}>
            {Object.keys(PRIORITY_CFG).map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>Status</FieldLabel>
          <Select value={bulkAddData.status} onChange={(event) => setBulkAddData((prev) => ({ ...prev, status: event.target.value }))}>
            {statusColumns.map((status) => <option key={status} value={status}>{status}</option>)}
          </Select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <FieldLabel>Ball In Court</FieldLabel>
          <Select value={bulkAddData.ball_in_court} onChange={(event) => setBulkAddData((prev) => ({ ...prev, ball_in_court: event.target.value }))}>
            {Object.keys(BIC_COLORS).map((bic) => <option key={bic} value={bic}>{bic}</option>)}
          </Select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <FieldLabel>Lines</FieldLabel>
          <Textarea value={bulkAddData.lines} onChange={(event) => setBulkAddData((prev) => ({ ...prev, lines: event.target.value }))} placeholder="One RFI per line. Use Title | Question for explicit question text." />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)" }}>Use one line per RFI. `Title | Question` is optional.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-secondary)", borderRadius: 4, padding: "8px 10px", cursor: "pointer", ...mono, fontSize: 8 }}>Cancel</button>
          <button onClick={() => bulkAddMut.mutate()} disabled={bulkAddMut.isPending} style={{ border: "1px solid var(--accent-border)", background: "var(--accent-muted)", color: "var(--accent)", borderRadius: 4, padding: "8px 10px", cursor: "pointer", ...mono, fontSize: 8 }}>
            {bulkAddMut.isPending ? "Adding..." : "Create RFIs"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function RFIDetailPanel({ selectedRFI, setSelectedRFI, setEditingRFI, setShowForm, setDeleteTarget, updateMut }) {
  return (
    <div style={{ width: 360, flexShrink: 0, borderLeft: "1px solid var(--divider)", background: "var(--bg-sidebar)", overflowY: "auto" }}>
      {!selectedRFI ? (
        <div style={{ padding: 20 }}>
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.10em", textTransform: "uppercase" }}>RFI Detail</div>
          <div style={{ marginTop: 8, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)" }}>Select an RFI to inspect status, ownership, dates, and impact.</div>
        </div>
      ) : (
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ ...mono, fontSize: 10, color: "var(--accent)", fontWeight: 700 }}>{selectedRFI.rfi_number}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 16, color: "var(--text-primary)", fontWeight: 600, marginTop: 4 }}>{selectedRFI.title}</div>
            </div>
            <button onClick={() => setSelectedRFI(null)} style={{ border: "1px solid var(--border-default)", background: "var(--bg-surface)", borderRadius: 4, padding: "4px 8px", cursor: "pointer", ...mono, fontSize: 8 }}>Close</button>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Pill label={selectedRFI.priority || "Medium"} color={(PRIORITY_CFG[selectedRFI.priority] || PRIORITY_CFG.Medium).color} bg={(PRIORITY_CFG[selectedRFI.priority] || PRIORITY_CFG.Medium).bg} />
            <Pill label={selectedRFI.status || "Open"} color={(STATUS_CFG[selectedRFI.status] || STATUS_CFG.Open).color} bg={(STATUS_CFG[selectedRFI.status] || STATUS_CFG.Open).bg} />
            <Pill label={selectedRFI.ball_in_court || "Contractor"} color={(BIC_COLORS[selectedRFI.ball_in_court || "Contractor"] || BIC_COLORS.Contractor).text} bg={(BIC_COLORS[selectedRFI.ball_in_court || "Contractor"] || BIC_COLORS.Contractor).bg} />
          </div>

          <ContentBox>
            <Section title="Dates">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <Meta label="Submitted" value={selectedRFI.submitted_date} />
                <Meta label="Required" value={selectedRFI.date_required} highlight={isOverdue(selectedRFI) ? "var(--status-error)" : undefined} />
                <Meta label="Answered" value={selectedRFI.date_answered} />
                <Meta label="Days Open" value={`${daysOpen(selectedRFI)}d`} highlight={daysOpen(selectedRFI) > 30 ? "var(--status-error)" : undefined} />
              </div>
            </Section>
          </ContentBox>

          <ContentBox accent>
            <Section title="Question">
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {selectedRFI.question || "No question captured."}
              </div>
            </Section>
          </ContentBox>

          <ContentBox success={isClosed(selectedRFI)}>
            <Section title="Context">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <Meta label="Drawing" value={selectedRFI.drawing_reference} />
                <Meta label="Spec" value={selectedRFI.spec_section} />
                <Meta label="Assigned To" value={selectedRFI.assigned_to} />
                <Meta label="Project" value={selectedRFI.project_name} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <label style={{ ...mono, fontSize: 8, color: selectedRFI.cost_impact ? "var(--status-warning)" : "var(--text-muted)" }}>
                  <input
                    type="checkbox"
                    checked={!!selectedRFI.cost_impact}
                    onChange={(event) => updateMut.mutate({ id: selectedRFI.id, data: { cost_impact: event.target.checked } })}
                    style={{ marginRight: 6, accentColor: "var(--accent)" }}
                  />
                  Cost Impact
                </label>
                <label style={{ ...mono, fontSize: 8, color: selectedRFI.schedule_impact ? "var(--status-error)" : "var(--text-muted)" }}>
                  <input
                    type="checkbox"
                    checked={!!selectedRFI.schedule_impact}
                    onChange={(event) => updateMut.mutate({ id: selectedRFI.id, data: { schedule_impact: event.target.checked } })}
                    style={{ marginRight: 6, accentColor: "var(--accent)" }}
                  />
                  Schedule Impact
                </label>
              </div>
            </Section>
          </ContentBox>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => {
                setEditingRFI(selectedRFI);
                setShowForm(true);
              }}
              style={{ flex: 1, border: "1px solid var(--border-default)", background: "var(--bg-surface)", color: "var(--text-primary)", borderRadius: 4, padding: "8px 10px", cursor: "pointer", ...mono, fontSize: 8 }}
            >
              Edit
            </button>
            <button
              onClick={() => {
                const idx = statusColumns.indexOf(selectedRFI.status || "Open");
                const next = statusColumns[Math.min(idx + 1, statusColumns.length - 1)];
                const extra = ["Answered", "Closed"].includes(next) ? { date_answered: new Date().toISOString().split("T")[0] } : {};
                updateMut.mutate({ id: selectedRFI.id, data: { status: next, ...extra } });
              }}
              style={{ flex: 1, border: "1px solid var(--accent-border)", background: "var(--accent-muted)", color: "var(--accent)", borderRadius: 4, padding: "8px 10px", cursor: "pointer", ...mono, fontSize: 8 }}
            >
              Advance
            </button>
            <button
              onClick={() => setDeleteTarget(selectedRFI)}
              style={{ border: "1px solid rgba(255,61,61,0.25)", background: "rgba(255,61,61,0.08)", color: "var(--status-error)", borderRadius: 4, padding: "8px 10px", cursor: "pointer", ...mono, fontSize: 8 }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
