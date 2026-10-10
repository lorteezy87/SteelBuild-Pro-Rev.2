import { expect, test as baseTest, type Page, type Request, type Response, type Route } from "@playwright/test";

type Row = Record<string, unknown>;
type RegisterName = "drawings" | "submittals" | "rfis";

interface ReadOnlyOptions { allowAuthLogout?: boolean }
interface ReadOnlyProbe {
  rows: Map<string, Row[]>;
  watchProject(projectId: string): void;
  assertHealthy(): void;
  settle(): Promise<void>;
  dispose(): Promise<void>;
  diagnostics(): ReadOnlyFailureCategory[];
}
export const READ_ONLY_FAILURE_CATEGORIES = ['browser-runtime', 'browser-console', 'request-failed',
  'http-error', 'invalid-project-response', 'invalid-json', 'blocked-write'] as const;
export type ReadOnlyFailureCategory = typeof READ_ONLY_FAILURE_CATEGORIES[number];
const pageProbes = new WeakMap<Page, { origin: string; allowAuthLogout: boolean; probe: ReadOnlyProbe }>();
// Individually inspected read-only RPCs; names beginning with "get" are not
// sufficient evidence. Keep this list explicit as application reads evolve.
const readOnlyRpcPaths = new Set([
  "/rest/v1/rpc/get_my_project_role",
  "/rest/v1/rpc/get_submittal_revision_coverage",
  "/rest/v1/rpc/get_submittal_revision_coverages",
]);

export const REGISTER_CONTRACTS = {
  drawings: { path: "/Drawings", headings: ["Drawing Control"], tables: ["drawings", "drawing_sets"], fixtureTable: "drawing_sets" },
  submittals: { path: "/Submittals", headings: ["Submittal Register"], tables: ["submittals"], fixtureTable: "submittals" },
  rfis: { path: "/RFIs", headings: ["RFI Control Center", "RFI Work Queue"], tables: ["rfis"], fixtureTable: null },
} as const;

export interface AcceptanceOptions {
  projectId: string;
  supabaseUrl: string;
  fixtureText?: string;
  timeout?: number;
}

export function acceptanceOptions(register: RegisterName): AcceptanceOptions {
  const projectId = process.env.E2E_PROJECT_ID;
  const supabaseUrl = process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!projectId || !supabaseUrl) throw new Error("Acceptance requires the project and Supabase URL resolved by global setup.");
  const staging = process.env.E2E_TARGET === "staging";
  const fixtureText = register === "drawings"
    ? process.env.E2E_DRAWING_FIXTURE_TEXT || (staging ? "STG Erection Drawings" : undefined)
    : register === "submittals"
      ? process.env.E2E_SUBMITTAL_FIXTURE_TEXT || (staging ? "Staging erection drawings" : undefined)
      : undefined;
  if (register !== "rfis" && !fixtureText) {
    throw new Error(`Set E2E_${register === "drawings" ? "DRAWING" : "SUBMITTAL"}_FIXTURE_TEXT to a known row in the selected project.`);
  }
  return { projectId, supabaseUrl, fixtureText };
}

