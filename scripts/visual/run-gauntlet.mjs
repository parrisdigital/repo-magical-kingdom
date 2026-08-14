import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCORECARD_SCHEMA = "repo-magical-kingdom/visual-gauntlet/v1";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const WORLD_DEFINITIONS = [
  {
    id: "compact-repository-city",
    scale: "compact",
    fixture: "src/components/kingdom/test-fixtures/repository-city-live-world.json",
    defaultWorldTheme: "enchanted-forest",
  },
  {
    id: "medium-magical-kingdom",
    scale: "medium",
    fixture: "src/components/kingdom/test-fixtures/magical-kingdom-medium-world.json",
    defaultWorldTheme: "enchanted-forest",
  },
  {
    id: "vast-nextjs",
    scale: "vast",
    fixture: "src/components/kingdom/test-fixtures/nextjs-large-world.json",
    defaultWorldTheme: "kingdom-valley",
  },
];

const CAPTURE_VIEW_DEFINITIONS = [
  {
    id: "orbit-overview",
    label: "Orbit overview",
    navigationMode: "orbit",
    mobile: true,
    intent:
      "Read the complete repository silhouette, terrain hierarchy, watershed, and settlement spacing.",
  },
  {
    id: "orbit-close",
    label: "Orbit close",
    navigationMode: "orbit",
    mobile: true,
    intent:
      "Inspect mid-distance material scale, object grounding, grove shape, and building readability.",
  },
  {
    id: "walk-spawn",
    label: "Walk spawn",
    navigationMode: "walk",
    mobile: false,
    intent:
      "Judge the first playable frame, eye-level scale, depth, control clarity, and immediate life.",
  },
  {
    id: "walk-settlement",
    label: "Walk settlement",
    navigationMode: "walk",
    mobile: false,
    intent:
      "Judge a path-side building cluster, architectural variety, contact, props, and lived-in density.",
  },
  {
    id: "walk-forest",
    label: "Walk forest",
    navigationMode: "walk",
    mobile: false,
    intent:
      "Judge vegetation silhouettes, understory, spacing, ground cover, and navigable clearings.",
  },
  {
    id: "walk-shoreline",
    label: "Walk shoreline",
    navigationMode: "walk",
    mobile: false,
    intent:
      "Judge visible water, bank shape, shoreline transition, reflections, and terrain contact.",
  },
];

const VIEW_DEFINITIONS = [
  {
    id: "desktop-normal",
    viewport: { width: 1440, height: 900 },
    reducedMotion: false,
    mobile: false,
  },
  {
    id: "mobile-normal",
    viewport: { width: 390, height: 844 },
    reducedMotion: false,
    mobile: true,
  },
  {
    id: "desktop-reduced",
    viewport: { width: 1440, height: 900 },
    reducedMotion: true,
    mobile: false,
  },
];

const VISUAL_REVIEW_AREAS = [
  {
    id: "world-composition",
    label: "World composition and repository-scale read",
    viewIds: ["orbit-overview", "orbit-close"],
  },
  {
    id: "terrain-materials",
    label: "Terrain, grass, rock, shoreline, and water coherence",
    viewIds: ["orbit-close", "walk-spawn", "walk-shoreline"],
  },
  {
    id: "settlements",
    label: "Settlement hierarchy, spacing, routes, and negative space",
    viewIds: ["orbit-overview", "orbit-close", "walk-settlement"],
  },
  {
    id: "ecology",
    label: "Tree, vegetation, wildlife, and prop distribution",
    viewIds: ["orbit-close", "walk-forest"],
  },
  {
    id: "life-motion",
    label: "Grounded, varied, and legible living motion",
    viewIds: ["orbit-close", "walk-spawn", "walk-settlement", "walk-forest", "walk-shoreline"],
  },
  {
    id: "season",
    label: "Seasonal assets, light, atmosphere, and visual consistency",
    viewIds: ["orbit-overview", "orbit-close", "walk-spawn", "walk-forest"],
  },
  {
    id: "hud",
    label: "HUD restraint, label legibility, and world dominance",
    viewIds: ["orbit-overview", "walk-spawn"],
  },
  {
    id: "framing",
    label: "Desktop or mobile framing, navigation, and exploration clarity",
    viewIds: CAPTURE_VIEW_DEFINITIONS.map((view) => view.id),
  },
];

function printHelp() {
  console.log(`Repo Magical Kingdom visual gauntlet

Usage:
  pnpm visual:gauntlet [options]

Options:
  --base-url <url>       Server origin (default: http://localhost:3000)
  --output <directory>   Exact run artifact directory
  --scenario <ids>       Comma-separated scenario ids
  --settle-ms <number>   Fixed post-canvas settle delay
  --frame-samples <n>    Browser frame-interval samples per scenario
  --reviews <file>       Explicit human-review JSON (see docs/GAUNTLET.md)
  --smoke                Shorter timings; keeps the complete scenario matrix
  --strict-review        Exit non-zero until every visual row is explicitly reviewed PASS
  --headed               Show Chromium while the sequential run executes
  --help                 Show this message

Stable capture view ids:
  ${CAPTURE_VIEW_DEFINITIONS.map((view) => view.id).join(", ")}
`);
}

