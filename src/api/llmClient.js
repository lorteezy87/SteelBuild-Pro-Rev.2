/**
 * LLM client — routes Claude calls through a Supabase Edge Function named "llm-proxy"
 * so the Anthropic API key is never exposed in the browser.
 *
 * Deploy the edge function: supabase functions deploy llm-proxy
 */
import { supabase } from '@/lib/supabase';

/**
 * Invoke Claude via the "llm-proxy" Supabase Edge Function.
 * @param {object} opts
 * @param {string} [opts.prompt]     - Simple user prompt
 * @param {string} [opts.system]     - System prompt
 * @param {Array}  [opts.messages]   - Full Anthropic messages array (overrides prompt)
 * @param {number} [opts.maxTokens]  - Max tokens (default 1000)
 * @param {string} [opts.model]      - Model override
 * @returns {Promise<string>}        - The assistant text response
 */
export async function invokeLLM({ prompt, system, messages, maxTokens = 1000, model }) {
  const { data, error } = await supabase.functions.invoke('llm-proxy', {
    body: { prompt, system, messages, maxTokens, model },
  });

  if (error) throw new Error(error.message || 'LLM invocation failed');
  if (data?.error) throw new Error(data.error);
  return data?.text || '';
}