/** Observe real browser requests without logging API payloads, tokens, or queries. */
export async function observeReadOnlyPage(page: Page, supabaseUrl: string, projectId?: string, options: ReadOnlyOptions = {}): Promise<ReadOnlyProbe> {
  const origin = new URL(supabaseUrl).origin;
  const existing = pageProbes.get(page);
  if (existing) {
    if (existing.origin !== origin || (options.allowAuthLogout && !existing.allowAuthLogout)) {
      throw new Error("Configure the read-only origin and logout exception before navigating.");
    }
    if (projectId) existing.probe.watchProject(projectId);
    return existing.probe;
  }
  const failures: string[] = [];
  const categories = new Set<ReadOnlyFailureCategory>();
  const fail = (category: ReadOnlyFailureCategory, message: string) => { categories.add(category); failures.push(message); };
  const rows = new Map<string, Row[]>();
  const pending = new Set<Promise<void>>();
  const inFlight = new Set<Request>();
  const onRequest = (request: Request) => {
    if (new URL(request.url()).origin === origin) inFlight.add(request);
  };
  const onRequestFinished = (request: Request) => { inFlight.delete(request); };
  const onPageError = () => fail('browser-runtime', "Uncaught browser runtime error");
  const onConsole = (message: { type(): string }) => {
    if (message.type() === "error") fail('browser-console', "Browser console error");
  };
  const onRequestFailed = (request: Request) => {
    inFlight.delete(request);
    const url = new URL(request.url());
    if (url.origin === origin) fail('request-failed', `Supabase request failed: ${url.pathname}`);
  };
  const onResponse = (response: Response) => {
    const url = new URL(response.url());
    if (url.origin !== origin) return;
    if (response.status() >= 400) {
      fail('http-error', `Supabase HTTP ${response.status()}: ${url.pathname}`);
      return;
    }
    if (response.request().method() !== "GET" || !response.ok()
      || !projectId || url.searchParams.get("project_id") !== `eq.${projectId}`) return;
    const table = /^\/rest\/v1\/([^/]+)$/.exec(url.pathname)?.[1];
    if (!table) return;
    const read = (async () => {
      try {
        const body: unknown = await response.json();
        if (!Array.isArray(body) || body.some(row => !row || typeof row !== "object" || Array.isArray(row)
          || (row.project_id !== undefined && row.project_id !== projectId))) {
          fail('invalid-project-response', `Invalid project-scoped rows: ${table}`);
          return;
        }
        rows.set(table, body as Row[]);
      } catch {
        fail('invalid-json', `Invalid JSON response: ${table}`);
      }
    })();
    pending.add(read);
    void read.finally(() => pending.delete(read));
  };
  const readOnlyRoute = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.fallback();
    const read = ["GET", "HEAD", "OPTIONS"].includes(request.method());
    const rpcRead = request.method() === "POST" && readOnlyRpcPaths.has(url.pathname);
    const refresh = request.method() === "POST" && url.pathname === "/auth/v1/token"
      && url.searchParams.get("grant_type") === "refresh_token";
    const logout = options.allowAuthLogout === true && request.method() === "POST"
      && url.pathname === "/auth/v1/logout";
    if (read || rpcRead || refresh || logout) return route.fallback();
    fail('blocked-write', `Blocked write during read-only acceptance: ${request.method()} ${url.pathname}`);
    return route.abort("blockedbyclient");
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  page.on("request", onRequest);
  page.on("requestfinished", onRequestFinished);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);
  await page.route("**/*", readOnlyRoute);
  const detach = () => {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    page.off("request", onRequest);
    page.off("requestfinished", onRequestFinished);
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
    pageProbes.delete(page);
  };
  page.once("close", detach);
  const probe: ReadOnlyProbe = {
    rows,
    diagnostics() { return [...categories]; },
    watchProject(nextProjectId) {
      if (projectId !== nextProjectId) rows.clear();
      projectId = nextProjectId;
    },
    assertHealthy() { expect(failures, "Read-only acceptance must have no runtime, network, or write failures").toEqual([]); },
    async settle() {
      await expect.poll(() => inFlight.size, {
        message: "Started Supabase requests must finish before acceptance", timeout: 15_000,
      }).toBe(0);
      await Promise.all([...pending]);
    },
    async dispose() {
      if (!page.isClosed()) await page.unroute("**/*", readOnlyRoute);
      page.off("close", detach);
      detach();
    },
  };
  pageProbes.set(page, { origin, allowAuthLogout: options.allowAuthLogout === true, probe });
  return probe;
}

