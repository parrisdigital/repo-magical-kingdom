import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { settlePointerLockRequest } from "./kingdom-walk-controls";

const WALK_CONTROLS_SOURCE = readFileSync(
  new URL("./kingdom-walk-controls.tsx", import.meta.url),
  "utf8",
);
const SCENE_SOURCE = readFileSync(new URL("./kingdom-scene-planned.tsx", import.meta.url), "utf8");
const RUNTIME_MODEL_SOURCE = readFileSync(
  new URL("./planned-walk-runtime-model.ts", import.meta.url),
  "utf8",
);

describe("walk pointer-lock boundary", () => {
  it("consumes one Walk-only canonical navigation grid and living spawn", () => {
    expect(SCENE_SOURCE).toContain("usePreparedPlannedWalkRuntime(walkRuntimeInput)");
    expect(RUNTIME_MODEL_SOURCE).toContain("createWalkNavigationGrid(plan, obstacles, landUse)");
    expect(RUNTIME_MODEL_SOURCE).toContain("findLivingWalkSpawn(");
    expect(WALK_CONTROLS_SOURCE).toContain(
      "findWalkSpawn(plan, obstacles, landUse, navigationGrid)",
    );
    expect(WALK_CONTROLS_SOURCE).not.toContain("createWalkNavigationGrid(");
    expect(WALK_CONTROLS_SOURCE).not.toContain("findLivingWalkSpawn(");
    expect(SCENE_SOURCE).not.toContain("createWalkNavigationGrid(");
    expect(SCENE_SOURCE).not.toContain("findLivingWalkSpawn(");
    expect(RUNTIME_MODEL_SOURCE.match(/createWalkNavigationGrid\(/gu)).toHaveLength(1);
    expect(RUNTIME_MODEL_SOURCE.match(/findLivingWalkSpawn\(/gu)).toHaveLength(1);
  });

  it("treats unsupported, synchronous, and asynchronous denials as an unlocked result", async () => {
    await expect(settlePointerLockRequest(undefined)).resolves.toBe(false);
    await expect(
      settlePointerLockRequest(() => {
        throw new DOMException("Pointer lock denied", "NotAllowedError");
      }),
    ).resolves.toBe(false);
    await expect(
      settlePointerLockRequest(() => Promise.reject(new Error("automation denied pointer lock"))),
    ).resolves.toBe(false);
  });

  it("accepts both legacy void and modern promise-returning requests", async () => {
    const legacyRequest = vi.fn(() => undefined);
    const modernRequest = vi.fn(() => Promise.resolve());

    await expect(settlePointerLockRequest(legacyRequest)).resolves.toBe(true);
    await expect(settlePointerLockRequest(modernRequest)).resolves.toBe(true);
    expect(legacyRequest).toHaveBeenCalledOnce();
    expect(modernRequest).toHaveBeenCalledOnce();
  });
});
