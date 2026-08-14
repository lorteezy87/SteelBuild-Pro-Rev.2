/**
 * Typed Production Notes folder access. Tables are not in the generated
 * Database types yet, so this owns `rpc` the same way org/backcharge repos do.
 * Every mutation goes through a SECURITY DEFINER RPC (access + audit + version).
 */

import { supabase } from "@/lib/supabase";
import { normalizeThrownQueryError } from "@/lib/postgrestErrors";
import type {
  FolderCommandResult,
  VisibleFolderWorkspace,
  VisibleNoteFolder,
} from "./types";

const callRpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => any)(fn, args);

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `nf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function unwrap<T extends { ok?: boolean; error_message?: string }>(data: T, fallback: string): T {
  if (data && data.ok === false) {
    throw new Error(data.error_message || fallback);
  }
  return data;
}

export async function listVisibleNoteFolders(input: {
  orgId: string;
  includeArchived?: boolean;
}): Promise<VisibleFolderWorkspace> {
  const { data, error } = await callRpc("list_visible_note_folders", {
    p_org_id: input.orgId,
    p_include_archived: Boolean(input.includeArchived),
  });
  if (error) throw normalizeThrownQueryError(error);
  return unwrap(data as VisibleFolderWorkspace, "Could not load note folders");
}

export async function createNoteFolder(input: {
  orgId: string;
  name: string;
  parentFolderId?: string | null;
  idempotencyKey?: string;
}): Promise<VisibleNoteFolder> {
  const { data, error } = await callRpc("create_note_folder", {
    p_org_id: input.orgId,
    p_name: input.name,
    p_parent_folder_id: input.parentFolderId ?? null,
    p_idempotency_key: input.idempotencyKey ?? newIdempotencyKey(),
  });
  if (error) throw normalizeThrownQueryError(error);
  const result = unwrap(data as FolderCommandResult, "Could not create folder");
  return (result as Extract<FolderCommandResult, { ok: true }>).folder;
}

export async function renameNoteFolder(input: {
  folderId: string;
  name: string;
  expectedVersion: number;
  idempotencyKey?: string;
}): Promise<VisibleNoteFolder> {
  const { data, error } = await callRpc("rename_note_folder", {
    p_folder_id: input.folderId,
    p_name: input.name,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey ?? newIdempotencyKey(),
  });
  if (error) throw normalizeThrownQueryError(error);
  const result = unwrap(data as FolderCommandResult, "Could not rename folder");
  return (result as Extract<FolderCommandResult, { ok: true }>).folder;
}

export async function moveNoteFolder(input: {
  folderId: string;
  parentFolderId: string | null;
  expectedVersion: number;
  idempotencyKey?: string;
}): Promise<VisibleNoteFolder> {
  const { data, error } = await callRpc("move_note_folder", {
    p_folder_id: input.folderId,
    p_parent_folder_id: input.parentFolderId,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey ?? newIdempotencyKey(),
  });
  if (error) throw normalizeThrownQueryError(error);
  const result = unwrap(data as FolderCommandResult, "Could not move folder");
  return (result as Extract<FolderCommandResult, { ok: true }>).folder;
}

export async function setNoteFolderLinks(input: {
  folderId: string;
  projectIds: string[];
  expectedVersion: number;
  makeIndependent?: boolean;
  idempotencyKey?: string;
}): Promise<VisibleNoteFolder> {
  const { data, error } = await callRpc("set_note_folder_links", {
    p_folder_id: input.folderId,
    p_project_ids: input.projectIds,
    p_expected_version: input.expectedVersion,
    p_make_independent: input.makeIndependent ?? true,
    p_idempotency_key: input.idempotencyKey ?? newIdempotencyKey(),
  });
  if (error) throw normalizeThrownQueryError(error);
  const result = unwrap(data as FolderCommandResult, "Could not update folder job links");
  return (result as Extract<FolderCommandResult, { ok: true }>).folder;
}

export async function archiveNoteFolder(input: {
  folderId: string;
  expectedVersion: number;
  reason?: string | null;
  idempotencyKey?: string;
}): Promise<VisibleNoteFolder> {
  const { data, error } = await callRpc("archive_note_folder", {
    p_folder_id: input.folderId,
    p_expected_version: input.expectedVersion,
    p_reason: input.reason ?? null,
    p_idempotency_key: input.idempotencyKey ?? newIdempotencyKey(),
  });
  if (error) throw normalizeThrownQueryError(error);
  const result = unwrap(data as FolderCommandResult, "Could not archive folder");
  return (result as Extract<FolderCommandResult, { ok: true }>).folder;
}

export async function restoreNoteFolder(input: {
  folderId: string;
  expectedVersion: number;
  idempotencyKey?: string;
}): Promise<VisibleNoteFolder> {
  const { data, error } = await callRpc("restore_note_folder", {
    p_folder_id: input.folderId,
    p_expected_version: input.expectedVersion,
    p_idempotency_key: input.idempotencyKey ?? newIdempotencyKey(),
  });
  if (error) throw normalizeThrownQueryError(error);
  const result = unwrap(data as FolderCommandResult, "Could not restore folder");
  return (result as Extract<FolderCommandResult, { ok: true }>).folder;
}
