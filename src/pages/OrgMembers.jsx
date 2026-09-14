/**
 * OrgMembers — canonical workspace team management surface.
 *
 * Invite teammates by email, see/revoke pending invites, and manage current
 * members and roles. Owner/admin-only mutations remain owned by this page;
 * TeamControlCenter is presentation-only. DangerZone remains mounted here so
 * owner-only workspace deletion stays available with the canonical shell.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import DangerZone from "@/components/settings/DangerZone.jsx";
import { useOrg } from "@/components/shared/OrgContext";
import { useNavigate, useLocation } from "react-router-dom";
import { usePlan } from "@/hooks/usePlan";
import { seatCapacity } from "@/lib/billing/plans";
import { isNativePlatform } from "@/lib/native/platform";
import { CommandBar } from "@/components/design-system";
import LoadingSkeleton from "@/components/shared/LoadingSkeleton";
import WorkflowFetchState from "@/components/shared/WorkflowFetchState";
import {
  listOrgMembers, listInvitations, createInvitation, revokeInvitation,
  updateMemberRole, removeMember, inviteLink, updateOrgDefaultProjectRole,
} from "@/lib/org/repository";
import { prepareOnboardingInvites, clampOrgRole } from "@/lib/org/onboardingInvites";
import TeamControlCenter from "./team/TeamControlCenter";

export default function OrgMembers() {
  const { user } = useAuth();
  const { currentOrg, currentRole, refetchOrgs } = useOrg();
  const qc = useQueryClient();
  const orgId = currentOrg?.id;
  const canManage = currentRole === "owner" || currentRole === "admin";
  const isOwner = currentRole === "owner";

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [ccSearch, setCcSearch] = useState("");

  const membersQuery = useQuery({
    queryKey: ["org-members", orgId], queryFn: () => listOrgMembers(orgId), enabled: !!orgId,
  });
  const invitesQuery = useQuery({
    queryKey: ["org-invites", orgId], queryFn: () => listInvitations(orgId), enabled: !!orgId,
  });

  const { data: members = [] } = membersQuery;
  const { data: invites = [] } = invitesQuery;
  const teamError = membersQuery.error || invitesQuery.error;
  const teamReady = membersQuery.isSuccess && invitesQuery.isSuccess;

  const ownerCount = useMemo(() => members.filter((m) => m.role === "owner").length, [members]);

  // Plan seat gating counts current members and pending invites. The server
  // enforces the same limit when an invitation is accepted.
  const { plan } = usePlan();
  const navigate = useNavigate();
  // Sign-in-only native build: hide the "Upgrade" (→ billing) upsells; plans are
  // managed on the web. The seat/plan-limit messages themselves still show.
  const native = isNativePlatform();
  const memberLimit = plan.limits.members;
  const cap = seatCapacity(members.length, invites.length, memberLimit);
  const atMemberLimit = cap.atLimit;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["org-members", orgId] });
    qc.invalidateQueries({ queryKey: ["org-invites", orgId] });
  };

  // The setup wizard routes here with location.state.prefillInvites. Stage the
  // roster once after both lists load so existing members and invites are
  // removed without overwriting the user's edits.
  const location = useLocation();
  const prefill = location.state?.prefillInvites;
  const [staged, setStaged] = useState([]);
  const [stagedSkipped, setStagedSkipped] = useState(null);
  const [sendingStaged, setSendingStaged] = useState(false);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    if (!Array.isArray(prefill) || prefill.length === 0) return;
    if (!orgId || !teamReady) return;
    const { invites: prepared, skipped } = prepareOnboardingInvites(prefill, {
      existingEmails: members.map((m) => m.email),
      pendingEmails: invites.map((i) => i.email),
    });
    const clamped = prepared.map((inv) => ({ ...inv, role: clampOrgRole(inv.role, { isOwner }) }));
    setStaged(clamped);
    setStagedSkipped(skipped);
    seededRef.current = true;
    if (clamped.length === 0) {
      const dropped = skipped.alreadyMember + skipped.alreadyInvited + skipped.invalid + skipped.duplicate;
      if (dropped > 0) toast.info(`Everyone from setup is already on the team or invited (${dropped} skipped)`);
    }
  }, [prefill, orgId, teamReady, members, invites, isOwner]);

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
      const inviteRole = clampOrgRole(inv.role, { isOwner });
      try {
        await createInvitation(orgId, inv.email, inviteRole, user.id);
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

  // ── Default project access (workspace-wide) ──
  const [savingDefaultRole, setSavingDefaultRole] = useState(false);
  const defaultProjectRole = currentOrg?.member_default_project_role ?? null;
  const onChangeDefaultProjectRole = async (value) => {
    if (savingDefaultRole || !orgId) return;
    const next = value === "none" ? null : value;
    setSavingDefaultRole(true);
    try {
      await updateOrgDefaultProjectRole(orgId, next);
      await refetchOrgs?.();
      toast.success(
        next
          ? `Members now see all workspace projects as ${next === "pm" ? "PM" : next}`
          : "Members now only see projects they're explicitly added to",
      );
    } catch (e) {
      toast.error(e?.message || "Couldn't update default project access");
    } finally {
      setSavingDefaultRole(false);
    }
  };

  if (!orgId) {
    return <div className="page-content" style={{ padding: 24 }}><CommandBar eyebrow="Workspace" title="Team" /></div>;
  }

  if (teamError) {
    return <WorkflowFetchState label="Team" error={teamError} onRetry={() => { void Promise.all([membersQuery.refetch(), invitesQuery.refetch()]); }} />;
  }

  if (!teamReady) {
    return (
      <div className="page-content" style={{ padding: 24 }}>
        <LoadingSkeleton variant="page" />
      </div>
    );
  }

  return (
    <div className="team-page">
      <TeamControlCenter
        orgName={currentOrg?.name || "Workspace"}
        members={members}
        invites={invites}
        selfUserId={user?.id || ""}
        ownerCount={ownerCount}
        seatsUsed={cap.used}
        seatsLimit={cap.limit}
        seatsPct={cap.pct}
        seatsAtLimit={cap.atLimit}
        seatsNear={cap.near}
        planName={plan.name}
        canManage={canManage}
        isOwner={isOwner}
        staged={staged}
        stagedSkippedNote={stagedSkippedNote}
        sendingStaged={sendingStaged}
        seatsLeft={seatsLeft}
        inviteEmail={email}
        inviteRole={role}
        inviteBusy={busy}
        atMemberLimit={atMemberLimit}
        search={ccSearch}
        onSearch={setCcSearch}
        onSendInvite={sendInvite}
        onSetInviteEmail={setEmail}
        onSetInviteRole={setRole}
        onChangeRole={onChangeRole}
        onRemove={onRemove}
        onRevoke={onRevoke}
        onCopyLink={copyLink}
        onNavigateToBilling={() => navigate("/Billing")}
        onSendStaged={sendStaged}
        onSetStagedRole={setStagedRole}
        onRemoveStaged={removeStaged}
        onDismissStaged={() => setStaged([])}
      />
      {canManage && (
        <div style={{ padding: "0 var(--cmd-page-px, 24px) 16px" }}>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-card)", padding: "16px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
            <div style={{ flex: "1 1 320px", minWidth: 260 }}>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                Default project access for members
              </div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
                The role every member holds on all workspace projects unless they're given a
                specific role on a project. Owners and admins always see everything.
              </div>
            </div>
            <select
              aria-label="Default project access for members"
              value={defaultProjectRole ?? "none"}
              disabled={savingDefaultRole}
              onChange={(e) => onChangeDefaultProjectRole(e.target.value)}
              style={{ minHeight: 36, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--bg-surface-low)", color: "var(--text-primary)", fontFamily: "var(--font-body)", fontSize: 12, cursor: savingDefaultRole ? "wait" : "pointer" }}
            >
              <option value="viewer">Viewer — read-only on all projects</option>
              <option value="field">Field — field updates on all projects</option>
              <option value="pm">PM — full working role on all projects</option>
              <option value="none">No automatic access (invite per project)</option>
            </select>
          </div>
        </div>
      )}
      <div style={{ padding: "0 var(--cmd-page-px, 24px) 24px" }}>
        <DangerZone />
      </div>
    </div>
  );
}
