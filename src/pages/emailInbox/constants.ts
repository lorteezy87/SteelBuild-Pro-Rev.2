import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { formatLocalDate } from "@/utils/dates";
import {
  Archive,
  CheckCircle2,
  Inbox,
  Link2,
  Mail,
  Send,
  Star,
  XCircle,
} from "lucide-react";
import type { EntityTypeOption, Folder, StatusStyle, TypeStyle } from "./types";

export const TYPE_STYLES: Record<string, TypeStyle> = {
  rfi:          { color: "var(--info)",       label: "RFI" },
  submittal:    { color: "var(--accent)",     label: "Submittal" },
  action_item:  { color: "var(--warning)",    label: "Action Item" },
  transmittal:  { color: "var(--success)",    label: "Transmittal" },
  change_order: { color: "#F97316",          label: "Change Order" },
  general:      { color: "var(--text-muted)", label: "General" },
  unknown:      { color: "var(--text-muted)", label: "Unknown" },
};

export const STATUS_STYLES: Record<string, StatusStyle> = {
  pending:  { color: "var(--warning)",      bg: "var(--warning-muted)",  border: "var(--warning-border)", label: "Pending" },
  approved: { color: "var(--success)",      bg: "var(--success-muted)",  border: "var(--success-border)", label: "Approved" },
  rejected: { color: "var(--status-error)", bg: "color-mix(in srgb, var(--status-error) 10%, transparent)", border: "color-mix(in srgb, var(--status-error) 30%, transparent)", label: "Rejected" },
  linked:   { color: "var(--info)",         bg: "var(--info-muted)",     border: "var(--info-border)",    label: "Linked" },
  archived: { color: "var(--text-muted)",   bg: "var(--bg-surface-low)", border: "var(--border-default)", label: "Archived" },
};

export const ENTITY_TYPE_OPTIONS: EntityTypeOption[] = [
  { value: "rfi",          label: "RFI" },
  { value: "action_item",  label: "Action Item" },
  { value: "submittal",    label: "Submittal" },
  { value: "change_order", label: "Change Order" },
];

export const DEFAULT_LABELS = ["Urgent", "Follow-up", "Waiting", "Important"];

const LABEL_COLORS: Record<string, string> = {
  "Urgent":     "#EF4444",
  "Follow-up":  "#F59E0B",
  "Waiting":    "#8B5CF6",
  "Important":  "#3B82F6",
};

export function getLabelColor(label: string): string {
  if (LABEL_COLORS[label]) return LABEL_COLORS[label];
  // Deterministic color from string hash
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = label.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

export const FOLDERS: Folder[] = [
  { id: "inbox",    label: "Inbox",    icon: Inbox,       filter: (m) => m.import_status === "pending" && m.direction !== "outbound" },
  { id: "sent",     label: "Sent",     icon: Send,        filter: (m) => m.direction === "outbound" },
  { id: "starred",  label: "Starred",  icon: Star,        filter: (m) => Boolean(m.is_starred) && m.import_status !== "archived" && m.import_status !== "rejected" },
  { id: "approved", label: "Approved", icon: CheckCircle2, filter: (m) => m.import_status === "approved" && m.direction !== "outbound" },
  { id: "linked",   label: "Linked",   icon: Link2,       filter: (m) => m.import_status === "linked" },
  { id: "rejected", label: "Rejected", icon: XCircle,     filter: (m) => m.import_status === "rejected" },
  { id: "archived", label: "Archived", icon: Archive,     filter: (m) => m.import_status === "archived" },
  { id: "all",      label: "All Mail", icon: Mail,        filter: () => true },
];

export function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return formatLocalDate(dateStr, "en-US", { month: "short", day: "numeric" });
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

// Combined raw-size cap for outbound attachments (must match the email-send
// edge function guard). base64 inflates the request body ~33%.
export const MAX_ATTACH_TOTAL_BYTES = 20 * 1024 * 1024;

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export const labelStyle: CSSProperties = {
  display: "block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 5,
};

export const inputStyle: CSSProperties = {
  width: "100%", padding: "8px 12px", background: "var(--bg-surface-low)",
  border: "1px solid var(--border-default)", borderRadius: 8,
  fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-primary)",
  outline: "none", boxSizing: "border-box",
};

export const primaryBtnStyle: CSSProperties = {
  padding: "8px 18px", background: "var(--accent)", border: "1px solid var(--accent-border)",
  borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 600,
  color: "var(--text-on-accent, #fff)", cursor: "pointer", transition: "all 120ms",
};

export const secondaryBtnStyle: CSSProperties = {
  padding: "8px 18px", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
  borderRadius: 8, fontFamily: "var(--font-body)", fontSize: 12, fontWeight: 500,
  color: "var(--text-secondary)", cursor: "pointer", transition: "all 120ms",
};

export function useWindowWidth(): number {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}
