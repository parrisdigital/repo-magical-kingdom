import { stableFraction, stableHash } from "@/lib/kingdom/hash";
import type { KingdomSeason } from "@/lib/kingdom/types";
import type { WorldPlan } from "@/lib/kingdom/world-plan";

import type { PlannedBuilding, PlannedScatter } from "./planned-scatter";
import {
  getPlannedTerrainDefinition,
  samplePlannedTerrainHeight,
  samplePlannedWaterSurface,
} from "./planned-terrain-model";
import type { PlannedVisualEnrichment } from "./planned-visual-enrichment";

export const MAX_PLANNED_LIFE_PARTICLES = 120;

export type PlannedLifeKind = "petal" | "smoke" | "water-mote";

export type PlannedLifePoint = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type PlannedLifeParticle = Readonly<{
  id: string;
  kind: PlannedLifeKind;
  sourceId: string;
  anchor: PlannedLifePoint;
  phase: number;
  cycleOffset: number;
  speed: number;
  amplitude: number;
  travel: number;
  size: number;
}>;

export type PlannedLifePlan = Readonly<{
  schema: "repo-planned-life/v1";
  topologyKey: string;
  petals: ReadonlyArray<PlannedLifeParticle>;
  smoke: ReadonlyArray<PlannedLifeParticle>;
  waterMotes: ReadonlyArray<PlannedLifeParticle>;
  totalParticles: number;
}>;

type FloweringTreeSource = Readonly<{
  id: string;
  x: number;
  z: number;
  terrainY: number;
  scaleY: number;
}>;

const TAU = Math.PI * 2;
const PETAL_TARGET = 48;
const SMOKE_BUILDING_TARGET = 12;
const SMOKE_PER_BUILDING = 2;
const WATER_MOTE_TARGET = 20;

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function fraction(key: string, suffix: string): number {
  return stableFraction(`${key}:${suffix}`);
}

function createParticle(
  kind: PlannedLifeKind,
  sourceId: string,
  index: number,
  anchor: PlannedLifePoint,
  topologyKey: string,
  values: Readonly<{
    speed: readonly [number, number];
    amplitude: readonly [number, number];
    travel: readonly [number, number];
    size: readonly [number, number];
  }>,
): PlannedLifeParticle {
  const key = `${topologyKey}:life:${kind}:${sourceId}:${index}`;
  const interpolate = (range: readonly [number, number], suffix: string) =>
    range[0] + fraction(key, suffix) * (range[1] - range[0]);
  return {
    id: `life-${kind}-${stableHash(key).toString(16)}`,
    kind,
    sourceId,
    anchor: {
      x: round(anchor.x),
      y: round(anchor.y),
      z: round(anchor.z),
    },
    phase: round(fraction(key, "phase") * TAU),
    cycleOffset: round(fraction(key, "cycle")),
    speed: round(interpolate(values.speed, "speed")),
    amplitude: round(interpolate(values.amplitude, "amplitude")),
    travel: round(interpolate(values.travel, "travel")),
    size: round(interpolate(values.size, "size")),
  };
}

function floweringTreeSources(
  plan: WorldPlan,
  scatter: PlannedScatter,
  enrichment: PlannedVisualEnrichment,
): ReadonlyArray<FloweringTreeSource> {
  const planned = scatter.trees
    .filter(
      (tree) =>
        tree.paletteRole === "flowering" ||
        tree.assetRole === "common-tree-2" ||
        tree.assetRole === "twisted-tree-1",
    )
    .map((tree) => ({
      id: tree.id,
      x: tree.transform.position.x,
      z: tree.transform.position.z,
      terrainY: samplePlannedTerrainHeight(
        plan,
        tree.transform.position.x,
        tree.transform.position.z,
      ),
      scaleY: tree.transform.scale.y * 0.96,
    }));
  const supplemental = enrichment.supplementalTrees
    .filter(
      (tree) =>
        tree.paletteRole === "flowering" ||
        tree.assetRole === "common-tree-2" ||
        tree.assetRole === "twisted-tree-1",
    )
    .map((tree) => ({
      id: tree.id,
      x: tree.position.x,
      z: tree.position.z,
      terrainY: samplePlannedTerrainHeight(plan, tree.position.x, tree.position.z),
      scaleY: tree.scale.y,
    }));
  return [...planned, ...supplemental].sort((first, second) => first.id.localeCompare(second.id));
}

