/**
 * rbac.ts — Shared RBAC vocabulary for the permission moat.
 *
 * Single source of truth for the role and action unions used by the
 * server-authoritative permission layer (`services/permissions`).
 * Frontend role logic is DISPLAY-ONLY — the authoritative guards are RLS and
 * domain RPC/policy enforcement.
 */

// Global role lives in `user_profiles.role`.
export type GlobalRole = "admin" | "user";

// Project role lives in `user_projects.role`. `owner` is equivalent to `admin`
// for project control.
export type ProjectRole = "owner" | "admin" | "pm" | "field" | "viewer";

// `canPerform` is fed whichever role the caller holds, so its rank table must
// cover BOTH vocabularies. A global `user` maps to PM-level privilege.
export type AppRole = GlobalRole | ProjectRole;

// Entity-agnostic actions gated by `canPerform`.
export type PermissionAction =
  | "create"
  | "edit"
  | "delete"
  | "bulk_update"
  | "bulk_delete"
  | "approve"
  | "void"
  | "export"
  | "view";
