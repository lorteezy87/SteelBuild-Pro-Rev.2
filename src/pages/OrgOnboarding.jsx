/**
 * OrgOnboarding — shown to a signed-in user who isn't in any organization yet
 * (new signup, or an account never added to a workspace). Creates their org via
 * the SECURITY DEFINER create_organization RPC, which makes them its owner.
 *
 * This is the multi-tenant onboarding gate: every user belongs to a workspace
 * before they can create projects (which are stamped with the org).
 */

import React, { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/AuthContext";
import { useOrg } from "@/components/shared/OrgContext";
import { createOrganization } from "@/lib/org/repository";

export default function OrgOnboarding() {
  const { user, logout } = useAuth();
  const { setCurrentOrg, refetchOrgs } = useOrg();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const org = await createOrganization(trimmed);
      if (org?.id) setCurrentOrg(org.id);
      toast.success("Workspace created");
      await refetchOrgs();
      // The org gate re-renders into the app once the membership query refreshes.
    } catch (err) {
      toast.error(err?.message || "Couldn't create the workspace — please try again.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg-base, #0D1117)" }}>
      <div
        style={{
          width: "100%", maxWidth: 460, background: "var(--bg-surface-secondary, #161B22)",
          border: "1px solid var(--border-default)", borderRadius: 14, padding: "32px 28px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--accent)", fontWeight: 800 }}>
          SteelBuild Pro
        </div>
        <h1 style={{ fontFamily: "'Space Grotesk', var(--font-display)", fontSize: 24, fontWeight: 600, color: "var(--text-primary)", margin: "10px 0 6px" }}>
          Create your workspace
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 22px" }}>
          A workspace holds your projects, your team, and your billing. Name it after your shop or company —
          you can invite teammates once it's set up.
        </p>

        <form onSubmit={submit}>
          <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
            Workspace name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Steel Fabricators"
            disabled={busy}
            style={{
              width: "100%", boxSizing: "border-box", background: "var(--bg-input)",
              border: "1px solid var(--border-default)", borderRadius: 9, padding: "11px 13px",
              color: "var(--text-primary)", fontSize: 15, outline: "none", marginBottom: 18,
            }}
          />
          <button
            type="submit"
            className="sbd-btn sbd-btn-primary"
            disabled={!name.trim() || busy}
            style={{ width: "100%", justifyContent: "center", minHeight: 44, fontSize: 14 }}
          >
            {busy ? "Creating…" : "Create workspace"}
          </button>
        </form>

        <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "var(--text-muted)" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>
            {user?.email || "Signed in"}
          </span>
          <button
            type="button"
            onClick={() => logout?.()}
            style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
