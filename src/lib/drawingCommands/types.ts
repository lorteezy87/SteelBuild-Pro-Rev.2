/** Exact reviewed SQL contracts. Owner identity fences local replay only; SQL uses auth.uid(). */
export type DrawingJson = null | string | number | boolean | readonly DrawingJson[] | { readonly [key: string]: DrawingJson };
export type DrawingExtraction<T> = { readonly state: 'unavailable' } | { readonly state: 'harvested'; readonly value: T };
export interface DrawingSourceObject { readonly path: string; readonly token: string }
interface ChangedSheetFields {
  readonly sheet_number: string;
  readonly sheet_title: string;
  readonly revision_code: string;
  readonly file_path: string;
  readonly pdf_page: number;
  readonly reviewed: true;
  readonly discipline?: string | null;
  readonly extraction: {
    readonly text: DrawingExtraction<string>;
    readonly callouts: DrawingExtraction<readonly DrawingJson[]>;
  };
}
interface ExistingSheetFields {
  readonly drawing_id: string;
  readonly expected_updated_at: string;
  readonly expected_revision_id: string | null;
  readonly sheet_number: string;
}
export type AddedDrawingSheet = ChangedSheetFields & { readonly action: 'added' };
export type RevisedDrawingSheet = ChangedSheetFields & ExistingSheetFields & { readonly action: 'revised'; readonly expected_revision_id: string };
export type UnchangedDrawingSheet = ExistingSheetFields & { readonly action: 'same' };
export type RemovedDrawingSheet = ExistingSheetFields & { readonly action: 'removed'; readonly expected_revision_id: string };
export type ReviewedDrawingSheet = AddedDrawingSheet | RevisedDrawingSheet | UnchangedDrawingSheet | RemovedDrawingSheet;
interface DrawingRequestFields {
  readonly project_id: string;
  readonly revision_label: string;
  readonly file_path: string;
  readonly source_objects: readonly DrawingSourceObject[];
}
export interface CreateSetRequest extends DrawingRequestFields {
  readonly set_name: string;
  readonly set_number: string | null;
  readonly discipline: string | null;
  readonly issued_date: string | null;
  readonly issued_by: string | null;
  readonly notes: string | null;
  readonly sheets: readonly AddedDrawingSheet[];
}
export interface ReviseSetRequest extends DrawingRequestFields {
  readonly set_id: string;
  readonly expected_set_updated_at: string;
  readonly expected_set_revision: string | null;
  readonly issued_date: string;
  readonly issued_by?: string | null;
  readonly notes?: string | null;
  readonly sheets: readonly ReviewedDrawingSheet[];
}
export type CreateSetReview = CreateSetRequest;
export type ReviseSetReview = ReviseSetRequest;
export interface DrawingCommandOwner { readonly actorId: string; readonly orgId: string; readonly projectId: string }
export type DrawingCommandOperation = 'create_set' | 'revise_set';
export type ReviewedDrawingCommand = {
  readonly version: 1;
  readonly requestId: string;
  readonly owner: DrawingCommandOwner;
} & ({ readonly operation: 'create_set'; readonly payload: CreateSetRequest }
  | { readonly operation: 'revise_set'; readonly payload: ReviseSetRequest });
export interface DrawingCommandCapabilities {
  readonly contract_version: 1;
  readonly new_set: boolean;
  readonly revision: boolean;
  readonly write_boundary: boolean;
  readonly source_protection: boolean;
  readonly receipt_lookup: boolean;
}
export interface DrawingCommandSourcePage {
  readonly drawing_id: string;
  readonly revision_id: string;
  readonly file_path: string;
  readonly pdf_page: number;
}
export interface DrawingCommandResult {
  readonly applied: true;
  readonly contract_version: 1;
  readonly operation: DrawingCommandOperation;
  readonly payload_sha256: string;
  readonly request_id: string;
  readonly project_id: string;
  readonly set_id: string;
  readonly revised: number;
  readonly added: number;
  readonly removed: number;
  readonly sheet_count: number;
  readonly zones_cloned: number;
  readonly links_cloned: number;
  readonly dependencies_cloned: number;
  readonly source_pages: readonly DrawingCommandSourcePage[];
}
export type DrawingCommandReceipt = { readonly state: 'committed'; readonly result: DrawingCommandResult }
  | { readonly state: 'pending' | 'not_committed' };
export interface DrawingCommandFailure { readonly code: string; readonly message: string }
/** Only dispatched writes produce outcomes. Pre-dispatch failures throw DrawingCommandPreflightError. */
export type DrawingCommandOutcome = { readonly kind: 'committed'; readonly result: DrawingCommandResult }
  | { readonly kind: 'rejected' | 'uncertain'; readonly error: DrawingCommandFailure };
