import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const artifactDirectory = path.resolve(
  process.env.VISUAL_REVIEW_ARTIFACT_DIR ?? path.join(repositoryRoot, "artifacts", "visual-review"),
);
const baseUrl = (process.env.VISUAL_REVIEW_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const reviewPath = "/visual-review?season=spring&clean=1";
const settleMilliseconds = Number(process.env.VISUAL_REVIEW_SETTLE_MS ?? 6500);
const requestedCaptureIds = new Set(
  (process.env.VISUAL_REVIEW_CAPTURE_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

const allCaptures = [
  {
    id: "desktop-overview",
    viewport: { width: 1440, height: 900 },
    explore: false,
  },
  {
    id: "mobile-overview",
    viewport: { width: 390, height: 844 },
    explore: false,
  },
  {
    id: "desktop-exploration",
    viewport: { width: 1440, height: 900 },
    explore: true,
  },
];
const captures =
  requestedCaptureIds.size === 0
    ? allCaptures
    : allCaptures.filter((capture) => requestedCaptureIds.has(capture.id));

if (captures.length === 0) {
  throw new Error(
    `VISUAL_REVIEW_CAPTURE_IDS did not match: ${allCaptures
      .map((capture) => capture.id)
      .join(", ")}`,
  );
}

function assertion(name, passed, details) {
  return { name, passed, details };
}

async function waitForScene(page) {
  const canvas = page.locator("canvas").first();
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  // Next development mode keeps HMR traffic open. A fixed post-canvas settle
  // makes the capture sequence repeatable without treating HMR idleness as an
  // art-readiness signal.
  await page.waitForTimeout(settleMilliseconds);
  return canvas;
}

async function inspectPage(page, canvas, browserFailures) {
  const canvasState = await canvas.evaluate((element) => {
    const target = /** @type {HTMLCanvasElement} */ (element);
    const context =
      target.getContext("webgl2") ??
      target.getContext("webgl") ??
      target.getContext("experimental-webgl");
    const webgl =
      context && "isContextLost" in context
        ? /** @type {WebGLRenderingContext | WebGL2RenderingContext} */ (context)
        : null;
    const bounds = target.getBoundingClientRect();

    return {
      visible: bounds.width > 0 && bounds.height > 0,
      cssWidth: bounds.width,
      cssHeight: bounds.height,
      pixelWidth: target.width,
      pixelHeight: target.height,
      hasWebGl: Boolean(webgl),
      contextLost: webgl?.isContextLost() ?? null,
      drawingBufferWidth: webgl?.drawingBufferWidth ?? 0,
      drawingBufferHeight: webgl?.drawingBufferHeight ?? 0,
      renderer: webgl ? String(webgl.getParameter(webgl.RENDERER)) : null,
      version: webgl ? String(webgl.getParameter(webgl.VERSION)) : null,
    };
  });

  const layoutState = await page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const root = document.documentElement;
    const body = document.body;
    const overflow = {
      documentWidth: Math.max(root.scrollWidth, body.scrollWidth),
      documentHeight: Math.max(root.scrollHeight, body.scrollHeight),
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    };

    const giantLabels = [...document.querySelectorAll("body *")]
      .filter((element) => {
        const directText = [...element.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? "")
          .join(" ")
          .trim();
        if (!directText) return false;
        const style = window.getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0 ||
          bounds.width <= 0 ||
          bounds.height <= 0
        ) {
          return false;
        }

        const fontSize = Number.parseFloat(style.fontSize);
        const coversMostOfView =
          bounds.width > viewport.width * 0.72 || bounds.height > viewport.height * 0.32;
        const exceptionallyLargeType = fontSize > Math.max(72, viewport.width * 0.12);
        return coversMostOfView && exceptionallyLargeType;
      })
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? "").trim().slice(0, 120),
          fontSize: style.fontSize,
          width: Math.round(bounds.width),
          height: Math.round(bounds.height),
        };
      });

    return { overflow, giantLabels };
  });

  const assertions = [
    assertion("canvas is visible and sized", canvasState.visible, canvasState),
    assertion(
      "WebGL context is live",
      canvasState.hasWebGl && canvasState.contextLost === false,
      canvasState,
    ),
    assertion(
      "WebGL drawing buffer is non-empty",
      canvasState.drawingBufferWidth > 0 && canvasState.drawingBufferHeight > 0,
      canvasState,
    ),
    assertion(
      "no page or console errors",
      browserFailures.pageErrors.length === 0 && browserFailures.consoleErrors.length === 0,
      browserFailures,
    ),
    assertion(
      "no document overflow",
      layoutState.overflow.documentWidth <= layoutState.overflow.viewportWidth + 1 &&
        layoutState.overflow.documentHeight <= layoutState.overflow.viewportHeight + 1,
      layoutState.overflow,
    ),
    assertion(
      "no giant DOM labels obscure the world",
      layoutState.giantLabels.length === 0,
      layoutState.giantLabels,
    ),
  ];

  return { canvasState, layoutState, assertions };
}