function optionValue(argumentsList, name) {
  const index = argumentsList.indexOf(name);
  if (index === -1) return undefined;
  const value = argumentsList[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

function positiveInteger(value, fallback, label) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function round(value) {
  return Number(value.toFixed(3));
}

function percentile(sorted, percentileValue) {
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * percentileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined) return null;
  return round(lower + (upper - lower) * (position - lowerIndex));
}

function distribution(samples) {
  const finiteSamples = samples.filter(Number.isFinite);
  const sorted = [...finiteSamples].sort((first, second) => first - second);
  if (sorted.length === 0) {
    return {
      sampleCount: 0,
      mean: null,
      p50: null,
      p95: null,
      p99: null,
      worst: null,
      hitchesOver33ms: 0,
      hitchesOver50ms: 0,
    };
  }

  return {
    sampleCount: sorted.length,
    mean: round(sorted.reduce((total, value) => total + value, 0) / sorted.length),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    worst: round(sorted.at(-1)),
    hitchesOver33ms: sorted.filter((value) => value > 33.34).length,
    hitchesOver50ms: sorted.filter((value) => value > 50).length,
  };
}

function automatedCheck(id, passed, details) {
  return { id, status: passed ? "PASS" : "FAIL", details };
}

function informationalCheck(id, details) {
  return { id, status: "INFO", details };
}

function relativeArtifact(artifactDirectory, file) {
  return path.relative(artifactDirectory, file);
}

async function bounded(operation, timeoutMs, label) {
  let timeout;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} exceeded its ${timeoutMs}ms stage deadline.`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function logScenarioStage(scenarioId, startedAt, stage, status) {
  console.log(`  STAGE ${scenarioId} +${Date.now() - startedAt}ms ${stage} ${status}`);
}

async function captureCanvasBytes(canvas, options = {}) {
  await canvas.waitFor({ state: "visible", timeout: 5_000 });
  const page = canvas.page();
  await bounded(
    canvas.evaluate((element) => {
      const main = element.closest("main");
      if (!main) throw new Error("Canvas is not mounted inside the product surface.");
      let owner = element;
      while (owner.parentElement && owner.parentElement !== main) owner = owner.parentElement;
      if (owner.parentElement !== main) {
        throw new Error("Could not resolve the canvas owner inside the product surface.");
      }
      main.setAttribute("data-gauntlet-canvas-capture", "true");
      owner.setAttribute("data-gauntlet-canvas-owner", "true");
      let style = document.querySelector("style[data-gauntlet-canvas-style]");
      if (!style) {
        style = document.createElement("style");
        style.setAttribute("data-gauntlet-canvas-style", "true");
        style.textContent =
          'main[data-gauntlet-canvas-capture="true"] > :not([data-gauntlet-canvas-owner="true"]) { visibility: hidden !important; }';
        document.head.append(style);
      }
    }),
    15_000,
    "Canvas-only capture setup",
  );
  try {
    return await bounded(
      page.screenshot({
        animations: "disabled",
        caret: "hide",
        fullPage: false,
        timeout: 20_000,
        ...options,
      }),
      22_000,
      "Canvas-only viewport screenshot",
    );
  } finally {
    await bounded(
      page.evaluate(() => {
        document
          .querySelector('main[data-gauntlet-canvas-capture="true"]')
          ?.removeAttribute("data-gauntlet-canvas-capture");
        document
          .querySelector('[data-gauntlet-canvas-owner="true"]')
          ?.removeAttribute("data-gauntlet-canvas-owner");
      }),
      5_000,
      "Canvas-only capture cleanup",
    ).catch(() => undefined);
  }
}

async function writeScreenshot(page, artifactDirectory, filename) {
  const file = path.join(artifactDirectory, filename);
  const bytes = await bounded(
    page.screenshot({
      path: file,
      animations: "disabled",
      caret: "hide",
      fullPage: false,
      timeout: 20_000,
    }),
    22_000,
    `Page screenshot ${filename}`,
  );
  return {
    file: relativeArtifact(artifactDirectory, file),
    sha256: hash(bytes),
    bytes: bytes.byteLength,
  };
}

async function duplicateScreenshot(artifactDirectory, capture, filename) {
  const file = path.join(artifactDirectory, filename);
  await copyFile(path.join(artifactDirectory, capture.file), file);
  return { ...capture, file: relativeArtifact(artifactDirectory, file) };
}

async function writeCanvasScreenshot(canvas, artifactDirectory, filename) {
  const file = path.join(artifactDirectory, filename);
  let bytes;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // Locator.screenshot waits for element stability. A continuously
      // animated WebGL canvas can remain intentionally unstable, so capture
      // its current viewport bounds through Page.screenshot instead.
      bytes = await captureCanvasBytes(canvas, {
        path: file,
      });
      break;
    } catch (error) {
      lastError = error;
      if (
        !/not attached to the DOM/i.test(error instanceof Error ? error.message : String(error))
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!bytes) throw lastError ?? new Error("Canvas screenshot did not complete.");
  return {
    file: relativeArtifact(artifactDirectory, file),
    sha256: hash(bytes),
    bytes: bytes.byteLength,
  };
}

function captureViewDefinition(viewId) {
  const definition = CAPTURE_VIEW_DEFINITIONS.find((view) => view.id === viewId);
  if (!definition) throw new Error(`Unknown capture view id: ${viewId}`);
  return definition;
}

function applicableCaptureViews(scenario) {
  return CAPTURE_VIEW_DEFINITIONS.filter((view) => view.mobile || !scenario.view.mobile);
}

async function writeCaptureView(
  page,
  canvas,
  artifactDirectory,
  scenarioId,
  viewId,
  filenames = {},
) {
  const definition = captureViewDefinition(viewId);
  const pageCapture = await writeScreenshot(
    page,
    artifactDirectory,
    filenames.page ?? `${scenarioId}--${viewId}.png`,
  );
  const canvasCapture =
    filenames.captureCanvas === false
      ? null
      : await writeCanvasScreenshot(
          canvas,
          artifactDirectory,
          filenames.canvas ?? `${scenarioId}--${viewId}--canvas.png`,
        );
  return {
    id: definition.id,
    label: definition.label,
    navigationMode: definition.navigationMode,
    intent: definition.intent,
    page: pageCapture,
    ...(canvasCapture ? { canvas: canvasCapture } : {}),
  };
}

async function compareScreenshots(browser, artifactDirectory, first, second) {
  const [firstBytes, secondBytes] = await Promise.all([
    readFile(path.join(artifactDirectory, first.file)),
    readFile(path.join(artifactDirectory, second.file)),
  ]);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const comparison = await page.evaluate(
      async ({ firstBase64, secondBase64 }) => {
        const load = (base64) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error("Could not decode repeatability screenshot."));
            image.src = `data:image/png;base64,${base64}`;
          });
        const [firstImage, secondImage] = await Promise.all([
          load(firstBase64),
          load(secondBase64),
        ]);
        if (firstImage.width !== secondImage.width || firstImage.height !== secondImage.height) {
          return {
            dimensionsMatch: false,
            width: firstImage.width,
            height: firstImage.height,
            repeatWidth: secondImage.width,
            repeatHeight: secondImage.height,
            meanAbsoluteChannelDelta: null,
            differingPixelRatioOver3: null,
            maximumChannelDelta: null,
          };
        }

        const canvas = document.createElement("canvas");
        canvas.width = firstImage.width;
        canvas.height = firstImage.height;
        const context2d = canvas.getContext("2d", { willReadFrequently: true });
        if (!context2d) throw new Error("Could not create screenshot comparison context.");
        context2d.drawImage(firstImage, 0, 0);
        const firstPixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
        context2d.clearRect(0, 0, canvas.width, canvas.height);
        context2d.drawImage(secondImage, 0, 0);
        const secondPixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;

        let totalDelta = 0;
        let differingPixelsOver3 = 0;
        let maximumChannelDelta = 0;
        const pixelCount = canvas.width * canvas.height;
        for (let index = 0; index < firstPixels.length; index += 4) {
          let pixelMaximum = 0;
          for (let channel = 0; channel < 3; channel += 1) {
            const delta = Math.abs(firstPixels[index + channel] - secondPixels[index + channel]);
            totalDelta += delta;
            pixelMaximum = Math.max(pixelMaximum, delta);
            maximumChannelDelta = Math.max(maximumChannelDelta, delta);
          }
          if (pixelMaximum > 3) differingPixelsOver3 += 1;
        }

        return {
          dimensionsMatch: true,
          width: canvas.width,
          height: canvas.height,
          repeatWidth: canvas.width,
          repeatHeight: canvas.height,
          meanAbsoluteChannelDelta: totalDelta / (pixelCount * 3),
          differingPixelRatioOver3: differingPixelsOver3 / pixelCount,
          maximumChannelDelta,
        };
      },
      {
        firstBase64: firstBytes.toString("base64"),
        secondBase64: secondBytes.toString("base64"),
      },
    );
    const thresholds = {
      maximumMeanAbsoluteChannelDelta: 0.02,
      maximumDifferingPixelRatioOver3: 0.0005,
    };
    return {
      ...comparison,
      exactSha256Match: first.sha256 === second.sha256,
      thresholds,
      repeatable:
        comparison.dimensionsMatch &&
        comparison.meanAbsoluteChannelDelta <= thresholds.maximumMeanAbsoluteChannelDelta &&
        comparison.differingPixelRatioOver3 <= thresholds.maximumDifferingPixelRatioOver3,
    };
  } finally {
    await context.close();
  }
}

async function readWorld(definition) {
  const absoluteFixture = path.join(repositoryRoot, definition.fixture);
  const fixtureBytes = await readFile(absoluteFixture);
  const fixture = JSON.parse(fixtureBytes.toString("utf8"));
  const themedFixture = {
    ...fixture,
    // The Repository City capture predates the required worldTheme field. The
    // harness supplies the same deterministic default in memory and never
    // rewrites the historical fixture.
    worldTheme: fixture.worldTheme ?? definition.defaultWorldTheme,
  };
  const directEntities = themedFixture.entities.filter((entity) => !entity.aggregate).length;
  const aggregateEntities = themedFixture.entities.length - directEntities;
  const representedFiles = themedFixture.entities.reduce(
    (total, entity) => total + entity.representedFiles,
    0,
  );
  const coverageNeedsReconciliation =
    themedFixture.coverage.directEntities !== directEntities ||
    themedFixture.coverage.aggregateEntities !== aggregateEntities ||
    themedFixture.coverage.representedFiles !== representedFiles;
  const world = coverageNeedsReconciliation
    ? {
        ...themedFixture,
        coverage: {
          ...themedFixture.coverage,
          directEntities,
          aggregateEntities,
          representedFiles,
        },
        warnings: [
          ...themedFixture.warnings,
          {
            code: "LEGACY_COVERAGE_RECONCILED",
            message:
              "Legacy summary counters were reconciled with the available entity collection; some eligible source details may be absent from this captured package.",
          },
        ],
      }
    : themedFixture;

  return {
    ...definition,
    fixtureSha256: hash(fixtureBytes),
    world,
  };
}

function routeForWorld(world) {
  const owner = encodeURIComponent(world.source.owner);
  const repository = encodeURIComponent(world.source.repository);
  const query = new URLSearchParams({ world: world.worldTheme, season: world.season });
  return `/kingdom/${owner}/${repository}/${world.source.commitSha}?${query.toString()}`;
}

async function installRuntimeInstrumentation(page) {
  await page.addInitScript(() => {
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    const webGlCanvases = new WeakSet();
    const diagnostics = {
      getContextCalls: 0,
      webGlCanvasCount: 0,
      contextLostEvents: 0,
      contextRestoredEvents: 0,
      longTasksMs: [],
    };

    Object.defineProperty(window, "__repoMagicalKingdomGauntlet", {
      configurable: false,
      enumerable: false,
      value: diagnostics,
      writable: false,
    });

    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value(contextId, ...contextArguments) {
        const isWebGl =
          contextId === "webgl" || contextId === "webgl2" || contextId === "experimental-webgl";
        const context = Reflect.apply(nativeGetContext, this, [contextId, ...contextArguments]);
        if (isWebGl) {
          diagnostics.getContextCalls += 1;
          if (context && !webGlCanvases.has(this)) {
            webGlCanvases.add(this);
            diagnostics.webGlCanvasCount += 1;
          }
        }
        return context;
      },
    });

    document.addEventListener(
      "webglcontextlost",
      () => {
        diagnostics.contextLostEvents += 1;
      },
      true,
    );
    document.addEventListener(
      "webglcontextrestored",
      () => {
        diagnostics.contextRestoredEvents += 1;
      },
      true,
    );

    if ("PerformanceObserver" in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) diagnostics.longTasksMs.push(entry.duration);
        });
        observer.observe({ entryTypes: ["longtask"] });
      } catch {
        // Long-task observation is diagnostic. Unsupported browsers still run
        // the renderer, context, interaction, and screenshot gates.
      }
    }
  });
}

function watchBrowserFailures(page, baseUrl) {
  const failures = {
    consoleErrors: [],
    pageErrors: [],
    failedLocalRequests: [],
    abortedLocalRequests: [],
    localErrorResponses: [],
    modelRequests: [],
    modelResponses: [],
    modelRequestFailures: [],
  };

  const isModelRequest = (url) => /\.(?:glb|gltf)(?:\?|$)/i.test(url);

  page.on("console", (message) => {
    if (message.type() === "error") failures.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => failures.pageErrors.push(error.message));
  page.on("request", (request) => {
    if (isModelRequest(request.url())) failures.modelRequests.push(request.url());
  });
  page.on("requestfailed", (request) => {
    const error = request.failure()?.errorText ?? "unknown request failure";
    if (isModelRequest(request.url())) {
      failures.modelRequestFailures.push({
        url: request.url(),
        error,
      });
    }
    if (request.url().startsWith(baseUrl)) {
      const target =
        error === "net::ERR_ABORTED" ? failures.abortedLocalRequests : failures.failedLocalRequests;
      target.push({ url: request.url(), error });
    }
  });
  page.on("response", (response) => {
    if (isModelRequest(response.url()) && response.ok()) {
      failures.modelResponses.push(response.url());
    }
    if (response.url().startsWith(baseUrl) && response.status() >= 400) {
      failures.localErrorResponses.push({ url: response.url(), status: response.status() });
    }
  });

  return failures;
}

async function createScenarioPage(browser, scenario, baseUrl) {
  const context = await browser.newContext({
    viewport: scenario.view.viewport,
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: scenario.view.reducedMotion ? "reduce" : "no-preference",
    hasTouch: scenario.view.mobile,
    isMobile: scenario.view.mobile,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(45_000);
  const failures = watchBrowserFailures(page, baseUrl);
  await installRuntimeInstrumentation(page);
  await page.route(/\/api\/kingdom(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ world: scenario.world.world }),
    });
  });
  return { context, page, failures };
}

async function waitAnimationFrames(page, frameCount) {
  await bounded(
    page.evaluate(
      (count) =>
        new Promise((resolve) => {
          let remaining = count;
          const nextFrame = () => {
            remaining -= 1;
            if (remaining <= 0) resolve(undefined);
            else requestAnimationFrame(nextFrame);
          };
          requestAnimationFrame(nextFrame);
        }),
      frameCount,
    ),
    20_000,
    `Animation-frame wait (${frameCount})`,
  );
}

async function openSettledWorld(page, scenario, baseUrl, settleMs, settleFrames) {
  const route = routeForWorld(scenario.world.world);
  const startedAt = Date.now();
  const response = await page.goto(`${baseUrl}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  if (!response?.ok()) {
    throw new Error(`Repository-world route returned HTTP ${response?.status() ?? "no response"}.`);
  }

  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.locator('main[data-mode="kingdom"]').waitFor({ state: "visible", timeout: 30_000 });
  await page.getByRole("heading", { name: scenario.world.world.title }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.waitForFunction(
    () => {
      const visible = (element) => {
        const style = window.getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) !== 0 &&
          bounds.width > 0 &&
          bounds.height > 0
        );
      };
      return ![...document.querySelectorAll('[role="status"], body *')].some((element) => {
        if (!visible(element)) return false;
        const directText = [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? "")
          .join(" ")
          .trim();
        return /^Rendering(?:…|\.\.\.)?$/i.test(directText);
      });
    },
    undefined,
    { timeout: 30_000 },
  );
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () => {
      const element = document.querySelector("canvas");
      return element instanceof HTMLCanvasElement && element.width > 0 && element.height > 0;
    },
    undefined,
    { timeout: 30_000 },
  );
  const canvasReadyMs = Date.now() - startedAt;

  // Next development mode keeps HMR traffic open. A fixed time plus a fixed
  // browser-frame budget is more reproducible than network-idle heuristics.
  await page.waitForTimeout(settleMs);
  await waitAnimationFrames(page, settleFrames);
  return { canvas, route, canvasReadyMs };
}

