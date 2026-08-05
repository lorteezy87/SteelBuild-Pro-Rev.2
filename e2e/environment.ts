export type E2ETarget = "production" | "staging" | "local";

export interface E2EEnvironment {
  target: E2ETarget;
  baseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  email: string;
  password: string;
  supabaseRef: string;
}

type Environment = Record<string, string | undefined>;

const PRODUCTION_HOSTS = new Set(["steelbuild-pro.com", "www.steelbuild-pro.com"]);

export function resolveE2EEnvironment(env: Environment = process.env): E2EEnvironment {
  const target = (env.E2E_TARGET || "production") as E2ETarget;
  if (!(["production", "staging", "local"] as const).includes(target)) {
    throw new Error(`Unsupported E2E_TARGET: ${target}`);
  }

  const baseUrl = env.E2E_BASE_URL || (target === "production" ? "https://steelbuild-pro.com" : "");
  const supabaseUrl = env.E2E_SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const supabaseAnonKey = env.E2E_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  const email = env.E2E_USER || "";
  const password = env.E2E_PASS || "";
  const missing = [
    !baseUrl && "E2E_BASE_URL",
    !email && "E2E_USER",
    !password && "E2E_PASS",
    !supabaseUrl && "E2E_SUPABASE_URL (or VITE_SUPABASE_URL)",
    !supabaseAnonKey && "E2E_SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`E2E auth is not configured. Set: ${missing.join(", ")}. See e2e/README.md.`);
  }

  const base = new URL(baseUrl);
  const supabase = new URL(supabaseUrl);
  const supabaseRef = supabase.hostname.split(".")[0];

  if (target === "staging") {
    if (PRODUCTION_HOSTS.has(base.hostname)) {
      throw new Error("Staging E2E refuses to run against the production app host.");
    }
    const expectedRef = env.E2E_EXPECTED_SUPABASE_REF || "";
    if (!expectedRef) {
      throw new Error("Staging E2E requires E2E_EXPECTED_SUPABASE_REF.");
    }
    if (supabaseRef !== expectedRef) {
      throw new Error("Staging E2E Supabase URL does not match E2E_EXPECTED_SUPABASE_REF.");
    }
  }

  return {
    target,
    baseUrl: base.origin,
    supabaseUrl: supabase.origin,
    supabaseAnonKey,
    email,
    password,
    supabaseRef,
  };
}

export function assertDisposableMutationEnvironment(env: Environment = process.env): void {
  const resolved = resolveE2EEnvironment(env);
  if (resolved.target !== "staging") {
    throw new Error("Mutation E2E is staging-only.");
  }
  if (env.E2E_MUTATIONS_ENABLED !== "true") {
    throw new Error("Mutation E2E requires E2E_MUTATIONS_ENABLED=true.");
  }
  if (env.E2E_MUTATION_FIXTURE_KIND !== "disposable") {
    throw new Error("Mutation E2E requires a disposable fixture declaration.");
  }
}
