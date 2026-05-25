import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, MouseEvent, ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Hash,
  Link2,
  Paperclip,
  Plus,
  Reply,
  ReplyAll,
  RotateCcw,
  Send,
  Star,
  Tag,
  X,
  XCircle,
} from "lucide-react";
import {
  STATUS_STYLES,
  TYPE_STYLES,
  formatBytes,
  formatDate,
  getLabelColor,
  timeAgo,
} from "./constants";
import type { EmailAttachment, EmailMessage } from "./types";

interface EmailRowProps {
  message: EmailMessage;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: () => void;
  onCheck: (e: ChangeEvent<HTMLInputElement>) => void;
  onStar: (e: MouseEvent) => void;
  attachmentCount: number;
}

export function EmailRow({ message, isSelected, isChecked, onSelect, onCheck, onStar, attachmentCount }: EmailRowProps) {
  const isUnread = !message.is_read;
  const isOutbound = message.direction === "outbound";
  const typeInfo = TYPE_STYLES[message.parsed_type] || TYPE_STYLES.unknown;
  const labels = Array.isArray(message.labels) ? message.labels : [];

  // For outbound messages, show first recipient instead of sender
  const displayName = useMemo(() => {
    if (isOutbound) {
      try {
        const recips = typeof message.recipients === "string" ? JSON.parse(message.recipients) : (message.recipients || []);
        return recips.length > 0 ? `To: ${recips[0]}${recips.length > 1 ? ` +${recips.length - 1}` : ""}` : "To: (unknown)";
      } catch { return "To: (unknown)"; }
    }
    return message.sender_name || message.sender_email || "Unknown";
  }, [isOutbound, message.sender_name, message.sender_email, message.recipients]);

  const { bodyPreview, aiSummary } = useMemo(() => {
    // Try AI summary first
    let summary = null;
    if (message.parsed_metadata) {
      const meta = typeof message.parsed_metadata === "string"
        ? (() => { try { return JSON.parse(message.parsed_metadata as string); } catch { return null; } })()
        : message.parsed_metadata;
      if (meta?.extracted?.summary) summary = meta.extracted.summary;
    }

    let text = message.body_text || "";
    if (/^\s*<|<html|<body|<div|<table/i.test(text)) {
      text = text
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
    }
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 120);
    return { bodyPreview: preview, aiSummary: summary };
  }, [message.body_text, message.parsed_metadata]);

  return (
    <div
      onClick={onSelect}
      style={{
        display: "flex", alignItems: "flex-start", gap: 6, padding: "9px 12px",
        borderBottom: "1px solid var(--border-default)",
        background: isSelected
          ? "var(--accent-muted)"
          : isUnread
            ? "color-mix(in srgb, var(--bg-surface) 100%, transparent)"
            : "var(--bg-surface-low)",
        cursor: "pointer",
        transition: "background 80ms",
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 6%, var(--bg-surface))"; }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = isUnread
            ? "color-mix(in srgb, var(--bg-surface) 100%, transparent)"
            : "var(--bg-surface-low)";
        }
      }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isChecked}
        onChange={onCheck}
        onClick={(e) => e.stopPropagation()}
        style={{ accentColor: "var(--accent)", marginTop: 3, cursor: "pointer", flexShrink: 0 }}
      />

      {/* Star */}
      <button
        onClick={(e) => { e.stopPropagation(); onStar(e); }}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 2, flexShrink: 0,
          color: message.is_starred ? "#F59E0B" : "var(--text-muted)",
          opacity: message.is_starred ? 1 : 0.4,
          transition: "all 100ms",
        }}
        title={message.is_starred ? "Unstar" : "Star"}
      >
        <Star size={13} strokeWidth={2} fill={message.is_starred ? "#F59E0B" : "none"} />
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Sender + time */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{
            fontFamily: "var(--font-body)", fontSize: 12,
            fontWeight: isUnread ? 700 : 400,
            color: isOutbound ? "var(--accent)" : "var(--text-primary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
          }}>
            {displayName}
          </span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {timeAgo(message.received_at)}
          </span>
        </div>

        {/* Subject */}
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 11.5,
          fontWeight: isUnread ? 600 : 400,
          color: isUnread ? "var(--text-primary)" : "var(--text-secondary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginTop: 1,
        }}>
          {message.subject || "(no subject)"}
        </div>

        {/* Body preview — AI summary preferred when available */}
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 10.5,
          color: aiSummary ? "var(--text-secondary)" : "var(--text-muted)",
          lineHeight: 1.35,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginTop: 2,
          fontStyle: aiSummary ? "normal" : "normal",
        }}>
          {aiSummary || bodyPreview || "No content"}
        </div>

        {/* Bottom row: badges + attachments + labels */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          {/* Type badge */}
          <span style={{
            display: "inline-flex", padding: "1px 5px", borderRadius: 3,
            fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
            color: typeInfo.color,
            background: `color-mix(in srgb, ${typeInfo.color} 12%, transparent)`,
          }}>
            {typeInfo.label}
          </span>

          {/* Attachment indicator */}
          {(message.has_attachments || attachmentCount > 0) && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 2,
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
            }}>
              <Paperclip size={9} strokeWidth={2} />
              {message.attachment_count || attachmentCount}
            </span>
          )}

          {/* Labels */}
          {labels.slice(0, 2).map((l) => (
            <span key={l} style={{
              display: "inline-flex", padding: "1px 4px", borderRadius: 3,
              fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 600,
              color: getLabelColor(l),
              background: `color-mix(in srgb, ${getLabelColor(l)} 12%, transparent)`,
            }}>
              {l}
            </span>
          ))}
          {labels.length > 2 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>
              +{labels.length - 2}
            </span>
          )}

          {/* Unread dot */}
          {isUnread && (
            <div style={{
              width: 6, height: 6, borderRadius: 3, background: "var(--accent)", marginLeft: "auto", flexShrink: 0,
            }} />
          )}
        </div>
      </div>
    </div>
  );
}