async function inspectReadinessUi(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) !== 0 &&
        bounds.width > 0 &&
        bounds.height > 0
      );
    };
    const textOf = (element) => (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const visibleErrors = [...document.querySelectorAll('[role="alert"]')]
      .filter(visible)
      .map(textOf)
      .filter(Boolean);
    const renderingIndicators = [...document.querySelectorAll('[role="status"], body *')]
      .filter(visible)
      .filter((element) => {
        const directText = [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? "")
          .join(" ")
          .trim();
        return /^Rendering(?:…|\.\.\.)?$/i.test(directText);
      })
      .map(textOf);
    return { visibleErrors, renderingIndicators };
  });
}

async function collectFrameIntervals(page, sampleCount, maximumWindowMs) {
  return page.evaluate(
    ({ count, windowMs }) =>
      new Promise((resolve) => {
        const samples = [];
        let previous = null;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve(samples);
        };
        window.setTimeout(finish, windowMs);
        const sample = (timestamp) => {
          if (settled) return;
          if (previous !== null) samples.push(timestamp - previous);
          previous = timestamp;
          if (samples.length >= count) finish();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
    { count: sampleCount, windowMs: maximumWindowMs },
  );
}

async function inspectRuntime(page, _canvas, failures) {
  const canvasState = await bounded(
    page.evaluate(() => {
      const element = document.querySelector("canvas");
      if (!(element instanceof HTMLCanvasElement)) {
        throw new Error("Runtime canvas is not mounted.");
      }
      const context =
        element.getContext("webgl2") ??
        element.getContext("webgl") ??
        element.getContext("experimental-webgl");
      const bounds = element.getBoundingClientRect();
      return {
        visible: bounds.width > 0 && bounds.height > 0,
        cssWidth: roundForBrowser(bounds.width),
        cssHeight: roundForBrowser(bounds.height),
        pixelWidth: element.width,
        pixelHeight: element.height,
        hasContext: Boolean(context),
        contextLost: context && "isContextLost" in context ? context.isContextLost() : null,
        drawingBufferWidth:
          context && "drawingBufferWidth" in context ? context.drawingBufferWidth : 0,
        drawingBufferHeight:
          context && "drawingBufferHeight" in context ? context.drawingBufferHeight : 0,
        renderer: context ? String(context.getParameter(context.RENDERER)) : null,
        version: context ? String(context.getParameter(context.VERSION)) : null,
      };

      function roundForBrowser(value) {
        return Math.round(value * 1000) / 1000;
      }
    }),
    12_000,
    "Runtime canvas inspection",
  );

  const pageState = await bounded(
    page.evaluate(() => {
      const diagnostics = window.__repoMagicalKingdomGauntlet ?? null;
      const root = document.documentElement;
      const body = document.body;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        mainMode: document.querySelector("main")?.getAttribute("data-mode") ?? null,
        canvasCount: document.querySelectorAll("canvas").length,
        fallbackHeadingCount: [...document.querySelectorAll("h1, h2")].filter((heading) =>
          /kingdom needs webgl|kingdom could not be assembled/i.test(heading.textContent ?? ""),
        ).length,
        overflow: {
          documentWidth: Math.max(root.scrollWidth, body.scrollWidth),
          documentHeight: Math.max(root.scrollHeight, body.scrollHeight),
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
        },
        navigation: navigation
          ? {
              domContentLoadedMs: Math.round(navigation.domContentLoadedEventEnd * 1000) / 1000,
              loadMs: Math.round(navigation.loadEventEnd * 1000) / 1000,
            }
          : null,
        instrumentation: diagnostics
          ? {
              ...diagnostics,
              longTasksMs: diagnostics.longTasksMs.map(
                (duration) => Math.round(duration * 1000) / 1000,
              ),
            }
          : null,
      };
    }),
    8_000,
    "Runtime page inspection",
  );

  const checks = [
    automatedCheck("kingdom-mode-mounted", pageState.mainMode === "kingdom", pageState.mainMode),
    automatedCheck(
      "canvas-visible-and-sized",
      canvasState.visible && canvasState.pixelWidth > 0 && canvasState.pixelHeight > 0,
      canvasState,
    ),
    automatedCheck(
      "webgl-context-live",
      canvasState.hasContext && canvasState.contextLost === false,
      canvasState,
    ),
    automatedCheck(
      "webgl-drawing-buffer-live",
      canvasState.drawingBufferWidth > 0 && canvasState.drawingBufferHeight > 0,
      canvasState,
    ),
    automatedCheck(
      "single-renderer-canvas",
      pageState.canvasCount === 1 && pageState.instrumentation?.webGlCanvasCount === 1,
      {
        domCanvasCount: pageState.canvasCount,
        instrumentedWebGlCanvasCount: pageState.instrumentation?.webGlCanvasCount ?? null,
        getContextCalls: pageState.instrumentation?.getContextCalls ?? null,
      },
    ),
    automatedCheck(
      "no-webgl-context-loss",
      pageState.instrumentation?.contextLostEvents === 0 &&
        pageState.instrumentation?.contextRestoredEvents === 0,
      pageState.instrumentation,
    ),
    automatedCheck("no-renderer-fallback", pageState.fallbackHeadingCount === 0, {
      fallbackHeadingCount: pageState.fallbackHeadingCount,
    }),
    automatedCheck(
      "no-browser-errors",
      failures.consoleErrors.length === 0 && failures.pageErrors.length === 0,
      { consoleErrors: failures.consoleErrors, pageErrors: failures.pageErrors },
    ),
    automatedCheck(
      "no-local-resource-failures",
      failures.failedLocalRequests.length === 0 && failures.localErrorResponses.length === 0,
      {
        failedLocalRequests: failures.failedLocalRequests,
        abortedLocalRequests: failures.abortedLocalRequests,
        localErrorResponses: failures.localErrorResponses,
      },
    ),
    automatedCheck(
      "no-document-overflow",
      pageState.overflow.documentWidth <= pageState.overflow.viewportWidth + 1 &&
        pageState.overflow.documentHeight <= pageState.overflow.viewportHeight + 1,
      pageState.overflow,
    ),
  ];

  return { canvasState, pageState, checks };
}

async function probeHoverLabel(page, canvas, config) {
  const bounds = await bounded(canvas.boundingBox(), 10_000, "Hover canvas bounds query");
  if (!bounds) {
    return {
      attempted: false,
      found: false,
      attempts: 0,
      label: null,
      point: null,
      attemptTimingMs: distribution([]),
    };
  }

  const rows = config.hoverRows;
  const columns = config.hoverColumns;
  let attempts = 0;
  const attemptTimings = [];
  const hint = page.locator('[class*="hoverHint"]').first();
  const priorityPoints = [
    [0.5, 0.34],
    [0.5, 0.5],
    [0.35, 0.46],
    [0.65, 0.46],
    [0.35, 0.64],
    [0.65, 0.64],
    [0.5, 0.72],
  ];
  const gridPoints = [];
  for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
    const columnOrder = Array.from({ length: columns }, (_, index) =>
      rowIndex % 2 === 0 ? index : columns - index - 1,
    );
    for (const columnIndex of columnOrder) {
      gridPoints.push([
        0.08 + (columnIndex / Math.max(1, columns - 1)) * 0.84,
        0.14 + (rowIndex / Math.max(1, rows - 1)) * 0.7,
      ]);
    }
  }

  for (const [normalizedX, normalizedY] of [...priorityPoints, ...gridPoints].slice(
    0,
    config.hoverMaxAttempts,
  )) {
    const x = bounds.x + bounds.width * normalizedX;
    const y = bounds.y + bounds.height * normalizedY;
    const attemptStartedAt = performance.now();
    await page.mouse.move(x, y);
    attempts += 1;
    await page.waitForTimeout(config.hoverDelayMs);
    attemptTimings.push(performance.now() - attemptStartedAt);
    if ((await hint.count()) > 0 && (await hint.isVisible())) {
      const label = (await hint.locator("span").first().textContent())?.trim() ?? "";
      if (label) {
        return {
          attempted: true,
          found: true,
          attempts,
          label,
          point: { x: round(x), y: round(y) },
          attemptTimingMs: distribution(attemptTimings),
        };
      }
    }
  }

  return {
    attempted: true,
    found: false,
    attempts,
    label: null,
    point: null,
    attemptTimingMs: distribution(attemptTimings),
  };
}

