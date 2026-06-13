/**
 * repository.ts — typed access for the organization/workspace layer
 * (multi-tenant SaaS). organizations / organization_members aren't in the
 * generated DB types yet, so this owns its own typed `from`/`rpc` (same pattern
 * as the backcharge / payapp / production repositories). RLS scopes every read
 * to the caller's orgs.
 */

import { supabase } from "@/lib/supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (table: string): any => (supabase.from as unknown as (t: string) => any)(table);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callRpc = (fn: string, args: Record<string, unknown>): any =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => any)(fn, args);

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  plan: string;
  created_by: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface OrgMembership {
  role: string; // owner | admin | member
  organization: Organization;
}

export interface OrgMemberRow {
  id: string;
  org_id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string | null;
  full_name?: string | null;
}

export interface OrgInvitation {
  id: string;
  org_id: string;
  email: string;
  role: string;
  token: string;
  status: string;
  created_at: string;
  expires_at: string;
}

/** The orgs the current user belongs to (with their role in each). */
export async function listMyMemberships(userId: string): Promise<OrgMembership[]> {
  if (!userId) return [];
  const { data, error } = await from("organization_members")
    .select("role, organizations(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || [])
    .filter((r: { organizations: Organization | null }) => r.organizations)
    .map((r: { role: string; organizations: Organization }) => ({ role: r.role, organization: r.organizations }));
}

/** Create a new org and become its owner (SECURITY DEFINER bootstrap). */
export async function createOrganization(name: string, slug?: string): Promise<Organization> {
  const { data, error } = await callRpc("create_organization", { p_name: name, p_slug: slug ?? null });
  if (error) throw error;
  return data as Organization;
}

/** Members of an org, resolved to email/name (for the member-management UI). */
export async function listOrgMembers(orgId: string): Promise<OrgMemberRow[]> {
  if (!orgId) return [];
  const { data, error } = await from("organization_members")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const members = (data || []) as OrgMemberRow[];
  const ids = members.map((m) => m.user_id);
  let profiles: Record<string, { email: string | null; full_name: string | null }> = {};
  if (ids.length) {
    const { data: profs } = await from("user_profiles").select("id, email, full_name").in("id", ids);
    profiles = Object.fromEntries((profs || []).map((p: { id: string; email: string | null; full_name: string | null }) => [p.id, p]));
  }
  return members.map((m) => ({ ...m, email: profiles[m.user_id]?.email ?? null, full_name: profiles[m.user_id]?.full_name ?? null }));
}

export async function updateMemberRole(memberId: string, role: string): Promise<void> {
  const { error } = await from("organization_members").update({ role }).eq("id", memberId);
  if (error) throw error;
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await from("organization_members").delete().eq("id", memberId);
  if (error) throw error;
}

/** Pending invitations for an org. */
export async function listInvitations(orgId: string): Promise<OrgInvitation[]> {
  if (!orgId) return [];
  const { data, error } = await from("organization_invitations")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as OrgInvitation[];
}

export async function createInvitation(orgId: string, email: string, role: string, invitedBy: string): Promise<OrgInvitation> {
  const { data, error } = await from("organization_invitations")
    .insert({ org_id: orgId, email: email.trim().toLowerCase(), role, invited_by: invitedBy })
    .select()
    .single();
  if (error) throw error;
  return data as OrgInvitation;
}

export async function revokeInvitation(id: string): Promise<void> {
  const { error } = await from("organization_invitations").update({ status: "revoked" }).eq("id", id);
  if (error) throw error;
}

/** Minimal invite details for the accept screen (token-keyed, definer-backed). */
export async function getInvitation(token: string): Promise<{ org_id: string; org_name: string; role: string; email: string; status: string; expired: boolean } | null> {
  const { data, error } = await callRpc("get_invitation", { p_token: token });
  if (error) throw error;
  return (data as { org_id: string } | null)?.org_id ? data : null;
}

/** Accept an invite — the caller joins the org with the invited role. */
export async function acceptInvitation(token: string): Promise<{ org_id: string; org_name: string }> {
  const { data, error } = await callRpc("accept_invitation", { p_token: token });
  if (error) throw error;
  return data as { org_id: string; org_name: string };
}

/** Build a shareable accept link for an invite token. */
export function inviteLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://steelbuild-pro.com";
  return `${origin}/?invite=${token}`;
}
