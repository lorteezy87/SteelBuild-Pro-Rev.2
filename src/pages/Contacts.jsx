import React, { useMemo, useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import ContactList from "@/components/contacts/ContactList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, KpiTile, Button } from "@/components/design-system";
import { Upload } from "lucide-react";
import { useProjectId } from "@/hooks/useProjectId";
import {
  filterContacts,
  computeContactStats,
  findById,
  CONTACT_TYPE_COLORS,
  CONTACT_TYPE_FILTER_OPTIONS,
  nextContactTypeFilter,
  contactsCommandSubtitle,
} from "./contacts/contactsPageHelpers";
import { toUserErrorMessage, withProjectId } from "@/lib/mutations/standardMutation";
import { RegisterFetchBody } from "@/components/shared/RegisterFetchStates";


export default function Contacts() {
  const projectId = useProjectId();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grid");

  const {
    data: contacts = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["contacts", projectId],
    queryFn: () =>
      projectId
        ? entities.Contact.filter({ project_id: projectId })
        : entities.Contact.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => entities.Project.list(),
    staleTime: 5 * 60 * 1000,
  });

  const createMut = useMutation({
    mutationFn: (data) =>
      entities.Contact.create(withProjectId(data, data.project_id || projectId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success("Contact created");
      setShowForm(false);
    },
    onError: (e) => toast.error(toUserErrorMessage(e, "Failed to create contact")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => {
      const pid = projectId || data.project_id;
      return entities.Contact.update(id, pid ? withProjectId(data, pid) : data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setEditingContact(null);
      setShowForm(false);
      toast.success("Contact updated");
    },
    onError: (e) => toast.error(toUserErrorMessage(e, "Failed to update contact")),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => entities.Contact.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      setDeleteTarget(null);
      toast.success("Contact deleted");
    },
    onError: (e) => toast.error(toUserErrorMessage(e, "Failed to delete contact")),
  });

  const selectedProject = findById(projects, projectId);

  const filtered = useMemo(
    () => filterContacts(contacts, filterType, search),
    [contacts, filterType, search],
  );

  const stats = useMemo(
    () => computeContactStats(contacts),
    [contacts],
  );

  const typeOptions = CONTACT_TYPE_FILTER_OPTIONS;

  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <CommandBar
        eyebrow={selectedProject ? selectedProject.name : "ALL PROJECTS"}
        title="Contacts"
        count={isLoading ? undefined : filtered.length}
        unit=" · CONTACTS"
        subtitle={contactsCommandSubtitle(filterType)}
      >
        <Button variant="secondary"><Upload size={12} /> Import CSV</Button>
        <Button variant="primary" icon="plus" onClick={() => { setEditingContact(null); setShowForm(true); }}>
          New Contact
        </Button>
      </CommandBar>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        <KpiTile compact label="Total"        value={stats.total}          color="var(--accent)"                active={filterType === "all"}           onClick={() => setFilterType(nextContactTypeFilter(filterType, "all"))} />
        <KpiTile compact label="Owner"        value={stats.owner}          color={CONTACT_TYPE_COLORS.Owner}            active={filterType === "Owner"}         onClick={() => setFilterType(nextContactTypeFilter(filterType, "Owner"))} />
        <KpiTile compact label="GC"           value={stats.gc}             color={CONTACT_TYPE_COLORS.GC}               active={filterType === "GC"}            onClick={() => setFilterType(nextContactTypeFilter(filterType, "GC"))} />
        <KpiTile compact label="Engineer"     value={stats.engineer}       color={CONTACT_TYPE_COLORS.Engineer}         active={filterType === "Engineer"}      onClick={() => setFilterType(nextContactTypeFilter(filterType, "Engineer"))} />
        <KpiTile compact label="Subs"         value={stats.subcontractor}  color={CONTACT_TYPE_COLORS.Subcontractor}    active={filterType === "Subcontractor"} onClick={() => setFilterType(nextContactTypeFilter(filterType, "Subcontractor"))} />
        <KpiTile compact label="Supplier"     value={stats.supplier}       color={CONTACT_TYPE_COLORS.Supplier}         active={filterType === "Supplier"}      onClick={() => setFilterType(nextContactTypeFilter(filterType, "Supplier"))} />
        <KpiTile compact label="Inspector"    value={stats.inspector}      color={CONTACT_TYPE_COLORS.Inspector}        active={filterType === "Inspector"}     onClick={() => setFilterType(nextContactTypeFilter(filterType, "Inspector"))} />
        <KpiTile compact label="Internal"     value={stats.internal}       color={CONTACT_TYPE_COLORS.Internal}         active={filterType === "Internal"}      onClick={() => setFilterType(nextContactTypeFilter(filterType, "Internal"))} />
      </div>

      {/* Search Bar — prominent, full width */}
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
          fontSize: 14, color: "var(--text-muted)", pointerEvents: "none",
        }}>🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, company, email, or role..."
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-input)",
            padding: "10px 14px 10px 38px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            outline: "none",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "var(--text-muted)",
              cursor: "pointer", fontSize: 14, padding: 4,
            }}
          >✕</button>
        )}
      </div>

      {/* Filter bar + View toggle */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", flex: 1 }}>
          {typeOptions.map((t) => {
            const isActive = filterType === t;
            const typeColor = t !== "all" ? CONTACT_TYPE_COLORS[t] : null;
            return (
              <button
                key={t}
                onClick={() => setFilterType(nextContactTypeFilter(filterType, t))}
                style={{
                  padding: "6px 10px",
                  borderRadius: "var(--radius-btn)",
                  border: isActive
                    ? `1px solid ${typeColor || "var(--accent)"}`
                    : "1px solid var(--divider)",
                  background: isActive
                    ? `${typeColor || "var(--accent)"}18`
                    : "var(--bg-surface)",
                  color: isActive
                    ? (typeColor || "var(--accent)")
                    : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  boxShadow: isActive ? `0 0 0 1px ${typeColor || "var(--accent)"}44` : "none",
                  transition: "all 0.15s ease",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6 }}>
          {["grid", "list"].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "6px 10px",
                borderRadius: "var(--radius-btn)",
                border: view === v ? "1px solid var(--accent)" : "1px solid var(--divider)",
                background: view === v ? "rgba(200,155,32,0.12)" : "var(--bg-surface)",
                color: view === v ? "var(--accent)" : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {v === "grid" ? "⊞ Grid" : "≡ List"}
            </button>
          ))}
        </div>
      </div>

      <RegisterFetchBody
        isLoading={isLoading}
        isError={isError}
        errorMessage={toUserErrorMessage(error, "Failed to load contacts")}
        onRetry={() => refetch()}
        totalCount={contacts.length}
        filteredCount={filtered.length}
        emptyTitle="No contacts yet"
        emptyBody="Add owner, GC, engineer, sub, and supplier contacts for this project directory."
        emptyActionLabel="+ New Contact"
        onEmptyAction={() => { setEditingContact(null); setShowForm(true); }}
        onClearFilters={() => { setFilterType("all"); setSearch(""); }}
      >
        <ContactList
          contacts={filtered}
          view={view}
          onEdit={(c) => { setEditingContact(c); setShowForm(true); }}
          onDelete={setDeleteTarget}
          onAdd={() => { setEditingContact(null); setShowForm(true); }}
        />
      </RegisterFetchBody>

      {(showForm || editingContact) && (
        <ContactFormModal
          projectId={projectId}
          contact={editingContact}
          onClose={() => { setShowForm(false); setEditingContact(null); }}
          onSave={(data) => {
            if (editingContact) {
              return updateMut.mutateAsync({ id: editingContact.id, data });
            }
            createMut.mutate(data);
          }}
        />
      )}

      <DeleteDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        busy={deleteMut.isPending}
        onConfirm={() => deleteTarget && deleteMut.mutateAsync(deleteTarget.id)}
        title="Delete Contact"
        description={`Delete ${deleteTarget?.first_name} ${deleteTarget?.last_name}? This cannot be undone.`}
      />
    </div>
  );
}
