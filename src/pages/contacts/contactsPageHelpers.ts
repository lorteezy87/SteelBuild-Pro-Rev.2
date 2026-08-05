/**
 * Pure helpers for Contacts page shell.
 */
import { CONTACT_TYPE } from "@/lib/enums";

export type ContactLike = {
  contact_type?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  email?: string | null;
  role?: string | null;
  [k: string]: unknown;
};

export function filterContacts(
  contacts: ContactLike[],
  filterType: string,
  search: string,
): ContactLike[] {
  const q = (search || "").toLowerCase();
  return (contacts || []).filter((c) => {
    const typeMatch = filterType === "all" || c.contact_type === filterType;
    const searchMatch =
      !q ||
      `${c.first_name || ""} ${c.last_name || ""}`.toLowerCase().includes(q) ||
      (c.company || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.role || "").toLowerCase().includes(q);
    return typeMatch && searchMatch;
  });
}

export function computeContactStats(contacts: ContactLike[]) {
  return {
    total: contacts.length,
    owner: contacts.filter((c) => c.contact_type === CONTACT_TYPE.OWNER).length,
    gc: contacts.filter((c) => c.contact_type === CONTACT_TYPE.GC).length,
    engineer: contacts.filter((c) => c.contact_type === CONTACT_TYPE.ENGINEER).length,
    subcontractor: contacts.filter((c) => c.contact_type === CONTACT_TYPE.SUBCONTRACTOR).length,
    supplier: contacts.filter((c) => c.contact_type === CONTACT_TYPE.SUPPLIER).length,
    inspector: contacts.filter((c) => c.contact_type === CONTACT_TYPE.INSPECTOR).length,
    internal: contacts.filter((c) => c.contact_type === CONTACT_TYPE.INTERNAL).length,
  };
}

/** @deprecated Prefer `@/pages/shared/findById` — re-export kept for local imports. */
export { findById } from "@/pages/shared/findById";

export const CONTACT_TYPE_COLORS: Record<string, string> = {
  [CONTACT_TYPE.OWNER]: "var(--status-error)",
  [CONTACT_TYPE.GC]: "var(--status-info)",
  [CONTACT_TYPE.ENGINEER]: "var(--accent)",
  [CONTACT_TYPE.SUBCONTRACTOR]: "var(--status-warning)",
  [CONTACT_TYPE.SUPPLIER]: "var(--status-success)",
  [CONTACT_TYPE.INSPECTOR]: "var(--text-muted)",
  [CONTACT_TYPE.INTERNAL]: "var(--secondary)",
};

/** Filter chip values including "all". */
export const CONTACT_TYPE_FILTER_OPTIONS = [
  "all",
  ...Object.values(CONTACT_TYPE),
] as const;

/**
 * KPI-tile toggle: click active type again → all; else set that type.
 */
export function nextContactTypeFilter(
  current: string,
  clicked: string,
): string {
  if (clicked === "all") return "all";
  return current === clicked ? "all" : clicked;
}

export function contactsCommandSubtitle(
  filterType: string,
): string {
  const base =
    "Project directory · Owner / GC / Engineer / Subs / Suppliers / Inspectors";
  return filterType !== "all" ? `${base} · filtered: ${filterType}` : base;
}

