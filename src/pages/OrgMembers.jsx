/**
 * OrgMembers — workspace team management (multi-tenant SaaS).
 *
 * Invite teammates by email (creates a tokenised invite → shareable accept
 * link), see/revoke pending invites, and manage current members (role, remove).
 * Owner/admin only for the mutating actions; everyone can view. Org membership
 * grants workspace access — an admin still adds members to specific projects
 * (via Project Members) for project data.
 */

import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Mail, Link2, X, Shield } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useOrg } from "@/components/shared/OrgContext";
import { CommandBar } from "@/components/design-system";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import {
  listOrgMembers, listInvitations, createInvitation, revokeInvitation,
  updateMemberRole, removeMember, inviteLink,
} from "@/lib/org/repository";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" };

export default function OrgMembers() {
  const { user } = useAuth();
  const { currentOrg, currentRole } = useOrg();
  const qc = useQueryClient();
  const orgId = currentOrg?.id;
  const canManage = currentRole === "owner" || currentRole === "admin";
  const isOwner = currentRole === "owner";

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);

  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["org-members", orgId], queryFn: () => listOrgMembers(orgId), enabled: !!orgId,
  });
  const { data: invites = [], isLoading: loadingInvites } = useQuery({
    queryKey: ["org-invites", orgId], queryFn: () => listInvitations(orgId), enabled: !!orgId,
  });

  const ownerCount = useMemo(() => members.filter((m) => m.role === "owner").length, [members]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["org-members", orgId] });
    qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
  };

  const copyLink = async (token) => {
    const link = inviteLink(token);
    try { await navigator.clipboard.writeText(link); toast.success("Invite link copied"); }
    catch { toast.message(link); }
  };

  const sendInvite = async (e) => {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr || !orgId || busy) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { toast.error("Enter a valid email"); return; }
    setBusy(true);
    try {
      const inv = await createInvitation(orgId, addr, role, user.id);
      await copyLink(inv.token);
      toast.success(`Invited ${addr} — link copied, send it to them`);
      setEmail("");
      refresh();
    } catch (err) {
      const msg = String(err?.message || "");
      toast.error(/duplicate|unique/i.test(msg) ? "There's already a pending invite for that email" : (msg || "Couldn't create invite"));
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id) => { try { await revokeInvitation(id); refresh(); } catch (e) { toast.error(e?.message || "Couldn't revoke"); } };
  const onChangeRole = async (m, next) => {
    if (m.role === "owner" && next !== "owner" && ownerCount <= 1) { toast.error("A workspace needs at least one owner"); return; }
    try { await updateMemberRole(m.id, next); toast.success("Role updated"); refresh(); } catch (e) { toast.error(e?.message || "Couldn't update role"); }
  };
  const onRemove = async (m) => {
    if (m.user_id === user.id) { toast.error("You can't remove yourself"); return; }
    if (m.role === "owner" && ownerCount <= 1) { toast.error("A workspace needs at least one owner"); return; }
    try { await removeMember(m.id); toast.success("Member removed"); refresh(); } catch (e) { toast.error(e?.message || "Couldn't remove"); }
  };

  if (!orgId) {
    return <div className="page-content" style={{ padding: 24 }}><CommandBar eyebrow="Workspace" title="Team" /></div>;
  }

  return (
    <div className="page-content" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 920 }}>
      <CommandBar eyebrow={currentOrg?.name || "Workspace"} title="Team" count={members.length} unit=" members" subtitle="Invite teammates and manage who can access this workspace" />

      {canManage && (
        <div className="sbd-card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "var(--text-primary)", fontWeight: 700, fontSize: 13 }}>
            <Mail size={15} style={{ color: "var(--accent)" }} /> Invite a teammate
          </div>
          <form onSubmit={sendInvite} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" disabled={busy}
              style={{ flex: "1 1 260px", minWidth: 200, background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 9, padding: "10px 12px", color: "var(--text-primary)", fontSize: 14, outline: "none" }}
            />
            <select value={role} onChange={(e) => setRole(e.target.value)} disabled={busy} className="sbd-select" style={{ padding: "10px 12px", borderRadius: 9, minHeight: 40 }}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="sbd-btn sbd-btn-primary" disabled={busy || !email.trim()} style={{ minHeight: 40 }}>
              {busy ? "Inviting…" : "Send invite"}
            </button>
          </form>
          <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
            Creates a 14-day invite link (copied to your clipboard) — send it to them; they accept after signing in.
          </div>
        </div>
      )}

      {/* Pending invites */}
      {(loadingInvites ? false : invites.length > 0) && (
        <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={sectionHdr}>Pending invites ({invites.length})</div>
          <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id}>
                  <td style={td}><span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{inv.email}</span></td>
                  <td style={td}><Badge>{ROLE_LABEL[inv.role] || inv.role}</Badge></td>
                  <td style={{ ...td, ...mono, fontSize: 11, color: "var(--text-muted)" }}>expires {String(inv.expires_at).slice(0, 10)}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    {canManage && (
                      <>
                        <button onClick={() => copyLink(inv.token)} className="sbd-btn sbd-btn-ghost" style={smallBtn} title="Copy invite link"><Link2 size={13} /> Link</button>
                        <button onClick={() => onRevoke(inv.id)} className="sbd-btn sbd-btn-ghost" style={{ ...smallBtn, color: "var(--status-error)" }} title="Revoke"><X size={13} /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Members */}
      <div className="sbd-card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={sectionHdr}><Users size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />Members</div>
        {loadingMembers ? (
          <div style={{ padding: 16 }}><LoadingSkeleton variant="list" /></div>
        ) : (
          <table className="sbd-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {members.map((m) => {
                const self = m.user_id === user.id;
                return (
                  <tr key={m.id}>
                    <td style={td}>
                      <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>
                        {m.full_name || m.email || `${m.user_id.slice(0, 8)}…`}{self && <span style={{ ...mono, fontSize: 9, color: "var(--accent)", marginLeft: 8 }}>YOU</span>}
                      </div>
                      {m.email && m.full_name && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{m.email}</div>}
                    </td>
                    <td style={{ ...td, width: 130 }}>
                      {canManage && !self ? (
                        <select value={m.role} onChange={(e) => onChangeRole(m, e.target.value)} className="sbd-select" style={{ padding: "5px 8px", borderRadius: 7, fontSize: 12 }}>
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                          {(isOwner || m.role === "owner") && <option value="owner">Owner</option>}
                        </select>
                      ) : (
                        <Badge tone={m.role === "owner" ? "var(--accent)" : undefined}><Shield size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} />{ROLE_LABEL[m.role] || m.role}</Badge>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: "right", width: 90 }}>
                      {canManage && !self && (
                        <button onClick={() => onRemove(m)} className="sbd-btn sbd-btn-ghost" style={{ ...smallBtn, color: "var(--status-error)" }} title="Remove from workspace"><X size={13} /> Remove</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const mono = { fontFamily: "var(--font-mono)" };
const sectionHdr = { padding: "10px 14px", background: "var(--bg-surface-low)", borderBottom: "1px solid var(--divider)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 };
const td = { padding: "10px 14px", borderBottom: "1px solid var(--divider)", color: "var(--text-secondary)" };
const smallBtn = { padding: "4px 8px", fontSize: 11, minHeight: 28, display: "inline-flex", alignItems: "center", gap: 4 };

function Badge({ children, tone }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999, border: `1px solid ${tone ? `color-mix(in srgb, ${tone} 40%, var(--border-default))` : "var(--border-default)"}`, background: "var(--bg-surface-low)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: tone || "var(--text-secondary)", letterSpacing: "0.04em" }}>
      {children}
    </span>
  );
}
