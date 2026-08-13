import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { createDemoKingdom, createDemoUniverse } from "../../src/lib/kingdom/demo-world";
import type { KingdomWorld } from "../../src/lib/kingdom/types";

const selectedSeason = "autumn" as const;
const selectedWorldTheme = "enchanted-forest" as const;
const demoKingdom = createDemoKingdom(selectedSeason, selectedWorldTheme);
const kingdomFixture = {
  ...demoKingdom,
  // A distinct key ensures the fetched package is treated as a real kingdom,
  // rather than the landing page's bundled preview.
  buildKey: "e2e-immutable-kingdom-package",
};

const demoUniverse = createDemoUniverse();
const universeFixture = {
  ...demoUniverse,
  displayName: "Parris Digital Observatory",
};

const canonicalKingdomPath = `/kingdom/${kingdomFixture.source.owner}/${kingdomFixture.source.repository}/${kingdomFixture.source.commitSha}?world=${selectedWorldTheme}&season=${selectedSeason}`;
const requestedRepository = "parrisdigital/repo-magical-kingdom";
const explorerSourcePath = "components/city/city-scene.tsx";
const largeKingdomFixture = JSON.parse(
  readFileSync(
    new URL("../../src/components/kingdom/test-fixtures/nextjs-large-world.json", import.meta.url),
    "utf8",
  ),
) as KingdomWorld;

// Next.js 16 protects development chunks by hostname. `next dev` defaults to
// localhost, while the web-server health check may safely continue using the
// loopback IP. This origin can also be overridden for preview deployments.
test.use({
  baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  // A deterministic on-demand frame loop keeps headless software WebGL from
  // contending with Playwright tracing while preserving all input behavior.
  contextOptions: { reducedMotion: "reduce" },
});

type BrowserFailures = Readonly<{
  consoleErrors: string[];
  pageErrors: string[];
}>;

function watchBrowserFailures(page: Page): BrowserFailures {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  return { consoleErrors, pageErrors };
}

async function mockKingdomApi(page: Page, requests: URL[] = []) {
  await page.route(/\/api\/kingdom(?:\?|$)/, async (route) => {
    requests.push(new URL(route.request().url()));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ world: kingdomFixture }),
    });
  });
}

async function mockUniverseApi(page: Page, requests: URL[] = []) {
  await page.route(/\/api\/universe(?:\?|$)/, async (route) => {
    requests.push(new URL(route.request().url()));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ universe: universeFixture }),
    });
  });
}

async function expectWebGlKingdom(page: Page) {
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 20_000 });

  const renderer = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const context =
      canvasElement.getContext("webgl2") ??
      canvasElement.getContext("webgl") ??
      canvasElement.getContext("experimental-webgl");

    return {
      hasContext: Boolean(context),
      height: canvasElement.height,
      width: canvasElement.width,
    };
  });

  expect(renderer.hasContext).toBe(true);
  expect(renderer.width).toBeGreaterThan(0);
  expect(renderer.height).toBeGreaterThan(0);
  return canvas;
}

