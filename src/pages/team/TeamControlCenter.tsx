/**
 * TeamControlCenter — canonical workspace team-management presentation.
 * Presentation-only. All data + mutations are owned by the parent OrgMembers.jsx
 * and passed via props — no RBAC logic lives here.
 *
 * RBAC contract (do NOT change):
 *   canManage  — controls whether invite/role-change/remove actions are rendered
 *   isOwner    — controls whether the "Owner" role option appears
 *   ownerCount — used by the parent to gate owner-demotion; surfaced here for display only
 *
 * All mutation handlers (onSendInvite, onChangeRole, onRemove, onRevoke,
 * onCopyLink, onSendStaged, setStagedRole, removeStaged) are the exact
 * same functions from OrgMembers.jsx — they are passed in unchanged.
 */

import { useMemo } from "react";
import { Users, Mail, Link2, X, Shield, UserPlus } from "lucide-react";
import "@/styles/command.css";
import {
  PageHero, KpiStrip, DecisionPanel, Pill, FilterBar, DataTable, useCommandSkin,
} from "@/components/command";
import type { Column, KpiCellDef } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import type { OrgMemberRow, OrgInvitation } from "@/lib/org/repository";
import { buildTeamSummary, roleTone, inviteExpiryTone } from "./teamControlCenter.derive";
import type { StagedInvite } from "@/lib/org/onboardingInvites";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface TeamControlCenterProps {
  // Data (read-only for this component)
  orgName: string;
  members: OrgMemberRow[];
  invites: OrgInvitation[];
  selfUserId: string;
  ownerCount: number;
  /** Seat capacity from seatCapacity() — already computed in OrgMembers.jsx. */
  seatsUsed: number;
  seatsLimit: number | null;   // null = unlimited
  seatsPct: number;
  seatsAtLimit: boolean;
  seatsNear: boolean;
  planName: string;

  // RBAC gates (these exact values come from OrgMembers.jsx — do not recompute)
  canManage: boolean;
  isOwner: boolean;

  // Onboarding invite batch — passed through unchanged from parent state
  staged: StagedInvite[];
  stagedSkippedNote: string;
  sendingStaged: boolean;
  seatsLeft: number; // Infinity or a finite count (from parent)

  // Single-invite form state (parent owns these too)
  inviteEmail: string;
  inviteRole: string;
  inviteBusy: boolean;
  atMemberLimit: boolean;

  // Search/filter state
  search: string;
  onSearch: (v: string) => void;

  // Handlers — all the EXACT same functions from OrgMembers.jsx
  onSendInvite: (e: React.FormEvent) => void;
  onSetInviteEmail: (v: string) => void;
  onSetInviteRole: (v: string) => void;
  onChangeRole: (m: OrgMemberRow, nextRole: string) => void;
  onRemove: (m: OrgMemberRow) => void;
  onRevoke: (id: string) => void;
  onCopyLink: (token: string) => void;
  onNavigateToBilling: () => void;
  // Staged batch handlers
  onSendStaged: () => void;
  onSetStagedRole: (idx: number, role: string) => void;
  onRemoveStaged: (idx: number) => void;
  onDismissStaged: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};
const ROLE_OPTIONS = ["member", "admin"];