async function probeCamera(page, canvas, scenario, config) {
  const bounds = await bounded(canvas.boundingBox(), 10_000, "Orbit canvas bounds query");
  if (!bounds) {
    return {
      attempted: false,
      input: scenario.view.mobile ? "touch-compatible pointer drag + wheel" : "mouse drag + wheel",
      beforeSha256: null,
      afterSha256: null,
      frameChanged: false,
      dispatchTimingMs: distribution([]),
      postGestureFrameIntervalsMs: distribution([]),
    };
  }

  const before = scenario.view.reducedMotion ? await captureCanvasBytes(canvas) : null;
  const dispatchTimings = [];
  const timeDispatch = async (dispatch) => {
    const gestureStartedAt = performance.now();
    await dispatch();
    dispatchTimings.push(performance.now() - gestureStartedAt);
  };
  const startX = bounds.x + bounds.width * 0.66;
  const startY = bounds.y + bounds.height * 0.56;
  await timeDispatch(() => page.mouse.move(startX, startY));
  await timeDispatch(() => page.mouse.down());
  await timeDispatch(() =>
    page.mouse.move(startX - bounds.width * 0.095, startY - bounds.height * 0.04),
  );
  await timeDispatch(() => page.mouse.up());
  await timeDispatch(() => page.mouse.wheel(0, -720));
  await page.waitForTimeout(config.cameraSettleMs);
  await waitAnimationFrames(page, config.settleFrames);
  const postGestureFrameIntervals = await collectFrameIntervals(
    page,
    config.postGestureFrameSamples,
    config.frameSampleWindowMs,
  );
  const after = scenario.view.reducedMotion ? await captureCanvasBytes(canvas) : null;
  const beforeSha256 = before ? hash(before) : null;
  const afterSha256 = after ? hash(after) : null;

  return {
    attempted: true,
    input: scenario.view.mobile ? "touch-compatible pointer drag + wheel" : "mouse drag + wheel",
    pixelComparisonCaptured: scenario.view.reducedMotion,
    beforeSha256,
    afterSha256,
    frameChanged:
      beforeSha256 !== null && afterSha256 !== null ? beforeSha256 !== afterSha256 : null,
    dispatchTimingMs: distribution(dispatchTimings),
    postGestureFrameIntervalsMs: distribution(postGestureFrameIntervals),
  };
}

