/**
 * internal.ts
 *
 * Shared internal query-builder plumbing used by queryHelpers, softDelete, and
 * the entity client. NOT part of the public barrel surface. Extracted verbatim
 * from supabaseClient.ts (the QueryBuilder alias + sbFrom shim).
 */

import { supabase } from '@/lib/supabase';

// The Postgrest filter-builder type is structural and parameterised by every
// table generic. Typing it cleanly here would force every helper to thread
// 5 generics for zero runtime benefit — `any` for the builder is the
// pragmatic choice; the public surface (createEntityClient) is fully typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryBuilder = any;

// Calling supabase.from() inside a function generic over `T extends TableName`
// trips the table-literal overload (TS won't propagate the constraint cleanly
// through the union of 57 string literals). We re-type from() through an
// untyped shim and rely on createEntityClient's surface to enforce shape.
export const sbFrom = (table: string): QueryBuilder =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (supabase.from as unknown as (t: string) => any)(table);
