import { useMemo, useRef, useState } from "react";
import type { ComponentType, Dispatch, PropsWithChildren, SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Link2, Paperclip, Reply, ReplyAll, Send, X } from "lucide-react";
import { entities } from "@/api/supabaseClient";
import { Modal as ModalRaw } from "@/components/design-system";
import { invalidateEntity } from "@/services/cacheRegistry";
import { sendEmail, buildReplyDefaults } from "@/services/emailSendService";
import {
  ENTITY_TYPE_OPTIONS,
  MAX_ATTACH_TOTAL_BYTES,
  formatBytes,
  inputStyle,
  labelStyle,
  primaryBtnStyle,
  readFileAsBase64,
  secondaryBtnStyle,
} from "./constants";
import type { EmailAttachment, EmailMessage, OutboundAttachment, ReplyMode } from "./types";

// design-system Modal is still .jsx — type it permissively at the boundary
// until the design system is converted. Removable once it is typed.
type AnyProps = PropsWithChildren<Record<string, unknown>>;
const Modal = ModalRaw as unknown as ComponentType<AnyProps>;

interface ExtractedChipProps {
  label: string;
  color: string;
}

function ExtractedChip({ label, color }: ExtractedChipProps) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 7px", borderRadius: 4,
      fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 600,
      color,
      background: `color-mix(in srgb, ${color} 10%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
      maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

interface CreateRecordModalProps {
  message: EmailMessage;
  attachments: EmailAttachment[];
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateRecordModal({ message, attachments, projectId, onClose, onSuccess }: CreateRecordModalProps) {
  const qc = useQueryClient();

  const extracted = useMemo<any>(() => {
    if (!message.parsed_metadata) return null;
    const meta = typeof message.parsed_metadata === "string"
      ? (() => { try { return JSON.parse(message.parsed_metadata as string); } catch { return null; } })()
      : message.parsed_metadata;
    return meta?.extracted || null;
  }, [message.parsed_metadata]);

  const validTypes = ENTITY_TYPE_OPTIONS.map((o) => o.value);
  const defaultType = validTypes.includes(message.parsed_type) ? message.parsed_type : "action_item";

  const [entityType, setEntityType] = useState(defaultType);
  const [title, setTitle] = useState(message.subject || "");
  const [description, setDescription] = useState(
    `From: ${message.sender_name || message.sender_email}\n\n${message.body_text || ""}`
  );
  const [selectedAttachments, setSelectedAttachments] = useState<Set<string>>(
    new Set(attachments.map((a) => a.id))
  );
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      let createdRecord: any;
      const priorityMap: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
      const aiPriority = extracted?.priority ? (priorityMap[extracted.priority] || "Medium") : "Medium";

      if (entityType === "rfi") {
        createdRecord = await entities.RFI.create({
          project_id: projectId, subject: title, question: description,
          status: "Open", priority: aiPriority,
          ...(extracted?.rfi_number ? { rfi_number: extracted.rfi_number } : {}),
          ...(extracted?.due_date ? { due_date: extracted.due_date } : {}),
          ...(extracted?.responsible_party ? { assigned_to_name: extracted.responsible_party } : {}),
        } as any);
        invalidateEntity(qc, "rfi", projectId);
      } else if (entityType === "action_item") {
        createdRecord = await entities.ActionItem.create({
          project_id: projectId, title, description, status: "Open", priority: aiPriority,
          ...(extracted?.due_date ? { due_date: extracted.due_date } : {}),
          ...(extracted?.responsible_party ? { assigned_to_name: extracted.responsible_party } : {}),
        } as any);
        invalidateEntity(qc, "action_item", projectId);
      } else if (entityType === "submittal") {
        createdRecord = await entities.Submittal.create({
          // "Draft" is the canonical not-yet-submitted status. ("Open" is valid
          // for RFI/ActionItem above but is rejected by submittals_status_check,
          // which previously made this create always throw.)
          project_id: projectId, title, description, status: "Draft",
          ...(extracted?.submittal_number ? { submittal_number: extracted.submittal_number } : {}),
        } as any);
        invalidateEntity(qc, "submittal", projectId);
      } else if (entityType === "change_order") {
        createdRecord = await entities.ChangeOrder.create({
          project_id: projectId, title, description, status: "Pending",
          ...(extracted?.due_date ? { response_due: extracted.due_date } : {}),
        } as any);
        invalidateEntity(qc, "change_order", projectId);
      }
      if (createdRecord) {
        await entities.EmailMessage.update(message.id, {
          import_status: "approved", linked_entity_type: entityType,
          linked_entity_id: createdRecord.id, reviewed_at: new Date().toISOString(),
        });

        // File selected attachments as documents
        if (selectedAttachments.size > 0) {
          const attsToFile = attachments.filter((a) => selectedAttachments.has(a.id));
          const today = new Date().toISOString();
          let filedCount = 0;
          for (const att of attsToFile) {
            try {
              const ext = (att.filename || "").split(".").pop()?.toLowerCase() || "other";
              const knownTypes = ["pdf","dwg","dxf","ifc","rvt","jpg","jpeg","png","xlsx","xls","docx","doc","csv","zip"];
              await entities.Document.create({
                project_id: projectId,
                display_name: att.filename,
                description: `Filed from email: ${message.subject || "(no subject)"}\nFrom: ${message.sender_name || message.sender_email}`,
                file_name: att.filename,
                // Bucket-prefixed storage path — resolveFileUrl signs it against
                // the private email-attachments bucket on display. A bare
                // /storage/v1/object/ URL would be fetched with no auth header
                // and is blocked by the bucket's project-scoped RLS.
                file_url: att.storage_path
                  ? `email-attachments/${att.storage_path}`
                  : null,
                file_type: knownTypes.includes(ext) ? ext : "other",
                file_size_kb: att.size_bytes ? Math.round(att.size_bytes / 1024) : 0,
                mime_type: att.content_type || "application/octet-stream",
                category: "Correspondence",
                status: "Final",
                revision_number: "0",
                revision_date: today.split("T")[0],
                tags: ["email-attachment", entityType],
                uploaded_date: today,
                source_type: "email",
                source_id: message.id,
              } as any);
              filedCount++;
            } catch (docErr) {
              console.error(`[EmailInbox] Failed to file attachment ${att.filename}:`, docErr);
            }
          }
          if (filedCount > 0) {
            invalidateEntity(qc, "document", projectId);
          }
        }
      }
      const typeName = ENTITY_TYPE_OPTIONS.find((o) => o.value === entityType)?.label || "Record";
      const attMsg = selectedAttachments.size > 0 ? ` (${selectedAttachments.size} attachment${selectedAttachments.size > 1 ? "s" : ""} filed)` : "";
      toast.success(`${typeName} created from email${attMsg}`);
      onSuccess();
    } catch (err: any) {
      toast.error("Failed: " + (err?.message || "Unknown error"));
    } finally { setSaving(false); }
  };

  return (
    <Modal open={true} onClose={onClose} title="Create Record from Email" width={540}
      footer={
        <>
          <button onClick={onClose} style={secondaryBtnStyle}>Cancel</button>
          <button onClick={handleCreate} disabled={saving} style={primaryBtnStyle}>
            {saving ? "Creating..." : "Create Record"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelStyle}>Record Type</label>
          <div style={{ display: "flex", gap: 6 }}>
            {ENTITY_TYPE_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setEntityType(opt.value)} style={{
                flex: 1, padding: "8px 0",
                background: entityType === opt.value ? "var(--accent-muted)" : "var(--bg-surface-low)",
                border: `1px solid ${entityType === opt.value ? "var(--accent-border)" : "var(--border-default)"}`,
                borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 12,
                fontWeight: entityType === opt.value ? 600 : 400,
                color: entityType === opt.value ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer", transition: "all 120ms",
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            style={inputStyle} placeholder="Record title" />
        </div>
        <div>
          <label style={labelStyle}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            rows={5} style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} />
        </div>
        {extracted && (
          <div style={{
            padding: "10px 12px", background: "color-mix(in srgb, var(--info) 6%, transparent)",
            border: "1px solid color-mix(in srgb, var(--info) 20%, transparent)",
            borderRadius: 8,
          }}>
            <div style={{
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: "var(--info)", marginBottom: 6,
            }}>
              AI-Extracted Fields (pre-filled)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {extracted.rfi_number && (
                <ExtractedChip label={`RFI: ${extracted.rfi_number}`} color="var(--info)" />
              )}
              {extracted.submittal_number && (
                <ExtractedChip label={`Submittal: ${extracted.submittal_number}`} color="var(--accent)" />
              )}
              {extracted.due_date && (
                <ExtractedChip label={`Due: ${extracted.due_date}`} color="var(--warning)" />
              )}
              {extracted.responsible_party && (
                <ExtractedChip label={`Assigned: ${extracted.responsible_party}`} color="var(--text-secondary)" />
              )}
              {extracted.priority && (
                <ExtractedChip label={`Priority: ${extracted.priority}`} color="var(--warning)" />
              )}
              {extracted.drawing_refs?.length > 0 && (
                <ExtractedChip label={`Drawings: ${extracted.drawing_refs.join(", ")}`} color="var(--info)" />
              )}
              {extracted.related_entities?.length > 0 && (
                <ExtractedChip label={`Refs: ${extracted.related_entities.join(", ")}`} color="var(--accent)" />
              )}
            </div>
          </div>
        )}
        {attachments.length > 0 && (
          <div>
            <label style={labelStyle}>Attachments to File</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {attachments.map((att) => (
                <label key={att.id} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                  background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
                  borderRadius: 6, cursor: "pointer", fontFamily: "var(--font-body)", fontSize: 12,
                  color: "var(--text-primary)",
                }}>
                  <input type="checkbox" checked={selectedAttachments.has(att.id)}
                    onChange={(e) => {
                      const next = new Set(selectedAttachments);
                      if (e.target.checked) next.add(att.id); else next.delete(att.id);
                      setSelectedAttachments(next);
                    }}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <Paperclip size={12} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {att.filename}
                  </span>
                  {att.size_bytes && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                      {formatBytes(att.size_bytes)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

interface LinkToExistingModalProps {
  message: EmailMessage;
  projectId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function LinkToExistingModal({ message, projectId, onClose, onSuccess }: LinkToExistingModalProps) {
  const qc = useQueryClient();
  const [searchType, setSearchType] = useState("rfi");
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: rfis = [] } = useQuery({
    queryKey: ["rfis", projectId, "link-search"],
    queryFn: () => entities.RFI.filter({ project_id: projectId }),
    enabled: !!projectId && searchType === "rfi",
  });
  const { data: actionItems = [] } = useQuery({
    queryKey: ["action-items", projectId, "link-search"],
    queryFn: () => entities.ActionItem.filter({ project_id: projectId }),
    enabled: !!projectId && searchType === "action_item",
  });
  const { data: submittals = [] } = useQuery({
    queryKey: ["submittals", projectId, "link-search"],
    queryFn: () => entities.Submittal.filter({ project_id: projectId }),
    enabled: !!projectId && searchType === "submittal",
  });

  const records: any[] = searchType === "rfi" ? rfis : searchType === "action_item" ? actionItems : submittals;

  const filteredRecords = useMemo(() => {
    if (!searchQuery.trim()) return records.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return records.filter((r) =>
      (r.subject || r.title || "").toLowerCase().includes(q)
      || (r.description || r.question || "").toLowerCase().includes(q)
    ).slice(0, 20);
  }, [records, searchQuery]);

  const handleLink = async (record: any) => {
    setSaving(true);
    try {
      await entities.EmailMessage.update(message.id, {
        import_status: "linked", linked_entity_type: searchType,
        linked_entity_id: record.id, reviewed_at: new Date().toISOString(),
      });
      invalidateEntity(qc, "email_message", projectId);
      toast.success("Email linked to existing record");
      onSuccess();
    } catch (err: any) {
      toast.error("Failed: " + (err?.message || "Unknown error"));
    } finally { setSaving(false); }
  };

  return (
    <Modal open={true} onClose={onClose} title="Link to Existing Record" width={540}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {ENTITY_TYPE_OPTIONS.map((opt) => (
            <button key={opt.value} onClick={() => setSearchType(opt.value)} style={{
              flex: 1, padding: "6px 0",
              background: searchType === opt.value ? "var(--accent-muted)" : "var(--bg-surface-low)",
              border: `1px solid ${searchType === opt.value ? "var(--accent-border)" : "var(--border-default)"}`,
              borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 11,
              fontWeight: searchType === opt.value ? 600 : 400,
              color: searchType === opt.value ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer", transition: "all 120ms",
            }}>
              {opt.label}
            </button>
          ))}
        </div>
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${ENTITY_TYPE_OPTIONS.find((o) => o.value === searchType)?.label || "records"}...`}
          style={inputStyle} autoFocus />
      </div>

      {filteredRecords.length === 0 ? (
        <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontFamily: "var(--font-body)", fontSize: 12 }}>
          No matching records found
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filteredRecords.map((rec) => (
            <button key={rec.id} onClick={() => handleLink(rec)} disabled={saving} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
              borderRadius: 8, cursor: "pointer", textAlign: "left", width: "100%", transition: "all 120ms",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-border)"; e.currentTarget.style.background = "var(--accent-muted)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.background = "var(--bg-surface-low)"; }}
            >
              <FileText size={14} strokeWidth={1.75} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600, color: "var(--text-primary)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {rec.subject || rec.title || "(untitled)"}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                  {rec.status || ""} {rec.number ? `#${rec.number}` : ""}
                </div>
              </div>
              <Link2 size={12} strokeWidth={2} style={{ color: "var(--accent)", flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

interface ComposeEmailModalProps {
  projectId: string;
  onClose: () => void;
  onSent: () => void;
}

export function ComposeEmailModal({ projectId, onClose, onSent }: ComposeEmailModalProps) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [attachments, setAttachments] = useState<OutboundAttachment[]>([]);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const toList = to.split(",").map((s) => s.trim()).filter(Boolean);
    if (toList.length === 0) { toast.error("At least one recipient is required"); return; }
    if (!subject.trim()) { toast.error("Subject is required"); return; }
    if (!bodyText.trim()) { toast.error("Message body is required"); return; }

    setSending(true);
    const ccList = cc ? cc.split(",").map((s) => s.trim()).filter(Boolean) : [];

    const result = await sendEmail({
      project_id: projectId,
      to: toList,
      cc: ccList,
      subject: subject.trim(),
      body_text: bodyText,
      attachments,
    });

    setSending(false);
    if (result.success) {
      toast.success("Email sent");
      onSent();
    } else {
      toast.error("Send failed: " + (result.error || "Unknown error"));
    }
  };

  return (
    <Modal
      open={true} onClose={onClose} title="Compose Email"
      eyebrow="NEW MESSAGE" width={600}
      footer={
        <>
          <button onClick={onClose} style={secondaryBtnStyle}>Discard</button>
          <button onClick={handleSend} disabled={sending} style={{
            ...primaryBtnStyle,
            display: "inline-flex", alignItems: "center", gap: 6,
            opacity: sending ? 0.7 : 1,
          }}>
            <Send size={12} strokeWidth={2} />
            {sending ? "Sending..." : "Send"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label style={labelStyle}>To</label>
          <input type="text" value={to} onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com (comma-separated for multiple)"
            style={inputStyle} autoFocus />
        </div>
        <div>
          <label style={labelStyle}>CC</label>
          <input type="text" value={cc} onChange={(e) => setCc(e.target.value)}
            placeholder="cc@example.com (optional)"
            style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Subject</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Message</label>
          <textarea
            value={bodyText} onChange={(e) => setBodyText(e.target.value)}
            rows={12} placeholder="Type your message..."
            style={{ ...inputStyle, resize: "vertical", minHeight: 160, lineHeight: 1.5 }}
          />
        </div>
        <div>
          <label style={labelStyle}>Attachments</label>
          <AttachmentPicker attachments={attachments} setAttachments={setAttachments} disabled={sending} />
        </div>
      </div>
    </Modal>
  );
}

interface ReplyEmailModalProps {
  projectId: string;
  originalMessage: EmailMessage;
  mode: ReplyMode;
  currentUserEmail: string;
  onClose: () => void;
  onSent: () => void;
}

export function ReplyEmailModal({ projectId, originalMessage, mode, currentUserEmail, onClose, onSent }: ReplyEmailModalProps) {
  const defaults = useMemo(
    () => buildReplyDefaults(originalMessage, mode, currentUserEmail),
    [originalMessage, mode, currentUserEmail]
  );

  const [to, setTo] = useState(defaults.to.join(", "));
  const [cc, setCc] = useState(defaults.cc.join(", "));
  const [subject, setSubject] = useState(defaults.subject);
  const [bodyText, setBodyText] = useState("");
  const [attachments, setAttachments] = useState<OutboundAttachment[]>([]);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const toList = to.split(",").map((s) => s.trim()).filter(Boolean);
    if (toList.length === 0) { toast.error("At least one recipient is required"); return; }
    if (!bodyText.trim()) { toast.error("Message body is required"); return; }

    setSending(true);
    const ccList = cc ? cc.split(",").map((s) => s.trim()).filter(Boolean) : [];

    const fullBody = bodyText + defaults.quoted_body;

    const result = await sendEmail({
      project_id: projectId,
      to: toList,
      cc: ccList,
      subject: subject.trim(),
      body_text: fullBody,
      reply_to_message_id: defaults.reply_to_message_id,
      in_reply_to_external_id: defaults.in_reply_to_external_id,
      thread_id: defaults.thread_id,
      attachments,
    });

    setSending(false);
    if (result.success) {
      toast.success("Reply sent");
      onSent();
    } else {
      toast.error("Send failed: " + (result.error || "Unknown error"));
    }
  };

  const modeLabel = mode === "reply_all" ? "Reply All" : "Reply";
  const ModeIcon = mode === "reply_all" ? ReplyAll : Reply;

  return (
    <Modal
      open={true} onClose={onClose}
      title={`${modeLabel}: ${originalMessage.subject || "(no subject)"}`}
      eyebrow={`TO ${originalMessage.sender_name || originalMessage.sender_email}`}
      width={600}
      footer={
        <>
          <button onClick={onClose} style={secondaryBtnStyle}>Discard</button>
          <button onClick={handleSend} disabled={sending} style={{
            ...primaryBtnStyle,
            display: "inline-flex", alignItems: "center", gap: 6,
            opacity: sending ? 0.7 : 1,
          }}>
            <ModeIcon size={12} strokeWidth={2} />
            {sending ? "Sending..." : modeLabel}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <label style={labelStyle}>To</label>
          <input type="text" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </div>
        {(mode === "reply_all" || cc) && (
          <div>
            <label style={labelStyle}>CC</label>
            <input type="text" value={cc} onChange={(e) => setCc(e.target.value)} style={inputStyle} />
          </div>
        )}
        <div>
          <label style={labelStyle}>Subject</label>
          <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Message</label>
          <textarea
            value={bodyText} onChange={(e) => setBodyText(e.target.value)}
            rows={8} placeholder="Type your reply..."
            style={{ ...inputStyle, resize: "vertical", minHeight: 120, lineHeight: 1.5 }}
            autoFocus
          />
        </div>
        <div>
          <label style={labelStyle}>Attachments</label>
          <AttachmentPicker attachments={attachments} setAttachments={setAttachments} disabled={sending} />
        </div>
        {/* Quoted original */}
        <div style={{
          padding: "10px 12px", borderRadius: 8,
          background: "var(--bg-surface-low)",
          border: "1px solid var(--border-default)",
          maxHeight: 200, overflowY: "auto",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.1em", textTransform: "uppercase",
            color: "var(--text-muted)", marginBottom: 6,
          }}>
            Original Message
          </div>
          <div style={{
            fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)",
            whiteSpace: "pre-wrap", lineHeight: 1.5, wordBreak: "break-word",
          }}>
            {defaults.quoted_body.trim()}
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface AttachmentPickerProps {
  attachments: OutboundAttachment[];
  setAttachments: Dispatch<SetStateAction<OutboundAttachment[]>>;
  disabled: boolean;
}

function AttachmentPicker({ attachments, setAttachments, disabled }: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    const next = [...attachments];
    for (const file of files) {
      const total = next.reduce((sum, a) => sum + (a.size_bytes || 0), 0);
      if (total + file.size > MAX_ATTACH_TOTAL_BYTES) {
        toast.error(`Attachments exceed ${formatBytes(MAX_ATTACH_TOTAL_BYTES)} total — "${file.name}" skipped`);
        continue;
      }
      try {
        const content_base64 = await readFileAsBase64(file);
        next.push({
          filename: file.name,
          content_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          content_base64,
        });
      } catch {
        toast.error(`Failed to read "${file.name}"`);
      }
    }
    setAttachments(next);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeAt = (idx: number) => setAttachments(attachments.filter((_, i) => i !== idx));

  return (
    <div>
      <input
        ref={inputRef} type="file" multiple style={{ display: "none" }}
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button" onClick={() => inputRef.current?.click()} disabled={disabled}
        style={{
          ...secondaryBtnStyle, display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 12px", opacity: disabled ? 0.6 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <Paperclip size={12} strokeWidth={2} />
        Attach files
      </button>
      {attachments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {attachments.map((att, idx) => (
            <div
              key={`${att.filename}-${idx}`}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
                borderRadius: 8,
              }}
            >
              <Paperclip size={12} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <span style={{
                flex: 1, minWidth: 0, fontFamily: "var(--font-body)", fontSize: 12,
                color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {att.filename}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                {formatBytes(att.size_bytes)}
              </span>
              <button
                type="button" onClick={() => removeAt(idx)} disabled={disabled} title="Remove"
                style={{
                  background: "none", border: "none", padding: 2, flexShrink: 0,
                  color: "var(--text-muted)", cursor: disabled ? "not-allowed" : "pointer",
                }}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
