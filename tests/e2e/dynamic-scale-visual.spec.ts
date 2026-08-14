import { readFileSync, writeFileSync } from "node:fs";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import type { KingdomWorld } from "../../src/lib/kingdom/types";

const VAST_WORLD = JSON.parse(
  readFileSync(
    new URL("../../src/components/kingdom/test-fixtures/nextjs-large-world.json", import.meta.url),
    "utf8",
  ),
) as KingdomWorld;

const COMPACT_WORLD = JSON.parse(
  readFileSync(
    new URL(
      "../../src/components/kingdom/test-fixtures/repository-city-live-world.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as KingdomWorld;

test.use({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
test.describe.configure({ mode: "serial", timeout: 120_000 });

type FrameProfile = Readonly<{
  maximumMs: number;
  medianMs: number;
  overBudgetFrames: number;
  p95Ms: number;
  samples: number;
}>;

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path });
  await testInfo.attach(name, { contentType: "image/png", path });
}

async function profileAnimationFrames(page: Page, sampleCount = 120): Promise<FrameProfile> {
  return page.evaluate(
    (samples) =>
      new Promise<FrameProfile>((resolve) => {
        const durations: number[] = [];
        let previous = performance.now();
        const sample = (now: number) => {
          durations.push(now - previous);
          previous = now;
          if (durations.length < samples) {
            requestAnimationFrame(sample);
            return;
          }
          const sorted = durations.slice(1).sort((first, second) => first - second);
          const percentile = (ratio: number) =>
            sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
          resolve({
            maximumMs: sorted.at(-1) ?? 0,
            medianMs: percentile(0.5),
            overBudgetFrames: sorted.filter((duration) => duration > 34).length,
            p95Ms: percentile(0.95),
            samples: sorted.length,
          });
        };
        requestAnimationFrame(sample);
      }),
    sampleCount,
  );
}

async function openFixture(
  page: Page,
  world: KingdomWorld,
  reducedMotion: "reduce" | "no-preference",
) {
  await page.emulateMedia({ reducedMotion });
  const normalizedWorld: KingdomWorld = {
    ...world,
    buildKey: `${world.buildKey}:visual-gate:kingdom-valley:spring`,
    season: "spring",
    worldTheme: "kingdom-valley",
  };
  await page.route(/\/api\/kingdom(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ world: normalizedWorld }),
    });
  });
  await page.goto(
    `/kingdom/${world.source.owner}/${world.source.repository}/${world.source.commitSha}?world=kingdom-valley&season=spring`,
  );
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "The kingdom needs WebGL." })).toHaveCount(0);
  await expect(
    page.getByText("The kingdom compiler returned an invalid world package.", { exact: true }),
  ).toHaveCount(0);
  await page.waitForLoadState("networkidle", { timeout: 60_000 });
  await page.waitForTimeout(15_000);
  await expect(page.getByText(/Rendering/)).toHaveCount(0, { timeout: 30_000 });
}

test("captures compact and vast desktop scale at the fixed visual gate", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await openFixture(page, COMPACT_WORLD, "no-preference");
  await expect(page.getByText(/compact realm/i)).toBeVisible();
  await capture(page, testInfo, "compact-1440x900.png");

  await page.unroute(/\/api\/kingdom(?:\?|$)/);
  await openFixture(page, VAST_WORLD, "no-preference");
  await expect(page.getByText(/vast realm/i)).toBeVisible();
  await capture(page, testInfo, "vast-1440x900.png");
});

test("keeps the vast silhouette legible on mobile", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, VAST_WORLD, "no-preference");
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - innerWidth,
    document: document.documentElement.scrollWidth - innerWidth,
  }));
  expect(overflow).toEqual({ body: 0, document: 0 });
  await expect(page.getByRole("heading", { name: VAST_WORLD.title })).toBeVisible();
  const frameProfile = await profileAnimationFrames(page);
  const frameProfilePath = testInfo.outputPath("mobile-frame-profile.json");
  writeFileSync(frameProfilePath, `${JSON.stringify(frameProfile, null, 2)}\n`);
  await testInfo.attach("mobile-frame-profile.json", {
    contentType: "application/json",
    path: frameProfilePath,
  });
  expect(frameProfile.samples).toBe(119);
  expect(Number.isFinite(frameProfile.p95Ms)).toBe(true);
  await capture(page, testInfo, "vast-mobile-390x844.png");
});

test("keeps the scale framing intact with reduced motion", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await openFixture(page, VAST_WORLD, "reduce");
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true,
  );
  await capture(page, testInfo, "vast-reduced-1440x900.png");
});
