/** Pure chrome helpers for TeamControlCenter. */
import type { CSSProperties } from "react";

export const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export const ROLE_OPTIONS = ["member", "admin"] as const;

export function formatTeamRole(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

export const monoStyle: CSSProperties = { fontFamily: "var(--font-mono)" };

export const smallBtnStyle: CSSProperties = {
  padding: "4px 8px",
  fontSize: 11,
  minHeight: 28,
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};
