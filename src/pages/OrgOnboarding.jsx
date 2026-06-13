/**
 * OrgOnboarding — the multi-tenant onboarding gate, shown to a signed-in user
 * who isn't in any organization yet. Two modes:
 *   • with ?invite=<token> in the URL → accept the invitation and join that org
 *     (the invitee path — survives the sign-in redirect since it's in the URL).
 *   • otherwise → create a new workspace (the caller becomes its owner).
 */

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { useOrg } from "@/components/shared/OrgContext";
import { createOrganization, getInvitation, acceptInvitation } from "@/lib/org/repository";

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" };

function Shell({ children, email, onSignOut }) {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg-base, #0D1117)" }}>
      <div style={{ width: "100%", maxWidth: 460, background: "var(--bg-surface-secondary, #161B22)", border: "1px solid var(--border-default)", borderRadius: 14, padding: "32px 28px", boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--accent)", fontWeight: 800 }}>
          SteelBuild Pro
        </div>
        {children}
        <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{email || "Signed in"}</span>
          <button type="button" onClick={onSignOut} style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

export default function OrgOnboarding() {
  const { user, logout } = useAuth();
  const { setCurrentOrg, refetchOrgs } = useOrg();
  const [busy, setBusy] = useState(false);

  const token = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("invite"); } catch { return null; }
  }, []);

  const { data: invite, isLoading: loadingInvite } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => getInvitation(token),
    enabled: !!token,
  });

  const [name, setName] = useState("");

  const finishJoin = async (orgId) => {
    if (orgId) setCurrentOrg(orgId);
    await refetchOrgs();
    try { window.history.replaceState({}, "", "/"); } catch { /* ignore */ }
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const org = await createOrganization(trimmed);
      toast.success("Workspace created");
      await finishJoin(org?.id);
    } catch (err) {
      toast.error(err?.message || "Couldn't create the workspace — please try again.");
      setBusy(false);
    }
  };

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await acceptInvitation(token);
      toast.success(`Joined ${res?.org_name || "the workspace"}`);
      await finishJoin(res?.org_id);
    } catch (err) {
      toast.error(err?.message || "Couldn't accept the invitation.");
      setBusy(false);
    }
  };

  // ── Invite-accept mode ──
  if (token) {
    if (loadingInvite) {
      return <Shell email={user?.email} onSignOut={() => logout?.()}><p style={{ color: "var(--text-muted)", marginTop: 18 }}>Loading invitation…</p></Shell>;
    }
    const invalid = !invite || invite.status !== "pending" || invite.expired;
    if (invalid) {
      return (
        <Shell email={user?.email} onSignOut={() => logout?.()}>
          <h1 style={hStyle}>Invitation unavailable</h1>
          <p style={pStyle}>This invitation has expired, been revoked, or already used. Ask your workspace admin to send a new one — or create your own workspace below.</p>
          <button className="sbd-btn sbd-btn-ghost" style={{ width: "100%", justifyContent: "center", minHeight: 42 }} onClick={() => { try { window.history.replaceState({}, "", "/"); } catch { /* ignore */ } window.location.reload(); }}>
            Create a workspace instead
          </button>
        </Shell>
      );
    }
    const emailMismatch = invite.email && user?.email && invite.email.toLowerCase() !== user.email.toLowerCase();
    return (
      <Shell email={user?.email} onSignOut={() => logout?.()}>
        <h1 style={hStyle}>Join {invite.org_name}</h1>
        <p style={pStyle}>
          You've been invited to the <strong>{invite.org_name}</strong> workspace as{" "}
          <strong>{ROLE_LABEL[invite.role] || invite.role}</strong>.
        </p>
        {emailMismatch && (
          <p style={{ ...pStyle, color: "var(--status-warning)" }}>
            This invite was sent to <strong>{invite.email}</strong>, but you're signed in as {user.email}. Sign in with the invited address to accept.
          </p>
        )}
        <button className="sbd-btn sbd-btn-primary" style={{ width: "100%", justifyContent: "center", minHeight: 44, fontSize: 14 }} disabled={busy || emailMismatch} onClick={accept}>
          {busy ? "Joining…" : `Accept & join ${invite.org_name}`}
        </button>
      </Shell>
    );
  }

  // ── Create-workspace mode ──
  return (
    <Shell email={user?.email} onSignOut={() => logout?.()}>
      <h1 style={hStyle}>Create your workspace</h1>
      <p style={pStyle}>A workspace holds your projects, your team, and your billing. Name it after your shop or company — you can invite teammates once it's set up.</p>
      <form onSubmit={submitCreate}>
        <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>Workspace name</label>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Steel Fabricators" disabled={busy}
          style={{ width: "100%", boxSizing: "border-box", background: "var(--bg-input)", border: "1px solid var(--border-default)", borderRadius: 9, padding: "11px 13px", color: "var(--text-primary)", fontSize: 15, outline: "none", marginBottom: 18 }} />
        <button type="submit" className="sbd-btn sbd-btn-primary" disabled={!name.trim() || busy} style={{ width: "100%", justifyContent: "center", minHeight: 44, fontSize: 14 }}>
          {busy ? "Creating…" : "Create workspace"}
        </button>
      </form>
    </Shell>
  );
}

const hStyle = { fontFamily: "'Space Grotesk', var(--font-display)", fontSize: 24, fontWeight: 600, color: "var(--text-primary)", margin: "10px 0 6px" };
const pStyle = { color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 22px" };
