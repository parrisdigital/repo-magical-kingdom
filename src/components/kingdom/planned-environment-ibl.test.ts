import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  installPlannedEnvironmentIbl,
  PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT,
  type PlannedEnvironmentIblDependencies,
} from "./planned-environment-ibl";

function createLifecycleHarness() {
  let completeLoad: ((texture: THREE.DataTexture) => void) | undefined;
  let failLoad: ((error: unknown) => void) | undefined;
  const setDataType = vi.fn();
  const load = vi.fn(
    (
      _url: string,
      onLoad: (texture: THREE.DataTexture) => void,
      _onProgress?: (event: ProgressEvent) => void,
      onError?: (error: unknown) => void,
    ) => {
      completeLoad = onLoad;
      failLoad = onError;
    },
  );
  const sourceTexture = new THREE.DataTexture();
  const sourceDispose = vi.spyOn(sourceTexture, "dispose");
  const pmremTarget = new THREE.WebGLRenderTarget(4, 4);
  const targetDispose = vi.spyOn(pmremTarget, "dispose");
  const compileEquirectangularShader = vi.fn();
  const fromEquirectangular = vi.fn(() => pmremTarget);
  const generatorDispose = vi.fn();
  const createPmremGenerator = vi.fn(() => ({
    compileEquirectangularShader,
    fromEquirectangular,
    dispose: generatorDispose,
  }));
  const dependencies: PlannedEnvironmentIblDependencies = {
    createHdrLoader: () => ({ setDataType, load }),
    createPmremGenerator,
  };

  return {
    dependencies,
    setDataType,
    load,
    sourceTexture,
    sourceDispose,
    pmremTarget,
    targetDispose,
    createPmremGenerator,
    compileEquirectangularShader,
    fromEquirectangular,
    generatorDispose,
    completeLoad: () => {
      if (!completeLoad) throw new Error("HDR loader did not start");
      completeLoad(sourceTexture);
    },
    failLoad: () => {
      if (!failLoad) throw new Error("HDR loader did not start");
      failLoad(new Error("expected test failure"));
    },
  };
}

describe("planned environment IBL lifecycle", () => {
  it("converts the high-tier HDR to PMREM, owns only environment, and disposes exactly once", () => {
    const harness = createLifecycleHarness();
    const renderer = {} as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const background = new THREE.Color("#88aacc");
    const previousEnvironment = new THREE.Texture();
    scene.background = background;
    scene.environment = previousEnvironment;
    const invalidate = vi.fn();

    const cleanup = installPlannedEnvironmentIbl({
      renderer,
      scene,
      invalidate,
      dependencies: harness.dependencies,
    });

    expect(harness.setDataType).toHaveBeenCalledWith(THREE.HalfFloatType);
    expect(harness.load).toHaveBeenCalledWith(
      PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT.url,
      expect.any(Function),
      undefined,
      expect.any(Function),
    );
    expect(scene.environment).toBe(previousEnvironment);
    harness.completeLoad();

    expect(harness.sourceTexture.mapping).toBe(THREE.EquirectangularReflectionMapping);
    expect(harness.sourceTexture.colorSpace).toBe(THREE.LinearSRGBColorSpace);
    expect(harness.createPmremGenerator).toHaveBeenCalledWith(renderer);
    expect(harness.compileEquirectangularShader).toHaveBeenCalledOnce();
    expect(harness.fromEquirectangular).toHaveBeenCalledWith(harness.sourceTexture);
    expect(harness.generatorDispose).toHaveBeenCalledOnce();
    expect(harness.sourceDispose).toHaveBeenCalledOnce();
    expect(scene.environment).toBe(harness.pmremTarget.texture);
    expect(scene.background).toBe(background);
    expect(invalidate).toHaveBeenCalledOnce();

    cleanup();
    cleanup();

    expect(scene.environment).toBe(previousEnvironment);
    expect(scene.background).toBe(background);
    expect(harness.targetDispose).toHaveBeenCalledOnce();
    expect(harness.sourceDispose).toHaveBeenCalledOnce();
    expect(harness.generatorDispose).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("disposes a late source without allocating PMREM after the high tier unmounts", () => {
    const harness = createLifecycleHarness();
    const scene = new THREE.Scene();
    const invalidate = vi.fn();
    const cleanup = installPlannedEnvironmentIbl({
      renderer: {} as THREE.WebGLRenderer,
      scene,
      invalidate,
      dependencies: harness.dependencies,
    });

    cleanup();
    harness.completeLoad();

    expect(harness.sourceDispose).toHaveBeenCalledOnce();
    expect(harness.createPmremGenerator).not.toHaveBeenCalled();
    expect(harness.targetDispose).not.toHaveBeenCalled();
    expect(scene.environment).toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("does not overwrite a newer environment owner during cleanup or on load failure", () => {
    const harness = createLifecycleHarness();
    const scene = new THREE.Scene();
    const previousEnvironment = new THREE.Texture();
    const newerEnvironment = new THREE.Texture();
    scene.environment = previousEnvironment;
    const invalidate = vi.fn();
    const cleanup = installPlannedEnvironmentIbl({
      renderer: {} as THREE.WebGLRenderer,
      scene,
      invalidate,
      dependencies: harness.dependencies,
    });

    harness.completeLoad();
    scene.environment = newerEnvironment;
    cleanup();

    expect(scene.environment).toBe(newerEnvironment);
    expect(harness.targetDispose).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledTimes(2);

    const failed = createLifecycleHarness();
    const failedInvalidate = vi.fn();
    installPlannedEnvironmentIbl({
      renderer: {} as THREE.WebGLRenderer,
      scene,
      invalidate: failedInvalidate,
      dependencies: failed.dependencies,
    });
    failed.failLoad();
    expect(failed.createPmremGenerator).not.toHaveBeenCalled();
    expect(scene.environment).toBe(newerEnvironment);
    expect(failedInvalidate).not.toHaveBeenCalled();
  });
});
