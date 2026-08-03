import { expect, test, type Page, type Route } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SUPABASE_ORIGIN = "http://127.0.0.1:54321";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const ACTION_ALPHA_ID = "44444444-4444-4444-8444-444444444444";
const ACTION_BRAVO_ID = "55555555-5555-4555-8555-555555555555";
const SCREENSHOT_DIR = path.resolve("output/playwright/planner-core");

type ActionFixture = {
  id: string;
  project_id: string;
  project_name: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  workstream: string | null;
  action_date: string | null;
  due_date: string | null;
  follow_up_date: string | null;
  impact_date: string | null;
  waiting_on: string | null;
  assigned_user_id: string | null;
  assigned_to: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MockPlannerState = {
  actions: ActionFixture[];
  unhandledRequests: string[];
};

function encodeJwtPart(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fixtureSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3_600;
  const user = {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "planner.e2e@example.test",
    email_confirmed_at: "2026-08-01T00:00:00.000Z",
    phone: "",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: "Planner E2E" },
    identities: [],
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
  const accessToken = [
    encodeJwtPart({ alg: "HS256", typ: "JWT" }),
    encodeJwtPart({
      aud: "authenticated",
      exp: expiresAt,
      sub: USER_ID,
      email: user.email,
      role: "authenticated",
      aal: "aal1",
      session_id: "66666666-6666-4666-8666-666666666666",
      amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
    }),
    "planner-test-signature",
  ].join(".");

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3_600,
    expires_at: expiresAt,
    refresh_token: "planner-test-refresh-token",
    user,
  };
}

function initialActions(): ActionFixture[] {
  return [
    {
      id: ACTION_ALPHA_ID,
      project_id: PROJECT_ID,
      project_name: "Skyport at Redfield",
      title: "Release main steel",
      description: "Confirm IFC package before shop release.",
      priority: "Critical",
      status: "Open",
      workstream: "Fabrication",
      action_date: "2026-08-02",
      due_date: "2026-08-03",
      follow_up_date: null,
      impact_date: "2026-08-04",
      waiting_on: "Detailer",
      assigned_user_id: USER_ID,
      assigned_to: "Planner E2E",
      source_entity_type: null,
      source_entity_id: null,
      completed_at: null,
      archived_at: null,
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    },
    {
      id: ACTION_BRAVO_ID,
      project_id: PROJECT_ID,
      project_name: "Skyport at Redfield",
      title: "Verify field safety access",
      description: "Confirm crane access and exclusion zone.",
      priority: "High",
      status: "In Progress",
      workstream: "Field",
      action_date: "2026-08-02",
      due_date: "2026-08-04",
      follow_up_date: "2026-08-03",
      impact_date: "2026-08-04",
      waiting_on: "Superintendent",
      assigned_user_id: USER_ID,
      assigned_to: "Planner E2E",
      source_entity_type: null,
      source_entity_id: null,
      completed_at: null,
      archived_at: null,
      created_at: "2026-08-01T13:00:00.000Z",
      updated_at: "2026-08-01T13:00:00.000Z",
    },
  ];
}

const responseHeaders = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "content-range",
  "content-type": "application/json",
};

function comparedValue(url: URL, field: string): string | null {
  const value = url.searchParams.get(field);
  return value?.startsWith("eq.") ? value.slice(3) : null;
}

function selectedIds(url: URL): string[] | null {
  const value = url.searchParams.get("id");
  if (!value?.startsWith("in.(") || !value.endsWith(")")) return null;
  return value.slice(4, -1).split(",").filter(Boolean);
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, headers: responseHeaders, body: JSON.stringify(body) });
}

