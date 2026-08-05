/**
 * Presentational chrome for Email Inbox (header, KPI, sidebar, list shell).
 */
// @ts-nocheck
import type { ComponentType, PropsWithChildren } from "react";
import {
  Archive, Clock, Eye, Inbox, Mail, PenSquare, Search, Send, Settings, Star, XCircle,
} from "lucide-react";
import { KpiTile as KpiTileRaw, BulkActionBar as BulkActionBarRaw, Button as ButtonRaw } from "@/components/design-system";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import { toUserErrorMessage } from "@/lib/mutations/standardMutation";
import { FOLDERS, getLabelColor } from "./constants";
import { EmailRow } from "./components";
import { countMessagesWithLabel } from "./emailInboxHelpers";
import type { EmailMessage } from "./types";

type AnyProps = PropsWithChildren<Record<string, unknown>>;
const KpiTile = KpiTileRaw as unknown as ComponentType<AnyProps>;
const BulkActionBar = BulkActionBarRaw as unknown as ComponentType<AnyProps>;
const Button = ButtonRaw as unknown as ComponentType<AnyProps>;

export function InboxHeader({ onCompose, onOpenSettings }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
      <Mail size={20} strokeWidth={1.75} style={{ color: "var(--accent)" }} />
      <h1 style={{
        fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700,
        color: "var(--text-primary)", margin: 0,
      }}>
        Email Inbox
      </h1>
      <div style={{ flex: 1 }} />
      <button
        onClick={onCompose}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          height: 30, padding: "0 12px",
          background: "var(--accent)", border: "1px solid var(--accent-border)",
          borderRadius: 8, cursor: "pointer",
          fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
          color: "var(--on-accent)", flexShrink: 0,
        }}
      >
        <PenSquare size={12} strokeWidth={2} />
        Compose
      </button>
      <button
        onClick={onOpenSettings}
        title="Email Settings"
        style={{
          height: 30, width: 30, display: "flex", alignItems: "center", justifyContent: "center",
          background: "var(--bg-surface)", border: "1px solid var(--border-default)",
          borderRadius: 8, cursor: "pointer", color: "var(--text-muted)", flexShrink: 0,
        }}
      >
        <Settings size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

export function EmailKpiStrip({ stats, activeFolder, onFolder }) {
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
      <KpiTile compact label="Inbox" value={stats.total} icon={<Inbox size={14} />} color="var(--accent)"
        active={activeFolder === "inbox"} onClick={() => onFolder("inbox")} />
      <KpiTile compact label="Unread" value={stats.unread} icon={<Mail size={14} />} color="var(--warning)"
        onClick={() => onFolder("inbox")} />
      <KpiTile compact label="Starred" value={stats.starred} icon={<Star size={14} />} color="var(--status-warning)"
        active={activeFolder === "starred"} onClick={() => onFolder("starred")} />
      <KpiTile compact label="Sent" value={stats.sent} icon={<Send size={14} />} color="var(--accent)"
        active={activeFolder === "sent"} onClick={() => onFolder("sent")} />
      <KpiTile compact label="Pending Review" value={stats.pending} icon={<Clock size={14} />} color="var(--info)"
        active={activeFolder === "inbox"} onClick={() => onFolder("inbox")} />
    </div>
  );
}

