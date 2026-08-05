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

