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

/** Members of an org (for the member-management UI). */
export async function listOrgMembers(orgId: string): Promise<OrgMemberRow[]> {
  if (!orgId) return [];
  const { data, error } = await from("organization_members")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as OrgMemberRow[];
}
