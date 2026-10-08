import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { env } from '@/lib/env';
import { initializePasswordRecovery, capturePasswordRecovery } from '@/lib/passwordRecovery';

// Record the callback hint before Auth consumes it, including before React loads.
initializePasswordRecovery();

// Config (and its validation) is centralized in @/lib/env — importing it here
// makes this module the fail-fast entry point: a missing/malformed
// VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY throws a clear EnvValidationError
// at startup instead of an opaque auth failure later.
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

// This synchronous listener deliberately makes no Auth API calls. It captures
// recovery even if the SDK finishes initialization before AuthProvider mounts.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') capturePasswordRecovery(session);
});
