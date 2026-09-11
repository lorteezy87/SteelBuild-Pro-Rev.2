import { supabase } from '@/lib/supabase';
import { validateDetailingSheets } from '@/lib/detailingValidation/rules';
import type { ValidationSheet, ValidationRevision, ValidationHold } from '@/lib/detailingValidation/rules';

async function allRows<T>(page: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + 499);
    if (error) throw error;
    if (!data) throw new Error('Validation evidence was not returned. Retry the check.');
    if (!data.length) return rows;
    rows.push(...data);
  }
}
/** Fresh, complete reads only when the user runs validation. No service role or writes. */
export async function runDetailingValidation(projectId: string) {
  if (!projectId) throw new Error('Select a project before running validation.');
  const [sheets, revisions, holds] = await Promise.all([
    allRows<ValidationSheet>((start,end) => supabase.from('drawings')
      .select('id, sheet_number, title, revision_number, file_url, drawing_set_name, is_superseded')
      .eq('project_id', projectId).eq('is_deleted', false).order('id').range(start,end)),
    allRows<ValidationRevision>((start,end) => supabase.from('drawing_revisions')
      .select('drawing_id, is_current, revision_code, file_url')
      .eq('project_id', projectId).eq('is_current', true).order('id').range(start,end)),
    allRows<ValidationHold>((start,end) => supabase.from('drawing_holds')
      .select('drawing_id, is_active, reason').eq('project_id', projectId).eq('is_active', true).order('id').range(start,end)),
  ]);
  return { ...validateDetailingSheets(sheets, revisions, holds), checkedAt: new Date().toISOString() };
}
