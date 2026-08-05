-- Enterprise scale pass (Supabase performance advisors), index-only.
--  1. Cover 43 foreign keys that lacked an index (faster joins/cascades and
--     cheaper ON DELETE/UPDATE as project data grows).
--  2. Drop 4 duplicate indexes (identical pairs — wasted storage + write cost).
-- Additive/idempotent (IF NOT EXISTS / IF EXISTS); index builds are cheap at
-- current data sizes. Applied live via Supabase MCP 2026-05-26.
--
-- NOTE: the 4 `auth_rls_initplan` RLS-policy rewrites the advisor also flags
-- (ai_audit_log, bluebeam_connections, default_cost_codes) are intentionally
-- NOT in this migration — they touch security policies and are handled
-- separately with explicit review.

-- ── 1. Covering indexes for unindexed foreign keys ──────────────────────
CREATE INDEX IF NOT EXISTS idx_ai_audit_log_user_id ON public.ai_audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_bluebeam_oauth_states_user_id ON public.bluebeam_oauth_states (user_id);
CREATE INDEX IF NOT EXISTS idx_bluebeam_session_documents_source_document_id ON public.bluebeam_session_documents (source_document_id);
CREATE INDEX IF NOT EXISTS idx_bluebeam_sessions_created_by ON public.bluebeam_sessions (created_by);
CREATE INDEX IF NOT EXISTS idx_comments_author_id ON public.comments (author_id);
CREATE INDEX IF NOT EXISTS idx_comments_status_changed_by ON public.comments (status_changed_by);
CREATE INDEX IF NOT EXISTS idx_document_folders_parent_folder_id ON public.document_folders (parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_document_import_queue_created_document_id ON public.document_import_queue (created_document_id);
CREATE INDEX IF NOT EXISTS idx_document_import_queue_target_folder_id ON public.document_import_queue (target_folder_id);
CREATE INDEX IF NOT EXISTS idx_drawing_findings_linked_rfi_id ON public.drawing_findings (linked_rfi_id);
CREATE INDEX IF NOT EXISTS idx_drawing_links_drawing_id ON public.drawing_links (drawing_id);
CREATE INDEX IF NOT EXISTS idx_drawing_revision_comparisons_from_analysis_id ON public.drawing_revision_comparisons (from_analysis_id);
CREATE INDEX IF NOT EXISTS idx_drawing_revision_comparisons_to_analysis_id ON public.drawing_revision_comparisons (to_analysis_id);
CREATE INDEX IF NOT EXISTS idx_drawing_revision_deltas_linked_rfi_id ON public.drawing_revision_deltas (linked_rfi_id);
CREATE INDEX IF NOT EXISTS idx_drawing_revisions_supersedes_revision_id ON public.drawing_revisions (supersedes_revision_id);
CREATE INDEX IF NOT EXISTS idx_drawing_sets_current_submittal_id ON public.drawing_sets (current_submittal_id);
CREATE INDEX IF NOT EXISTS idx_drawing_sets_locked_by ON public.drawing_sets (locked_by);
CREATE INDEX IF NOT EXISTS idx_drawing_signoffs_stamped_by_id ON public.drawing_signoffs (stamped_by_id);
CREATE INDEX IF NOT EXISTS idx_drawing_signoffs_voided_by ON public.drawing_signoffs (voided_by);
CREATE INDEX IF NOT EXISTS idx_drawing_zone_activity_drawing_id ON public.drawing_zone_activity (drawing_id);
CREATE INDEX IF NOT EXISTS idx_drawing_zone_dependencies_created_by ON public.drawing_zone_dependencies (created_by);
CREATE INDEX IF NOT EXISTS idx_drawing_zone_dependencies_removed_by ON public.drawing_zone_dependencies (removed_by);
CREATE INDEX IF NOT EXISTS idx_drawing_zone_dependencies_target_zone_id ON public.drawing_zone_dependencies (target_zone_id);
CREATE INDEX IF NOT EXISTS idx_drawing_zone_proposals_accepted_zone_id ON public.drawing_zone_proposals (accepted_zone_id);
CREATE INDEX IF NOT EXISTS idx_drawing_zone_proposals_analysis_id ON public.drawing_zone_proposals (analysis_id);
CREATE INDEX IF NOT EXISTS idx_drawing_zone_proposals_decided_by ON public.drawing_zone_proposals (decided_by);
CREATE INDEX IF NOT EXISTS idx_drawing_zone_proposals_drawing_id ON public.drawing_zone_proposals (drawing_id);
CREATE INDEX IF NOT EXISTS idx_drawing_zone_proposals_merged_into_proposal_id ON public.drawing_zone_proposals (merged_into_proposal_id);
CREATE INDEX IF NOT EXISTS idx_drawing_zones_parent_zone_id ON public.drawing_zones (parent_zone_id);
CREATE INDEX IF NOT EXISTS idx_email_accounts_created_by ON public.email_accounts (created_by);
CREATE INDEX IF NOT EXISTS idx_email_attachments_project_id ON public.email_attachments (project_id);
CREATE INDEX IF NOT EXISTS idx_email_intake_queue_reviewed_by ON public.email_intake_queue (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_email_messages_account_id ON public.email_messages (account_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_reviewed_by ON public.email_messages (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_email_messages_sent_by ON public.email_messages (sent_by);
CREATE INDEX IF NOT EXISTS idx_external_file_refs_drawing_set_id ON public.external_file_refs (drawing_set_id);
CREATE INDEX IF NOT EXISTS idx_external_linked_folders_drawing_set_id ON public.external_linked_folders (drawing_set_id);
CREATE INDEX IF NOT EXISTS idx_mitigation_actions_project_id ON public.mitigation_actions (project_id);
CREATE INDEX IF NOT EXISTS idx_model_element_links_project_id ON public.model_element_links (project_id);
CREATE INDEX IF NOT EXISTS idx_model_registry_document_id ON public.model_registry (document_id);
CREATE INDEX IF NOT EXISTS idx_model_registry_superseded_by ON public.model_registry (superseded_by);
CREATE INDEX IF NOT EXISTS idx_submittal_sheet_responses_drawing_set_id ON public.submittal_sheet_responses (drawing_set_id);
CREATE INDEX IF NOT EXISTS idx_submittals_current_round_id ON public.submittals (current_round_id);

-- ── 2. Drop duplicate indexes (keep one of each identical pair) ──────────
DROP INDEX IF EXISTS public.idx_drawing_sets_project;        -- twin of idx_drawing_sets_project_id
DROP INDEX IF EXISTS public.idx_drawings_project;            -- twin of idx_drawings_project_id
DROP INDEX IF EXISTS public.idx_zone_activity_zone;          -- twin of idx_drawing_zone_activity_zone
DROP INDEX IF EXISTS public.idx_zone_activity_project;       -- twin of idx_drawing_zone_activity_project
