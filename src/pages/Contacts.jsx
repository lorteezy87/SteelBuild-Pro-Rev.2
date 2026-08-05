import React, { useMemo, useState } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import ContactList from "@/components/contacts/ContactList";
import DeleteDialog from "@/components/shared/DeleteDialog";
import { CommandBar, Button } from "@/components/design-system";
import { Upload } from "lucide-react";
import { useProjectId } from "@/hooks/useProjectId";
import {
  filterContacts,
  computeContactStats,
  findById,
  nextContactTypeFilter,
  contactsCommandSubtitle,
  createEmptyContactFilters,
} from "./contacts/contactsPageHelpers";
import {
  ContactsKpiStrip,
  ContactsSearchBar,
  ContactsFilterBar,
} from "./contacts/ContactsUi";
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

      <ContactsKpiStrip
        stats={stats}
        filterType={filterType}
        onToggleType={(t) => setFilterType(nextContactTypeFilter(filterType, t))}
      />

      <ContactsSearchBar search={search} onSearch={setSearch} />

      <ContactsFilterBar
        filterType={filterType}
        view={view}
        onFilterType={(t) => setFilterType(nextContactTypeFilter(filterType, t))}
        onView={setView}
      />

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
        onClearFilters={() => {
          const empty = createEmptyContactFilters();
          setFilterType(empty.filterType);
          setSearch(empty.search);
        }}
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
