import { useId, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { useOptionalOrg } from "@/components/shared/OrgContext";
import type { Organization } from "@/lib/org/repository";
import { createPageUrl } from "@/utils";

type Workspace = Pick<Organization, "id" | "name">;
type WorkspaceContext = {
  orgs: Workspace[];
  currentOrg: Workspace | null;
  isLoadingOrgs: boolean;
  setCurrentOrg: (id: string) => void;
};

/** Uses the existing workspace gate to clear queries and remount project scope. */
export default function WorkspaceSelector({ compact = false }: { compact?: boolean }) {
  const org = useOptionalOrg() as WorkspaceContext | undefined;
  const navigate = useNavigate();
  const labelId = useId();
  // Some isolated shell previews intentionally omit authenticated providers.
  if (!org) return null;
  const currentName = org.currentOrg?.name || "Workspace unavailable";
  const controlStyle: CSSProperties = {
    minWidth: 0, width: "100%", maxWidth: compact ? 132 : 160,
    minHeight: compact ? 34 : 28, padding: "4px 7px",
    border: "1px solid var(--border-default)", borderRadius: 6,
    background: "var(--bg-surface)", color: "var(--text-primary)",
    fontFamily: "var(--font-body)", fontSize: 11, fontWeight: 600,
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0, maxWidth: compact ? "48vw" : 220 }}>
      <span id={labelId} style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: 8, textTransform: "uppercase" }}>Workspace</span>
      {org.isLoadingOrgs || org.orgs.length > 1 ? (
        <select
          aria-labelledby={labelId}
          title={org.isLoadingOrgs ? "Loading workspaces" : currentName}
          value={org.isLoadingOrgs ? "" : org.currentOrg?.id || ""}
          disabled={org.isLoadingOrgs}
          style={controlStyle}
          onChange={event => {
            const nextId = event.currentTarget.value;
            if (!org.isLoadingOrgs && nextId !== org.currentOrg?.id && org.orgs.some(workspace => workspace.id === nextId)) {
              org.setCurrentOrg(nextId);
              // Project/detail deep links belong to the workspace being left.
              // Start at its replacement's project list, with no old URL pin.
              navigate(createPageUrl("Projects"), { replace: true });
            }
          }}
        >
          {org.isLoadingOrgs ? <option value="">Loading workspaces…</option> : null}
          {!org.isLoadingOrgs && !org.currentOrg ? <option value="" disabled>Select workspace</option> : null}
          {!org.isLoadingOrgs && org.orgs.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
        </select>
      ) : (
        <span role="status" aria-labelledby={labelId} title={currentName}
          style={{ ...controlStyle, display: "flex", alignItems: "center", borderColor: "transparent", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {currentName}
        </span>
      )}
    </span>
  );
}