function createPetals(
  plan: WorldPlan,
  scatter: PlannedScatter,
  enrichment: PlannedVisualEnrichment,
): ReadonlyArray<PlannedLifeParticle> {
  const sources = floweringTreeSources(plan, scatter, enrichment);
  if (sources.length === 0) return [];
  const count = Math.min(PETAL_TARGET, sources.length * 4);
  return Array.from({ length: count }, (_, index) => {
    const source = sources[index % sources.length]!;
    const key = `${plan.topologyKey}:life:petal-anchor:${source.id}:${index}`;
    const angle = fraction(key, "angle") * TAU;
    const radius = 0.8 + fraction(key, "radius") * 2.7;
    const canopyHeight = Math.max(4.4, source.scaleY * 7.2);
    return createParticle(
      "petal",
      source.id,
      index,
      {
        x: source.x + Math.cos(angle) * radius,
        y: source.terrainY + canopyHeight * (0.52 + fraction(key, "height") * 0.38),
        z: source.z + Math.sin(angle) * radius,
      },
      plan.topologyKey,
      {
        speed: [0.035, 0.075],
        amplitude: [0.25, 0.75],
        travel: [1.6, 3.1],
        size: [0.34, 0.56],
      },
    );
  });
}

function selectSmokeBuildings(buildings: ReadonlyArray<PlannedBuilding>): PlannedBuilding[] {
  const byHamlet = new Map<string, PlannedBuilding[]>();
  for (const building of [...buildings].sort((a, b) => a.id.localeCompare(b.id))) {
    const group = byHamlet.get(building.hamletId);
    if (group) group.push(building);
    else byHamlet.set(building.hamletId, [building]);
  }
  const hamlets = [...byHamlet.keys()].sort();
  const selected: PlannedBuilding[] = [];
  for (let tier = 0; selected.length < SMOKE_BUILDING_TARGET; tier += 1) {
    let added = false;
    for (const hamletId of hamlets) {
      const building = byHamlet.get(hamletId)?.[tier];
      if (!building) continue;
      selected.push(building);
      added = true;
      if (selected.length === SMOKE_BUILDING_TARGET) break;
    }
    if (!added) break;
  }
  return selected;
}

function chimneyAnchor(plan: WorldPlan, building: PlannedBuilding): PlannedLifePoint {
  const hall = building.assetRole === "manor";
  const localScale = building.transform.scale.y * 1.34;
  const localX = (hall ? 1.4 : 1.05) * localScale;
  const localY = (hall ? 7.59 : 4.47) * localScale;
  const localZ = -0.4 * localScale;
  const cosine = Math.cos(building.transform.rotationY);
  const sine = Math.sin(building.transform.rotationY);
  return {
    x: building.transform.position.x + localX * cosine + localZ * sine,
    y:
      samplePlannedTerrainHeight(
        plan,
        building.transform.position.x,
        building.transform.position.z,
      ) +
      0.08 +
      localY,
    z: building.transform.position.z - localX * sine + localZ * cosine,
  };
}

function createSmoke(plan: WorldPlan, scatter: PlannedScatter): ReadonlyArray<PlannedLifeParticle> {
  return selectSmokeBuildings(scatter.buildings).flatMap((building) => {
    const chimney = chimneyAnchor(plan, building);
    return Array.from({ length: SMOKE_PER_BUILDING }, (_, index) =>
      createParticle(
        "smoke",
        building.id,
        index,
        { ...chimney, y: chimney.y + index * 0.72 },
        plan.topologyKey,
        {
          speed: [0.025, 0.052],
          amplitude: [0.22, 0.55],
          travel: [2.2, 3.8],
          size: [0.7, 1.15],
        },
      ),
    );
  });
}