async function moveToExplorationView(page, canvas) {
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Cannot move the exploration camera: canvas has no bounds.");

  const startX = bounds.x + bounds.width * 0.72;
  const startY = bounds.y + bounds.height * 0.58;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - bounds.width * 0.19, startY - bounds.height * 0.08, {
    steps: 16,
  });
  await page.mouse.up();
  await page.mouse.wheel(0, -1800);
  await page.waitForTimeout(2200);
}

async function captureScene(browser, capture) {
  const context = await browser.newContext({
    viewport: capture.viewport,
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const browserFailures = { consoleErrors: [], pageErrors: [] };
  page.on("console", (message) => {
    if (message.type() === "error") browserFailures.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserFailures.pageErrors.push(error.message));

  try {
    const response = await page.goto(`${baseUrl}${reviewPath}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    if (!response?.ok()) {
      throw new Error(`Visual-review route returned HTTP ${response?.status() ?? "no response"}.`);
    }
    await page.addStyleTag({
      content: "nextjs-portal { display: none !important; }",
    });

    const canvas = await waitForScene(page);
    if (capture.explore) await moveToExplorationView(page, canvas);
    const inspection = await inspectPage(page, canvas, browserFailures);

    const screenshotFile = path.join(artifactDirectory, `${capture.id}-spring.png`);
    const screenshot = await page.screenshot({ path: screenshotFile, animations: "disabled" });
    return {
      id: capture.id,
      route: reviewPath,
      viewport: capture.viewport,
      screenshotFile: path.relative(repositoryRoot, screenshotFile),
      screenshotSha256: createHash("sha256").update(screenshot).digest("hex"),
      ...inspection,
    };
  } finally {
    await context.close();
  }
}

await mkdir(artifactDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
const runErrors = [];

try {
  for (const capture of captures) {
    try {
      const result = await captureScene(browser, capture);
      results.push(result);
      const failures = result.assertions.filter((item) => !item.passed);
      if (failures.length > 0) {
        runErrors.push(
          `${capture.id} failed automated sanity checks:\n${failures
            .map((item) => `${item.name}: ${JSON.stringify(item.details)}`)
            .join("\n")}`,
        );
      }
    } catch (error) {
      runErrors.push(`${capture.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  await browser.close();
}

const runError = runErrors.length > 0 ? runErrors.join("\n\n") : null;

const report = {
  baseUrl,
  route: reviewPath,
  season: "spring",
  captures: results,
  automatedVerdict: runError ? "FAIL" : "PASS",
  runError,
  note: "PASS covers runtime and layout sanity only. Terrain composition, scattering, materials, lighting, life, and HUD restraint require human image inspection.",
};
const reportFile = path.join(artifactDirectory, "sanity-report.json");
await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

for (const result of results) {
  const captureVerdict = result.assertions.every((item) => item.passed) ? "PASS" : "FAIL";
  console.log(`${captureVerdict} ${result.id}: ${result.screenshotFile}`);
}
console.log(
  `${report.automatedVerdict} automated sanity: ${path.relative(repositoryRoot, reportFile)}`,
);
console.log(report.note);

if (runError) {
  console.error(runError);
  process.exitCode = 1;
}