async function installMockSupabase(page: Page): Promise<MockPlannerState> {
  const state: MockPlannerState = { actions: initialActions(), unhandledRequests: [] };
  const session = fixtureSession();

  await page.route(`${SUPABASE_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: responseHeaders });
      return;
    }

    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      await fulfillJson(route, session);
      return;
    }
    if (url.pathname === "/auth/v1/logout") {
      await route.fulfill({ status: 204, headers: responseHeaders });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      await fulfillJson(route, session.user);
      return;
    }

    if (url.pathname === "/rest/v1/user_profiles") {
      await fulfillJson(route, { role: "admin" });
      return;
    }
    if (url.pathname === "/rest/v1/organization_members") {
      await fulfillJson(route, [{
        role: "owner",
        organizations: {
          id: ORG_ID,
          name: "SteelBuild E2E",
          slug: "steelbuild-e2e",
          plan: "enterprise",
          created_by: USER_ID,
          created_at: "2026-08-01T00:00:00.000Z",
          metadata: { timezone: "America/Phoenix" },
        },
      }]);
      return;
    }
    if (url.pathname === "/rest/v1/projects") {
      await fulfillJson(route, [{
        id: PROJECT_ID,
        org_id: ORG_ID,
        name: "Skyport at Redfield",
        project_number: "25531",
        is_deleted: false,
        on_hold: false,
        created_at: "2026-08-01T00:00:00.000Z",
      }]);
      return;
    }
    if (url.pathname === "/rest/v1/planner_action_events") {
      await fulfillJson(route, []);
      return;
    }
    if (url.pathname === "/rest/v1/schedule_tasks") {
      await fulfillJson(route, []);
      return;
    }
    if (url.pathname === "/rest/v1/action_items") {
      const projectId = comparedValue(url, "project_id");
      const actionId = comparedValue(url, "id");

      if (method === "POST") {
        const payload = request.postDataJSON() as Partial<ActionFixture>;
        const created: ActionFixture = {
          ...initialActions()[0],
          ...payload,
          id: "77777777-7777-4777-8777-777777777777",
          project_id: payload.project_id ?? PROJECT_ID,
          project_name: "Skyport at Redfield",
          title: payload.title ?? "Untitled action",
          created_at: "2026-08-02T15:00:00.000Z",
          updated_at: "2026-08-02T15:00:00.000Z",
          completed_at: null,
          archived_at: null,
        };
        state.actions.push(created);
        await fulfillJson(route, created, 201);
        return;
      }

      if (method === "PATCH") {
        const payload = request.postDataJSON() as Partial<ActionFixture>;
        const targetId = actionId ?? state.actions.find((action) => action.project_id === projectId)?.id;
        const index = state.actions.findIndex((action) => action.id === targetId);
        if (index < 0) {
          await route.fulfill({ status: 204, headers: responseHeaders });
          return;
        }
        state.actions[index] = {
          ...state.actions[index],
          ...payload,
          updated_at: new Date(Date.parse(state.actions[index].updated_at) + 1_000).toISOString(),
        };
        await fulfillJson(route, state.actions[index]);
        return;
      }

      if (method === "GET") {
        const ids = selectedIds(url);
        const rows = state.actions.filter((action) => (
          (!projectId || action.project_id === projectId)
          && (!actionId || action.id === actionId)
          && (!ids || ids.includes(action.id))
        ));
        await fulfillJson(route, rows);
        return;
      }
    }

    if (url.pathname === "/rest/v1/rpc/planner_replay_offline_operation") {
      await fulfillJson(route, { ok: true });
      return;
    }

    state.unhandledRequests.push(`${method} ${url.pathname}`);
    await fulfillJson(route, { message: "Unhandled Planner E2E fixture request" }, 501);
  });

  return state;
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/task-register");
  await page.getByRole("button", { name: "Sign in" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Sign in" });
  await dialog.getByLabel("Email").fill("planner.e2e@example.test");
  await dialog.getByLabel("Password").fill("planner-test-password");
  await dialog.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Task Register" })).toBeVisible();
}

test("Planner deployment config serves a separate hardened SPA", () => {
  const config = JSON.parse(readFileSync(path.resolve("vercel.planner.json"), "utf8")) as {
    buildCommand?: string;
    outputDirectory?: string;
    headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    rewrites?: Array<{ source: string; destination: string }>;
  };

  expect(config.buildCommand).toBe("npm run build:planner");
  expect(config.outputDirectory).toBe("dist-planner");
  expect(config.headers?.find((entry) => entry.source === "/assets/(.*)")?.headers)
    .toContainEqual({ key: "Cache-Control", value: "public, max-age=31536000, immutable" });
  expect(config.headers?.find((entry) => entry.source === "/(.*)")?.headers.map(({ key }) => key))
    .toEqual(expect.arrayContaining([
      "Content-Security-Policy-Report-Only",
      "Permissions-Policy",
      "Referrer-Policy",
      "Strict-Transport-Security",
      "X-Content-Type-Options",
      "X-Frame-Options",
    ]));
  expect(config.rewrites).toEqual(expect.arrayContaining([
    { source: "/assets/:path*", destination: "/assets/:path*" },
    { source: "/sw.js", destination: "/sw.js" },
    { source: "/manifest.webmanifest", destination: "/manifest.webmanifest" },
  ]));
  const fallback = config.rewrites?.at(-1);
  expect(fallback?.destination).toBe("/index.html");
  expect(fallback?.source).toContain("?!assets/");
  expect(fallback?.source).toContain("?!sw\\.js$");
  expect(fallback?.source).toContain("?!manifest\\.webmanifest$");
});

test("unauthenticated users stop at the existing sign-in boundary", async ({ page }) => {
  await installMockSupabase(page);
  await page.goto("/task-register");
  await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();
  await expect(page.getByRole("main", { name: "SteelBuild Planner workspace" })).toHaveCount(0);
});

test("authenticated Planner core workflow and PWA boundary remain deterministic", async ({ page, context }) => {
  const state = await installMockSupabase(page);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.setViewportSize({ width: 2_048, height: 830 });
  await signIn(page);
  await expect(page.getByRole("row", { name: /Release main steel/ })).toBeVisible();

  await page.getByRole("button", { name: "New Task" }).click();
  const newTask = page.getByRole("dialog", { name: /New Planner record/ });
  await newTask.getByLabel("Record kind").selectOption("action");
  await newTask.getByLabel("Project").selectOption(PROJECT_ID);
  await newTask.getByLabel("Title").fill("Confirm delivery sequence");
  await newTask.getByLabel("Workstream").fill("Delivery");
  await newTask.getByLabel("Required date").fill("2026-08-04");
  await newTask.getByRole("button", { name: "Create action" }).click();
  await expect(page.getByRole("row", { name: /Confirm delivery sequence/ })).toBeVisible();

  await page.getByRole("button", { name: "Edit Release main steel" }).click();
  const editor = page.getByRole("dialog", { name: "Edit action" });
  await editor.getByLabel("Required date").fill("2026-08-04");
  await editor.getByRole("button", { name: "Save changes" }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Confirm required-date change" });
  await expect(confirmation).toContainText("2026-08-03");
  await expect(confirmation).toContainText("2026-08-04");
  await confirmation.getByRole("button", { name: /Confirm/ }).click();
  await expect(editor).toHaveCount(0);

  await page.getByLabel("Search actions").fill("safety access");
  await expect(page.getByRole("row", { name: /Verify field safety access/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Release main steel/ })).toHaveCount(0);
  await page.getByLabel("Search actions").fill("");

  await page.getByLabel("Select Verify field safety access").check();
  await page.getByRole("button", { name: "Complete Selected" }).click();
  await expect(page.getByRole("alert")).toContainText("Completed 1 action");

  await page.getByRole("link", { name: "48-Hour Gate" }).click();
  await expect(page.getByRole("heading", { name: "48-Hour Gate" })).toBeVisible();
  await expect(page.getByText(/action.*control window/)).toBeVisible();
  await page.getByLabel("Search actions").fill("delivery sequence");
  await expect(page.getByRole("row", { name: /Confirm delivery sequence/ })).toBeVisible();

  await page.getByRole("link", { name: "Task Register" }).click();
  await page.getByRole("button", { name: "Edit Release main steel" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Archive action" }).click();
  await expect(page.getByRole("button", { name: "Edit Release main steel" })).toHaveCount(0);
  await page.getByRole("link", { name: "Archive" }).click();
  await expect(page.getByText(/Release main steel.*archived/)).toBeVisible();

  const manifest = await page.evaluate(async () => {
    const response = await fetch("/manifest.webmanifest");
    return response.json() as Promise<{ name: string; display: string; start_url: string }>;
  });
  expect(manifest).toMatchObject({ name: "SteelBuild Planner", display: "standalone", start_url: "/" });
  await expect.poll(() => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active && registration.scope === `${window.location.origin}/`);
  })).toBe(true);

  await page.getByRole("link", { name: "Task Register" }).click();
  // The first controlled online reload gives the static-asset cache a real
  // request to capture before the offline navigation assertion.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Task Register" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/Online|Last synced/);
  await context.setOffline(true);
  await expect(page.getByRole("status")).toContainText("Offline—cached data");
  await page.reload();
  await expect(page.getByRole("link", { name: "SteelBuild Planner home" })).toBeVisible();
  await context.setOffline(false);

  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await page.setViewportSize({ width: 2_048, height: 830 });
  await page.goto("/48-hour-gate");
  await expect(page.getByRole("heading", { name: "48-Hour Gate" })).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 1_024, height: 768 });
  await expect(page.getByRole("navigation", { name: "Planner navigation" })).toBeVisible();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "tablet.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Open Planner navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Open Planner navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Planner navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Planner navigation" })).toBeHidden();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "mobile.png"), fullPage: true });

  await page.evaluate(() => localStorage.setItem("sbp:planner:e2e-probe", "must-clear"));
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    Object.keys(localStorage).filter((key) => key.startsWith("sbp:planner:") || (key.startsWith("sb-") && key.endsWith("-auth-token")))
  ))).toEqual([]);
  await expect.poll(() => page.evaluate(async () => (
    "databases" in indexedDB
      ? (await indexedDB.databases()).filter((database) => database.name?.startsWith("steelbuild-planner"))
      : []
  ))).toEqual([]);

  expect(state.unhandledRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
