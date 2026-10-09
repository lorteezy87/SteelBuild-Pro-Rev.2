import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import type { Database } from "@/types/supabase";

/** One replay owns one token; SDK auth locks must never substitute a new user. */
export async function createReplayClient(
  userId: string,
  assertActive: () => void,
  signal: AbortSignal,
): Promise<SupabaseClient<Database>> {
  assertActive();
  const { data, error } = await supabase.auth.getSession();
  assertActive();
  const session = data?.session;
  if (error || session?.user.id !== userId || !session.access_token) {
    throw new Error("Outbox replay requires the original signed-in user");
  }
  const token = session.access_token;
  return createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    // accessToken avoids creating a second Auth client, storage or listeners.
    accessToken: async () => token,
    global: {
      fetch: (input, init) => {
        // Runs AFTER the SDK's asynchronous token resolution, directly at the
        // network boundary. Also covers Storage, whose upload omits signals.
        assertActive();
        signal.throwIfAborted();
        return fetch(input, { ...init, signal });
      },
    },
  });
}
