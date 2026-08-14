import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
    id: "vast-nextjs",
    scale: "vast",
    fixture: "src/components/kingdom/test-fixtures/nextjs-large-world.json",
    defaultWorldTheme: "kingdom-valley",
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
  ["world-composition", "World composition and repository-scale read"],
  ["terrain-materials", "Terrain, grass, rock, shoreline, and water coherence"],
  ["settlements", "Settlement hierarchy, spacing, routes, and negative space"],
  ["ecology", "Tree, vegetation, wildlife, and prop distribution"],
  ["life-motion", "Grounded, varied, and legible living motion"],
  ["season", "Seasonal assets, light, atmosphere, and visual consistency"],
  ["hud", "HUD restraint, label legibility, and world dominance"],
  ["framing", "Desktop or mobile framing, navigation, and exploration clarity"],
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

async function writeScreenshot(page, artifactDirectory, filename) {
  const file = path.join(artifactDirectory, filename);
  const bytes = await page.screenshot({
    path: file,
    animations: "disabled",
    caret: "hide",
    fullPage: false,
  });
  return {
    file: relativeArtifact(artifactDirectory, file),
    sha256: hash(bytes),
    bytes: bytes.byteLength,
  };
}

async function writeCanvasScreenshot(canvas, artifactDirectory, filename) {
  const file = path.join(artifactDirectory, filename);
  let bytes;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await canvas.waitFor({ state: "visible", timeout: 10_000 });
      bytes = await canvas.screenshot({ path: file, animations: "disabled", caret: "hide" });
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
  const world = {
    ...fixture,
    // The Repository City capture predates the required worldTheme field. The
    // harness supplies the same deterministic default in memory and never
    // rewrites the historical fixture.
    worldTheme: fixture.worldTheme ?? definition.defaultWorldTheme,
  };

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
  await page.evaluate(
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
  await page.waitForFunction(() => {
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
  });
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector("canvas");
    return element instanceof HTMLCanvasElement && element.width > 0 && element.height > 0;
  });
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

async function inspectRuntime(page, canvas, failures) {
  const canvasState = await canvas.evaluate((element) => {
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
  });

  const pageState = await page.evaluate(() => {
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
  });

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
  const bounds = await canvas.boundingBox();
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
  const bounds = await canvas.boundingBox();
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

  const before = await canvas.screenshot({ animations: "disabled" });
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
  const after = await canvas.screenshot({ animations: "disabled" });
  const beforeSha256 = hash(before);
  const afterSha256 = hash(after);

  return {
    attempted: true,
    input: scenario.view.mobile ? "touch-compatible pointer drag + wheel" : "mouse drag + wheel",
    beforeSha256,
    afterSha256,
    frameChanged: beforeSha256 !== afterSha256,
    dispatchTimingMs: distribution(dispatchTimings),
    postGestureFrameIntervalsMs: distribution(postGestureFrameIntervals),
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
  const contentProbe = await canvas.screenshot({ animations: "disabled" });
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
    console.log(`  CANVAS ${scenario.id} ${opened.canvasReadyMs}ms`);
    const initialInspection = await inspectRuntime(session.page, opened.canvas, session.failures);
    const readiness = await probePopulatedScene(
      session.page,
      opened.canvas,
      session.failures,
      config,
    );
    console.log(
      `  POPULATED ${scenario.id} models=${readiness.modelResourceCount} hover=${readiness.hover.found}`,
    );
    const prerequisiteChecks = [...initialInspection.checks, ...readiness.checks];
    const hoverCheck = automatedCheck(
      "canvas-hover-label-discovered",
      readiness.hover.attempted && readiness.hover.found,
      readiness.hover,
    );
    const primary = await writeScreenshot(
      session.page,
      config.artifactDirectory,
      `${scenario.id}--overview.png`,
    );
    console.log(`  CAPTURED ${scenario.id} ${primary.sha256.slice(0, 12)}`);
    const overviewCanvas = await writeCanvasScreenshot(
      opened.canvas,
      config.artifactDirectory,
      `${scenario.id}--overview-canvas.png`,
    );
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
        screenshots: { overview: primary, overviewCanvas },
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
    const camera = await probeCamera(session.page, opened.canvas, scenario, config);
    const exploration = await writeScreenshot(
      session.page,
      config.artifactDirectory,
      `${scenario.id}--exploration.png`,
    );
    const finalInspection = await inspectRuntime(session.page, opened.canvas, session.failures);

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
    ];

    const longTasks = finalInspection.pageState.instrumentation?.longTasksMs ?? [];
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
      renderer: finalInspection.canvasState,
      instrumentation: finalInspection.pageState.instrumentation,
      hoverProbe: readiness.hover,
      cameraProbe: camera,
      screenshots: {
        overview: primary,
        overviewCanvas,
        exploration,
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
  return VISUAL_REVIEW_AREAS.map(([id, label]) => {
    if (!automatedPassed) {
      return {
        scenarioId: scenario.id,
        id,
        label,
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
  scenarioTimeoutMs: smoke ? 75_000 : 240_000,
  settleFrames: 4,
  settleMs,
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
