-- Remove the Bluebeam integration entirely (deprioritized module, never
-- connected — all four tables are empty). The bluebeam-proxy + sharepoint-proxy
-- Edge Functions and the client stack are removed in the same change. CASCADE
-- clears the inter-table FKs (session_documents → sessions) and any dependent
-- policies/constraints.
DROP TABLE IF EXISTS public.bluebeam_session_documents CASCADE;
DROP TABLE IF EXISTS public.bluebeam_sessions          CASCADE;
DROP TABLE IF EXISTS public.bluebeam_connections       CASCADE;
DROP TABLE IF EXISTS public.bluebeam_oauth_states      CASCADE;

NOTIFY pgrst, 'reload schema';