interface EmailDetailProps {
  message: EmailMessage;
  attachments: EmailAttachment[];
  onReject: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onApprove: () => void;
  onLink: () => void;
  onMarkRead: () => void;
  onStar: (e: MouseEvent) => void;
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
  allLabels: string[];
  labelDropdownOpen: boolean;
  onToggleLabelDropdown: () => void;
  onReply: () => void;
  onReplyAll: () => void;
}

export function EmailDetail({
  message, attachments, onReject, onArchive, onRestore, onApprove, onLink,
  onMarkRead, onStar, onAddLabel, onRemoveLabel, allLabels,
  labelDropdownOpen, onToggleLabelDropdown, onReply, onReplyAll,
}: EmailDetailProps) {
  const [customLabel, setCustomLabel] = useState("");
  const status = STATUS_STYLES[message.import_status] || STATUS_STYLES.pending;
  const typeInfo = TYPE_STYLES[message.parsed_type] || TYPE_STYLES.unknown;
  const labels = Array.isArray(message.labels) ? message.labels : [];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Detail header */}
      <div style={{
        padding: "14px 18px", borderBottom: "1px solid var(--border-default)", flexShrink: 0,
      }}>
        {/* Subject */}
        <h2 style={{
          fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700,
          color: "var(--text-primary)", margin: "0 0 8px", lineHeight: 1.3,
        }}>
          {message.subject || "(no subject)"}
        </h2>

        {/* Sender + metadata */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          {/* Avatar */}
          <div style={{
            width: 34, height: 34, borderRadius: 8, background: "var(--accent-muted)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            color: "var(--accent)", fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700,
          }}>
            {(message.sender_name || message.sender_email || "?")[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                {message.sender_name || message.sender_email}
              </span>
              {message.sender_name && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                  {"<"}{message.sender_email}{">"}
                </span>
              )}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
              {formatDate(message.received_at)}
            </div>
            {/* Recipients */}
            {message.recipients && (
              <div style={{ fontFamily: "var(--font-body)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                To: {typeof message.recipients === "string" ? message.recipients : JSON.parse((message.recipients as unknown as string) || "[]").join(", ")}
              </div>
            )}
          </div>
          {/* Right side: star + status */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button
              onClick={onStar}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 2,
                color: message.is_starred ? "#F59E0B" : "var(--text-muted)",
              }}
              title={message.is_starred ? "Unstar" : "Star"}
            >
              <Star size={16} strokeWidth={1.75} fill={message.is_starred ? "#F59E0B" : "none"} />
            </button>
            <span style={{
              padding: "2px 8px", borderRadius: 4,
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.05em", textTransform: "uppercase",
              color: typeInfo.color,
              background: `color-mix(in srgb, ${typeInfo.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${typeInfo.color} 25%, transparent)`,
            }}>
              {typeInfo.label}
            </span>
            <span style={{
              padding: "2px 8px", borderRadius: 4,
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.05em", textTransform: "uppercase",
              color: status.color, background: status.bg, border: `1px solid ${status.border}`,
            }}>
              {status.label}
            </span>
          </div>
        </div>

        {/* Labels row */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          {labels.map((l) => (
            <span key={l} style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 4,
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
              color: getLabelColor(l),
              background: `color-mix(in srgb, ${getLabelColor(l)} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${getLabelColor(l)} 25%, transparent)`,
            }}>
              {l}
              <X
                size={9} strokeWidth={2.5} style={{ cursor: "pointer", opacity: 0.6 }}
                onClick={() => onRemoveLabel(l)}
              />
            </span>
          ))}

          {/* Add label button */}
          <div style={{ position: "relative" }}>
            <button
              onClick={onToggleLabelDropdown}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "2px 7px", borderRadius: 4, border: "1px dashed var(--border-default)",
                background: "transparent", cursor: "pointer",
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                color: "var(--text-muted)",
              }}
            >
              <Tag size={9} strokeWidth={2} /> Label
            </button>

            {labelDropdownOpen && (
              <div style={{
                position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
                background: "var(--bg-elevated)", border: "1px solid var(--border-strong)",
                borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                width: 180, maxHeight: 200, overflowY: "auto",
              }}>
                {allLabels.filter((l) => !labels.includes(l)).map((l) => (
                  <button
                    key={l}
                    onClick={() => { onAddLabel(l); onToggleLabelDropdown(); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      padding: "7px 12px", border: "none", background: "transparent",
                      cursor: "pointer", textAlign: "left",
                      fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg-surface-low)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: getLabelColor(l), flexShrink: 0 }} />
                    {l}
                  </button>
                ))}
                {/* Custom label input */}
                <div style={{
                  padding: "6px 10px", borderTop: "1px solid var(--border-default)",
                  display: "flex", gap: 4,
                }}>
                  <input
                    type="text" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="Custom..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && customLabel.trim()) {
                        onAddLabel(customLabel.trim());
                        setCustomLabel("");
                        onToggleLabelDropdown();
                      }
                    }}
                    style={{
                      flex: 1, height: 24, padding: "0 6px",
                      background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
                      borderRadius: 4, fontFamily: "var(--font-body)", fontSize: 10,
                      color: "var(--text-primary)", outline: "none",
                    }}
                  />
                  <button
                    onClick={() => {
                      if (customLabel.trim()) {
                        onAddLabel(customLabel.trim());
                        setCustomLabel("");
                        onToggleLabelDropdown();
                      }
                    }}
                    style={{
                      height: 24, padding: "0 6px", background: "var(--accent)",
                      border: "none", borderRadius: 4, cursor: "pointer",
                      color: "var(--text-on-accent, #fff)", fontSize: 10,
                    }}
                  >
                    <Plus size={10} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI-extracted fields */}
        <ExtractedFieldsStrip metadata={message.parsed_metadata} confidence={message.parsed_confidence} />

        {/* Linked entity info */}
        {(message.import_status === "approved" || message.import_status === "linked") && message.linked_entity_type && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
            padding: "4px 10px", background: "var(--success-muted)",
            border: "1px solid var(--success-border)", borderRadius: 6,
            fontFamily: "var(--font-body)", fontSize: 11, color: "var(--success)",
          }}>
            <Link2 size={12} strokeWidth={2} />
            Linked to {message.linked_entity_type.replace(/_/g, " ")}
            <ExternalLink size={10} strokeWidth={2} />
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {/* Reply actions — available for all messages */}
          {message.direction !== "outbound" && (
            <>
              <DetailAction icon={<Reply size={12} />} label="Reply" color="var(--accent)" onClick={onReply} />
              <DetailAction icon={<ReplyAll size={12} />} label="Reply All" color="var(--accent)" onClick={onReplyAll} />
            </>
          )}
          {message.import_status === "pending" && message.direction !== "outbound" && (
            <>
              <DetailAction icon={<Plus size={12} />} label="Approve & Create" color="var(--success)" onClick={onApprove} />
              <DetailAction icon={<Link2 size={12} />} label="Link to Existing" color="var(--info)" onClick={onLink} />
              <DetailAction icon={<XCircle size={12} />} label="Reject" color="var(--status-error)" onClick={onReject} />
              <DetailAction icon={<Archive size={12} />} label="Archive" color="var(--text-muted)" onClick={onArchive} />
            </>
          )}
          {message.import_status === "approved" && (
            <DetailAction icon={<Archive size={12} />} label="Archive" color="var(--text-muted)" onClick={onArchive} />
          )}
          {(message.import_status === "rejected" || message.import_status === "archived") && (
            <DetailAction icon={<RotateCcw size={12} />} label="Restore to Pending" color="var(--info)" onClick={onRestore} />
          )}
          <DetailAction
            icon={message.is_read ? <EyeOff size={12} /> : <Eye size={12} />}
            label={message.is_read ? "Mark Unread" : "Mark Read"}
            color="var(--text-muted)"
            onClick={onMarkRead}
          />
        </div>
      </div>

      {/* Body content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
        <EmailBodyContent message={message} attachments={attachments} />
      </div>
    </div>
  );
}

interface EmailBodyContentProps {
  message: EmailMessage;
  attachments: EmailAttachment[];
}

export function EmailBodyContent({ message, attachments }: EmailBodyContentProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Determine the best HTML content to render:
  // 1. Use body_html if available
  // 2. If body_text contains HTML tags (starts with < or contains <html), treat it as HTML
  // 3. Otherwise fallback to plain text
  const rawHtml = message.body_html
    || (message.body_text && /^\s*<|<html|<body|<div|<table|<p[\s>]/i.test(message.body_text) ? message.body_text : null);

  // Strip HTML client-side for plain-text fallback
  const plainText = useMemo(() => {
    if (!rawHtml && message.body_text) return message.body_text;
    if (rawHtml && !message.body_text) {
      return rawHtml
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    return message.body_text || "";
  }, [rawHtml, message.body_text]);

  // Resize iframe to fit content
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !rawHtml) return;
    const onLoad = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          const h = doc.documentElement.scrollHeight || doc.body.scrollHeight;
          iframe.style.height = Math.min(Math.max(h + 20, 100), 2000) + "px";
        }
      } catch { /* cross-origin guard */ }
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [rawHtml]);

  const htmlDoc = rawHtml
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body { margin: 0; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 13px; line-height: 1.5; color: #d4d4d8; background: transparent; }
        img { max-width: 100%; height: auto; }
        a { color: #60a5fa; }
        table { border-collapse: collapse; max-width: 100%; }
        td, th { padding: 4px 8px; }
        pre, code { font-family: var(--font-mono, monospace); font-size: 12px;
          background: rgba(255,255,255,0.06); padding: 2px 4px; border-radius: 3px; }
      </style></head><body>${rawHtml}</body></html>`
    : null;

  return (
    <div>
      {/* Render HTML body in sandboxed iframe, or fallback to text */}
      {htmlDoc ? (
        <iframe
          ref={iframeRef}
          sandbox="allow-same-origin"
          srcDoc={htmlDoc}
          style={{
            width: "100%", minHeight: 100, border: "none", borderRadius: 6,
            background: "var(--bg-surface-low)",
          }}
          title="Email body"
        />
      ) : plainText ? (
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)",
          lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word",
          padding: 12, background: "var(--bg-surface-low)", borderRadius: 8,
        }}>
          {plainText}
        </div>
      ) : (
        <div style={{
          fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)",
          fontStyle: "italic", padding: 12,
        }}>
          No email body content available
        </div>
      )}

      {/* Attachments */}
      {attachments.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
            letterSpacing: "0.12em", textTransform: "uppercase",
            color: "var(--text-muted)", marginBottom: 6,
          }}>
            Attachments ({attachments.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {attachments.map((att) => (
              <div
                key={att.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 12px", background: "var(--bg-surface-low)",
                  border: "1px solid var(--border-default)", borderRadius: 6,
                }}
              >
                <Paperclip size={12} strokeWidth={2} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontFamily: "var(--font-body)", fontSize: 12,
                  color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {att.filename}
                </span>
                {att.size_bytes && (
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                    {formatBytes(att.size_bytes)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface DetailActionProps {
  icon: ReactNode;
  label: string;
  color: string;
  onClick: () => void;
}

export function DetailAction({ icon, label, color, onClick }: DetailActionProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        padding: "5px 10px",
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
        borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 11,
        fontWeight: 500, color, cursor: "pointer", transition: "all 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `color-mix(in srgb, ${color} 16%, transparent)`;
        e.currentTarget.style.borderColor = `color-mix(in srgb, ${color} 40%, transparent)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = `color-mix(in srgb, ${color} 8%, transparent)`;
        e.currentTarget.style.borderColor = `color-mix(in srgb, ${color} 25%, transparent)`;
      }}
    >
      {icon}
      {label}
    </button>
  );
}