async function inspectWalkUi(page) {
  return bounded(
    page.evaluate(() => {
      const walkButton = [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.trim().endsWith("Walk"),
      );
      const status = document.querySelector('[aria-label="Walk exploration status"]');
      return {
        walkButtonPresent: walkButton instanceof HTMLButtonElement,
        walkButtonEnabled: walkButton instanceof HTMLButtonElement ? !walkButton.disabled : false,
        walkButtonPressed: walkButton?.getAttribute("aria-pressed") === "true",
        statusVisible:
          status instanceof HTMLElement &&
          status.getBoundingClientRect().width > 0 &&
          status.getBoundingClientRect().height > 0,
        locationLabel: status?.querySelector("strong")?.textContent?.trim() ?? null,
        interactionLabel: status?.querySelector("small")?.textContent?.trim() ?? null,
        pointerLocked: document.pointerLockElement instanceof HTMLCanvasElement,
      };
    }),
    12_000,
    "Walk UI inspection",
  );
}

async function releasePointerLock(page) {
  const locked = await bounded(
    page.evaluate(() => document.pointerLockElement instanceof HTMLCanvasElement),
    12_000,
    "Pointer-lock state inspection",
  );
  if (!locked) return;
  await bounded(page.keyboard.press("Escape"), 8_000, "Pointer-lock release key");
  await page
    .waitForFunction(() => document.pointerLockElement === null, undefined, { timeout: 1_500 })
    .catch(() => undefined);
}

async function activateNavigationMode(page, mode, config) {
  await releasePointerLock(page);
  // The HUD remains visibly actionable during Walk, but locator actionability
  // probes can starve behind the continuously rendering WebGL branch. Inspect
  // the real DOM button and queue its real React click in one bounded task.
  const transition = await bounded(
    page.evaluate(
      ({ requestedLabel, requestedMode }) => {
        const navigationRoot = document.querySelector('main[data-mode="kingdom"]');
        const target = [...(navigationRoot?.querySelectorAll("button") ?? [])].find((candidate) =>
          candidate.textContent?.trim().endsWith(requestedLabel),
        );
        const bounds = target?.getBoundingClientRect();
        const style = target ? window.getComputedStyle(target) : null;
        const visible = Boolean(
          bounds &&
          bounds.width > 0 &&
          bounds.height > 0 &&
          style?.display !== "none" &&
          style?.visibility !== "hidden" &&
          Number(style?.opacity ?? 1) !== 0,
        );
        const enabled = target instanceof HTMLButtonElement && !target.disabled;
        const currentMode = navigationRoot?.getAttribute("data-navigation-mode") ?? null;
        if (visible && enabled && currentMode !== requestedMode) {
          window.setTimeout(() => target.click(), 0);
        }
        return {
          currentMode,
          enabled,
          present: target instanceof HTMLButtonElement,
          visible,
        };
      },
      { requestedLabel: mode === "walk" ? "Walk" : "Orbit", requestedMode: mode },
    ),
    12_000,
    `${mode} navigation button inspection and queue`,
  );
  if (!transition.present || !transition.visible) {
    throw new Error(`${mode} navigation button is not visibly mounted.`);
  }
  if (!transition.enabled) return { available: false, ui: await inspectWalkUi(page) };
  await page
    .locator(`main[data-mode="kingdom"][data-navigation-mode="${mode}"]`)
    .waitFor({ state: "visible", timeout: 12_000 });
  await page.waitForTimeout(mode === "walk" ? config.walkSettleMs : config.cameraSettleMs);
  await waitAnimationFrames(page, config.navigationSettleFrames);
  return { available: true, ui: await inspectWalkUi(page) };
}

async function runWalkViewGesture(page, _canvas, action, config) {
  const bounds = await bounded(
    page.evaluate(() => {
      const element = document.querySelector("canvas");
      if (!(element instanceof HTMLCanvasElement)) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }),
    12_000,
    "Walk canvas bounds query",
  );
  if (!bounds) return { attempted: false, pointerLockAccepted: false, action };
  const centerX = bounds.x + bounds.width * 0.5;
  const centerY = bounds.y + bounds.height * 0.5;
  await bounded(page.mouse.click(centerX, centerY), 8_000, "Walk pointer-lock click");
  const pointerLockAccepted = await page
    .waitForFunction(() => document.pointerLockElement instanceof HTMLCanvasElement, undefined, {
      timeout: 1_500,
    })
    .then(() => true)
    .catch(() => false);
  if (pointerLockAccepted) {
    await bounded(page.mouse.move(centerX, centerY), 8_000, "Walk pointer centering");
    await bounded(
      page.mouse.move(centerX + action.lookX, centerY + action.lookY, { steps: 8 }),
      8_000,
      "Walk look gesture",
    );
    if (action.forwardMs > 0) {
      if (action.sprint) {
        await bounded(page.keyboard.down("Shift"), 8_000, "Walk sprint key down");
      }
      await bounded(page.keyboard.down("w"), 8_000, "Walk forward key down");
      if (action.strafe) {
        await bounded(page.keyboard.down(action.strafe), 8_000, "Walk strafe key down");
      }
      await page.waitForTimeout(action.forwardMs);
      if (action.strafe) {
        await bounded(page.keyboard.up(action.strafe), 8_000, "Walk strafe key up");
      }
      await bounded(page.keyboard.up("w"), 8_000, "Walk forward key up");
      if (action.sprint) {
        await bounded(page.keyboard.up("Shift"), 8_000, "Walk sprint key up");
      }
    }
    await page.waitForTimeout(config.walkGestureSettleMs);
    await waitAnimationFrames(page, config.navigationSettleFrames);
  }
  const ui = await inspectWalkUi(page);
  await releasePointerLock(page);
  return { attempted: true, pointerLockAccepted, action, ui };
}

async function captureWalkViews(page, canvas, scenario, config, scenarioStartedAt) {
  const captures = {};
  const probes = {};
  logScenarioStage(scenario.id, scenarioStartedAt, "walk-spawn", "PREPARE");
  const initial = await activateNavigationMode(page, "walk", config);
  if (!initial.available || !initial.ui.statusVisible) {
    return {
      available: false,
      captures,
      probes,
      ui: initial.ui,
      checks: [automatedCheck("walk-mode-mounted", false, initial.ui)],
    };
  }

  captures["walk-spawn"] = {
    ...(await writeCaptureView(page, canvas, config.artifactDirectory, scenario.id, "walk-spawn", {
      captureCanvas: false,
    })),
    probe: { attempted: false, pointerLockAccepted: null, ui: initial.ui },
  };
  logScenarioStage(scenario.id, scenarioStartedAt, "walk-spawn", "DONE");

  const actions = {
    "walk-settlement": {
      description: "Small path-side look adjustment from the deterministic living spawn.",
      lookX: -42,
      lookY: -8,
      forwardMs: 0,
      sprint: false,
      strafe: null,
    },
    "walk-forest": {
      description: "Quarter-turn sprint excursion from a reset living spawn.",
      lookX: 230,
      lookY: 4,
      forwardMs: config.walkForestTravelMs,
      sprint: true,
      strafe: "a",
    },
    "walk-shoreline": {
      description: "Downward shoreline-biased look from a reset water-aware living spawn.",
      lookX: 0,
      lookY: 72,
      forwardMs: 0,
      sprint: false,
      strafe: null,
    },
  };

  for (const [viewId, action] of Object.entries(actions)) {
    logScenarioStage(scenario.id, scenarioStartedAt, viewId, "PREPARE");
    await activateNavigationMode(page, "orbit", config);
    const reset = await activateNavigationMode(page, "walk", config);
    const probe = await runWalkViewGesture(page, canvas, action, config);
    probes[viewId] = { ...probe, resetUi: reset.ui };
    captures[viewId] = {
      ...(await writeCaptureView(page, canvas, config.artifactDirectory, scenario.id, viewId, {
        captureCanvas: false,
      })),
      probe: probes[viewId],
    };
    logScenarioStage(
      scenario.id,
      scenarioStartedAt,
      viewId,
      `DONE pointerLock=${probe.pointerLockAccepted}`,
    );
  }

  const expectedIds = applicableCaptureViews(scenario)
    .filter((view) => view.navigationMode === "walk")
    .map((view) => view.id);
  return {
    available: true,
    captures,
    probes,
    ui: await inspectWalkUi(page),
    checks: [
      automatedCheck("walk-mode-mounted", true, initial.ui),
      automatedCheck(
        "walk-capture-view-set-complete",
        expectedIds.every((viewId) => captures[viewId]),
        { expectedIds, capturedIds: Object.keys(captures) },
      ),
      informationalCheck(
        "walk-pointer-lock-gesture-results",
        Object.fromEntries(
          Object.entries(probes).map(([viewId, probe]) => [
            viewId,
            { attempted: probe.attempted, pointerLockAccepted: probe.pointerLockAccepted },
          ]),
        ),
      ),
    ],
  };
}

