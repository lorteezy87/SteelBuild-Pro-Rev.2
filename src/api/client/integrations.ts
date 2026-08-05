/**
 * integrations.ts
 *
 * Composes the `integrations` surface (integrations.Core.UploadFile /
 * .InvokeLLM) from the extracted uploads + llm implementations. The object
 * shape is identical to what supabaseClient.ts exported before the split.
 */

import { UploadFile } from './uploads';
import { InvokeLLM } from './llm';

export const integrations = {
  Core: {
    UploadFile,
    InvokeLLM,
  },
};