function createWaterMotes(plan: WorldPlan): ReadonlyArray<PlannedLifeParticle> {
  const lake = getPlannedTerrainDefinition(plan).water.lake;
  return Array.from({ length: WATER_MOTE_TARGET }, (_, index) => {
    const key = `${plan.topologyKey}:life:water-mote-anchor:${index}`;
    const baseAngle = (index / WATER_MOTE_TARGET) * TAU + (fraction(key, "angle") - 0.5) * 0.16;
    let x = lake.center.x;
    let z = lake.center.z;
    let surface: number | null = null;
    for (let attempt = 0; attempt < 16 && surface === null; attempt += 1) {
      const angle = baseAngle + attempt * 2.399_963;
      const radial = 0.58 + fraction(key, `radius:${attempt}`) * 0.27;
      x = lake.center.x + Math.cos(angle) * lake.radiusX * radial;
      z = lake.center.z + Math.sin(angle) * lake.radiusZ * radial;
      surface = samplePlannedWaterSurface(plan, x, z);
    }
    if (surface === null) {
      throw new Error(`Unable to anchor planned lake mote ${index} over water`);
    }
    return createParticle(
      "water-mote",
      "lake",
      index,
      {
        x,
        y: surface + 0.55 + fraction(key, "height") * 1.15,
        z,
      },
      plan.topologyKey,
      {
        speed: [0.12, 0.24],
        amplitude: [0.18, 0.42],
        travel: [0.12, 0.32],
        size: [0.24, 0.42],
      },
    );
  });
}

/**
 * Creates season-invariant life anchors. Season only controls presentation in
 * the render adapter, so changing appearance cannot alter repository topology.
 */
export function createPlannedLifePlan(
  plan: WorldPlan,
  scatter: PlannedScatter,
  enrichment: PlannedVisualEnrichment,
): PlannedLifePlan {
  const petals = createPetals(plan, scatter, enrichment);
  const smoke = createSmoke(plan, scatter);
  const waterMotes = createWaterMotes(plan);
  const totalParticles = petals.length + smoke.length + waterMotes.length;
  if (totalParticles > MAX_PLANNED_LIFE_PARTICLES) {
    throw new Error(
      `Planned life budget exceeded: ${totalParticles}/${MAX_PLANNED_LIFE_PARTICLES}`,
    );
  }
  return {
    schema: "repo-planned-life/v1",
    topologyKey: plan.topologyKey,
    petals,
    smoke,
    waterMotes,
    totalParticles,
  };
}

function fract(value: number): number {
  return value - Math.floor(value);
}

/** Samples a restrained particle path without mutating its topology anchor. */
export function samplePlannedLifeParticle(
  particle: PlannedLifeParticle,
  elapsedSeconds: number,
  reducedMotion: boolean,
): PlannedLifePoint {
  if (reducedMotion) return particle.anchor;
  const elapsed = Math.max(0, elapsedSeconds);
  if (particle.kind === "petal") {
    const cycle = fract(particle.cycleOffset + elapsed * particle.speed);
    return {
      x: particle.anchor.x + Math.sin(elapsed * 0.55 + particle.phase) * particle.amplitude,
      y: particle.anchor.y - cycle * particle.travel,
      z:
        particle.anchor.z +
        Math.cos(elapsed * 0.41 + particle.phase * 0.73) * particle.amplitude * 0.68,
    };
  }
  if (particle.kind === "smoke") {
    const cycle = fract(particle.cycleOffset + elapsed * particle.speed);
    return {
      x: particle.anchor.x + Math.sin(elapsed * 0.34 + particle.phase) * particle.amplitude * cycle,
      y: particle.anchor.y + cycle * particle.travel,
      z:
        particle.anchor.z +
        Math.cos(elapsed * 0.29 + particle.phase * 0.81) * particle.amplitude * cycle,
    };
  }
  return {
    x: particle.anchor.x + Math.sin(elapsed * particle.speed + particle.phase) * particle.amplitude,
    y:
      particle.anchor.y +
      Math.sin(elapsed * particle.speed * 1.7 + particle.phase * 0.66) * particle.travel,
    z:
      particle.anchor.z +
      Math.cos(elapsed * particle.speed * 0.83 + particle.phase) * particle.amplitude,
  };
}

export function isPlannedLifeKindVisible(kind: PlannedLifeKind, season: KingdomSeason): boolean {
  return kind !== "petal" || season === "spring";
}