async function probePopulatedScene(page, canvas, failures, config) {
  const modelResourceMinimum = config.modelResourceMinimum;
  try {
    await page.waitForFunction(
      (minimum) =>
        performance
          .getEntriesByType("resource")
          .filter((entry) => /\.(?:glb|gltf)(?:\?|$)/i.test(entry.name)).length >= minimum,
      modelResourceMinimum,
      { timeout: config.populationTimeoutMs },
    );
  } catch {
    // Preserve the observed count in the scorecard instead of converting a
    // readiness timeout into an unstructured scenario error.
  }
  await waitAnimationFrames(page, config.settleFrames);

  const ui = await inspectReadinessUi(page);
  const modelResourceCount = await page.evaluate(
    () =>
      performance
        .getEntriesByType("resource")
        .filter((entry) => /\.(?:glb|gltf)(?:\?|$)/i.test(entry.name)).length,
  );
  const contentProbe = await captureCanvasBytes(canvas);
  const hover = await probeHoverLabel(page, canvas, config);
  const checks = [
    automatedCheck(
      "current-world-schema-accepted",
      ui.visibleErrors.every((message) => !/invalid world package/i.test(message)),
      { visibleErrors: ui.visibleErrors },
    ),
    automatedCheck("no-visible-error-toast", ui.visibleErrors.length === 0, ui.visibleErrors),
    automatedCheck(
      "no-rendering-indicator",
      ui.renderingIndicators.length === 0,
      ui.renderingIndicators,
    ),
    automatedCheck(
      "model-resources-loaded",
      modelResourceCount >= modelResourceMinimum && failures.modelRequestFailures.length === 0,
      {
        requiredMinimum: modelResourceMinimum,
        performanceResourceCount: modelResourceCount,
        requestedCount: failures.modelRequests.length,
        completedCount: failures.modelResponses.length,
        failures: failures.modelRequestFailures,
      },
    ),
    automatedCheck(
      "nontrivial-canvas-frame",
      contentProbe.byteLength >= config.minimumCanvasScreenshotBytes,
      { pngBytes: contentProbe.byteLength, requiredMinimum: config.minimumCanvasScreenshotBytes },
    ),
  ];

  return { checks, hover, modelResourceCount };
}

