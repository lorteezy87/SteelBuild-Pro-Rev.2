import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import { env } from '@/lib/env';
import { initializePasswordRecovery, capturePasswordRecovery } from '@/lib/passwordRecovery';
import { rejectImplicitAuthCallback, inspectAuthCallbackUrl, finishAuthCallback } from '@/lib/authCallbackPolicy';

// Record the callback hint before Auth consumes it, including before React loads.
rejectImplicitAuthCallback();
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
      flowType: 'pkce',
    },
  }
);

// This synchronous listener deliberately makes no Auth API calls. It captures
// recovery even if the SDK finishes initialization before AuthProvider mounts.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') capturePasswordRecovery(session);
});

// The SDK verifies the persisted, flow-specific PKCE verifier and emits the
// recovery event itself. Remove codes even when the provider rejects the link.
const callbackUrl = typeof window !== 'undefined' ? window.location?.href : undefined;
if (callbackUrl && inspectAuthCallbackUrl(callbackUrl).code) {
  void supabase.auth.initialize().then(({ error }) => {
    // With no local verifier the SDK deliberately ignores a URL code. Treat
    // the unconsumed callback as a failed link, not as a successful sign-in.
    const unconsumed = window.location.href === callbackUrl && Boolean(inspectAuthCallbackUrl(window.location.href).code);
    finishAuthCallback(callbackUrl, Boolean(error) || unconsumed);
  })
    .catch(() => finishAuthCallback(callbackUrl, true));
}
