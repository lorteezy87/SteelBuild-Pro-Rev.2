/** Org-scoped Production Notes folder with inherited or independent job links. */

export type NoteFolderLinkMode = "inherited" | "independent";

export interface NoteFolder {
  id: string;
  org_id: string;
  parent_folder_id: string | null;
  name: string;
  link_mode: NoteFolderLinkMode;
  is_system: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
}

export interface NoteFolderJobLink {
  folder_id: string;
  project_id: string;
  created_by: string | null;
  created_at: string;
}

export interface VisibleNoteFolder extends NoteFolder {
  effective_project_ids: string[];
  independently_linked: boolean;
  can_manage_links: boolean;
  can_edit: boolean;
}

export interface AccessImpact {
  addedJobIds: string[];
  removedJobIds: string[];
  accessTightens: boolean;
  accessLoosens: boolean;
}

export interface FolderMutationResult {
  ok: true;
  folder: VisibleNoteFolder;
  version: number;
  pending_invalidation?: boolean;
}

export interface FolderMutationFailure {
  ok: false;
  error_code: string;
  error_message: string;
  failure_id?: string;
}

export type FolderCommandResult = FolderMutationResult | FolderMutationFailure;

export interface VisibleFolderWorkspace {
  ok: true;
  folders: VisibleNoteFolder[];
  links: NoteFolderJobLink[];
  general_notes_id: string;
}

export type AppRoleLike = "owner" | "admin" | "pm" | "user" | "field" | "viewer" | "member" | string;