test.describe("Repo Magical Kingdom journeys", () => {
  // WebGL contexts contend for one software GPU in headless Chromium. Serial
  // journeys reflect the CI worker policy and avoid artificial context loss.
  // Each isolated journey also cold-starts the GL context and decoded assets;
  // assertion-level timeouts remain strict inside this wider lifecycle budget.
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("renders the living repository-world gateway with WebGL", async ({ page }) => {
    // The first journey performs a cold decode/compile of the complete CC0 GLB
    // bundle on Chromium's software GPU. Keep assertion timeouts strict while
    // allowing that one-time renderer initialization to finish in CI.
    const failures = watchBrowserFailures(page);

    await page.goto("/");
    // Let the cold Three.js scene finish its first software-rendered frame
    // before asking Chromium for a sequence of accessibility snapshots.
    await expectWebGlKingdom(page);

    await expect(page).toHaveTitle(/Repo Magical Kingdom/);
    await expect(page.locator('link[rel~="icon"]')).toHaveAttribute("href", /icon\.png/);
    const app = page.locator("main[data-mode]");
    await expect(app).toHaveAttribute("data-mode", "landing");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByLabel("GitHub repository or profile")).toBeVisible();
    const worldSelector = page.getByRole("radiogroup", { name: /choose a world/i });
    await expect(worldSelector).toBeVisible();
    await expect(worldSelector.getByRole("radio")).toHaveCount(3);
    await expect(worldSelector.getByRole("radio", { name: "Repo choice" })).toBeChecked();
    const seasonSelector = page.getByRole("radiogroup", { name: /season/i });
    await expect(seasonSelector).toBeVisible();
    await expect(seasonSelector.getByRole("radio")).toHaveCount(4);
    await expect(seasonSelector).toContainText(/Spring\s*Summer\s*Autumn\s*Winter/);
    await expect(seasonSelector.getByRole("radio", { name: "Spring" })).toBeChecked();
    await expect(app).toContainText(/Public repositories only\s*·\s*Deterministic at every commit/);
    await expect(page.getByRole("heading", { name: "The kingdom needs WebGL." })).toHaveCount(0);

    expect(failures.pageErrors).toEqual([]);
    expect(failures.consoleErrors).toEqual([]);
  });

  test("reports client validation and a public-repository API error accessibly", async ({
    page,
  }) => {
    await page.route(/\/api\/kingdom(?:\?|$)/, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Only public repositories can become kingdoms." },
        }),
      });
    });
    await page.goto("/");

    const repositoryInput = page.getByLabel("GitHub repository or profile");
    const submit = page.getByRole("button", { name: /Forge kingdom/ });
    await expect(submit).toBeDisabled();

    await repositoryInput.fill("not valid/repository");
    await expect(submit).toBeEnabled({ timeout: 15_000 });
    await submit.click();
    const validationError = page.getByText("Enter a GitHub owner or an owner/repository pair.", {
      exact: true,
    });
    await expect(validationError).toBeVisible();
    await expect(validationError).toHaveAttribute("role", "alert");

    await repositoryInput.fill("private/repository");
    await expect(repositoryInput).toHaveValue("private/repository");
    await expect(submit).toBeEnabled();
    const apiResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/kingdom",
    );
    await submit.click();
    await apiResponse;
    const apiError = page.getByText("Only public repositories can become kingdoms.", {
      exact: true,
    });
    await expect(apiError).toBeVisible({ timeout: 20_000 });
    await expect(apiError).toHaveAttribute("role", "alert");
    await expect(page).toHaveURL("/");
  });

  test("loads a deterministic kingdom, canonicalizes the commit, and exposes source semantics", async ({
    page,
  }) => {
    const apiRequests: URL[] = [];
    await mockKingdomApi(page, apiRequests);
    await page.goto("/");

    await page
      .getByLabel("GitHub repository or profile")
      .fill(`https://github.com/${requestedRepository}`);
    await page
      .getByRole("radiogroup", { name: /choose a world/i })
      .getByText("Enchanted Forest", { exact: true })
      .click();
    await expect(page.getByRole("radio", { name: "Enchanted Forest" })).toBeChecked();
    await page
      .getByRole("radiogroup", { name: /season/i })
      .getByText("Autumn", { exact: true })
      .click();
    await expect(page.getByRole("radio", { name: "Autumn" })).toBeChecked();
    const forgeButton = page.getByRole("button", { name: /Forge kingdom/ });
    await expect(forgeButton).toBeEnabled({ timeout: 15_000 });
    await forgeButton.click();

    await expect(page).toHaveURL(canonicalKingdomPath, { timeout: 20_000 });
    await expect(page.locator('main[data-mode="kingdom"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: kingdomFixture.title })).toBeVisible();
    await expect(
      page.getByText(`${kingdomFixture.coverage.representedFiles} files represented`, {
        exact: false,
      }),
    ).toBeVisible();
    expect(apiRequests.length).toBeGreaterThan(0);
    expect(apiRequests[0]?.searchParams.get("repository")).toBe(requestedRepository);
    expect(apiRequests[0]?.searchParams.get("world")).toBe(selectedWorldTheme);
    expect(apiRequests[0]?.searchParams.get("season")).toBe(selectedSeason);

    await page.getByRole("button", { name: /Explore/ }).click();
    const explorer = page.getByRole("region", { name: "Kingdom explorer" });
    await expect(explorer).toBeVisible();
    await explorer.getByPlaceholder("Search paths or provinces…").fill("city-scene.tsx");
    await explorer.getByRole("button").filter({ hasText: explorerSourcePath }).click();

    await expect(page.getByRole("heading", { name: "city-scene.tsx" })).toBeVisible();
    await expect(page.getByText(explorerSourcePath, { exact: true })).toBeVisible();
    const sourceLink = page.getByRole("link", { name: /View source/ });
    await expect(sourceLink).toHaveAttribute(
      "href",
      `${kingdomFixture.source.canonicalUrl}/blob/${kingdomFixture.source.commitSha}/${explorerSourcePath}`,
    );
    await expect(sourceLink).toHaveAttribute("target", "_blank");
    await expect(sourceLink).toHaveAttribute("rel", "noreferrer");
  });

  test("renders a captured vast repository as a living world without a false WebGL error", async ({
    page,
  }) => {
    const failures = watchBrowserFailures(page);
    await page.route(/\/api\/kingdom(?:\?|$)/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ world: largeKingdomFixture }),
      });
    });

    await page.goto(
      `/kingdom/${largeKingdomFixture.source.owner}/${largeKingdomFixture.source.repository}/${largeKingdomFixture.source.commitSha}?season=spring`,
    );

    await expectWebGlKingdom(page);
    await expect(page.locator('main[data-mode="kingdom"]')).toBeVisible();
    await expect(page.getByRole("heading", { name: largeKingdomFixture.title })).toBeVisible();
    await expect(page.getByText(/vast realm/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "The kingdom needs WebGL." })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "This kingdom could not be assembled." }),
    ).toHaveCount(0);
    expect(failures.pageErrors).toEqual([]);
    expect(failures.consoleErrors).toEqual([]);
  });

  test("charts a mocked profile universe and lets explorers inspect a repository world", async ({
    page,
  }) => {
    const apiRequests: URL[] = [];
    await mockUniverseApi(page, apiRequests);

    await page.goto(`/profile/${universeFixture.owner}`);

    await expect(page).toHaveURL(`/profile/${universeFixture.owner}`);
    await expect(page.locator('main[data-mode="universe"]')).toBeVisible();
    await expect(page.getByText("Repo Magical Kingdom", { exact: true })).toHaveCSS(
      "color",
      "rgb(247, 241, 220)",
    );
    await expect(
      page
        .getByRole("button", { name: "Return to the Repo Magical Kingdom gateway" })
        .locator("img"),
    ).toHaveAttribute("src", /app-logo-v2\.png/);
    await expect.poll(() => apiRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByRole("heading", { name: universeFixture.displayName })).toBeVisible();
    await expect(
      page.getByText(`${universeFixture.repositoryCount} explorable worlds`, { exact: true }),
    ).toBeVisible();
    expect(apiRequests[0]?.searchParams.get("owner")).toBe(universeFixture.owner);

    await page.getByRole("button", { name: /Worlds/ }).click();
    const worlds = page.getByRole("region", { name: "Repository worlds" });
    await expect(worlds).toBeVisible();
    await expect(worlds).toContainText(/Spring|Summer|Autumn|Winter/);
    await worlds.getByRole("button").filter({ hasText: kingdomFixture.source.repository }).click();

    await expect(
      page.getByRole("heading", {
        name: `${kingdomFixture.source.owner}/${kingdomFixture.source.repository}`,
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Enter world/ })).toBeVisible();
    await expect(page.getByText("Season", { exact: true })).toBeVisible();
  });

  test("accepts orbit and zoom camera input without client errors", async ({ page }) => {
    const failures = watchBrowserFailures(page);
    const apiRequests: URL[] = [];
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockKingdomApi(page, apiRequests);
    await page.goto(canonicalKingdomPath);
    await expect(page.locator('main[data-mode="kingdom"]')).toBeVisible();
    await expect.poll(() => apiRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(apiRequests[0]?.searchParams.get("revision")).toBe(kingdomFixture.source.commitSha);
    expect(apiRequests[0]?.searchParams.get("world")).toBe(selectedWorldTheme);
    expect(apiRequests[0]?.searchParams.get("season")).toBe(selectedSeason);
    const canvas = await expectWebGlKingdom(page);
    await expect(page.getByRole("heading", { name: kingdomFixture.title })).toBeVisible();

    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    const before = await canvas.screenshot();
    const x = bounds!.x + bounds!.width * 0.76;
    const y = bounds!.y + bounds!.height * 0.63;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 150, y - 70, { steps: 12 });
    await page.mouse.up();
    await page.mouse.wheel(0, -520);
    await page.waitForTimeout(250);

    const after = await canvas.screenshot();
    expect(after.equals(before)).toBe(false);
    await page.getByRole("button", { name: /Overview/ }).click();
    await expect(page.getByRole("button", { name: /Overview/ })).toBeEnabled();
    expect(failures.pageErrors).toEqual([]);
    expect(failures.consoleErrors).toEqual([]);
  });

  test("keeps the mobile gateway within 390px and leaves its form usable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expectWebGlKingdom(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      body: document.body.scrollWidth - window.innerWidth,
      document: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(overflow.body).toBeLessThanOrEqual(0);

    const input = page.getByLabel("GitHub repository or profile");
    const submit = page.getByRole("button", { name: /Forge kingdom/ });
    const winter = page.getByRole("radio", { name: "Winter" });
    const enchantedForest = page.getByRole("radio", { name: "Enchanted Forest" });
    const enchantedForestOption = page
      .getByRole("radiogroup", { name: /world/i })
      .getByText("Enchanted Forest", { exact: true });
    const winterOption = page
      .getByRole("radiogroup", { name: /season/i })
      .getByText("Winter", { exact: true });
    await expect(input).toBeInViewport();
    await expect(submit).toBeInViewport();
    await expect(enchantedForestOption).toBeInViewport();
    await expect(winterOption).toBeInViewport();
    await input.fill("parrisdigital/repo-magical-kingdom");
    await enchantedForestOption.click();
    await winterOption.click();
    await expect(winter).toBeChecked();
    await expect(enchantedForest).toBeChecked();
    await expect(input).toHaveValue("parrisdigital/repo-magical-kingdom");
    await expect(submit).toBeEnabled();
  });

  test("honors prefers-reduced-motion in both the browser and rendered scene shell", async ({
    browser,
  }) => {
    // Construct a dedicated context instead of mutating a page after the
    // serial software-WebGL journeys. Chromium can otherwise retain stale
    // media emulation state after several GPU contexts have been released.
    const context = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    try {
      expect(
        await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
      ).toBe(true);
      await page.goto("/");
      const canvas = await expectWebGlKingdom(page);

      const motionStyles = await canvas.evaluate((element) => {
        const canvasWrap = element.parentElement;
        const overview = document.querySelector<HTMLButtonElement>("nav button");
        return {
          canvasAnimation: canvasWrap ? getComputedStyle(canvasWrap).animationName : null,
          toolTransition: overview ? getComputedStyle(overview).transitionDuration : null,
        };
      });
      expect(motionStyles.canvasAnimation).toBe("none");
      const longestTransition = Math.max(
        ...(motionStyles.toolTransition ?? "0s")
          .split(",")
          .map((duration) => Number.parseFloat(duration) || 0),
      );
      // Browsers clamp a zero-duration transition to a tiny epsilon internally.
      expect(longestTransition).toBeLessThan(0.001);
      await expect(page.locator("main[data-mode]")).toHaveAttribute("data-travel-phase", "idle");
    } finally {
      await context.close();
    }
  });
});

