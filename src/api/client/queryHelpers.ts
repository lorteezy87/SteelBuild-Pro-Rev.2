/**
 * queryHelpers.ts
 *
 * Legacy sort-string parsing + conditions→PostgREST filter translation.
 * Extracted verbatim from supabaseClient.ts.
 */

import { mapColumn } from './fieldMapping';
import type { QueryBuilder } from './internal';
import type { Conditions } from './supabaseTypes';

/**
 * Parse legacy sort string ("-column" = descending, "column" = ascending)
 */
export const parseSortBy = (sortBy?: string | null): { column: string; ascending: boolean } | null => {
  if (!sortBy) return null;
  const desc = sortBy.startsWith('-');
  const column = mapColumn(desc ? sortBy.slice(1) : sortBy);
  return { column, ascending: !desc };
};

/**
 * Build a filtered Supabase query from a legacy conditions object.
 * Supports:
 *   - Simple equality: { status: 'Open' }
 *   - IN-array:        { status: ['Open', 'Closed'] }
 *   - Range operators: { 'scheduled_date.gte': '2024-01-01' }
 *   - NULL checks:     { assigned_to: null } → .is('assigned_to', null)
 */
const RANGE_OPS: Record<string, string> = {
  gte: 'gte', gt: 'gt', lte: 'lte', lt: 'lt', neq: 'neq', like: 'like', ilike: 'ilike',
};

export const applyConditions = (query: QueryBuilder, conditions: Conditions = {}): QueryBuilder => {
  for (const [key, value] of Object.entries(conditions)) {
    if (value === undefined) continue;

    // Check for operator suffix: "field.gte" → { field: col, op: 'gte' }
    const dotIdx = key.lastIndexOf('.');
    if (dotIdx > 0) {
      const opName = key.slice(dotIdx + 1);
      if (RANGE_OPS[opName]) {
        const col = mapColumn(key.slice(0, dotIdx));
        query = query[opName](col, value);
        continue;
      }
    }

    const col = mapColumn(key);
    if (value === null) {
      query = query.is(col, null);
    } else if (Array.isArray(value)) {
      query = query.in(col, value);
    } else {
      query = query.eq(col, value);
    }
  }
  return query;
};