export function FolderSidebar({
  activeFolder,
  activeLabelFilter,
  folderCounts,
  allLabels,
  messages,
  onSelectFolder,
  onSelectLabel,
}) {
  return (
    <div style={{
      width: 200, flexShrink: 0, borderRight: "1px solid var(--border-default)",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ padding: "12px 8px 6px" }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: "var(--text-muted)", padding: "0 8px 6px",
        }}>
          Folders
        </div>
        {FOLDERS.map((f) => {
          const FolderIcon = f.icon;
          const isActive = activeFolder === f.id && !activeLabelFilter;
          const count = folderCounts[f.id] || 0;
          return (
            <button
              key={f.id}
              onClick={() => onSelectFolder(f.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "7px 10px", borderRadius: 6, border: "none",
                background: isActive ? "var(--accent-muted)" : "transparent",
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                fontFamily: "var(--font-body)", fontSize: 12, fontWeight: isActive ? 600 : 400,
                cursor: "pointer", textAlign: "left", transition: "all 100ms",
              }}
            >
              <FolderIcon size={14} strokeWidth={isActive ? 2 : 1.5} />
              <span style={{ flex: 1 }}>{f.label}</span>
              {count > 0 && (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  minWidth: 18, textAlign: "right",
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ padding: "8px 8px 12px", borderTop: "1px solid var(--border-default)", marginTop: 4 }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
          letterSpacing: "0.14em", textTransform: "uppercase",
          color: "var(--text-muted)", padding: "4px 8px 6px",
        }}>
          Labels
        </div>
        {allLabels.map((label) => {
          const isActive = activeLabelFilter === label;
          const color = getLabelColor(label);
          const count = countMessagesWithLabel(messages, label);
          return (
            <button
              key={label}
              onClick={() => onSelectLabel(label, isActive)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "5px 10px", borderRadius: 6, border: "none",
                background: isActive ? `color-mix(in srgb, ${color} 15%, transparent)` : "transparent",
                color: isActive ? color : "var(--text-secondary)",
                fontFamily: "var(--font-body)", fontSize: 11, fontWeight: isActive ? 600 : 400,
                cursor: "pointer", textAlign: "left", transition: "all 100ms",
              }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0,
              }} />
              <span style={{ flex: 1 }}>{label}</span>
              {count > 0 && (
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  color: "var(--text-muted)",
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EmailListToolbar({
  search,
  onSearchChange,
  isNarrow,
  activeFolder,
  onFolderChange,
  allFilteredSelected,
  filteredCount,
  selectedCount,
  onToggleSelectAll,
}) {
  return (
    <>
      <div style={{
        padding: "10px 12px", borderBottom: "1px solid var(--border-default)",
        display: "flex", gap: 8, alignItems: "center", flexShrink: 0,
      }}>
        <div style={{ flex: 1, position: "relative" }}>
          <Search size={13} strokeWidth={2} style={{
            position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
            color: "var(--text-muted)", pointerEvents: "none",
          }} />
          <input
            type="text" value={search} onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search emails..."
            style={{
              width: "100%", height: 30, padding: "0 8px 0 28px",
              background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
              borderRadius: 6, fontFamily: "var(--font-body)", fontSize: 11,
              color: "var(--text-primary)", outline: "none",
            }}
          />
        </div>
        {isNarrow && (
          <select
            value={activeFolder}
            onChange={(e) => onFolderChange(e.target.value)}
            style={{
              height: 30, padding: "0 24px 0 8px", background: "var(--bg-surface-low)",
              border: "1px solid var(--border-default)", borderRadius: 6,
              fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-primary)",
              cursor: "pointer", appearance: "none",
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
            }}
          >
            {FOLDERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        )}
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
        borderBottom: "1px solid var(--border-default)", flexShrink: 0,
        background: "var(--bg-surface-low)",
      }}>
        <input
          type="checkbox"
          checked={allFilteredSelected && filteredCount > 0}
          onChange={onToggleSelectAll}
          style={{ accentColor: "var(--accent)", cursor: "pointer" }}
        />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
          letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)",
        }}>
          {selectedCount > 0 ? `${selectedCount} selected` : `${filteredCount} emails`}
        </span>
      </div>
    </>
  );
}

export function EmailListBody({
  isLoading,
  isError,
  error,
  onRetry,
  filtered,
  messagesLength,
  selectedId,
  selectedIds,
  attachmentsByMessage,
  onSelectMessage,
  onToggleSelect,
  onStar,
}) {
  if (isLoading) {
    return (
      <div style={{ padding: 16 }}>
        <LoadingSkeleton variant="table" rows={8} />
      </div>
    );
  }
  if (isError) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        gap: 12,
      }}>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
          Couldn’t load emails
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center", maxWidth: 280 }}>
          {toUserErrorMessage(error, "Something went wrong. Try again.")}
        </p>
        <Button variant="outline" onClick={onRetry}>Retry</Button>
      </div>
    );
  }
  if (filtered.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <Inbox size={32} strokeWidth={1.25} style={{ color: "var(--text-muted)", marginBottom: 8 }} />
        <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
          {messagesLength > 0 ? "No emails match your filters" : "No emails yet"}
        </p>
      </div>
    );
  }
  return filtered.map((msg: EmailMessage) => (
    <EmailRow
      key={msg.id}
      message={msg}
      isSelected={selectedId === msg.id}
      isChecked={selectedIds.has(msg.id)}
      onSelect={() => onSelectMessage(msg)}
      onCheck={(e) => onToggleSelect(msg.id, e)}
      onStar={(e) => onStar(msg, e)}
      attachmentCount={(attachmentsByMessage[msg.id] || []).length}
    />
  ));
}

export function DetailEmptyState() {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 8, color: "var(--text-muted)",
    }}>
      <Mail size={40} strokeWidth={1} style={{ opacity: 0.4 }} />
      <span style={{ fontFamily: "var(--font-body)", fontSize: 13 }}>Select an email to read</span>
    </div>
  );
}

export function EmailBulkBar({ selectedIds, onClear, onBulk }) {
  return (
    <BulkActionBar
      count={selectedIds.size}
      onClear={onClear}
      actions={[
        {
          label: "Mark Read", icon: <Eye size={12} />,
          onClick: () => onBulk("read"),
        },
        {
          label: "Star", icon: <Star size={12} />,
          onClick: () => onBulk("star"),
        },
        {
          label: "Archive", icon: <Archive size={12} />,
          onClick: () => onBulk("archive"),
        },
        {
          label: "Reject", icon: <XCircle size={12} />, variant: "danger",
          onClick: () => onBulk("reject"),
        },
      ]}
    />
  );
}
