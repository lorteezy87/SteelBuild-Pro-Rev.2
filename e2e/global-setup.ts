import { chromium, expect, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { resolveE2EEnvironment } from "./environment";
import { observeReadOnlyPage } from "./acceptance";

/**
 * Sign in ONCE via the Supabase API and seed the resulting session into the app
 * origin's localStorage. After the app initializes identity, choose the known
 * project through its real picker and persist Playwright storageState.
 *
 * The app creates its Supabase client with the DEFAULT storage key (there is no
 * custom `storageKey` in src/lib/supabase.ts), which is `sb-<ref>-auth-token`.
 * supabase-js v2 persists the session object as JSON under that key, so the app
 * reads exactly what we seed here.
 *
 * Required env (see e2e/README.md):
 *   E2E_USER, E2E_PASS                                  dedicated test account
 *   E2E_SUPABASE_URL      | VITE_SUPABASE_URL           project URL
 *   E2E_SUPABASE_ANON_KEY | VITE_SUPABASE_ANON_KEY      anon key (public)
 *   E2E_BASE_URL                                        app origin (default prod)
 */
const STORAGE_PATH = "e2e/.auth/state.json";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const environment = resolveE2EEnvironment();
  const explicitProjectId = process.env.E2E_PROJECT_ID;
  if (!explicitProjectId && environment.target !== "staging") {
    throw new Error("Read-only E2E requires E2E_PROJECT_ID outside staging; it never chooses an arbitrary project.");
  }

  const supabase = createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: environment.email,
    password: environment.password,
  });
  if (error || !data.session) {
    throw new Error(
      `E2E sign-in failed: ${error?.message || "no session returned"}`,
    );
  }

  // Resolve only a fixture the signed-in user can actually read under RLS.
  // STG-0001 is the staging bootstrap fixture, never a production fallback.
  const projectQuery = supabase.from("projects").select("id,name,project_number,org_id,is_deleted,on_hold");
  const { data: project, error: projectError } = await (explicitProjectId
    ? projectQuery.eq("id", explicitProjectId)
    : projectQuery.eq("project_number", "STG-0001")).single();
  if (projectError || !project?.id || !project.org_id || !project.name
    || project.is_deleted === true || project.on_hold === true) {
    throw new Error("E2E project fixture is missing, ambiguous, paused, or inaccessible to the signed-in user.");
  }
  process.env.E2E_PROJECT_ID = project.id;

  const storageKey = `sb-${environment.supabaseRef}-auth-token`;
  const sessionValue = JSON.stringify(data.session);
  const origin = environment.baseUrl;

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const probe = await observeReadOnlyPage(page, environment.supabaseUrl);
    // Land on the origin so localStorage is scoped to it, seed the session,
    // then capture storageState for the specs.
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ([key, value, orgId]) => {
        window.localStorage.setItem(key, value);
        // This is only a workspace preference. The application still verifies
        // membership and owns project-cache initialization after authentication.
        window.localStorage.setItem("sbp:current-org", orgId);
      },
      [storageKey, sessionValue, project.org_id] as [string, string, string],
    );
    await page.goto(new URL("/Projects", origin).href, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main", { name: "Main content", exact: true })).toBeVisible({ timeout: 30_000 });
    // Identity initialization clears unowned cache state. Wait for the app to
    // publish its real account/workspace-owned project list before selecting.
    await expect.poll(() => page.evaluate(({ userId, orgId, projectId }) => {
      try {
        const cached = JSON.parse(localStorage.getItem("sbp_projects_cache") || "null");
        return cached?.version === 2 && cached.owner?.userId === userId
          && cached.owner?.orgId === orgId
          && cached.projects?.some((row: { id?: string }) => row.id === projectId);
      } catch { return false; }
    }, { userId: data.session.user.id, orgId: project.org_id, projectId: project.id }), {
      timeout: 30_000, message: "The signed-in app must load the fixture in its owned project cache",
    }).toBe(true);
    await page.locator('button[aria-label^="Project picker:"]:visible').first().click();
    const picker = page.getByRole("dialog", { name: "Choose project", exact: true });
    await picker.getByRole("combobox", { name: "Search projects", exact: true }).fill(project.project_number || project.name);
    await picker.locator(`[id="project-option-${project.id}"]`).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("activeProjectId"))).toBe(project.id);
    await expect(page.getByRole("button", { name: `Project picker: ${project.name}`, exact: true }).first()).toBeVisible();
    await probe.settle();
    probe.assertHealthy();
    mkdirSync("e2e/.auth", { recursive: true });
    await context.storageState({ path: STORAGE_PATH });
    await probe.dispose();
  } finally {
    await browser.close();
  }
}
