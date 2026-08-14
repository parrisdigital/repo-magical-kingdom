import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { legacyKingdomWorldSchema } from "@/lib/kingdom/schemas";
import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { createRepoSemanticGraphV2 } from "./repo-semantic-graph-v2";

import {
  assertTerrainArtifactV2Integrity,
  createTerrainArtifactV2,
  createTerrainArtifactV2BufferChecksums,
  createTerrainArtifactV2ChunkMeshData,
  createTerrainArtifactV2PreviewMeshData,
  createTerrainArtifactV2WaterMeshData,
  isTerrainArtifactV2Navigable,
  sampleTerrainArtifactV2Collision,
  sampleTerrainArtifactV2Height,
  sampleTerrainArtifactV2MaterialWeights,
  TERRAIN_ARTIFACT_V2_CHUNK_LODS,
  TERRAIN_ARTIFACT_V2_GENERATOR_REVISION,
  TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND,
  TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS,
  TERRAIN_ARTIFACT_V2_MATERIAL_CHANNELS,
  TERRAIN_ARTIFACT_V2_RESOLUTION,
  TERRAIN_ARTIFACT_V2_SCHEMA,
  TERRAIN_ARTIFACT_V2_WATER_TOPOLOGY_SAMPLE_STEP,
  type TerrainArtifactV2,
  type TerrainArtifactV2WaterMeshData,
} from "./terrain-artifact-v2";
import { createWorldDesignSpecV3 } from "./world-design-spec-v3";

const SOURCE = readFileSync(new URL("./terrain-artifact-v2.ts", import.meta.url), "utf8");
const SAMPLE_COUNT = 513 * 513;
const MATERIAL_CHANNEL_COUNT = TERRAIN_ARTIFACT_V2_MATERIAL_CHANNELS.length;
const GOLD_WORLD_FILES = [
  "../../components/kingdom/test-fixtures/repository-city-live-world.json",
  "../../components/kingdom/test-fixtures/magical-kingdom-medium-world.json",
  "../../components/kingdom/test-fixtures/nextjs-large-world.json",
] as const;

function loadGoldWorld(file: string): KingdomWorld {
  const candidate = JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8"));
  return legacyKingdomWorldSchema.parse({
    ...candidate,
    worldTheme: candidate.worldTheme ?? "enchanted-forest",
  });
}

function worldPointForIndex(artifact: TerrainArtifactV2, index: number) {
  const gridX = index % artifact.resolution;
  const gridZ = Math.floor(index / artifact.resolution);
  return {
    x: artifact.envelope.minX + (gridX / (artifact.resolution - 1)) * artifact.envelope.width,
    z: artifact.envelope.minZ + (gridZ / (artifact.resolution - 1)) * artifact.envelope.depth,
  };
}

function waterMeshComponentCount(mesh: TerrainArtifactV2WaterMeshData): number {
  const parent = new Int32Array(mesh.vertexCount);
  parent.fill(-1);
  const find = (vertex: number): number => {
    let root = vertex;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[vertex] !== vertex) {
      const next = parent[vertex]!;
      parent[vertex] = root;
      vertex = next;
    }
    return root;
  };
  const include = (vertex: number) => {
    if (parent[vertex]! < 0) parent[vertex] = vertex;
  };
  const unite = (first: number, second: number) => {
    include(first);
    include(second);
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parent[secondRoot] = firstRoot;
  };
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const first = mesh.indices[index]!;
    const second = mesh.indices[index + 1]!;
    const third = mesh.indices[index + 2]!;
    unite(first, second);
    unite(second, third);
  }
  const roots = new Set<number>();
  for (let vertex = 0; vertex < parent.length; vertex += 1) {
    if (parent[vertex]! >= 0) roots.add(find(vertex));
  }
  return roots.size;
}

function artifactInput(season: "spring" | "summer" | "autumn" | "winter" = "summer") {
  const world = createDemoKingdom(season, "enchanted-forest");
  const plan = createWorldPlan(world);
  const design = createWorldDesignSpecV3(world, plan, createRepoSemanticGraphV2(world));
  return { world, plan, design };
}

