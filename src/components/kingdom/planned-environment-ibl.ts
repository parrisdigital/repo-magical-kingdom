import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

export const PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT = Object.freeze({
  url: "/assets/world/environment/polyhaven/kloofendal_overcast_puresky_1k.hdr",
  sourceBytes: 1_174_053,
  sourceSha256: "5f98aa01d43a49cd899299751a978b3e5559a76300198b5dd2d9c68ecc4ad130",
  width: 1_024,
  height: 512,
  usage: "reflection-and-ibl-only" as const,
  backgroundAllowed: false as const,
  loader: "HDRLoader" as const,
  loaderDataType: "HalfFloatType" as const,
  colorSpace: "LinearSRGBColorSpace" as const,
  mapping: "EquirectangularReflectionMapping" as const,
  retainedPmremBytes: 6 * 1_024 * 1_024,
});

type PlannedEnvironmentHdrLoader = Readonly<{
  setDataType: (type: THREE.TextureDataType) => unknown;
  load: (
    url: string,
    onLoad: (texture: THREE.DataTexture) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ) => void;
}>;

type PlannedEnvironmentPmremGenerator = Readonly<{
  compileEquirectangularShader: () => void;
  fromEquirectangular: (texture: THREE.Texture) => THREE.WebGLRenderTarget;
  dispose: () => void;
}>;

export type PlannedEnvironmentIblDependencies = Readonly<{
  createHdrLoader: () => PlannedEnvironmentHdrLoader;
  createPmremGenerator: (renderer: THREE.WebGLRenderer) => PlannedEnvironmentPmremGenerator;
}>;

export type InstallPlannedEnvironmentIblOptions = Readonly<{
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  invalidate: () => void;
  dependencies?: Partial<PlannedEnvironmentIblDependencies>;
}>;

const DEFAULT_DEPENDENCIES: PlannedEnvironmentIblDependencies = {
  createHdrLoader: () => new HDRLoader(),
  createPmremGenerator: (renderer) => new THREE.PMREMGenerator(renderer),
};

/**
 * Starts one high-tier HDR load and returns an idempotent owner cleanup.
 * The visible background is deliberately never read or written here.
 */
export function installPlannedEnvironmentIbl({
  renderer,
  scene,
  invalidate,
  dependencies,
}: InstallPlannedEnvironmentIblOptions): () => void {
  const createHdrLoader = dependencies?.createHdrLoader ?? DEFAULT_DEPENDENCIES.createHdrLoader;
  const createPmremGenerator =
    dependencies?.createPmremGenerator ?? DEFAULT_DEPENDENCIES.createPmremGenerator;
  const disposedTextures = new WeakSet<THREE.Texture>();
  let active = true;
  let cleaned = false;
  let installed = false;
  let previousEnvironment: THREE.Texture | null = null;
  let pmremTarget: THREE.WebGLRenderTarget | null = null;

  const disposeTextureOnce = (texture: THREE.Texture) => {
    if (disposedTextures.has(texture)) return;
    disposedTextures.add(texture);
    texture.dispose();
  };

  try {
    const loader = createHdrLoader();
    loader.setDataType(THREE.HalfFloatType);
    loader.load(
      PLANNED_ENVIRONMENT_IBL_ASSET_CONTRACT.url,
      (sourceTexture) => {
        if (!active) {
          disposeTextureOnce(sourceTexture);
          return;
        }

        sourceTexture.mapping = THREE.EquirectangularReflectionMapping;
        sourceTexture.colorSpace = THREE.LinearSRGBColorSpace;
        let generator: PlannedEnvironmentPmremGenerator | null = null;
        let nextTarget: THREE.WebGLRenderTarget | null = null;
        try {
          generator = createPmremGenerator(renderer);
          generator.compileEquirectangularShader();
          nextTarget = generator.fromEquirectangular(sourceTexture);
        } catch {
          nextTarget?.dispose();
          return;
        } finally {
          generator?.dispose();
          disposeTextureOnce(sourceTexture);
        }

        if (!active) {
          nextTarget.dispose();
          return;
        }

        previousEnvironment = scene.environment;
        pmremTarget = nextTarget;
        scene.environment = nextTarget.texture;
        installed = true;
        invalidate();
      },
      undefined,
      () => {
        // The analytic sky and light rig remain the complete fallback.
      },
    );
  } catch {
    // Loader construction/request failures retain the analytic fallback.
  }

  return () => {
    if (cleaned) return;
    cleaned = true;
    active = false;
    if (!pmremTarget) return;

    if (installed && scene.environment === pmremTarget.texture) {
      scene.environment = previousEnvironment;
    }
    pmremTarget.dispose();
    pmremTarget = null;
    invalidate();
  };
}
