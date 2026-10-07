import { expect, test, type Page } from "@playwright/test";
import { observeReadOnlyPage, readOnlyTest as guardedTest, visitRegister } from "./acceptance";

// These test the acceptance guard itself, using controlled HTML and browser
// responses. They do not claim that the authenticated app or RLS is validated.
const API = "https://acceptance-supabase.invalid";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const TITLE = "Staging erection drawings";
const ROW = { id: "fixture-submittal", project_id: PROJECT, title: TITLE };
const READY = `<main aria-label="Main content"><h1>Submittal Register</h1>
  <section aria-label="Submittal register list"><div role="button" aria-label="Open submittal SUB-001"><div>${TITLE}</div></div></section></main>`;
const options = { supabaseUrl: API, projectId: PROJECT, fixtureText: TITLE, timeout: 500 };

interface Fixture {
  html?: string;
  status?: number;
  body?: unknown;
  requestProject?: string;
  selectedProject?: string;
  request?: boolean;
  extraScript?: string;
  table?: string;
}

async function fixture(page: Page, config: Fixture = {}) {
  await page.addInitScript(project => localStorage.setItem("activeProjectId", project), config.selectedProject ?? PROJECT);
  let writesReachedBackend = 0;
  await page.context().route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === API) {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) writesReachedBackend++;
      await route.fulfill({ status: config.status ?? 200, contentType: "application/json",
        headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(config.body ?? [ROW]) });
      return;
    }
    const read = config.request === false ? "" : `await fetch(${JSON.stringify(`${API}/rest/v1/${config.table ?? "submittals"}?project_id=eq.${config.requestProject ?? PROJECT}`)});`;
    await route.fulfill({ contentType: "text/html", body: `<!doctype html><title>Acceptance contract fixture</title>
      <script type="module">${read}${config.extraScript ?? ""}
      document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(config.html ?? READY)});</script><body></body>` });
  });
  return { writesReachedBackend: () => writesReachedBackend };
}

test("accepts a loaded authenticated register with its scoped response and fixture row", async ({ page }) => {
  await fixture(page);
  await visitRegister(page, "submittals", options);
});

test("rejects a login page even when its body contains the register name", async ({ page }) => {
  await fixture(page, { html: '<h1>Manage your submittals</h1><button>Sign in</button>' });
  await expect(visitRegister(page, "submittals", options)).rejects.toThrow(/Authenticated Main content/);
});

test("rejects body keywords and navigation headings outside authenticated Main content", async ({ page }) => {
  await fixture(page, { html: '<nav><h1>Submittal Register</h1></nav><main aria-label="Main content">Manage drawings, submittals and RFIs</main>' });
  await expect(visitRegister(page, "submittals", options)).rejects.toThrow(/loaded register heading/);
});

for (const status of [401, 403, 500]) {
  test(`rejects HTTP ${status} despite a convincing register and fixture row`, async ({ page }) => {
    await fixture(page, { status });
    await expect(visitRegister(page, "submittals", options)).rejects.toThrow(/runtime, network, or write failures/);
  });
}

test("rejects rendered cached data without a successful API read", async ({ page }) => {
  await fixture(page, { request: false });
  await expect(visitRegister(page, "submittals", options)).rejects.toThrow(/successful project-scoped JSON/);
});

test("rejects a successful response for the wrong project", async ({ page }) => {
  await fixture(page, { requestProject: "other-project" });
  await expect(visitRegister(page, "submittals", options)).rejects.toThrow(/successful project-scoped JSON/);
});

test("rejects a missing selected project despite successful fixture data", async ({ page }) => {
  await fixture(page, { selectedProject: "" });
  await expect(visitRegister(page, "submittals", options)).rejects.toThrow(/retain the selected acceptance project/);
});

test("rejects a fixture absent from the successful response", async ({ page }) => {
  await fixture(page, { body: [] });
  await expect(visitRegister(page, "submittals", options)).rejects.toThrow(/response must contain the known fixture row/);
});

test("rejects fixture text in a description when the submittal title differs", async ({ page }) => {
  await fixture(page, { body: [{ ...ROW, title: "Different submittal", description: TITLE }] });
  await expect(visitRegister(page, "submittals", options)).rejects.toThrow(/response must contain the known fixture row/);
});

test("rejects a rendered title that only contains the fixture text", async ({ page }) => {
  await fixture(page, { html: READY.replace(TITLE, `${TITLE} replacement`) });
  await expect(visitRegister(page, "submittals", options)).rejects.toThrow(/known fixture must render/);
});

