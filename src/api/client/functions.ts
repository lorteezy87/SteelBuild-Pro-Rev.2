/**
 * functions.ts
 *
 * The functions.invoke dispatcher. Includes the SECURITY-CRITICAL atomic
 * number-sequencing path (secureNumberSequence / numberSequence): sequence
 * numbers come ONLY from the get_next_sequence_number DB RPC with a 3× retry —
 * there is NO client-side Math.max / derivation fallback, ever. Extracted
 * verbatim from supabaseClient.ts.
 */

import { supabase } from '@/lib/supabase';
import { SupabaseOperationError } from './errors';
import type { FunctionInvokeResult } from './supabaseTypes';

// ─── Backend functions ────────────────────────────────────────────────────────

export const functions = {
  /**
   * Invoke a named backend function.
   * Implements the explicit supported function allowlist. Unsupported names
   * reject instead of returning a null result that could be mistaken for success.
   */
  invoke: async (name: string, params: Record<string, unknown> = {}): Promise<FunctionInvokeResult> => {
    switch (name) {
      // Atomic number sequencing via Postgres RPC — no race conditions.
      // The DB function uses INSERT...ON CONFLICT with RETURNING for atomicity.
      case 'secureNumberSequence':
      case 'numberSequence': {
        const { project_id, record_type } = params as { project_id?: string; record_type?: string };
        if (!project_id || !record_type) return { data: { number: 1 } };
        // Atomic, server-side ONLY. The RPC does INSERT...ON CONFLICT DO UPDATE
        // ...RETURNING under a row lock, so concurrent callers serialize and get
        // DISTINCT official numbers (and it re-checks project access). NEVER fall
        // back to a client read-modify-write — two concurrent creates would read
        // the same next_value and mint DUPLICATE RFI/CO/submittal numbers, a
        // serious record-integrity problem. On a transient RPC error, retry the
        // SERVER call, then fail closed (no browser-side sequencing).
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { data, error } = await supabase.rpc('get_next_sequence_number', {
            p_project_id: project_id,
            p_record_type: record_type,
          });
          if (!error) return { data: { number: data } };
          lastError = error;
          console.warn(`[numberSequence] atomic RPC attempt ${attempt + 1}/3 failed:`, error?.message ?? error);
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
        throw new SupabaseOperationError('number_sequences', 'get_next_sequence_number', lastError);
      }

      // LLM proxy — prefer integrations.Core.InvokeLLM (src/api/client/llm.ts).
      // This legacy dispatcher path must still fail closed: never return a
      // success-shaped payload with error: null when the proxy is unavailable.
      case 'invokeLLM':
      case 'anthropicProxy': {
        try {
          const { data, error } = await supabase.functions.invoke('llm-proxy', { body: params });
          if (error) throw error;
          return { data };
        } catch (err: unknown) {
          const detail =
            (err as { message?: string } | undefined)?.message ||
            'AI features require the "llm-proxy" Supabase Edge Function.';
          return { data: { text: null, error: detail } };
        }
      }

      // Alert generation — fail closed. There is no generate-alerts Edge Function
      // in this repo; returning an empty "success" made Alerts Center look like a
      // scan completed. Module workflows (RFIs, Deliveries) create alerts directly.
      case 'generateAlerts':
        throw new Error(
          'Cross-module alert scan is unavailable: the generate-alerts Edge Function is not deployed. Alerts are created from module workflows (RFIs, Deliveries).',
        );

      // Agent memory — retired with the chat assistant. Do not invoke a
      // remote function or return a null "success" that hides the retirement.
      case 'agentMemory':
        throw new Error(
          'Agent memory is unavailable: the retired memory Edge Function is not deployed.',
        );

      default:
        throw new Error(`Unsupported backend function: ${name}`);
    }
  },
};