describe("TerrainArtifactV2", () => {
  let artifact: TerrainArtifactV2;

  beforeAll(() => {
    artifact = createTerrainArtifactV2(artifactInput());
  });

  it("pins the 513-square manifest-facing artifact and exact allocation", () => {
    expect(artifact).toMatchObject({
      schema: TERRAIN_ARTIFACT_V2_SCHEMA,
      resolution: TERRAIN_ARTIFACT_V2_RESOLUTION,
      chunkLods: TERRAIN_ARTIFACT_V2_CHUNK_LODS,
      structureKey: expect.any(String),
      key: expect.stringMatching(/^terrain-artifact-v2:[0-9a-f]{16}$/u),
    });
    expect(artifact.chunkLods).toEqual([129, 65, 33]);
    expect(artifact.chunks).toHaveLength(16);
    expect(artifact.heightField).toHaveLength(SAMPLE_COUNT);
    expect(artifact.materialWeights).toHaveLength(SAMPLE_COUNT * MATERIAL_CHANNEL_COUNT);
    expect(artifact.waterDepth).toHaveLength(SAMPLE_COUNT);
    expect(artifact.flow.x).toHaveLength(SAMPLE_COUNT);
    expect(artifact.flow.z).toHaveLength(SAMPLE_COUNT);
    expect(artifact.wetness).toHaveLength(SAMPLE_COUNT);
    expect(artifact.metrics).toEqual({
      sampleCount: SAMPLE_COUNT,
      allocatedBytes: 8_158_239,
      minimumHeight: -7.653608,
      maximumHeight: 25.910984,
      meanHeight: -0.306424,
      maximumSlopeDegrees: 86.355008,
      drySamples: 159_107,
      riverSamples: 4_198,
      lakeSamples: 4_318,
      oceanSamples: 95_546,
      operatorCount: 7,
      checksums: {
        height: "e2e44373",
        materialWeights: "7ca0005c",
        landMask: "7b52129e",
        hydrology: "e6589586",
        combined: "9e04a907",
      },
    });
    expect(
      artifact.metrics.drySamples +
        artifact.metrics.riverSamples +
        artifact.metrics.lakeSamples +
        artifact.metrics.oceanSamples,
    ).toBe(SAMPLE_COUNT);
  });

  it("runs all required multi-scale geomorphic operators without appearance input", () => {
    expect(artifact.operators.map(({ kind }) => kind)).toEqual([
      "ridge",
      "basin",
      "terrace",
      "river-valley",
      "cliff",
      "erosion-channel",
      "irregular-shoreline",
    ]);
    expect(new Set(artifact.operators.map(({ scaleMeters }) => scaleMeters)).size).toBe(7);
    expect(artifact.metrics.maximumHeight - artifact.metrics.minimumHeight).toBeGreaterThan(30);
    expect(artifact.metrics.maximumSlopeDegrees).toBeGreaterThan(45);
    expect(artifact.metrics.riverSamples).toBeGreaterThan(100);
    expect(artifact.metrics.lakeSamples).toBeGreaterThan(1_000);
    expect(artifact.metrics.oceanSamples).toBeGreaterThan(10_000);
    expect(SOURCE).not.toMatch(/appearance|KingdomSeason|worldTheme/u);
  });

  it("is deterministic, season invariant, structured-cloneable, and worker compatible", () => {
    const spring = createTerrainArtifactV2(artifactInput("spring"));
    const winter = createTerrainArtifactV2(artifactInput("winter"));
    const repeated = createTerrainArtifactV2(artifactInput("spring"));

    expect(spring.structureKey).toBe(winter.structureKey);
    expect(spring.metrics.checksums).toEqual(winter.metrics.checksums);
    expect(repeated.metrics.checksums).toEqual(spring.metrics.checksums);
    expect(Array.from(winter.heightField.slice(0, 4_096))).toEqual(
      Array.from(spring.heightField.slice(0, 4_096)),
    );
    const cloned = structuredClone(spring);
    expect(cloned.heightField).toBeInstanceOf(Float32Array);
    expect(cloned.metrics.checksums).toEqual(spring.metrics.checksums);
    expect(() => assertTerrainArtifactV2Integrity(cloned)).not.toThrow();
    expect(SOURCE).not.toMatch(/from ["'](?:three|react|@react-three\/fiber)/u);
    expect(SOURCE).not.toMatch(/\b(?:window|document|navigator)\b/u);
  });

  it("keeps terrain and hydrology fixed while theme changes ecological masks", () => {
    const valleyWorld = createDemoKingdom("summer", "kingdom-valley");
    const forestWorld = createDemoKingdom("summer", "enchanted-forest");
    const valleyPlan = createWorldPlan(valleyWorld);
    const forestPlan = createWorldPlan(forestWorld);
    const valleyDesign = createWorldDesignSpecV3(
      valleyWorld,
      valleyPlan,
      createRepoSemanticGraphV2(valleyWorld),
    );
    const forestDesign = createWorldDesignSpecV3(
      forestWorld,
      forestPlan,
      createRepoSemanticGraphV2(forestWorld),
    );
    const valley = createTerrainArtifactV2({ plan: valleyPlan, design: valleyDesign });
    const forest = createTerrainArtifactV2({ plan: forestPlan, design: forestDesign });

    expect(forestPlan.terrainKey).toBe(valleyPlan.terrainKey);
    expect(forestDesign.ecology).not.toEqual(valleyDesign.ecology);
    expect(forestDesign.terrain.morphology).toEqual(valleyDesign.terrain.morphology);
    expect(forest.metrics.checksums).toEqual(valley.metrics.checksums);
    expect(forest.heightField).toEqual(valley.heightField);
    expect(forest.hydrology.kind).toEqual(valley.hydrology.kind);
    expect(forest.hydrology.surfaceHeight).toEqual(valley.hydrology.surfaceHeight);
  });

  it("rejects mutated or structurally invalid worker and cache payloads before consumption", () => {
    const baseline = structuredClone(artifact);
    expect(() => assertTerrainArtifactV2Integrity(baseline)).not.toThrow();

    const mutations: ReadonlyArray<
      Readonly<{
        label: string;
        mutate: (candidate: TerrainArtifactV2) => void;
      }>
    > = [
      {
        label: "height",
        mutate: (candidate) => {
          candidate.heightField[0] = candidate.heightField[0]! + 0.25;
        },
      },
      {
        label: "material weights",
        mutate: (candidate) => {
          candidate.materialWeights[0] = candidate.materialWeights[0]! ^ 1;
        },
      },
      {
        label: "land mask",
        mutate: (candidate) => {
          candidate.landMask[0] = candidate.landMask[0]! ^ 1;
        },
      },
      {
        label: "water depth",
        mutate: (candidate) => {
          candidate.waterDepth[0] = candidate.waterDepth[0]! + 0.25;
        },
      },
      {
        label: "flow x",
        mutate: (candidate) => {
          candidate.flow.x[0] = candidate.flow.x[0]! + 0.25;
        },
      },
      {
        label: "flow z",
        mutate: (candidate) => {
          candidate.flow.z[0] = candidate.flow.z[0]! + 0.25;
        },
      },
      {
        label: "wetness",
        mutate: (candidate) => {
          candidate.wetness[0] = candidate.wetness[0]! ^ 1;
        },
      },
      {
        label: "hydrology kind",
        mutate: (candidate) => {
          candidate.hydrology.kind[0] = 9;
        },
      },
      {
        label: "surface height",
        mutate: (candidate) => {
          const wetIndex = candidate.hydrology.kind.findIndex(
            (kind) => kind !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry,
          );
          candidate.hydrology.surfaceHeight[wetIndex] = Number.NaN;
        },
      },
    ];

    for (const mutation of mutations) {
      const candidate = structuredClone(artifact);
      mutation.mutate(candidate);
      expect(() => assertTerrainArtifactV2Integrity(candidate), mutation.label).toThrow();
    }

    const staleKey = structuredClone(artifact);
    Object.assign(staleKey, { key: `${artifact.key}:stale` });
    expect(() => assertTerrainArtifactV2Integrity(staleKey)).toThrow(/key does not match/u);

    const wrongLength = structuredClone(artifact) as TerrainArtifactV2 & {
      heightField: Float32Array;
    };
    wrongLength.heightField = wrongLength.heightField.slice(1);
    expect(() => assertTerrainArtifactV2Integrity(wrongLength)).toThrow(/height field/u);

    const structuralMutations: ReadonlyArray<
      Readonly<{
        label: string;
        mutate: (candidate: TerrainArtifactV2) => void;
      }>
    > = [
      {
        label: "envelope",
        mutate: (candidate) => {
          (candidate.envelope as { width: number }).width *= 2;
        },
      },
      {
        label: "LOD definition",
        mutate: (candidate) => {
          (candidate.lodDefinitions[0] as { sampleStep: number }).sampleStep = 4;
        },
      },
      {
        label: "chunk bounds",
        mutate: (candidate) => {
          (candidate.chunks[0] as { worldMaxX: number }).worldMaxX += 100;
        },
      },
      {
        label: "scalar metrics",
        mutate: (candidate) => {
          (candidate.metrics as { maximumHeight: number }).maximumHeight += 100;
        },
      },
      {
        label: "operator amplitude",
        mutate: (candidate) => {
          (candidate.operators[0] as { amplitudeMeters: number }).amplitudeMeters += 100;
        },
      },
    ];
    for (const mutation of structuralMutations) {
      const candidate = structuredClone(artifact);
      mutation.mutate(candidate);
      expect(() => assertTerrainArtifactV2Integrity(candidate), mutation.label).toThrow();
    }
  });

  it("keys every cached terrain buffer and the generator revision", () => {
    const buffers = () => ({
      heightField: artifact.heightField.slice(),
      materialWeights: artifact.materialWeights.slice(),
      landMask: artifact.landMask.slice(),
      hydrologyKind: artifact.hydrology.kind.slice(),
      wetness: artifact.wetness.slice(),
      waterDepth: artifact.waterDepth.slice(),
      flowX: artifact.flow.x.slice(),
      flowZ: artifact.flow.z.slice(),
      surfaceHeight: artifact.hydrology.surfaceHeight.slice(),
    });
    const baseline = createTerrainArtifactV2BufferChecksums(buffers());
    const mutations: ReadonlyArray<
      Readonly<{
        label: string;
        mutate: (candidate: ReturnType<typeof buffers>) => void;
      }>
    > = [
      {
        label: "height",
        mutate: (candidate) => {
          candidate.heightField[0] = candidate.heightField[0]! + 0.125;
        },
      },
      {
        label: "material weights",
        mutate: (candidate) => {
          candidate.materialWeights[0] = candidate.materialWeights[0]! ^ 1;
        },
      },
      {
        label: "land mask",
        mutate: (candidate) => {
          candidate.landMask[0] = candidate.landMask[0]! ^ 1;
        },
      },
      {
        label: "hydrology kind",
        mutate: (candidate) => {
          candidate.hydrologyKind[0] = candidate.hydrologyKind[0]! ^ 1;
        },
      },
      {
        label: "wetness",
        mutate: (candidate) => {
          candidate.wetness[0] = candidate.wetness[0]! ^ 1;
        },
      },
      {
        label: "water depth",
        mutate: (candidate) => {
          candidate.waterDepth[0] = candidate.waterDepth[0]! + 0.125;
        },
      },
      {
        label: "flow x",
        mutate: (candidate) => {
          candidate.flowX[0] = candidate.flowX[0]! + 0.125;
        },
      },
      {
        label: "flow z",
        mutate: (candidate) => {
          candidate.flowZ[0] = candidate.flowZ[0]! + 0.125;
        },
      },
      {
        label: "surface height",
        mutate: (candidate) => {
          candidate.surfaceHeight[0] = candidate.surfaceHeight[0]! + 0.125;
        },
      },
    ];
    for (const { label, mutate } of mutations) {
      const candidate = buffers();
      mutate(candidate);
      expect(createTerrainArtifactV2BufferChecksums(candidate).combined, label).not.toBe(
        baseline.combined,
      );
    }
    const surfaceCandidate = buffers();
    surfaceCandidate.surfaceHeight[0] = surfaceCandidate.surfaceHeight[0]! + 0.125;
    expect(createTerrainArtifactV2BufferChecksums(surfaceCandidate).hydrology).not.toBe(
      baseline.hydrology,
    );
    expect(TERRAIN_ARTIFACT_V2_GENERATOR_REVISION).toMatch(/^terrain-artifact-v2-generator\/\d+$/u);
    expect(artifact.key).toMatch(/^terrain-artifact-v2:[0-9a-f]{16}$/u);
  });

  it("turns three gold repository morphologies into materially distinct terrain artifacts", () => {
    const gold = GOLD_WORLD_FILES.map((file) => {
      const world = loadGoldWorld(file);
      const plan = createWorldPlan(world);
      const design = createWorldDesignSpecV3(world, plan, createRepoSemanticGraphV2(world));
      return { design, artifact: createTerrainArtifactV2({ plan, design }) };
    });

    expect(new Set(gold.map(({ artifact }) => artifact.key)).size).toBe(3);
    expect(new Set(gold.map(({ artifact }) => artifact.metrics.checksums.combined)).size).toBe(3);
    expect(new Set(gold.map(({ artifact }) => artifact.metrics.checksums.height)).size).toBe(3);
    expect(new Set(gold.map(({ artifact }) => artifact.metrics.oceanSamples)).size).toBe(3);
    for (const { artifact: goldArtifact, design } of gold) {
      expect(goldArtifact.structureKey).toBe(design.structureKey);
      expect(goldArtifact.metrics.operatorCount).toBe(7);
    }
    for (const field of [
      "signature",
      "ridgeBearingRadians",
      "ridgeBranches",
      "basinCount",
      "shorelineLobes",
      "watershedBranches",
      "coastOpening",
      "relief",
    ]) {
      expect(SOURCE).toContain(`morphology.${field}`);
    }
  });

  it("normalizes every procedural material texel to exactly 255", () => {
    for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
      const offset = sample * MATERIAL_CHANNEL_COUNT;
      let sum = 0;
      for (let channel = 0; channel < MATERIAL_CHANNEL_COUNT; channel += 1) {
        sum += artifact.materialWeights[offset + channel]!;
      }
      expect(sum, `material weight sum at ${sample}`).toBe(255);
    }
    const center = sampleTerrainArtifactV2MaterialWeights(
      artifact,
      artifact.envelope.center.x,
      artifact.envelope.center.z,
    );
    expect(center).not.toBeNull();
    expect(Object.keys(center ?? {})).toEqual(TERRAIN_ARTIFACT_V2_MATERIAL_CHANNELS);
    expect(Object.values(center ?? {}).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8);
  });

  it("keeps hydrology, terrain collision, and navigation on one field", () => {
    const riverIndex = artifact.hydrology.kind.findIndex(
      (kind) => kind === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river,
    );
    expect(riverIndex).toBeGreaterThanOrEqual(0);
    const riverPoint = worldPointForIndex(artifact, riverIndex);
    const riverSample = sampleTerrainArtifactV2Collision(artifact, riverPoint.x, riverPoint.z);
    expect(riverSample).not.toBeNull();
    expect(riverSample?.hydrologyKind).toBe(TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river);
    expect(riverSample?.waterSurfaceHeight).toBeGreaterThan(riverSample?.height ?? Infinity);
    expect(riverSample?.waterDepth).toBeGreaterThan(0);
    expect(Math.hypot(riverSample?.flow.x ?? 0, riverSample?.flow.z ?? 0)).toBeCloseTo(1, 4);
    expect(riverSample?.walkable).toBe(false);
    expect(isTerrainArtifactV2Navigable(artifact, riverPoint.x, riverPoint.z)).toBe(false);

    const dryIndex = artifact.hydrology.kind.findIndex(
      (kind, index) =>
        kind === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry && artifact.landMask[index]! >= 245,
    );
    const dryPoint = worldPointForIndex(artifact, dryIndex);
    const dryHeight = sampleTerrainArtifactV2Height(artifact, dryPoint.x, dryPoint.z);
    expect(dryHeight).toBe(artifact.heightField[dryIndex]);
    const drySample = sampleTerrainArtifactV2Collision(artifact, dryPoint.x, dryPoint.z);
    expect(Math.hypot(...(drySample?.normal ?? [0, 0, 0]))).toBeCloseTo(1, 6);
    expect(isTerrainArtifactV2Navigable(artifact, dryPoint.x, dryPoint.z)).toBe(
      drySample?.walkable,
    );
    expect(
      sampleTerrainArtifactV2Height(
        artifact,
        artifact.envelope.maxX + 1,
        artifact.envelope.center.z,
        "reject",
      ),
    ).toBeNull();
  });

  it("carves continuous banks and carries wetness onto every dry shoreline sample", () => {
    const artifacts = [
      { label: "demo", artifact },
      ...GOLD_WORLD_FILES.map((file) => {
        const world = loadGoldWorld(file);
        const plan = createWorldPlan(world);
        const design = createWorldDesignSpecV3(world, plan, createRepoSemanticGraphV2(world));
        return { label: file, artifact: createTerrainArtifactV2({ plan, design }) };
      }),
    ];

    for (const { label, artifact: shorelineArtifact } of artifacts) {
      const spacingX = shorelineArtifact.envelope.width / (shorelineArtifact.resolution - 1);
      const spacingZ = shorelineArtifact.envelope.depth / (shorelineArtifact.resolution - 1);
      let dryBankSamples = 0;
      let maximumBankSlope = 0;
      let maximumBankPair = "";
      for (let gridZ = 0; gridZ < shorelineArtifact.resolution; gridZ += 1) {
        for (let gridX = 0; gridX < shorelineArtifact.resolution; gridX += 1) {
          const index = gridZ * shorelineArtifact.resolution + gridX;
          for (const [offsetX, offsetZ, spacing] of [
            [1, 0, spacingX],
            [0, 1, spacingZ],
          ] as const) {
            if (
              gridX + offsetX >= shorelineArtifact.resolution ||
              gridZ + offsetZ >= shorelineArtifact.resolution
            ) {
              continue;
            }
            const neighbor = (gridZ + offsetZ) * shorelineArtifact.resolution + gridX + offsetX;
            const firstDry =
              shorelineArtifact.hydrology.kind[index] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry;
            const secondDry =
              shorelineArtifact.hydrology.kind[neighbor] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry;
            if (firstDry === secondDry) continue;
            const dryIndex = firstDry ? index : neighbor;
            dryBankSamples += 1;
            expect(shorelineArtifact.wetness[dryIndex]).toBeGreaterThan(0);
            const rise = Math.abs(
              shorelineArtifact.heightField[index]! - shorelineArtifact.heightField[neighbor]!,
            );
            const slope = (Math.atan(rise / spacing) * 180) / Math.PI;
            if (slope > maximumBankSlope) {
              maximumBankSlope = slope;
              maximumBankPair = `${label};${gridX},${gridZ}->${gridX + offsetX},${gridZ + offsetZ};${shorelineArtifact.hydrology.kind[index]}:${shorelineArtifact.heightField[index]}:${shorelineArtifact.hydrology.surfaceHeight[index]}:${shorelineArtifact.wetness[index]}|${shorelineArtifact.hydrology.kind[neighbor]}:${shorelineArtifact.heightField[neighbor]}:${shorelineArtifact.hydrology.surfaceHeight[neighbor]}:${shorelineArtifact.wetness[neighbor]}`;
            }
          }
        }
      }
      expect(dryBankSamples, label).toBeGreaterThan(1_000);
      expect(maximumBankSlope, maximumBankPair).toBeLessThanOrEqual(45);
    }
  });

  it("keeps every gold water surface locally continuous and each river downstream-monotone", () => {
    for (const file of GOLD_WORLD_FILES) {
      const world = loadGoldWorld(file);
      const plan = createWorldPlan(world);
      const design = createWorldDesignSpecV3(world, plan, createRepoSemanticGraphV2(world));
      const riverArtifact = createTerrainArtifactV2({ plan, design });
      const spacingX = riverArtifact.envelope.width / (riverArtifact.resolution - 1);
      const spacingZ = riverArtifact.envelope.depth / (riverArtifact.resolution - 1);
      let triangleProbeCount = 0;
      for (let gridZ = 0; gridZ < riverArtifact.resolution - 1; gridZ += 37) {
        for (let gridX = 0; gridX < riverArtifact.resolution - 1; gridX += 41) {
          const localX = (gridX + gridZ) % 2 === 0 ? 0.23 : 0.73;
          const localZ = (gridX + gridZ) % 2 === 0 ? 0.31 : 0.61;
          const northWest = gridZ * riverArtifact.resolution + gridX;
          const northEast = northWest + 1;
          const southWest = northWest + riverArtifact.resolution;
          const southEast = southWest + 1;
          const firstTriangle = localX + localZ <= 1;
          const interpolate = (values: Float32Array | Uint8Array) => {
            if (firstTriangle) {
              return (
                values[northWest]! +
                (values[northEast]! - values[northWest]!) * localX +
                (values[southWest]! - values[northWest]!) * localZ
              );
            }
            return (
              values[southEast]! +
              (values[southWest]! - values[southEast]!) * (1 - localX) +
              (values[northEast]! - values[southEast]!) * (1 - localZ)
            );
          };
          const x = riverArtifact.envelope.minX + (gridX + localX) * spacingX;
          const z = riverArtifact.envelope.minZ + (gridZ + localZ) * spacingZ;
          const expectedHeight = interpolate(riverArtifact.heightField);
          const sampledHeight = sampleTerrainArtifactV2Height(riverArtifact, x, z, "reject");
          const collision = sampleTerrainArtifactV2Collision(riverArtifact, x, z);
          expect(sampledHeight, `${file} rendered triangle height`).toBeCloseTo(expectedHeight, 6);
          expect(collision?.height, `${file} collision triangle height`).toBeCloseTo(
            expectedHeight,
            6,
          );
          const slopeX = firstTriangle
            ? (riverArtifact.heightField[northEast]! - riverArtifact.heightField[northWest]!) /
              spacingX
            : (riverArtifact.heightField[southEast]! - riverArtifact.heightField[southWest]!) /
              spacingX;
          const slopeZ = firstTriangle
            ? (riverArtifact.heightField[southWest]! - riverArtifact.heightField[northWest]!) /
              spacingZ
            : (riverArtifact.heightField[southEast]! - riverArtifact.heightField[northEast]!) /
              spacingZ;
          const normalLength = Math.hypot(slopeX, 1, slopeZ);
          expect(collision?.normal[0]).toBeCloseTo(-slopeX / normalLength, 6);
          expect(collision?.normal[1]).toBeCloseTo(1 / normalLength, 6);
          expect(collision?.normal[2]).toBeCloseTo(-slopeZ / normalLength, 6);
          const waterCell = [northWest, northEast, southWest, southEast].every(
            (index) =>
              riverArtifact.hydrology.kind[index] !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry,
          );
          if (waterCell) {
            const expectedSurface = interpolate(riverArtifact.hydrology.surfaceHeight);
            expect(collision?.waterSurfaceHeight).toBeCloseTo(expectedSurface, 6);
            expect(collision?.waterDepth).toBeCloseTo(expectedSurface - expectedHeight, 6);
            expect((collision?.waterSurfaceHeight ?? 0) - (collision?.height ?? 0)).toBeCloseTo(
              collision?.waterDepth ?? Infinity,
              6,
            );
          } else {
            expect(collision).toMatchObject({
              hydrologyKind: TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry,
              waterDepth: 0,
              waterSurfaceHeight: null,
            });
          }
          triangleProbeCount += 1;
        }
      }
      expect(triangleProbeCount, file).toBeGreaterThan(100);
      let maximumWaterSurfaceSlope = 0;
      let maximumSurfaceSlope = 0;
      let maximumConfluenceSlope = 0;
      let maximumDownstreamRise = 0;
      let riverEdges = 0;
      for (let gridZ = 0; gridZ < riverArtifact.resolution; gridZ += 1) {
        for (let gridX = 0; gridX < riverArtifact.resolution; gridX += 1) {
          const index = gridZ * riverArtifact.resolution + gridX;
          if (riverArtifact.hydrology.kind[index] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry) {
            continue;
          }
          for (const [offsetX, offsetZ, spacing] of [
            [1, 0, spacingX],
            [0, 1, spacingZ],
          ] as const) {
            if (
              gridX + offsetX >= riverArtifact.resolution ||
              gridZ + offsetZ >= riverArtifact.resolution
            ) {
              continue;
            }
            const neighbor = (gridZ + offsetZ) * riverArtifact.resolution + gridX + offsetX;
            if (riverArtifact.hydrology.kind[neighbor] === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry) {
              continue;
            }
            const rise = Math.abs(
              riverArtifact.hydrology.surfaceHeight[index]! -
                riverArtifact.hydrology.surfaceHeight[neighbor]!,
            );
            maximumWaterSurfaceSlope = Math.max(
              maximumWaterSurfaceSlope,
              (Math.atan(rise / spacing) * 180) / Math.PI,
            );
          }
        }
      }
      let routedRiverSamples = 0;
      for (let gridZ = 0; gridZ < riverArtifact.resolution; gridZ += 1) {
        for (let gridX = 0; gridX < riverArtifact.resolution; gridX += 1) {
          const index = gridZ * riverArtifact.resolution + gridX;
          if (riverArtifact.hydrology.kind[index] !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river) {
            continue;
          }
          for (const [offsetX, offsetZ, spacing] of [
            [1, 0, spacingX],
            [0, 1, spacingZ],
          ] as const) {
            const neighbor = (gridZ + offsetZ) * riverArtifact.resolution + gridX + offsetX;
            const neighborKind = riverArtifact.hydrology.kind[neighbor]!;
            if (
              neighborKind !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry &&
              neighborKind !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river
            ) {
              const confluenceRise = Math.abs(
                riverArtifact.hydrology.surfaceHeight[index]! -
                  riverArtifact.hydrology.surfaceHeight[neighbor]!,
              );
              maximumConfluenceSlope = Math.max(
                maximumConfluenceSlope,
                (Math.atan(confluenceRise / spacing) * 180) / Math.PI,
              );
            }
            if (neighborKind !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river) {
              continue;
            }
            riverEdges += 1;
            const rise = Math.abs(
              riverArtifact.hydrology.surfaceHeight[index]! -
                riverArtifact.hydrology.surfaceHeight[neighbor]!,
            );
            maximumSurfaceSlope = Math.max(
              maximumSurfaceSlope,
              (Math.atan(rise / spacing) * 180) / Math.PI,
            );
          }
          const flowX = riverArtifact.flow.x[index]!;
          const flowZ = riverArtifact.flow.z[index]!;
          expect(Math.hypot(flowX, flowZ), `${file} river flow ${gridX},${gridZ}`).toBeCloseTo(
            1,
            6,
          );
          const downstreamOffsetX = Math.abs(flowX) >= Math.abs(flowZ) ? Math.sign(flowX) : 0;
          const downstreamOffsetZ = Math.abs(flowZ) > Math.abs(flowX) ? Math.sign(flowZ) : 0;
          expect(
            gridX + downstreamOffsetX >= 0 &&
              gridX + downstreamOffsetX < riverArtifact.resolution &&
              gridZ + downstreamOffsetZ >= 0 &&
              gridZ + downstreamOffsetZ < riverArtifact.resolution,
            `${file} bounded downstream ${gridX},${gridZ}`,
          ).toBe(true);
          const downstream =
            (gridZ + downstreamOffsetZ) * riverArtifact.resolution + gridX + downstreamOffsetX;
          expect(
            riverArtifact.hydrology.kind[downstream],
            `${file} wet downstream ${gridX},${gridZ}`,
          ).not.toBe(TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry);
          maximumDownstreamRise = Math.max(
            maximumDownstreamRise,
            riverArtifact.hydrology.surfaceHeight[downstream]! -
              riverArtifact.hydrology.surfaceHeight[index]!,
          );
          routedRiverSamples += 1;
        }
      }
      const drainageState = new Uint8Array(riverArtifact.hydrology.kind.length);
      let drainageFailure = "";
      for (let start = 0; start < riverArtifact.hydrology.kind.length; start += 1) {
        if (
          riverArtifact.hydrology.kind[start] !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river ||
          drainageState[start] !== 0
        ) {
          continue;
        }
        const path: number[] = [];
        let current = start;
        let terminalState = 2;
        while (true) {
          const kind = riverArtifact.hydrology.kind[current];
          if (
            kind === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.lake ||
            kind === TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.ocean ||
            drainageState[current] === 2
          ) {
            break;
          }
          if (kind !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.river || drainageState[current] === 3) {
            terminalState = 3;
            drainageFailure ||= `${file} river path reached invalid water at sample ${current}`;
            break;
          }
          if (drainageState[current] === 1) {
            terminalState = 3;
            drainageFailure ||= `${file} river path contains a cycle at sample ${current}`;
            break;
          }
          drainageState[current] = 1;
          path.push(current);
          const currentX = current % riverArtifact.resolution;
          const currentZ = Math.floor(current / riverArtifact.resolution);
          const currentFlowX = riverArtifact.flow.x[current]!;
          const currentFlowZ = riverArtifact.flow.z[current]!;
          const offsetX =
            Math.abs(currentFlowX) >= Math.abs(currentFlowZ) ? Math.sign(currentFlowX) : 0;
          const offsetZ =
            Math.abs(currentFlowZ) > Math.abs(currentFlowX) ? Math.sign(currentFlowZ) : 0;
          const nextX = currentX + offsetX;
          const nextZ = currentZ + offsetZ;
          if (
            nextX < 0 ||
            nextX >= riverArtifact.resolution ||
            nextZ < 0 ||
            nextZ >= riverArtifact.resolution
          ) {
            terminalState = 3;
            drainageFailure ||= `${file} river path left the artifact at sample ${current}`;
            break;
          }
          current = nextZ * riverArtifact.resolution + nextX;
        }
        for (const index of path) drainageState[index] = terminalState;
        if (drainageFailure) break;
      }
      expect(riverEdges, file).toBeGreaterThan(100);
      expect(routedRiverSamples, file).toBe(riverArtifact.metrics.riverSamples);
      expect(drainageFailure).toBe("");
      expect(
        drainageState.reduce((count, state) => count + Number(state === 2), 0),
        `${file} river samples reaching lake or ocean`,
      ).toBe(riverArtifact.metrics.riverSamples);
      expect(maximumWaterSurfaceSlope, `${file} all-water slope`).toBeLessThanOrEqual(20);
      expect(maximumSurfaceSlope, `${file} surface slope`).toBeLessThanOrEqual(20);
      expect(maximumConfluenceSlope, `${file} confluence slope`).toBeLessThanOrEqual(20);
      expect(maximumDownstreamRise, `${file} downstream rise`).toBeLessThanOrEqual(0.08);
    }
  });

  it("pins three crack-safe power-of-two chunk LODs and explicit skirts", () => {
    expect(TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS).toMatchObject([
      { id: "near", vertexResolution: 129, sampleStep: 1, segmentsPerChunk: 128 },
      { id: "mid", vertexResolution: 65, sampleStep: 2, segmentsPerChunk: 64 },
      { id: "far", vertexResolution: 33, sampleStep: 4, segmentsPerChunk: 32 },
    ]);
    const expectedMetrics = {
      near: { topVertexCount: 16_641, skirtVertexCount: 516, triangleCount: 33_792 },
      mid: { topVertexCount: 4_225, skirtVertexCount: 260, triangleCount: 8_704 },
      far: { topVertexCount: 1_089, skirtVertexCount: 132, triangleCount: 2_304 },
    } as const;
    const dryArtifact = {
      ...artifact,
      hydrology: {
        ...artifact.hydrology,
        kind: new Uint8Array(artifact.hydrology.kind.length),
      },
    } as TerrainArtifactV2;
    for (const lod of ["near", "mid", "far"] as const) {
      const mesh = createTerrainArtifactV2ChunkMeshData(dryArtifact, 0, 0, lod);
      expect(mesh).toMatchObject(expectedMetrics[lod]);
      expect(mesh).toMatchObject({ requestedLod: lod, effectiveLod: lod });
      expect(mesh.skirtTriangleCount).toBe(
        TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS.find(({ id }) => id === lod)!.segmentsPerChunk * 8,
      );
      const firstSkirtSource = mesh.sourceSampleIndices[mesh.skirtStartVertex]!;
      expect(mesh.positions[mesh.skirtStartVertex * 3 + 1]).toBeCloseTo(
        artifact.heightField[firstSkirtSource]! -
          TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS.find(({ id }) => id === lod)!.skirtDepth,
        5,
      );
    }

    const nearLeft = createTerrainArtifactV2ChunkMeshData(dryArtifact, 0, 0, "near");
    const farRight = createTerrainArtifactV2ChunkMeshData(dryArtifact, 1, 0, "far");
    const nearShared = new Set(nearLeft.edgeSampleIndices.east);
    for (const coarseSample of farRight.edgeSampleIndices.west) {
      expect(nearShared.has(coarseSample)).toBe(true);
    }
  });

  it("covers every three-gold near-to-far chunk edge deviation with the authored skirts", () => {
    const nearSkirtDepth = TERRAIN_ARTIFACT_V2_LOD_DEFINITIONS.find(
      ({ id }) => id === "near",
    )!.skirtDepth;
    for (const file of GOLD_WORLD_FILES) {
      const world = loadGoldWorld(file);
      const plan = createWorldPlan(world);
      const design = createWorldDesignSpecV3(world, plan, createRepoSemanticGraphV2(world));
      const goldArtifact = createTerrainArtifactV2({ plan, design });
      let maximumDeviation = 0;
      for (const boundary of [128, 256, 384]) {
        for (let coordinate = 0; coordinate <= 512; coordinate += 1) {
          const coarseStart = Math.floor(coordinate / 4) * 4;
          const coarseEnd = Math.min(512, coarseStart + 4);
          const mixAmount = (coordinate - coarseStart) / Math.max(1, coarseEnd - coarseStart);
          for (const axis of ["x", "z"] as const) {
            const fineIndex =
              axis === "x"
                ? coordinate * goldArtifact.resolution + boundary
                : boundary * goldArtifact.resolution + coordinate;
            const coarseStartIndex =
              axis === "x"
                ? coarseStart * goldArtifact.resolution + boundary
                : boundary * goldArtifact.resolution + coarseStart;
            const coarseEndIndex =
              axis === "x"
                ? coarseEnd * goldArtifact.resolution + boundary
                : boundary * goldArtifact.resolution + coarseEnd;
            const interpolated =
              goldArtifact.heightField[coarseStartIndex]! * (1 - mixAmount) +
              goldArtifact.heightField[coarseEndIndex]! * mixAmount;
            maximumDeviation = Math.max(
              maximumDeviation,
              Math.abs(goldArtifact.heightField[fineIndex]! - interpolated),
            );
          }
        }
      }
      expect(maximumDeviation, `${file} mixed-LOD edge`).toBeLessThanOrEqual(nearSkirtDepth);
    }
  });

  it("builds terrain and water previews from the same source sample indices", () => {
    const terrain = createTerrainArtifactV2PreviewMeshData(artifact, "far");
    const water = createTerrainArtifactV2WaterMeshData(artifact, "far");
    expect(terrain).toMatchObject({ requestedLod: "far", effectiveLod: "near" });
    expect(terrain.topVertexCount).toBe(513 * 513);
    expect(terrain.skirtVertexCount).toBe(513 * 4);
    // Water keeps the canonical full-resolution hydrology topology at every
    // terrain LOD so narrow rivers cannot fragment when the land mesh coarsens.
    expect(water.vertexCount).toBe(513 * 513);
    expect(water.triangleCount).toBeGreaterThan(1_000);
    for (let vertex = 0; vertex < water.vertexCount; vertex += 211) {
      const sourceIndex = water.sourceSampleIndices[vertex]!;
      expect(water.depth[vertex]).toBe(artifact.waterDepth[sourceIndex]);
      expect(water.wetness[vertex]).toBe(artifact.wetness[sourceIndex]);
      if (artifact.hydrology.kind[sourceIndex] !== TERRAIN_ARTIFACT_V2_HYDROLOGY_KIND.dry) {
        expect(water.positions[vertex * 3 + 1]).toBe(artifact.hydrology.surfaceHeight[sourceIndex]);
      }
    }
    const referencedWaterVertices = new Set(water.indices);
    for (const vertex of referencedWaterVertices) {
      expect(terrain.sourceSampleIndices[vertex]).toBe(water.sourceSampleIndices[vertex]);
      expect(terrain.positions[vertex * 3 + 1]).toBeLessThanOrEqual(
        water.positions[vertex * 3 + 1]! + 1e-6,
      );
    }
  });

  it("preserves one receiving-water topology across every terrain LOD and gold world", () => {
    expect(TERRAIN_ARTIFACT_V2_WATER_TOPOLOGY_SAMPLE_STEP).toBe(1);
    for (const file of GOLD_WORLD_FILES) {
      const world = loadGoldWorld(file);
      const plan = createWorldPlan(world);
      const design = createWorldDesignSpecV3(world, plan, createRepoSemanticGraphV2(world));
      const waterArtifact = createTerrainArtifactV2({ plan, design });
      const meshes = (["near", "mid", "far"] as const).map((lod) =>
        createTerrainArtifactV2WaterMeshData(waterArtifact, lod),
      );
      expect(new Set(meshes.map(({ triangleCount }) => triangleCount)).size, file).toBe(1);
      for (const mesh of meshes) {
        expect(waterMeshComponentCount(mesh), `${file} receiving-water components`).toBe(1);
      }
    }
  });

  it("rejects unsafe envelopes and chunk coordinates", () => {
    const input = artifactInput();
    const invalidPlan = {
      ...input.plan,
      topology: {
        ...input.plan.topology,
        envelope: { ...input.plan.topology.envelope, width: 0 },
      },
    };
    const invalidDesign = {
      ...input.design,
      terrain: {
        ...input.design.terrain,
        envelope: { ...input.design.terrain.envelope, width: 0 },
      },
    };
    expect(() =>
      createTerrainArtifactV2({
        plan: invalidPlan,
        design: invalidDesign,
      }),
    ).toThrow(/incoherent terrain envelope/u);
    const inconsistentEnvelope = {
      ...input.plan.topology.envelope,
      width: input.plan.topology.envelope.width * 2,
    };
    expect(() =>
      createTerrainArtifactV2({
        plan: {
          ...input.plan,
          topology: { ...input.plan.topology, envelope: inconsistentEnvelope },
        },
        design: {
          ...input.design,
          terrain: { ...input.design.terrain, envelope: inconsistentEnvelope },
        },
      }),
    ).toThrow(/incoherent terrain envelope/u);
    expect(() => createTerrainArtifactV2ChunkMeshData(artifact, -1, 0, "near")).toThrow(
      /between 0 and 3/u,
    );
    expect(() =>
      createTerrainArtifactV2({
        plan: input.plan,
        design: {
          ...input.design,
          sourcePlan: { ...input.design.sourcePlan, terrainKey: "terrain:wrong" },
        },
      }),
    ).toThrow(/structure key/u);
    expect(() =>
      createTerrainArtifactV2({
        plan: input.plan,
        design: {
          ...input.design,
          terrain: {
            ...input.design.terrain,
            morphology: {
              ...input.design.terrain.morphology,
              ridgeBranches: input.design.terrain.morphology.ridgeBranches + 1,
            },
          },
        },
      }),
    ).toThrow(/structure key/u);
    expect(() =>
      createTerrainArtifactV2({
        plan: input.plan,
        design: {
          ...input.design,
          terrain: {
            ...input.design.terrain,
            operators: input.design.terrain.operators.map((operator, index) =>
              index === 0 ? { ...operator, weight: Number.NaN } : operator,
            ),
          },
        },
      }),
    ).toThrow(/structure key/u);
  });
});
