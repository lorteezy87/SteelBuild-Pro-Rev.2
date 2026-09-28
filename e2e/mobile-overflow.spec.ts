import { test, expect, type Page } from "@playwright/test";

/**
 * Phone-width horizontal overflow guard. 393x852 is iPhone 17 Pro portrait,
 * the Capacitor iOS shell's viewport; 360 and 430 bracket the phone range.
 * Read-only: it navigates and measures.
 *
 * `document.documentElement.scrollWidth` alone can't catch this app's
 * failure mode. On phones `.app-frame` is overflow: hidden and `main` is
 * overflow-x: hidden, so over-wide content is clipped at the right edge
 * instead of scrolling the document, and the document check passes while
 * the page is visibly cut off. So each page also asserts that `main` is no
 * wider than its box, and that no visible element sticks out past the
 * viewport unless an intentional scroll/clip container (a table wrapper, a
 * scrollable tab strip) holds it.
 */

const PAGES = [
  { name: "Dashboard", path: "/Dashboard" },
  { name: "Projects", path: "/ProjectsHub" },
  { name: "RFIs", path: "/RFIs" },
  { name: "Drawings", path: "/DrawingSubmittalHub?hub_tab=drawings" },
  // Pages that overflowed once the shell was fixed; each had its own cause.
  { name: "Documents", path: "/Documents" },
  { name: "Photos", path: "/Photos" },
  { name: "Schedule", path: "/ScheduleHub" },
  { name: "Work Packages", path: "/WorkPackages" },
  { name: "Scope & Exclusions", path: "/ScopeExclusions" },
  { name: "Calculators", path: "/CalculatorsHub" },
  { name: "Feet & Inches calculator", path: "/FeetInchesCalculator" },
];

const WIDTHS = [393, 360, 430];

async function settle(page: Page) {
  await expect(page.locator("#main-content")).toBeVisible();
  await expect(page.getByRole("status", { name: "Loading page" })).toHaveCount(0);
  // Registers keep loading after the shell mounts; give data a bounded chance
  // to land (polling or realtime can keep the network from ever idling).
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
}

async function measure(page: Page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const main = document.getElementById("main-content");
    const topbar = document.querySelector(".app-topbar");

    // Anything under an overflow container inside the scanned region is that
    // container's business (it scrolls or clips on purpose). The shell's own
    // clips (main, .app-frame) are the bug, so the walk stops at the region.
    const heldByContainer = (el: Element, region: Element) => {
      for (let a = el.parentElement; a && a !== region; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== "visible") return true;
      }
      return false;
    };

    const offenders: { el: string; text: string; right: number }[] = [];
    for (const region of [topbar, main]) {
      if (!region) continue;
      for (const el of region.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || r.right <= vw + 1) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.position === "fixed" || heldByContainer(el, region)) continue;
        offenders.push({
          el: `${el.tagName.toLowerCase()}.${(el.getAttribute("class") || "").trim().split(/\s+/).join(".")}`.slice(0, 90),
          text: (el.textContent || "").trim().slice(0, 40),
          right: Math.round(r.right),
        });
      }
    }

    return {
      vw,
      docScrollWidth: document.documentElement.scrollWidth,
      mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
      topbarOverflow: topbar ? topbar.scrollWidth - topbar.clientWidth : 0,
      offenders: offenders.slice(0, 10),
    };
  });
}

for (const width of WIDTHS) {
  test.describe(`phone ${width}px: no horizontal overflow`, () => {
    test.use({ viewport: { width, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });

    for (const { name, path } of PAGES) {
      test(`${name} fits the viewport`, async ({ page }) => {
        await page.goto(path);
        await settle(page);

        const m = await measure(page);
        const detail = JSON.stringify(m, null, 2);
        expect(m.docScrollWidth, `document scrolls sideways\n${detail}`).toBeLessThanOrEqual(m.vw);
        expect(m.mainOverflow, `main is wider than the viewport (clipped)\n${detail}`).toBeLessThanOrEqual(1);
        expect(m.topbarOverflow, `top bar overflows\n${detail}`).toBeLessThanOrEqual(1);
        expect(m.offenders, `elements past the right edge\n${detail}`).toEqual([]);
      });
    }

    // One 12-16px gutter each side, not the hub wrapper's padding stacked on
    // the Control Center's (that put the hero 38px in).
    test("Projects hero sits in one symmetric 12-16px gutter", async ({ page }) => {
      await page.goto("/ProjectsHub");
      await settle(page);
      const hero = page.locator(".projects-cc .cmd-hero");
      await expect(hero).toBeVisible();
      const box = await hero.boundingBox();
      if (!box) throw new Error("Projects hero has no layout box");
      const left = box.x;
      const right = width - (box.x + box.width);
      const detail = `left gutter ${left}px, right gutter ${right}px`;
      expect(Math.abs(left - right), detail).toBeLessThanOrEqual(1);
      expect(left, detail).toBeGreaterThanOrEqual(12);
      expect(left, detail).toBeLessThanOrEqual(16);
    });
  });
}