test("keeps blocking delayed writes after register acceptance returns", async ({ page }) => {
  const backend = await fixture(page);
  await visitRegister(page, "submittals", options);
  await page.evaluate(async api => {
    await new Promise(resolve => setTimeout(resolve, 25));
    await fetch(`${api}/rest/v1/action_items`, { method: "POST", body: "{}" }).catch(() => {});
  }, API);
  expect(backend.writesReachedBackend()).toBe(0);
  const probe = await observeReadOnlyPage(page, API);
  expect(() => probe.assertHealthy()).toThrow(/runtime, network, or write failures/);
});

test("accepts an exact drawing name beside its nested number badge and quote characters", async ({ page }) => {
  const name = `Owner's "Erection" Drawings`;
  await fixture(page, { table: "drawing_sets", body: [{ id: "set", project_id: PROJECT, set_name: name }],
    extraScript: `await fetch(${JSON.stringify(`${API}/rest/v1/drawings?project_id=eq.${PROJECT}`)});`,
    html: `<main aria-label="Main content"><h1>Drawings &amp; Submittals</h1><table><tbody><tr><td><span>${name}<span>STG-001</span></span></td></tr></tbody></table></main>` });
  await visitRegister(page, "drawings", { ...options, fixtureText: name });
});

test("blocks auth logout unless this page explicitly opts in", async ({ page }) => {
  const backend = await fixture(page);
  await visitRegister(page, "submittals", options);
  await page.evaluate(api => fetch(`${api}/auth/v1/logout`, { method: "POST" }).catch(() => {}), API);
  expect(backend.writesReachedBackend()).toBe(0);
});

test("allows explicit auth logout while continuing to block project writes", async ({ page }) => {
  const backend = await fixture(page);
  const probe = await observeReadOnlyPage(page, API, undefined, { allowAuthLogout: true });
  await visitRegister(page, "submittals", options);
  const status = await page.evaluate(async api => (await fetch(`${api}/auth/v1/logout`, { method: "POST" })).status, API);
  expect(status).toBe(200);
  probe.assertHealthy();
  await page.evaluate(api => fetch(`${api}/rest/v1/action_items`, { method: "POST", body: "{}" }).catch(() => {}), API);
  expect(backend.writesReachedBackend()).toBe(1);
  expect(() => probe.assertHealthy()).toThrow(/runtime, network, or write failures/);
});

test("rejects an unsuccessful explicitly allowed logout", async ({ page }) => {
  await fixture(page, { status: 500 });
  const probe = await observeReadOnlyPage(page, API, undefined, { allowAuthLogout: true });
  await page.goto("/Submittals");
  await page.evaluate(api => fetch(`${api}/auth/v1/logout`, { method: "POST" }), API);
  await probe.settle();
  expect(() => probe.assertHealthy()).toThrow(/Supabase HTTP 500: \/auth\/v1\/logout/);
});

test("rejects a runtime error despite successful data and a rendered register", async ({ page }) => {
  await fixture(page, { extraScript: "queueMicrotask(() => { throw new Error('intentional acceptance failure'); });" });
  await expect(visitRegister(page, "submittals", options)).rejects.toThrow(/runtime, network, or write failures/);
});

test("blocks navigation-triggered mutations before they reach the backend", async ({ page }) => {
  const backend = await fixture(page, { extraScript: `await fetch(${JSON.stringify(`${API}/rest/v1/action_items`)}, {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).catch(()=>{});` });
  await expect(visitRegister(page, "submittals", options)).rejects.toThrow(/runtime, network, or write failures/);
  expect(backend.writesReachedBackend()).toBe(0);
});

test("accepts a legitimate empty RFI register only after its successful project read", async ({ page }) => {
  await fixture(page, { table: "rfis", body: [], html: '<main aria-label="Main content"><h1>RFI Control Center</h1><h2>RFI Work Queue</h2><div data-testid="rfi-table-shell">No RFIs yet</div></main>' });
  await visitRegister(page, "rfis", { ...options, fixtureText: undefined });
});

guardedTest.describe("automatic read-only fixture", () => {
  guardedTest.use({ readOnlySupabaseUrl: API });
  guardedTest("installs the default guard before the test navigates", async ({ page }) => {
    await expect(observeReadOnlyPage(page, API, undefined, { allowAuthLogout: true }))
      .rejects.toThrow(/Configure the read-only origin and logout exception before navigating/);
    await fixture(page);
    await visitRegister(page, "submittals", options);
  });
});

guardedTest.describe("automatic sign-out fixture", () => {
  guardedTest.use({ readOnlySupabaseUrl: API, allowAuthLogout: true });
  guardedTest("permits the explicit logout option through test teardown", async ({ page }) => {
    const backend = await fixture(page);
    await visitRegister(page, "submittals", options);
    const status = await page.evaluate(async api => (await fetch(`${api}/auth/v1/logout`, { method: "POST" })).status, API);
    expect(status).toBe(200);
    expect(backend.writesReachedBackend()).toBe(1);
  });
});
