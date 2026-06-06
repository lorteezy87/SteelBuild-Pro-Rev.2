-- Add covering indexes for the 8 foreign keys the performance advisor flagged
-- as unindexed (audit L3). Unindexed FKs make the referenced-side delete/update
-- and join paths do sequential scans. All are on the drawing-control module +
-- the new projects.on_hold_by column.
CREATE INDEX IF NOT EXISTS idx_drawing_impacts_created_by          ON public.drawing_impacts (created_by);
CREATE INDEX IF NOT EXISTS idx_drawing_markups_author_id           ON public.drawing_markups (author_id);
CREATE INDEX IF NOT EXISTS idx_drawing_markups_project_id          ON public.drawing_markups (project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_reviews_reviewer_id         ON public.drawing_reviews (reviewer_id);
CREATE INDEX IF NOT EXISTS idx_drawing_transmittal_items_project_id ON public.drawing_transmittal_items (project_id);
CREATE INDEX IF NOT EXISTS idx_drawing_transmittals_created_by     ON public.drawing_transmittals (created_by);
CREATE INDEX IF NOT EXISTS idx_drawing_watchers_project_id         ON public.drawing_watchers (project_id);
CREATE INDEX IF NOT EXISTS idx_projects_on_hold_by                 ON public.projects (on_hold_by);
