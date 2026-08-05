/**
 * EmailInbox.tsx — Professional split-pane email client for project emails.
 *
 * Three-column layout:
 *   Left sidebar  (~200px) — folder/label navigation
 *   Email list    (~380px) — compact rows with checkbox, star, sender, preview
 *   Detail pane   (flex)   — full email view with HTML rendering + actions
 *
 * Features:
 *   - Read/unread tracking (auto-mark on select)
 *   - Star/flag toggle inline
 *   - Label system with colored chips + custom labels
 *   - Bulk actions via checkbox selection
 *   - Approve & Create (RFI/Submittal/Action Item), Link, Reject, Archive
 *   - Sandboxed iframe for HTML body rendering
 *   - Responsive: hides detail pane on narrow screens, uses modal instead
 *
 * Data flows through EmailMessage entity + TanStack Query.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, PropsWithChildren } from "react";
import { entities } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectId } from "@/hooks/useProjectId";
import { toast } from "sonner";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { Modal as ModalRaw } from "@/components/design-system";
import { invalidateEntity } from "@/services/cacheRegistry";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useAppSecurity } from "@/components/shared/useAppSecurity";
import { useWindowWidth } from "./emailInbox/constants";
import { EmailBodyContent, EmailDetail, MobileDetailFooter } from "./emailInbox/components";
import { ComposeEmailModal, CreateRecordModal, LinkToExistingModal, ReplyEmailModal } from "./emailInbox/modals";
import type { EmailAttachment, EmailMessage, ReplyMode } from "./emailInbox/types";
import {
  groupAttachmentsByMessage,
  collectAllLabels,
  filterMessages,
  computeEmailStats,
  computeFolderCounts,
  labelsWithAdded,
  labelsWithout,
  allFilteredSelected,
  nextSelectedIdsForToggleAll,
  nextSelectedIdsForToggle,
} from "./emailInbox/emailInboxHelpers";
import {
  InboxHeader,
  EmailKpiStrip,
  FolderSidebar,
  EmailListToolbar,
  EmailListBody,
  DetailEmptyState,
  EmailBulkBar,
} from "./emailInbox/EmailInboxUi";

// design-system primitives are still .jsx — type them permissively at the
// boundary until the design system is converted. Removable once it is typed.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const Modal = ModalRaw as unknown as ComponentType<AnyProps>;

export default function EmailInbox() {
  const projectId = useProjectId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const windowWidth = useWindowWidth();
  const isNarrow = windowWidth < 900;
  const { user } = useAppSecurity();
  const currentUserEmail = user?.email || "";

  // ── State ──────────────────────────────────────────────────────────
  const [activeFolder, setActiveFolder] = useState("inbox");
  const [activeLabelFilter, setActiveLabelFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createModal, setCreateModal] = useState<EmailMessage | null>(null);
  const [linkModal, setLinkModal] = useState<EmailMessage | null>(null);
  const [labelDropdownId, setLabelDropdownId] = useState<string | null>(null);
  const [mobileDetailMsg, setMobileDetailMsg] = useState<EmailMessage | null>(null);
  const [composeModal, setComposeModal] = useState(false);
  const [replyState, setReplyState] = useState<{ mode: ReplyMode; message: EmailMessage } | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────
  // the generated generated row types lag the live schema (missing labels/direction/
  // is_read/etc.), so cast to the local EmailMessage/EmailAttachment shapes.
  const {
    data: messagesData = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["email-messages", projectId],
    queryFn: () => entities.EmailMessage.filter({ project_id: projectId }, "-received_at"),
    enabled: !!projectId,
  });
  const messages = messagesData as unknown as EmailMessage[];

  const { data: attachmentsData = [] } = useQuery({
    queryKey: ["email-attachments", projectId],
    queryFn: () => entities.EmailAttachment.filter({ project_id: projectId }),
    enabled: !!projectId,
  });
  const attachments = attachmentsData as unknown as EmailAttachment[];

  // Live updates — new webhook emails appear without manual refresh
  useRealtimeInvalidation("email_messages", projectId, [
    ["email-messages", projectId],
  ]);
  useRealtimeInvalidation("email_attachments", projectId, [
    ["email-attachments", projectId],
  ]);

  const attachmentsByMessage = useMemo(
    () => groupAttachmentsByMessage(attachments),
    [attachments],
  );

  // ── Mutations ──────────────────────────────────────────────────────
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => entities.EmailMessage.update(id, data),
    onSuccess: () => {
      invalidateEntity(qc, "email_message", projectId);
    },
    onError: (e: unknown) => toast.error(`Update failed: ${toUserErrorMessage(e, "Unknown error")}`),
  });

  const bulkUpdateMut = useMutation({
    mutationFn: async ({ ids, data }: { ids: string[]; data: any }) => {
      // Identical `data` patch across all ids → one chunked .in('id', ids) update.
      await entities.EmailMessage.bulkUpdate(ids, data);
    },
    onSuccess: () => {
      invalidateEntity(qc, "email_message", projectId);
      setSelectedIds(new Set());
    },
    onError: (e: unknown) => toast.error(`Bulk update failed: ${toUserErrorMessage(e, "Unknown error")}`),
  });

  // ── Collect all labels used across messages ────────────────────────
  const allLabels = useMemo(() => collectAllLabels(messages), [messages]);

  // ── Filtering ──────────────────────────────────────────────────────
  const filtered = useMemo(
    () => filterMessages(messages, { activeFolder, activeLabelFilter, search }),
    [messages, activeFolder, activeLabelFilter, search],
  );

  // ── Stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => computeEmailStats(messages), [messages]);

  // ── Folder counts ──────────────────────────────────────────────────
  const folderCounts = useMemo(() => computeFolderCounts(messages), [messages]);

  // ── Selected message ───────────────────────────────────────────────
  const selectedMessage = useMemo(
    () => messages.find((m) => m.id === selectedId) || null,
    [messages, selectedId]
  );

  // Auto-mark as read when selected
  useEffect(() => {
    if (selectedMessage && !selectedMessage.is_read) {
      updateMut.mutate({ id: selectedMessage.id, data: { is_read: true } });
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Action handlers ────────────────────────────────────────────────
  const handleStar = useCallback((msg: EmailMessage, e?: any) => {
    e?.stopPropagation();
    updateMut.mutate({ id: msg.id, data: { is_starred: !msg.is_starred } });
  }, [updateMut]);

  const handleMarkRead = useCallback((msg: EmailMessage) => {
    updateMut.mutate(
      { id: msg.id, data: { is_read: !msg.is_read } },
      { onSuccess: () => toast.success(msg.is_read ? "Marked unread" : "Marked read") }
    );
  }, [updateMut]);

  const handleReject = useCallback((msg: EmailMessage) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "rejected", reviewed_at: new Date().toISOString() } },
      { onSuccess: () => { toast.success("Email rejected"); if (selectedId === msg.id) setSelectedId(null); } }
    );
  }, [updateMut, selectedId]);

  const handleArchive = useCallback((msg: EmailMessage) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "archived", reviewed_at: new Date().toISOString() } },
      { onSuccess: () => { toast.success("Email archived"); if (selectedId === msg.id) setSelectedId(null); } }
    );
  }, [updateMut, selectedId]);

  const handleRestore = useCallback((msg: EmailMessage) => {
    updateMut.mutate(
      { id: msg.id, data: { import_status: "pending", reviewed_at: null, linked_entity_type: null, linked_entity_id: null } },
      { onSuccess: () => toast.success("Restored to pending") }
    );
  }, [updateMut]);

  const handleAddLabel = useCallback((msg: EmailMessage, label: string) => {
    const next = labelsWithAdded(msg.labels, label);
    if (!next) return;
    updateMut.mutate({ id: msg.id, data: { labels: next } });
  }, [updateMut]);

  const handleRemoveLabel = useCallback((msg: EmailMessage, label: string) => {
    updateMut.mutate({ id: msg.id, data: { labels: labelsWithout(msg.labels, label) } });
  }, [updateMut]);

  // ── Bulk actions ───────────────────────────────────────────────────
  const allSelected = allFilteredSelected(filtered, selectedIds);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(nextSelectedIdsForToggleAll(filtered, selectedIds));
  }, [filtered, selectedIds]);

  const toggleSelect = useCallback((id: string, e?: any) => {
    e?.stopPropagation();
    setSelectedIds((prev) => nextSelectedIdsForToggle(prev, id));
  }, []);

  const handleSelectMessage = useCallback((msg: EmailMessage) => {
    if (isNarrow) {
      setMobileDetailMsg(msg);
      // Mark as read
      if (!msg.is_read) {
        updateMut.mutate({ id: msg.id, data: { is_read: true } });
      }
    } else {
      setSelectedId(msg.id);
    }
  }, [isNarrow, updateMut]);

  const goFolder = useCallback((folderId: string) => {
    setActiveFolder(folderId);
    setActiveLabelFilter(null);
  }, []);

  const handleBulk = useCallback((action: "read" | "star" | "archive" | "reject") => {
    const ids = [...selectedIds];
    if (action === "read") {
      bulkUpdateMut.mutate({ ids, data: { is_read: true } });
    } else if (action === "star") {
      bulkUpdateMut.mutate({ ids, data: { is_starred: true } });
    } else if (action === "archive") {
      bulkUpdateMut.mutate({
        ids,
        data: { import_status: "archived", reviewed_at: new Date().toISOString() },
      });
    } else {
      bulkUpdateMut.mutate({
        ids,
        data: { import_status: "rejected", reviewed_at: new Date().toISOString() },
      });
    }
  }, [selectedIds, bulkUpdateMut]);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="sb-dashboard-reference-page" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* KPI strip */}
      <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
        <InboxHeader
          onCompose={() => setComposeModal(true)}
          onOpenSettings={() => navigate(createPageUrl("Integrations"))}
        />
        <EmailKpiStrip stats={stats} activeFolder={activeFolder} onFolder={goFolder} />
      </div>

      {/* Main content area */}
      <div style={{
        flex: 1, display: "flex", overflow: "hidden",
        border: "1px solid var(--border-default)", borderRadius: 12,
        margin: "0 20px 16px", background: "var(--bg-surface)",
      }}>
        {/* ── Left sidebar ──────────────────────────────────────────── */}
        {!isNarrow && (
          <FolderSidebar
            activeFolder={activeFolder}
            activeLabelFilter={activeLabelFilter}
            folderCounts={folderCounts}
            allLabels={allLabels}
            messages={messages}
            onSelectFolder={(id) => {
              setActiveFolder(id);
              setActiveLabelFilter(null);
              setSelectedIds(new Set());
            }}
            onSelectLabel={(label, isActive) => {
              setActiveLabelFilter(isActive ? null : label);
              setActiveFolder("all");
              setSelectedIds(new Set());
            }}
          />
        )}

        {/* ── Email list ────────────────────────────────────────────── */}
        <div style={{
          width: isNarrow ? "100%" : 380, flexShrink: 0,
          borderRight: isNarrow ? "none" : "1px solid var(--border-default)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <EmailListToolbar
            search={search}
            onSearchChange={setSearch}
            isNarrow={isNarrow}
            activeFolder={activeFolder}
            onFolderChange={(v) => { setActiveFolder(v); setActiveLabelFilter(null); }}
            allFilteredSelected={allSelected}
            filteredCount={filtered.length}
            selectedCount={selectedIds.size}
            onToggleSelectAll={toggleSelectAll}
          />

          {/* Email rows */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            <EmailListBody
              isLoading={isLoading}
              isError={isError}
              error={error}
              onRetry={() => refetch()}
              filtered={filtered}
              messagesLength={messages.length}
              selectedId={selectedId}
              selectedIds={selectedIds}
              attachmentsByMessage={attachmentsByMessage}
              onSelectMessage={handleSelectMessage}
              onToggleSelect={toggleSelect}
              onStar={handleStar}
            />
          </div>
        </div>

        {/* ── Detail pane ───────────────────────────────────────────── */}
        {!isNarrow && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {selectedMessage ? (
              <EmailDetail
                message={selectedMessage}
                attachments={attachmentsByMessage[selectedMessage.id] || []}
                onReject={() => handleReject(selectedMessage)}
                onArchive={() => handleArchive(selectedMessage)}
                onRestore={() => handleRestore(selectedMessage)}
                onApprove={() => setCreateModal(selectedMessage)}
                onLink={() => setLinkModal(selectedMessage)}
                onMarkRead={() => handleMarkRead(selectedMessage)}
                onStar={(e) => handleStar(selectedMessage, e)}
                onAddLabel={(label) => handleAddLabel(selectedMessage, label)}
                onRemoveLabel={(label) => handleRemoveLabel(selectedMessage, label)}
                allLabels={allLabels}
                labelDropdownOpen={labelDropdownId === selectedMessage.id}
                onToggleLabelDropdown={() => setLabelDropdownId(labelDropdownId === selectedMessage.id ? null : selectedMessage.id)}
                onReply={() => setReplyState({ mode: "reply", message: selectedMessage })}
                onReplyAll={() => setReplyState({ mode: "reply_all", message: selectedMessage })}
              />
            ) : (
              <DetailEmptyState />
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <EmailBulkBar
          selectedIds={selectedIds}
          onClear={() => setSelectedIds(new Set())}
          onBulk={handleBulk}
        />
      )}

      {/* Mobile detail modal */}
      {isNarrow && mobileDetailMsg && (
        <Modal
          open={true}
          onClose={() => setMobileDetailMsg(null)}
          title={mobileDetailMsg.subject || "(no subject)"}
          eyebrow={`FROM ${mobileDetailMsg.sender_name || mobileDetailMsg.sender_email}`}
          width={600}
          footer={
            <MobileDetailFooter
              message={mobileDetailMsg}
              onReject={() => { handleReject(mobileDetailMsg); setMobileDetailMsg(null); }}
              onArchive={() => { handleArchive(mobileDetailMsg); setMobileDetailMsg(null); }}
              onRestore={() => { handleRestore(mobileDetailMsg); setMobileDetailMsg(null); }}
              onApprove={() => { setCreateModal(mobileDetailMsg); setMobileDetailMsg(null); }}
              onLink={() => { setLinkModal(mobileDetailMsg); setMobileDetailMsg(null); }}
            />
          }
        >
          <EmailBodyContent
            message={mobileDetailMsg}
            attachments={attachmentsByMessage[mobileDetailMsg.id] || []}
          />
        </Modal>
      )}

      {/* Create Record Modal */}
      {createModal && (
        <CreateRecordModal
          message={createModal}
          attachments={attachmentsByMessage[createModal.id] || []}
          projectId={projectId ?? ""}
          onClose={() => setCreateModal(null)}
          onSuccess={() => {
            setCreateModal(null);
            invalidateEntity(qc, "email_message", projectId);
          }}
        />
      )}

      {/* Link to Existing Modal */}
      {linkModal && (
        <LinkToExistingModal
          message={linkModal}
          projectId={projectId ?? ""}
          onClose={() => setLinkModal(null)}
          onSuccess={() => {
            setLinkModal(null);
            invalidateEntity(qc, "email_message", projectId);
          }}
        />
      )}

      {/* Compose Modal */}
      {composeModal && (
        <ComposeEmailModal
          projectId={projectId ?? ""}
          onClose={() => setComposeModal(false)}
          onSent={() => {
            setComposeModal(false);
            invalidateEntity(qc, "email_message", projectId);
          }}
        />
      )}

      {/* Reply Modal */}
      {replyState && (
        <ReplyEmailModal
          projectId={projectId ?? ""}
          originalMessage={replyState.message}
          mode={replyState.mode}
          currentUserEmail={currentUserEmail}
          onClose={() => setReplyState(null)}
          onSent={() => {
            setReplyState(null);
            invalidateEntity(qc, "email_message", projectId);
          }}
        />
      )}
    </div>
  );
}
