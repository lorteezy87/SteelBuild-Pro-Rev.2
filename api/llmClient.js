/**
 * LLM client — routes all Claude calls through the invokeLLM backend function
 * so the Anthropic API key is never exposed in the browser.
 */
import { base44 } from './base44Client';

/**
 * Invoke Claude via the secure backend proxy.
 * @param {object} opts
 * @param {string} [opts.prompt]        - Simple user prompt (alternative to messages)
 * @param {string} [opts.system]        - System prompt
 * @param {Array}  [opts.messages]      - Full Anthropic messages array (overrides prompt)
 * @param {number} [opts.maxTokens]     - Max tokens (default 1000)
 * @param {string} [opts.model]         - Model override (default: claude-sonnet-4-6)
 * @returns {Promise<string>}           - The assistant text response
 */
export async function invokeLLM({ prompt, system, messages, maxTokens = 1000, model }) {
  const response = await base44.functions.invoke('invokeLLM', {
    prompt,
    system,
    messages,
    maxTokens,
    model,
  });

  const text = response?.data?.text;
  if (response?.data?.error) {
    throw new Error(response.data.error);
  }
  return text || '';
}