test.describe("Cinematic repository travel", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("flies from a selected profile planet into its compiled kingdom and back", async ({
    page,
  }) => {
    const failures = watchBrowserFailures(page);
    await mockUniverseApi(page);
    await page.route(/\/api\/kingdom(?:\?|$)/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 220));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ world: kingdomFixture }),
      });
    });

    await page.goto(`/profile/${universeFixture.owner}`);
    await expect(page.locator('main[data-mode="universe"]')).toBeVisible();
    await page.getByRole("button", { name: /Worlds/ }).click();
    const worlds = page.getByRole("region", { name: "Repository worlds" });
    await worlds.getByRole("button").filter({ hasText: kingdomFixture.source.repository }).click();
    await page.getByRole("button", { name: /Enter world/ }).click();

    const app = page.locator("main[data-mode]");
    await expect(app).toHaveAttribute("data-travel-phase", "approach");
    await expect(page).toHaveURL(canonicalKingdomPath, { timeout: 20_000 });
    await expect(app).toHaveAttribute("data-mode", "kingdom");
    await expect(page.getByRole("heading", { name: kingdomFixture.title })).toBeVisible();
    await expect(app).toHaveAttribute("data-travel-phase", "idle", { timeout: 10_000 });
    await expect(page).toHaveTitle(
      `${kingdomFixture.source.owner}/${kingdomFixture.source.repository} · Enchanted Forest · Autumn · Repo Magical Kingdom`,
    );

    await page.getByRole("button", { name: /View @.*'s universe/ }).click();
    await expect(app).toHaveAttribute("data-travel-phase", /^(approach|cover|reveal)$/);
    await expect(page).toHaveURL(`/profile/${universeFixture.owner}`, { timeout: 20_000 });
    await expect(app).toHaveAttribute("data-mode", "universe");
    await expect(app).toHaveAttribute("data-travel-phase", "idle", { timeout: 10_000 });
    await expect(page).toHaveTitle(`@${universeFixture.owner}'s universe · Repo Magical Kingdom`);
    expect(failures.pageErrors).toEqual([]);
    expect(failures.consoleErrors).toEqual([]);
  });
});