/** Keep the guard active before navigation and until Playwright closes the page. */
export const readOnlyTest = baseTest.extend<{
  readOnlySupabaseUrl: string;
  allowAuthLogout: boolean;
  readOnlyPageGuard: void;
}>({
  readOnlySupabaseUrl: [process.env.E2E_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "", { option: true }],
  allowAuthLogout: [false, { option: true }],
  readOnlyPageGuard: [async ({ page, readOnlySupabaseUrl, allowAuthLogout }, use, testInfo) => {
    if (!readOnlySupabaseUrl) throw new Error("Read-only acceptance requires a Supabase URL.");
    const probe = await observeReadOnlyPage(page, readOnlySupabaseUrl, undefined, { allowAuthLogout });
    try {
      await use();
      await probe.settle();
      probe.assertHealthy();
    } finally {
      for (const category of probe.diagnostics()) {
        testInfo.annotations.push({ type: 'read-only-failure-category', description: category });
      }
    }
    // Do not unroute here: navigation effects may run until page teardown.
  }, { auto: true }],
});

function xpathLiteral(value: string): string {
  return value.includes("'")
    ? `concat(${value.split("'").map(part => `'${part}'`).join(', "\'", ')})`
    : `'${value}'`;
}

/** Authenticated content AND a successful project read are mandatory. */
export async function visitRegister(page: Page, register: RegisterName, options: AcceptanceOptions): Promise<void> {
  const contract = REGISTER_CONTRACTS[register];
  const timeout = options.timeout ?? 15_000;
  if (!options.projectId || (contract.fixtureTable && !options.fixtureText)) {
    throw new Error("Register acceptance requires a selected project and known fixture row.");
  }
  const probe = await observeReadOnlyPage(page, options.supabaseUrl, options.projectId);
  await page.goto(contract.path);
  await expect(page, "The app must reach the canonical register route").toHaveURL(url => register === "drawings"
    ? url.pathname === "/DrawingSubmittalHub" && url.searchParams.get("hub_tab") === "drawings"
    : url.pathname.replace(/\/$/, "") === contract.path, { timeout });
  const main = page.getByRole("main", { name: "Main content", exact: true });
  await expect(main, "Authenticated Main content must be visible").toBeVisible({ timeout });
  for (const name of contract.headings) {
    await expect(main.getByRole("heading", { name, exact: true }), "The loaded register heading must be inside Main content").toBeVisible({ timeout });
  }
  if (register === "drawings") {
    // /Drawings redirects to the hub's sheet view. The known set-name fixture
    // lives in its explicit Sets & revisions view.
    const setsView = main.getByRole("button", { name: "Sets & revisions", exact: true });
    await setsView.click();
    await expect(setsView).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("activeProjectId")), {
    message: "The app must retain the selected acceptance project", timeout,
  }).toBe(options.projectId);
  probe.assertHealthy();
  await expect.poll(() => contract.tables.every(table => probe.rows.has(table)), {
    message: "Every required register table must return successful project-scoped JSON", timeout,
  }).toBe(true);
  await probe.settle();
  probe.assertHealthy();

  if (contract.fixtureTable && options.fixtureText) {
    const fixtureText = options.fixtureText;
    const fixtureField = register === "drawings" ? "set_name" : "title";
    expect(probe.rows.get(contract.fixtureTable)?.some(row => row[fixtureField] === fixtureText),
      "The successful response must contain the known fixture row").toBe(true);
    // Drawing names share a span with a nested set-number badge. Match the
    // exact title text node instead of the whole span or a row substring.
    const exactTitle = page.locator(`xpath=.//*[text()[normalize-space(.)=${xpathLiteral(fixtureText)}]]`);
    const fixtureRow = register === "drawings"
      ? main.getByRole("row").filter({ has: exactTitle })
      : main.getByRole("region", { name: "Submittal register list", exact: true })
        .getByRole("button", { name: /^Open submittal / }).filter({ has: exactTitle });
    await expect(fixtureRow.first(), "The known fixture must render in the register list").toBeVisible({ timeout });
  } else {
    await expect(main.getByTestId("rfi-table-shell")).toBeVisible({ timeout });
    if (probe.rows.get("rfis")?.length === 0) {
      await expect(main.getByText("No RFIs yet", { exact: true })).toBeVisible({ timeout });
    } else {
      await expect(main.locator(".rfi-record-row").first()).toBeVisible({ timeout });
    }
  }
  await probe.settle();
  probe.assertHealthy();
}