function fmt(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

function scrollToTable() {
  document.querySelector(".team-cc .cmd-table-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Inline-style atoms — only what command.css doesn't already provide
const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };
const smallBtn: React.CSSProperties = { padding: "4px 8px", fontSize: 11, minHeight: 28, display: "inline-flex", alignItems: "center", gap: 4 };

// ── Sub-components ────────────────────────────────────────────────────────────

function RolePill({ role }: { role: string }) {
  return <Pill tone={roleTone(role)}>{fmt(role)}</Pill>;
}

function SeatBar({ pct, atLimit, near, unlimited }: { pct: number; atLimit: boolean; near: boolean; unlimited: boolean }) {
  if (unlimited) return null;
  const color = atLimit ? "var(--status-error)" : near ? "var(--status-warning)" : "var(--accent)";
  return (
    <div style={{ height: 4, borderRadius: 999, background: "color-mix(in srgb, var(--border-default) 60%, transparent)", overflow: "hidden", marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width .2s" }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TeamControlCenter(props: TeamControlCenterProps) {
  const {
    orgName, members, invites, selfUserId, ownerCount,
    seatsUsed, seatsLimit, seatsPct, seatsAtLimit, seatsNear, planName,
    canManage, isOwner,
    staged, stagedSkippedNote, sendingStaged, seatsLeft,
    inviteEmail, inviteRole, inviteBusy, atMemberLimit,
    search, onSearch,
    onSendInvite, onSetInviteEmail, onSetInviteRole,
    onChangeRole, onRemove, onRevoke, onCopyLink, onNavigateToBilling,
    onSendStaged, onSetStagedRole, onRemoveStaged, onDismissStaged,
  } = props;

  useCommandSkin();

  const s = useMemo(() => buildTeamSummary(members, invites, seatsLimit), [members, invites, seatsLimit]);

  // Filter the members table by search
  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      (m.full_name || "").toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q) ||
      (m.role || "").toLowerCase().includes(q)
    );
  }, [members, search]);

  // ── Hero ────────────────────────────────────────────────────────────────────

  const heroChips = [
    { label: `${s.totalMembers} Member${s.totalMembers === 1 ? "" : "s"}` },
    ...(s.pendingInvites > 0 ? [{ label: `${s.pendingInvites} Pending`, tone: "warn" as const }] : []),
    ...(seatsAtLimit ? [{ label: "Seat limit reached", tone: "danger" as const }] : []),
  ];

  // ── KPI Strip ───────────────────────────────────────────────────────────────

  const seatsLimitDisplay = seatsLimit == null ? "∞" : String(seatsLimit);
  const kpiCells: KpiCellDef[] = [
    {
      label: "Total Members",
      value: s.totalMembers,
      sublabel: "accepted",
      tone: "good",
      Icon: Users,
    },
    {
      label: "Pending Invites",
      value: s.pendingInvites,
      sublabel: "awaiting acceptance",
      tone: s.pendingInvites > 0 ? "warn" : "neutral",
      Icon: Mail,
    },
    {
      label: "Seats Used",
      value: seatsLimit == null ? `${seatsUsed}` : `${seatsUsed} / ${seatsLimitDisplay}`,
      sublabel: seatsLimit == null ? `Unlimited on ${planName}` : `${planName} plan`,
      tone: seatsAtLimit ? "danger" : seatsNear ? "warn" : "neutral",
      Icon: Shield,
    },
    // Per-role counts (up to 3 roles: owner / admin / member)
    ...s.byRole.slice(0, 3).map((rg) => ({
      label: rg.label,
      value: rg.count,
      sublabel: "workspace",
      tone: roleTone(rg.role) as "neutral" | "good" | "warn" | "danger" | "info",
      Icon: Shield,
    })),
  ];

  // ── Members table columns ────────────────────────────────────────────────────

  const columns: Column<OrgMemberRow>[] = [
    {
      key: "name",
      header: "Name",
      render: (m) => {
        const self = m.user_id === selfUserId;
        const display = m.full_name || m.email || `${m.user_id.slice(0, 8)}…`;
        return (
          <div>
            <div style={{ color: "var(--text-primary)", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              {display}
              {self && (
                <span style={{ ...mono, fontSize: 9, color: "var(--accent)", letterSpacing: "0.06em" }}>YOU</span>
              )}
            </div>
            {m.email && m.full_name && (
              <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>{m.email}</div>
            )}
          </div>
        );
      },
    },
    {
      key: "role",
      header: "Role",
      render: (m) => {
        const self = m.user_id === selfUserId;
        if (canManage && !self) {
          return (
            <select
              value={m.role}
              onChange={(e) => onChangeRole(m, e.target.value)}
              className="sbd-select"
              style={{ padding: "5px 8px", borderRadius: 7, fontSize: 12 }}
              // Prevent row-click from firing when interacting with the select
              onClick={(e) => e.stopPropagation()}
            >
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{fmt(r)}</option>)}
              {(isOwner || m.role === "owner") && <option value="owner">{fmt("owner")}</option>}
            </select>
          );
        }
        return <RolePill role={m.role} />;
      },
    },
    {
      key: "email",
      header: "Email",
      render: (m) => <span style={{ ...mono, fontSize: 12, color: "var(--text-secondary)" }}>{m.email || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: () => <Pill tone="good">Active</Pill>,
    },
    {
      key: "joined",
      header: "Joined",
      render: (m) => <span style={{ ...mono, fontSize: 12 }}>{m.created_at.slice(0, 10)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right" as const,
      render: (m) => {
        if (!canManage || m.user_id === selfUserId) return null;
        return (
          <button
            type="button"
            className="sbd-btn sbd-btn-ghost"
            style={{ ...smallBtn, color: "var(--status-error)" }}
            title="Remove from workspace"
            onClick={(e) => { e.stopPropagation(); onRemove(m); }}
          >
            <X size={13} /> Remove
          </button>
        );
      },
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="team-cc">
      <PageHero
        Icon={Users}
        title="Team Control Center"
        subtitle="Manage workspace members, roles, and invitations."
        projectName={orgName}
        chips={heroChips}
        photoSrc={photoFor("OrgMembers") ?? undefined}
        stats={[]}
      />

      <KpiStrip cells={kpiCells} />

      {/* Seat bar — visual capacity indicator */}
      {seatsLimit != null && (
        <div style={{ padding: "0 var(--cmd-page-px, 24px) 4px" }}>
          <SeatBar pct={seatsPct} atLimit={seatsAtLimit} near={seatsNear} unlimited={false} />
          {seatsAtLimit && canManage && (
            <div style={{ ...mono, fontSize: 11, color: "var(--status-error)", marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
              {planName} seat limit reached ({seatsLimit}).{" "}
              <button type="button" onClick={onNavigateToBilling} style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", textDecoration: "underline", cursor: "pointer", ...mono, fontSize: 11 }}>Upgrade</button>
            </div>
          )}
        </div>
      )}

      {/* Decision panels */}
      <div className="cmd-panels">
        {/* By Role */}
        <DecisionPanel title="By Role" onViewAll={scrollToTable}>
          {s.byRole.length === 0 ? (
            <div className="cmd-row__meta">No members yet.</div>
          ) : s.byRole.map((rg) => (
            <div className="cmd-row" key={rg.role}>
              <div className="cmd-row__num">{rg.label}</div>
              <RolePill role={rg.role} />
              <div style={{ ...mono, fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>{rg.count}</div>
            </div>
          ))}
        </DecisionPanel>

        {/* Pending Invites */}
        <DecisionPanel title="Pending Invites" onViewAll={scrollToTable}>
          {s.pendingQueue.length === 0 ? (
            <div className="cmd-row__meta">No pending invites.</div>
          ) : s.pendingQueue.map((inv) => (
            <div className="cmd-row" key={inv.id}>
              <div>
                <div style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 13, wordBreak: "break-all" }}>{inv.email}</div>
                <div className="cmd-row__meta">
                  <Pill tone={inviteExpiryTone(inv.daysUntilExpiry)}>
                    {inv.daysUntilExpiry <= 0 ? "Expired" : `${inv.daysUntilExpiry}d left`}
                  </Pill>
                  {" · "}
                  {fmt(inv.role)}
                </div>
              </div>
              {canManage && (
                <div style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: "auto" }}>
                  <button type="button" className="sbd-btn sbd-btn-ghost" style={smallBtn} title="Copy link" onClick={() => onCopyLink(inv.token)}>
                    <Link2 size={13} />
                  </button>
                  <button type="button" className="sbd-btn sbd-btn-ghost" style={{ ...smallBtn, color: "var(--status-error)" }} title="Revoke" onClick={() => onRevoke(inv.id)}>
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </DecisionPanel>

        {/* Recent Activity */}
        <DecisionPanel title="Recent Activity" onViewAll={scrollToTable}>
          {s.recentActivity.length === 0 ? (
            <div className="cmd-row__meta">No activity yet.</div>
          ) : s.recentActivity.map((row) => (
            <div className="cmd-row" key={row.id}>
              <div>
                <div style={{ color: "var(--text-primary)", fontSize: 13 }}>{row.label}</div>
                <div className="cmd-row__meta">{row.detail}</div>
              </div>
              <Pill tone={row.tone}>{row.tone === "warn" ? "Invited" : "Joined"}</Pill>
            </div>
          ))}
        </DecisionPanel>
      </div>

      {/* Invite form (canManage only) — FilterBar is used for search; the invite
          form is a separate light card below it so the UX matches the RFI CC
          pattern of "filter then act" */}
      <FilterBar
        search={search}
        onSearch={onSearch}
        searchPlaceholder="Search name, email, or role"
        primaryLabel="Invite Member"
        onPrimary={canManage && !atMemberLimit ? () => {
          // Scroll to the invite form card below the filter bar
          document.querySelector(".team-cc .team-invite-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
        } : null}
      />

      {/* Onboarding batch invite panel */}
      {canManage && staged.length > 0 && (
        <div className="team-invite-card" style={{ margin: "0 var(--cmd-page-px, 24px)", padding: 16, border: "1px solid color-mix(in srgb, var(--accent) 40%, var(--border-default))", borderRadius: "var(--cmd-card-radius, 10px)", background: "var(--bg-surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, color: "var(--text-primary)", fontWeight: 700, fontSize: 13 }}>
            <UserPlus size={15} style={{ color: "var(--accent)" }} /> Invite your team from setup
          </div>
          <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
            Carried over from onboarding — review roles then send. Each becomes a 14-day invite link.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {staged.map((inv, idx) => (
              <div key={inv.email} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 240px", color: "var(--text-primary)", fontWeight: 600, fontSize: 14, wordBreak: "break-all" }}>{inv.email}</span>
                <select
                  value={inv.role}
                  onChange={(e) => onSetStagedRole(idx, e.target.value)}
                  disabled={sendingStaged}
                  className="sbd-select"
                  style={{ padding: "8px 10px", borderRadius: 9, minHeight: 38 }}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  {isOwner && <option value="owner">Owner</option>}
                </select>
                <button type="button" onClick={() => onRemoveStaged(idx)} disabled={sendingStaged} className="sbd-btn sbd-btn-ghost" style={{ ...smallBtn, color: "var(--status-error)" }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" className="sbd-btn sbd-btn-primary" onClick={onSendStaged} disabled={sendingStaged || seatsAtLimit} style={{ minHeight: 40 }}>
              {sendingStaged ? "Sending…" : `Send ${staged.length} invite${staged.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" className="sbd-btn sbd-btn-ghost" onClick={onDismissStaged} disabled={sendingStaged} style={{ minHeight: 40 }}>Dismiss</button>
            {stagedSkippedNote && <span style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>{stagedSkippedNote}</span>}
          </div>
          {seatsLimit != null && staged.length > seatsLeft && (
            <div style={{ ...mono, fontSize: 11, color: "var(--status-warning)", marginTop: 8 }}>
              Only {seatsLeft} seat{seatsLeft === 1 ? "" : "s"} left on {planName}.{" "}
              <button type="button" onClick={onNavigateToBilling} style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", textDecoration: "underline", cursor: "pointer", ...mono, fontSize: 11 }}>Upgrade</button>
            </div>
          )}
        </div>
      )}

      {/* Manual invite form */}
      {canManage && (
        <div className="team-invite-card" style={{ margin: "0 var(--cmd-page-px, 24px)", padding: 16, borderRadius: "var(--cmd-card-radius, 10px)", background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "var(--text-primary)", fontWeight: 700, fontSize: 13 }}>
            <Mail size={15} style={{ color: "var(--accent)" }} /> Invite a teammate
          </div>
          <form onSubmit={onSendInvite} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => onSetInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              disabled={inviteBusy}
              style={{
                flex: "1 1 260px", minWidth: 200,
                background: "var(--bg-input)", border: "1px solid var(--border-default)",
                borderRadius: 9, padding: "10px 12px", color: "var(--text-primary)",
                fontSize: 14, outline: "none",
              }}
            />
            <select
              value={inviteRole}
              onChange={(e) => onSetInviteRole(e.target.value)}
              disabled={inviteBusy}
              className="sbd-select"
              style={{ padding: "10px 12px", borderRadius: 9, minHeight: 40 }}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              className="sbd-btn sbd-btn-primary"
              disabled={inviteBusy || !inviteEmail.trim() || atMemberLimit}
              style={{ minHeight: 40 }}
            >
              {inviteBusy ? "Inviting…" : "Send invite"}
            </button>
          </form>
          {atMemberLimit ? (
            <div style={{ ...mono, fontSize: 11, color: "var(--status-warning)", marginTop: 8 }}>
              {planName} plan limit reached.{" "}
              <button type="button" onClick={onNavigateToBilling} style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", textDecoration: "underline", cursor: "pointer", ...mono, fontSize: 11 }}>Upgrade</button>
            </div>
          ) : (
            <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              Creates a 14-day invite link (copied to clipboard) — send it to them.
            </div>
          )}
        </div>
      )}

      {/* Members data table */}
      <DataTable<OrgMemberRow>
        columns={columns}
        rows={filteredMembers}
        emptyMessage="No members match your search."
      />
    </div>
  );
}