interface MobileDetailFooterProps {
  message: EmailMessage;
  onReject: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onApprove: () => void;
  onLink: () => void;
}

export function MobileDetailFooter({ message, onReject, onArchive, onRestore, onApprove, onLink }: MobileDetailFooterProps) {
  return (
    <>
      {message.import_status === "pending" && (
        <>
          <DetailAction icon={<Plus size={12} />} label="Approve" color="var(--success)" onClick={onApprove} />
          <DetailAction icon={<Link2 size={12} />} label="Link" color="var(--info)" onClick={onLink} />
          <DetailAction icon={<XCircle size={12} />} label="Reject" color="var(--status-error)" onClick={onReject} />
          <DetailAction icon={<Archive size={12} />} label="Archive" color="var(--text-muted)" onClick={onArchive} />
        </>
      )}
      {(message.import_status === "rejected" || message.import_status === "archived") && (
        <DetailAction icon={<RotateCcw size={12} />} label="Restore" color="var(--info)" onClick={onRestore} />
      )}
    </>
  );
}

interface ExtractedFieldsStripProps {
  metadata?: string | Record<string, any> | null;
  confidence?: number;
}

export function ExtractedFieldsStrip({ metadata, confidence }: ExtractedFieldsStripProps) {
  const extracted = useMemo(() => {
    if (!metadata) return null;
    const meta = typeof metadata === "string" ? (() => { try { return JSON.parse(metadata); } catch { return null; } })() : metadata;
    if (!meta?.extracted) return null;
    const e = meta.extracted;
    const hasData = e.summary || e.rfi_number || e.submittal_number
      || (e.drawing_refs?.length > 0) || e.due_date || e.responsible_party
      || e.priority || (e.related_entities?.length > 0) || e.action_required;
    return hasData ? e : null;
  }, [metadata]);

  if (!extracted) return null;

  const chips: Array<{ icon: ReactNode; label: string; color: string }> = [];

  if (extracted.summary) {
    chips.push({ icon: <FileText size={10} strokeWidth={2} />, label: extracted.summary, color: "var(--text-secondary)" });
  }

  if (extracted.action_required) {
    chips.push({ icon: <AlertTriangle size={10} strokeWidth={2} />, label: extracted.action_required, color: "var(--warning)" });
  }

  if (extracted.rfi_number) {
    chips.push({ icon: <Hash size={10} strokeWidth={2} />, label: `RFI ${extracted.rfi_number}`, color: "var(--info)" });
  }

  if (extracted.submittal_number) {
    chips.push({ icon: <Hash size={10} strokeWidth={2} />, label: `Sub ${extracted.submittal_number}`, color: "var(--accent)" });
  }

  if (extracted.drawing_refs?.length > 0) {
    chips.push({ icon: <FileText size={10} strokeWidth={2} />, label: `Dwg: ${extracted.drawing_refs.join(", ")}`, color: "var(--info)" });
  }

  if (extracted.due_date) {
    const d = new Date(extracted.due_date);
    const formatted = isNaN(d.getTime()) ? extracted.due_date : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    chips.push({ icon: <Clock size={10} strokeWidth={2} />, label: `Due: ${formatted}`, color: "var(--warning)" });
  }

  if (extracted.responsible_party) {
    chips.push({ icon: <Send size={10} strokeWidth={2} />, label: extracted.responsible_party, color: "var(--text-secondary)" });
  }

  if (extracted.priority) {
    const priColors: Record<string, string> = { critical: "var(--status-error)", high: "var(--warning)", medium: "var(--info)", low: "var(--text-muted)" };
    chips.push({ icon: <AlertTriangle size={10} strokeWidth={2} />, label: extracted.priority.charAt(0).toUpperCase() + extracted.priority.slice(1), color: priColors[extracted.priority] || "var(--text-muted)" });
  }

  if (extracted.related_entities?.length > 0) {
    chips.push({ icon: <Link2 size={10} strokeWidth={2} />, label: extracted.related_entities.join(", "), color: "var(--accent)" });
  }

  if (chips.length === 0) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 4, marginBottom: 5,
      }}>
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
          letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)",
        }}>
          AI Extracted
        </span>
        {confidence != null && confidence > 0 && (
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
            opacity: 0.7,
          }}>
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {chips.map((chip, i) => (
          <span
            key={i}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: 5,
              fontFamily: "var(--font-body)", fontSize: 10.5, fontWeight: 500,
              color: chip.color,
              background: `color-mix(in srgb, ${chip.color} 8%, transparent)`,
              border: `1px solid color-mix(in srgb, ${chip.color} 20%, transparent)`,
              maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {chip.icon}
            {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}