async function captureRepeat(browser, scenario, config, filename) {
  const session = await createScenarioPage(browser, scenario, config.baseUrl);
  let deadlineExpired = false;
  const deadline = setTimeout(() => {
    deadlineExpired = true;
    void session.context.close();
  }, config.scenarioTimeoutMs);
  try {
    const opened = await openSettledWorld(
      session.page,
      scenario,
      config.baseUrl,
      config.settleMs,
      config.settleFrames,
    );
    const readiness = await probePopulatedScene(
      session.page,
      opened.canvas,
      session.failures,
      config,
    );
    const readinessFailures = readiness.checks.filter((check) => check.status === "FAIL");
    if (readinessFailures.length > 0) {
      throw new Error(
        `Repeat page never reached populated-scene readiness: ${readinessFailures
          .map((check) => check.id)
          .join(", ")}`,
      );
    }
    const pageCapture = await writeScreenshot(session.page, config.artifactDirectory, filename);
    const canvasCapture = await writeCanvasScreenshot(
      opened.canvas,
      config.artifactDirectory,
      filename.replace(/\.png$/, "--canvas.png"),
    );
    return { page: pageCapture, canvas: canvasCapture };
  } catch (error) {
    if (deadlineExpired) {
      throw new Error(`Isolated repeat exceeded ${config.scenarioTimeoutMs}ms.`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(deadline);
    await session.context.close().catch(() => undefined);
  }
}

async function runScenario(browser, scenario, config) {
  const scenarioStartedAt = Date.now();
  const session = await createScenarioPage(browser, scenario, config.baseUrl);
  let deadlineExpired = false;
  const deadline = setTimeout(() => {
    deadlineExpired = true;
    void session.context.close();
  }, config.scenarioTimeoutMs);
  try {
    logScenarioStage(scenario.id, scenarioStartedAt, "world-open", "BEGIN");
    const opened = await openSettledWorld(
      session.page,
      scenario,
      config.baseUrl,
      config.settleMs,
      config.settleFrames,
    );
    logScenarioStage(scenario.id, scenarioStartedAt, "world-open", "DONE");
    console.log(`  CANVAS ${scenario.id} ${opened.canvasReadyMs}ms`);
    const initialInspection = await inspectRuntime(session.page, opened.canvas, session.failures);
    const readiness = await probePopulatedScene(
      session.page,
      opened.canvas,
      session.failures,
      config,
    );
    logScenarioStage(scenario.id, scenarioStartedAt, "population", "DONE");
    console.log(
      `  POPULATED ${scenario.id} models=${readiness.modelResourceCount} hover=${readiness.hover.found}`,
    );
    const prerequisiteChecks = [...initialInspection.checks, ...readiness.checks];
    const hoverCheck = automatedCheck(
      "canvas-hover-label-discovered",
      readiness.hover.attempted && readiness.hover.found,
      readiness.hover,
    );
    logScenarioStage(scenario.id, scenarioStartedAt, "orbit-overview", "CAPTURE");
    const orbitOverview = await writeCaptureView(
      session.page,
      opened.canvas,
      config.artifactDirectory,
      scenario.id,
      "orbit-overview",
    );
    if (!orbitOverview.canvas) throw new Error("Orbit overview canvas evidence is missing.");
    const primary = await duplicateScreenshot(
      config.artifactDirectory,
      orbitOverview.page,
      `${scenario.id}--overview.png`,
    );
    const overviewCanvas = await duplicateScreenshot(
      config.artifactDirectory,
      orbitOverview.canvas,
      `${scenario.id}--overview-canvas.png`,
    );
    console.log(`  CAPTURED ${scenario.id} ${primary.sha256.slice(0, 12)}`);
    if (prerequisiteChecks.some((check) => check.status === "FAIL")) {
      return {
        id: scenario.id,
        repositoryScale: scenario.world.scale,
        source: scenario.world.world.source,
        route: opened.route,
        viewport: scenario.view.viewport,
        motion: scenario.view.reducedMotion ? "reduced" : "normal",
        mobile: scenario.view.mobile,
        timings: {
          fixedSettleMs: config.settleMs,
          fixedSettleFrames: config.settleFrames,
          canvasReadyMs: opened.canvasReadyMs,
          hoverProbeAttemptMs: readiness.hover.attemptTimingMs,
        },
        renderer: initialInspection.canvasState,
        instrumentation: initialInspection.pageState.instrumentation,
        hoverProbe: readiness.hover,
        cameraProbe: null,
        screenshots: {
          overview: primary,
          overviewCanvas,
          views: { "orbit-overview": orbitOverview },
        },
        automatedChecks: [...prerequisiteChecks, hoverCheck],
      };
    }

    const frameIntervals = await collectFrameIntervals(
      session.page,
      config.frameSamples,
      config.frameSampleWindowMs,
    );
    await waitAnimationFrames(session.page, config.settleFrames);
    let samePageReducedMotion = null;
    if (scenario.view.reducedMotion) {
      await session.page.waitForTimeout(config.reducedMotionStabilityGapMs);
      await waitAnimationFrames(session.page, config.settleFrames);
      samePageReducedMotion = await writeCanvasScreenshot(
        opened.canvas,
        config.artifactDirectory,
        `${scenario.id}--same-page-stability.png`,
      );
    }
    logScenarioStage(scenario.id, scenarioStartedAt, "orbit-close", "INTERACT");
    const camera = await probeCamera(session.page, opened.canvas, scenario, config);
    const orbitClosePage = await writeScreenshot(
      session.page,
      config.artifactDirectory,
      `${scenario.id}--orbit-close.png`,
    );
    const exploration = await duplicateScreenshot(
      config.artifactDirectory,
      orbitClosePage,
      `${scenario.id}--exploration.png`,
    );
    const orbitCloseDefinition = captureViewDefinition("orbit-close");
    const orbitClose = {
      id: orbitCloseDefinition.id,
      label: orbitCloseDefinition.label,
      navigationMode: orbitCloseDefinition.navigationMode,
      intent: orbitCloseDefinition.intent,
      page: orbitClosePage,
      probe: camera,
    };
    logScenarioStage(scenario.id, scenarioStartedAt, "orbit-close", "DONE");
    const finalInspection = await inspectRuntime(session.page, opened.canvas, session.failures);

    const walk = scenario.view.mobile
      ? {
          available: false,
          captures: {},
          probes: {},
          ui: await inspectWalkUi(session.page),
          checks: [
            informationalCheck(
              "walk-capture-views-not-applicable-on-mobile",
              "The production surface intentionally requires a fine pointer and keyboard for Walk.",
            ),
          ],
        }
      : await captureWalkViews(session.page, opened.canvas, scenario, config, scenarioStartedAt);
    const postWalkInspection = scenario.view.mobile
      ? null
      : await inspectRuntime(session.page, opened.canvas, session.failures);

    const checks = [
      ...prerequisiteChecks,
      hoverCheck,
      automatedCheck("camera-gesture-dispatched", camera.attempted, camera),
      scenario.view.reducedMotion
        ? automatedCheck("camera-gesture-changed-stable-frame", camera.frameChanged, camera)
        : informationalCheck(
            "camera-frame-change-not-attributed-in-normal-motion",
            "The gesture was dispatched, but active world animation makes screenshot deltas non-causal.",
          ),
      ...finalInspection.checks.map((check) => ({ ...check, id: `post-gesture:${check.id}` })),
      ...walk.checks,
      ...(postWalkInspection
        ? postWalkInspection.checks.map((check) => ({ ...check, id: `post-walk:${check.id}` }))
        : []),
    ];

    const lastInspection = postWalkInspection ?? finalInspection;
    const longTasks = lastInspection.pageState.instrumentation?.longTasksMs ?? [];
    return {
      id: scenario.id,
      repositoryScale: scenario.world.scale,
      source: scenario.world.world.source,
      route: opened.route,
      viewport: scenario.view.viewport,
      motion: scenario.view.reducedMotion ? "reduced" : "normal",
      mobile: scenario.view.mobile,
      timings: {
        fixedSettleMs: config.settleMs,
        fixedSettleFrames: config.settleFrames,
        canvasReadyMs: opened.canvasReadyMs,
        browserFrameIntervalsMs: distribution(frameIntervals),
        hoverProbeAttemptMs: readiness.hover.attemptTimingMs,
        cameraGesturePhaseMs: camera.dispatchTimingMs,
        postGestureFrameIntervalsMs: camera.postGestureFrameIntervalsMs,
        observedLongTasksMs: distribution(longTasks),
      },
      renderer: lastInspection.canvasState,
      instrumentation: lastInspection.pageState.instrumentation,
      hoverProbe: readiness.hover,
      cameraProbe: camera,
      walkProbe: {
        available: walk.available,
        ui: walk.ui,
        views: walk.probes,
      },
      screenshots: {
        overview: primary,
        overviewCanvas,
        exploration,
        views: {
          "orbit-overview": orbitOverview,
          "orbit-close": orbitClose,
          ...walk.captures,
        },
        ...(samePageReducedMotion ? { samePageReducedMotion } : {}),
      },
      automatedChecks: checks,
    };
  } catch (error) {
    if (deadlineExpired) {
      throw new Error(`Scenario exceeded ${config.scenarioTimeoutMs}ms.`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(deadline);
    await session.context.close().catch(() => undefined);
  }
}

function createVisualRows(scenario, automatedPassed, explicitReviews) {
  const applicableViewIds = new Set(applicableCaptureViews(scenario).map((view) => view.id));
  const definitions = [
    ...VISUAL_REVIEW_AREAS.map((area) => ({
      ...area,
      viewIds: area.viewIds.filter((viewId) => applicableViewIds.has(viewId)),
    })),
    ...applicableCaptureViews(scenario).map((view) => ({
      id: `view-${view.id}`,
      label: `${view.label} evidence: ${view.intent}`,
      viewIds: [view.id],
    })),
  ];
  return definitions.map(({ id, label, viewIds }) => {
    if (!automatedPassed) {
      return {
        scenarioId: scenario.id,
        id,
        label,
        viewIds,
        status: "REVISE",
        notes: "Automated capture prerequisites failed; this visual row cannot be approved.",
        reviewedBy: null,
        reviewedAt: null,
      };
    }

    const explicit = explicitReviews?.scenarios?.[scenario.id]?.rows?.[id];
    if (explicit) {
      if (!explicitReviews.reviewedBy || !explicitReviews.reviewedAt) {
        throw new Error("Explicit reviews require reviewedBy and reviewedAt at the document root.");
      }
      if (!Number.isFinite(Date.parse(explicitReviews.reviewedAt))) {
        throw new Error("Explicit review reviewedAt must be an ISO-compatible date string.");
      }
      if (!new Set(["PASS", "REVISE"]).has(explicit.status) || !explicit.notes?.trim()) {
        throw new Error(
          `Explicit review ${scenario.id}/${id} requires status PASS or REVISE and non-empty notes.`,
        );
      }
      return {
        scenarioId: scenario.id,
        id,
        label,
        viewIds,
        status: explicit.status,
        notes: explicit.notes.trim(),
        reviewedBy: explicitReviews.reviewedBy,
        reviewedAt: explicitReviews.reviewedAt,
      };
    }

    return {
      scenarioId: scenario.id,
      id,
      label,
      viewIds,
      status: "HUMAN_REVIEW",
      notes: "Automation captured evidence but did not make an aesthetic judgment.",
      reviewedBy: null,
      reviewedAt: null,
    };
  });
}

const argumentsList = process.argv.slice(2);
if (argumentsList.includes("--help")) {
  printHelp();
  process.exit(0);
}

const smoke = argumentsList.includes("--smoke");
const headed = argumentsList.includes("--headed");
const strictReview = argumentsList.includes("--strict-review");
const baseUrl = (
  optionValue(argumentsList, "--base-url") ??
  process.env.GAUNTLET_BASE_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");
const settleMs = positiveInteger(
  optionValue(argumentsList, "--settle-ms") ?? process.env.GAUNTLET_SETTLE_MS,
  smoke ? 1_600 : 4_500,
  "settle-ms",
);
const frameSamples = positiveInteger(
  optionValue(argumentsList, "--frame-samples") ?? process.env.GAUNTLET_FRAME_SAMPLES,
  smoke ? 24 : 180,
  "frame-samples",
);
const runId = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
const artifactDirectory = path.resolve(
  optionValue(argumentsList, "--output") ??
    process.env.GAUNTLET_ARTIFACT_DIR ??
    path.join(repositoryRoot, "artifacts", "visual-review", "gauntlet", runId),
);
const requestedScenarioIds = new Set(
  (optionValue(argumentsList, "--scenario") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const reviewFile = optionValue(argumentsList, "--reviews");
const explicitReviews = reviewFile
  ? JSON.parse(await readFile(path.resolve(reviewFile), "utf8"))
  : null;

const worlds = await Promise.all(WORLD_DEFINITIONS.map(readWorld));
const completeMatrix = worlds.flatMap((world) =>
  VIEW_DEFINITIONS.map((view) => ({ id: `${world.id}--${view.id}`, world, view })),
);
const scenarios =
  requestedScenarioIds.size === 0
    ? completeMatrix
    : completeMatrix.filter((scenario) => requestedScenarioIds.has(scenario.id));

if (scenarios.length === 0) {
  throw new Error(
    `No scenarios selected. Valid ids: ${completeMatrix.map((scenario) => scenario.id).join(", ")}`,
  );
}
const unknownScenarioIds = [...requestedScenarioIds].filter(
  (id) => !completeMatrix.some((scenario) => scenario.id === id),
);
if (unknownScenarioIds.length > 0) {
  throw new Error(`Unknown scenario ids: ${unknownScenarioIds.join(", ")}`);
}

await mkdir(artifactDirectory, { recursive: true });
const config = {
  artifactDirectory,
  baseUrl,
  cameraSettleMs: smoke ? 350 : 900,
  frameSamples,
  frameSampleWindowMs: smoke ? 3_000 : 8_000,
  hoverColumns: smoke ? 10 : 16,
  hoverDelayMs: smoke ? 12 : 24,
  hoverMaxAttempts: smoke ? 18 : 120,
  hoverRows: smoke ? 7 : 11,
  minimumCanvasScreenshotBytes: 12_000,
  modelResourceMinimum: 8,
  populationTimeoutMs: smoke ? 35_000 : 75_000,
  postGestureFrameSamples: smoke ? 12 : 60,
  reducedMotionStabilityGapMs: 2_000,
  // The previous single-overview scenario owned 75s/240s. Six named evidence
  // views now share one isolated WebGL context, so the owner deadline grows
  // without relaxing any readiness, renderer, resource, or interaction gate.
  scenarioTimeoutMs: smoke ? 240_000 : 480_000,
  navigationSettleFrames: 2,
  settleFrames: 4,
  settleMs,
  walkForestTravelMs: smoke ? 900 : 1_400,
  walkGestureSettleMs: smoke ? 350 : 650,
  walkSettleMs: smoke ? 1_200 : 2_400,
};

const browser = await chromium.launch({ headless: !headed });
const scenarioResults = [];
try {
  // A single owner runs each isolated page sequentially. WebGL contexts never
  // contend with parallel workers, and each context is closed before the next.
  for (const scenario of scenarios) {
    console.log(`RUN ${scenario.id}`);
    try {
      const result = await runScenario(browser, scenario, config);
      if (scenario.view.reducedMotion && result.screenshots.samePageReducedMotion) {
        const repeat = await captureRepeat(browser, scenario, config, `${scenario.id}--repeat.png`);
        result.screenshots.repeat = repeat.page;
        result.screenshots.repeatCanvas = repeat.canvas;
        const isolatedRepeatability = await compareScreenshots(
          browser,
          artifactDirectory,
          result.screenshots.overviewCanvas,
          repeat.canvas,
        );
        const samePageStability = await compareScreenshots(
          browser,
          artifactDirectory,
          result.screenshots.overviewCanvas,
          result.screenshots.samePageReducedMotion,
        );
        result.repeatability = {
          isolatedCanvas: isolatedRepeatability,
          samePage: samePageStability,
        };
        result.automatedChecks.push(
          automatedCheck("reduced-motion-same-page-canvas-stable", samePageStability.repeatable, {
            firstSha256: result.screenshots.overviewCanvas.sha256,
            secondSha256: result.screenshots.samePageReducedMotion.sha256,
            gapMs: config.reducedMotionStabilityGapMs,
            ...samePageStability,
          }),
          automatedCheck(
            "reduced-motion-isolated-canvas-repeatable",
            isolatedRepeatability.repeatable,
            {
              overviewCanvasSha256: result.screenshots.overviewCanvas.sha256,
              repeatCanvasSha256: repeat.canvas.sha256,
              ...isolatedRepeatability,
            },
          ),
        );
      } else if (!scenario.view.reducedMotion) {
        result.automatedChecks.push(
          informationalCheck(
            "normal-motion-screenshot-hash-only",
            "Hash recorded for provenance only; active Three.js motion is not expected to be pixel-identical.",
          ),
        );
      }
      scenarioResults.push(result);
    } catch (error) {
      scenarioResults.push({
        id: scenario.id,
        repositoryScale: scenario.world.scale,
        source: scenario.world.world.source,
        route: routeForWorld(scenario.world.world),
        viewport: scenario.view.viewport,
        motion: scenario.view.reducedMotion ? "reduced" : "normal",
        mobile: scenario.view.mobile,
        runError: error instanceof Error ? (error.stack ?? error.message) : String(error),
        automatedChecks: [
          automatedCheck(
            "scenario-completed",
            false,
            error instanceof Error ? error.message : String(error),
          ),
        ],
        screenshots: {},
      });
    }
  }
} finally {
  await browser.close();
}

const visualRows = [];
for (const scenario of scenarios) {
  const result = scenarioResults.find((candidate) => candidate.id === scenario.id);
  const automatedPassed =
    Boolean(result) && result.automatedChecks.every((check) => check.status !== "FAIL");
  visualRows.push(...createVisualRows(scenario, automatedPassed, explicitReviews));
}

const automatedFailures = scenarioResults.flatMap((scenario) =>
  scenario.automatedChecks
    .filter((check) => check.status === "FAIL")
    .map((check) => ({ scenarioId: scenario.id, checkId: check.id, details: check.details })),
);
const automatedVerdict = automatedFailures.length === 0 ? "PASS" : "FAIL";
const visualVerdict = visualRows.some((row) => row.status === "REVISE")
  ? "REVISE"
  : visualRows.some((row) => row.status === "HUMAN_REVIEW")
    ? "HUMAN_REVIEW"
    : "PASS";
const overallVerdict =
  automatedVerdict === "FAIL" ? "FAIL" : visualVerdict === "PASS" ? "PASS" : visualVerdict;

const report = {
  schema: SCORECARD_SCHEMA,
  generatedAt: new Date().toISOString(),
  run: {
    id: runId,
    mode: smoke ? "smoke" : "full",
    baseUrl,
    sequential: true,
    isolatedBrowserContextPerPage: true,
    artifactDirectory,
    selectedScenarioIds: scenarios.map((scenario) => scenario.id),
    captureViewIds: CAPTURE_VIEW_DEFINITIONS.map((view) => view.id),
    fixedSettleMs: settleMs,
    fixedSettleFrames: config.settleFrames,
    frameSamples,
  },
  fixtures: worlds.map((world) => ({
    id: world.id,
    scale: world.scale,
    path: world.fixture,
    sha256: world.fixtureSha256,
    repository: `${world.world.source.owner}/${world.world.source.repository}`,
    commitSha: world.world.source.commitSha,
  })),
  captureViews: CAPTURE_VIEW_DEFINITIONS,
  scenarios: scenarioResults,
  scorecard: {
    automatedVerdict,
    visualVerdict,
    overallVerdict,
    automatedFailures,
    visualRows,
  },
  interpretation: {
    screenshotHashes:
      "All hashes prove artifact identity. Only reduced-motion repeat captures assert exact repeatability.",
    normalMotion:
      "Normal-motion captures are inherently animated and are never judged by pixel equality.",
    visualReview:
      "Visual rows remain HUMAN_REVIEW or REVISE unless a named, dated reviewer supplies an explicit review file.",
    semanticCaptureIntent:
      "Capture view ids state the human review target. Automation proves capture and interaction mechanics only; a reviewer must REVISE any frame that does not visibly satisfy its named target.",
    performance:
      "Browser frame intervals measure event-loop responsiveness while the mounted scene runs; they are not GPU profiler timings.",
  },
};

const scorecardFile = path.join(artifactDirectory, "scorecard.json");
await writeFile(scorecardFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

for (const scenario of scenarioResults) {
  const verdict = scenario.automatedChecks.every((check) => check.status !== "FAIL")
    ? "PASS"
    : "FAIL";
  console.log(`${verdict} ${scenario.id}`);
}
console.log(`${overallVerdict} ${scorecardFile}`);
console.log(
  "Visual rows are not auto-approved. Review the PNG evidence and apply a named review file before claiming PASS.",
);

if (automatedVerdict === "FAIL" || (strictReview && overallVerdict !== "PASS")) {
  process.exitCode = 1;
}
