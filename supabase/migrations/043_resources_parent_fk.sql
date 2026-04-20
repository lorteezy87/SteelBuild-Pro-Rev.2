-- ============================================================================
-- 043_resources_parent_fk.sql
--
-- Adds hierarchical crews to the resources table. A "Crew" resource has no
-- parent (parent_resource_id IS NULL) and its effective capacity is the
-- sum of its children's capacities. Individual members (welders,
-- ironworkers, foremen) are children pointing at the crew.
--
-- The Resource Scheduling board already assigns a work_package to a
-- single resource via work_packages.crew (TEXT match on resources.name).
-- Users can keep assigning to the crew; the over-allocation math now
-- rolls up member capacities so adding a 160-hour WP to a 4-person crew
-- no longer flags the crew as over-allocated when each member has 40h.
--
-- ON DELETE SET NULL so deleting a parent crew doesn't cascade-delete
-- the members — they simply become orphans and can be reassigned to a
-- new crew from the UI.
-- ============================================================================

ALTER TABLE resources ADD COLUMN IF NOT EXISTS parent_resource_id UUID
  REFERENCES resources(id) ON DELETE SET NULL;

-- Quick "members of this crew" lookup.
CREATE INDEX IF NOT EXISTS idx_resources_parent
  ON resources(parent_resource_id)
  WHERE parent_resource_id IS NOT NULL;

-- Self-reference guard: a resource cannot be its own parent.
ALTER TABLE resources DROP CONSTRAINT IF EXISTS chk_resources_no_self_parent;
ALTER TABLE resources ADD CONSTRAINT chk_resources_no_self_parent
  CHECK (parent_resource_id IS NULL OR parent_resource_id <> id);

NOTIFY pgrst, 'reload schema';
