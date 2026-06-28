/**
 * OrgMembers — workspace team management (multi-tenant SaaS).
 *
 * Invite teammates by email (creates a tokenised invite → shareable accept
 * link), see/revoke pending invites, and manage current members (role, remove).
 * Owner/admin only for the mutating actions; everyone can view. Org membership
 * grants workspace access — an admin still adds members to specific projects
 * (via Project Members) for project data.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Mail, Link2, X, Shield } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useOrg } from "@/components/shared/OrgContext";
import { useNavigate, useLocation } from "react-router-dom";
import { usePlan } from "@/hooks/usePlan";
import { seatCapacity } from "@/lib/billing/plans";
import { CommandBar } from "@/components/design-system";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import {
  listOrgMembers, listInvitations, createInvitation, revokeInvitation,
  updateMemberRole, removeMember, inviteLink,
} from "@/lib/org/repository";
import { prepareOnboardingInvites, clampOrgRole } from "@/lib/org/onboardingInvites";

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

  // Plan seat gating: count current members + still-pending invites against the
  // plan's member limit so we don't create invites that can't be accepted (the
  // server enforces at accept time). Enterprise/Business = unlimited (null).
  const { plan } = usePlan();
  const navigate = useNavigate();
  const memberLimit = plan.limits.members;
  const cap = seatCapacity(members.length, invites.length, memberLimit);
  const atMemberLimit = cap.atLimit;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["org-members", orgId] });
    qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
  };

  // ── Onboarding hand-off ────────────────────────────────────────────────────
  // The setup wizard (Onboarding → "Invite your team") routes here with the
  // collected roster on location.state.prefillInvites. Stage it for one-click
  // review + batch send: prepareOnboardingInvites maps project roles → org roles
  // and drops anyone already a member / already invited. Seeded ONCE, after the
  // member + invite lists load (needed for the dedupe) so the user's edits stick.
  const location = useLocation();
  const prefill = location.state?.prefillInvites;
  const [staged, setStaged] = useState([]);
  const [stagedSkipped, setStagedSkipped] = useState(null);
  const [sendingStaged, setSendingStaged] = useState(false);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    if (!Array.isArray(prefill) || prefill.length === 0) return;
    if (!orgId || loadingMembers || loadingInvites) return;
    const { invites: prepared, skipped } = prepareOnboardingInvites(prefill, {
      existingEmails: members.map((m) => m.email),
      pendingEmails: invites.map((i) => i.email),
    });
    // Clamp: a non-owner cannot grant 'owner'. The DB enforces this too
    // (org_invites_insert WITH CHECK), but clamping here keeps the role select
    // from showing a stale 'owner' value and stops the batch attempting a
    // doomed insert. owner→admin (the most an admin may grant).
    const clamped = prepared.map((inv) => ({ ...inv, role: clampOrgRole(inv.role, { isOwner }) }));
    setStaged(clamped);
    setStagedSkipped(skipped);
    seededRef.current = true;
    if (clamped.length === 0) {
      const dropped = skipped.alreadyMember + skipped.alreadyInvited + skipped.invalid + skipped.duplicate;
      if (dropped > 0) toast.info(`Everyone from setup is already on the team or invited (${dropped} skipped)`);
    }
  }, [prefill, orgId, loadingMembers, loadingInvites, members, invites, isOwner]);

  const stagedSkippedNote = useMemo(() => {
    if (!stagedSkipped) return "";
    const parts = [];
    if (stagedSkipped.alreadyMember) parts.push(`${stagedSkipped.alreadyMember} already on the team`);
    if (stagedSkipped.alreadyInvited) parts.push(`${stagedSkipped.alreadyInvited} already invited`);
    if (stagedSkipped.invalid) parts.push(`${stagedSkipped.invalid} invalid`);
    if (stagedSkipped.duplicate) parts.push(`${stagedSkipped.duplicate} duplicate`);
    return parts.length ? `Skipped ${parts.join(", ")}.` : "";
  }, [stagedSkipped]);

  const seatsLeft = cap.unlimited ? Infinity : Math.max(0, (cap.limit ?? 0) - cap.used);

  const setStagedRole = (idx, nextRole) =>
    setStaged((rows) => rows.map((row, i) => (i === idx ? { ...row, role: nextRole } : row)));
  const removeStaged = (idx) => setStaged((rows) => rows.filter((_, i) => i !== idx));

  const sendStaged = async () => {
    if (sendingStaged || staged.length === 0 || !orgId) return;
    if (atMemberLimit) {
      toast.error(`Your ${plan.name} plan includes ${memberLimit} member${memberLimit === 1 ? "" : "s"}. Upgrade to add more.`);
      return;
    }
    setSendingStaged(true);
    const results = [];
    for (const inv of staged) {
      // Defense-in-depth: never let a non-owner send an 'owner' invite even if a
      // stale value slipped through (the seed already clamps; the DB enforces too).
      const role = clampOrgRole(inv.role, { isOwner });
      try {
        await createInvitation(orgId, inv.email, role, user.id);
        results.push({ email: inv.email, ok: true });
      } catch {
        results.push({ email: inv.email, ok: false });
      }
    }
    setSendingStaged(false);
    refresh();
    const okCount = results.filter((r) => r.ok).length;
    const failCount = results.length - okCount;
    const failedEmails = new Set(results.filter((r) => !r.ok).map((r) => r.email));
    setStaged((rows) => rows.filter((row) => failedEmails.has(row.email)));
    if (okCount) {
      toast.success(`Created ${okCount} invite${okCount === 1 ? "" : "s"}${failCount ? `, ${failCount} couldn't be sent` : ""} — copy links from Pending invites below`);
    } else if (failCount) {
      toast.error("Couldn't create invites — seat limit reached, or they're already invited");
    }
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
    if (atMemberLimit) { toast.error(`Your ${plan.name} plan includes ${memberLimit} member${memberLimit === 1 ? "" : "s"}. Upgrade to add more.`); return; }
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
    <div className="sb-dashboard-reference-page page-content" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxWidth: 920 }}>
      <CommandBar eyebrow={currentOrg?.name || "Workspace"} title="Team" count={members.length} unit=" members" subtitle="Invite teammates and manage who can access this workspace" />

      {!(loadingMembers || loadingInvites) && (
        <CapacityMeter cap={cap} planName={plan.name} canManage={canManage} onUpgrade={() => navigate("/Billing")} />
      )}

      {canManage && staged.length > 0 && (
        <div className="sbd-card" style={{ padding: 16, border: "1px solid color-mix(in srgb, var(--accent) 40%, var(--border-default))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, color: "var(--text-primary)", fontWeight: 700, fontSize: 13 }}>
            <Users size={15} style={{ color: "var(--accent)" }} /> Invite your team from setup
          </div>
          <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
            Carried over from onboarding — review the roles, then send. Each becomes a 14-day invite link in Pending below.
            Project roles (PM / field / viewer) are assigned later on Project Members.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {staged.map((inv, idx) => (
              <div key={inv.email} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 240px", minWidth: 180, color: "var(--text-primary)", fontWeight: 600, fontSize: 14, wordBreak: "break-all" }}>{inv.email}</span>
                <select value={inv.role} onChange={(e) => setStagedRole(idx, e.target.value)} disabled={sendingStaged} className="sbd-select" style={{ padding: "8px 10px", borderRadius: 9, minHeight: 38 }}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  {isOwner && <option value="owner">Owner</option>}
                </select>
                <button type="button" onClick={() => removeStaged(idx)} disabled={sendingStaged} className="sbd-btn sbd-btn-ghost" style={{ ...smallBtn, color: "var(--status-error)" }} title="Remove from this batch"><X size={13} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <button type="button" className="sbd-btn sbd-btn-primary" onClick={sendStaged} disabled={sendingStaged || atMemberLimit} style={{ minHeight: 40 }}>
              {sendingStaged ? "Sending…" : `Send ${staged.length} invite${staged.length === 1 ? "" : "s"}`}
            </button>
            <button type="button" className="sbd-btn sbd-btn-ghost" onClick={() => setStaged([])} disabled={sendingStaged} style={{ minHeight: 40 }}>Dismiss</button>
            {stagedSkippedNote && <span style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>{stagedSkippedNote}</span>}
          </div>
          {!cap.unlimited && staged.length > seatsLeft && (
            <div style={{ ...mono, fontSize: 11, color: "var(--status-warning)", marginTop: 8 }}>
              Only {seatsLeft} seat{seatsLeft === 1 ? "" : "s"} left on {plan.name} — extra invites will be rejected. Remove some or{" "}
              <button type="button" onClick={() => navigate("/Billing")} style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>upgrade</button>.
            </div>
          )}
        </div>
      )}

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
            <button type="submit" className="sbd-btn sbd-btn-primary" disabled={busy || !email.trim() || atMemberLimit} style={{ minHeight: 40 }}>
              {busy ? "Inviting…" : "Send invite"}
            </button>
          </form>
          {atMemberLimit ? (
            <div style={{ ...mono, fontSize: 11, color: "var(--status-warning)", marginTop: 8 }}>
              {plan.name} plan limit reached ({memberLimit} member{memberLimit === 1 ? "" : "s"}).{" "}
              <button type="button" onClick={() => navigate("/Billing")} style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}>Upgrade</button> to invite more.
            </div>
          ) : (
            <div style={{ ...mono, fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              Creates a 14-day invite link (copied to your clipboard) — send it to them; they accept after signing in.
            </div>
          )}
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

function CapacityMeter({ cap, planName, canManage, onUpgrade }) {
  const barColor = cap.atLimit ? "var(--status-error)" : cap.near ? "var(--status-warning)" : "var(--accent)";
  const countColor = cap.atLimit ? "var(--status-error)" : "var(--text-primary)";
  return (
    <div className="sbd-card" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ ...mono, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 }}>Workspace seats</span>
          <span style={{ color: countColor, fontWeight: 800, fontSize: 15 }}>
            {cap.unlimited ? cap.used : `${cap.used} / ${cap.limit}`}
          </span>
          <span style={{ ...mono, fontSize: 11, color: "var(--text-muted)" }}>
            {cap.members} member{cap.members === 1 ? "" : "s"}
            {cap.pending > 0 ? ` · ${cap.pending} pending invite${cap.pending === 1 ? "" : "s"}` : ""}
            {cap.unlimited ? ` · Unlimited on ${planName}` : ""}
          </span>
        </div>
        {!cap.unlimited && cap.atLimit && canManage && (
          <button type="button" onClick={onUpgrade} style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", textDecoration: "underline", cursor: "pointer", ...mono, fontSize: 11, fontWeight: 700 }}>Upgrade →</button>
        )}
      </div>
      {!cap.unlimited && (
        <div style={{ height: 6, borderRadius: 999, background: "var(--bg-surface-low)", overflow: "hidden" }}>
          <div style={{ width: `${cap.pct}%`, height: "100%", background: barColor, borderRadius: 999, transition: "width .2s ease" }} />
        </div>
      )}
    </div>
  );
}

function Badge({ children, tone }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 9px", borderRadius: 999, border: `1px solid ${tone ? `color-mix(in srgb, ${tone} 40%, var(--border-default))` : "var(--border-default)"}`, background: "var(--bg-surface-low)", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: tone || "var(--text-secondary)", letterSpacing: "0.04em" }}>
      {children}
    </span>
  );
}
