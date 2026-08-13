import { stableFraction, stableHash } from "@/lib/kingdom/hash";
import type { Vec3 } from "@/lib/kingdom/types";
import type { WorldPlan } from "@/lib/kingdom/world-plan";

import type { PlannedScatter } from "./planned-scatter";
import { classifyPlannedTerrainRegion, samplePlannedTerrainHeight } from "./planned-terrain-model";

export const MAX_ENCHANTED_ANCIENT_TREES = 12;
export const MAX_ENCHANTED_RUNESTONES = 8;
export const MAX_ENCHANTED_ROOT_ARCHES = 4;
export const MAX_ENCHANTED_MUSHROOMS = 36;
export const MAX_ENCHANTED_FIREFLIES = 72;

export type PlannedRunestone = Readonly<{
  id: string;
  position: Vec3;
  rotationY: number;
  scale: number;
  glowPhase: number;
}>;

export type PlannedRootArch = Readonly<{
  id: string;
  start: Vec3;
  end: Vec3;
  height: number;
  radius: number;
}>;

export type PlannedMushroom = Readonly<{
  id: string;
  position: Vec3;
  rotationY: number;
  scale: number;
}>;

export type PlannedFirefly = Readonly<{
  id: string;
  anchor: Vec3;
  phase: number;
  speed: number;
  orbitRadius: number;
  verticalTravel: number;
  size: number;
}>;

export type PlannedWorldThemeLayer = Readonly<{
  schema: "repo-planned-world-theme/v1";
  topologyKey: string;
  worldTheme: WorldPlan["worldTheme"];
  ancientTreeIds: ReadonlyArray<string>;
  runestones: ReadonlyArray<PlannedRunestone>;
  rootArches: ReadonlyArray<PlannedRootArch>;
  mushrooms: ReadonlyArray<PlannedMushroom>;
  fireflies: ReadonlyArray<PlannedFirefly>;
  instanceBudget: number;
}>;

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function surfacePosition(plan: WorldPlan, x: number, z: number, lift = 0.02): Vec3 {
  return { x: round(x), y: round(samplePlannedTerrainHeight(plan, x, z) + lift), z: round(z) };
}

function validDecorativeSurface(plan: WorldPlan, x: number, z: number): boolean {
  const region = classifyPlannedTerrainRegion(plan, x, z);
  return (
    region.inside &&
    region.water === null &&
    region.material !== "outside" &&
    region.material !== "shore" &&
    region.slopeDegrees <= 28
  );
}

function emptyThemeLayer(plan: WorldPlan): PlannedWorldThemeLayer {
  return {
    schema: "repo-planned-world-theme/v1",
    topologyKey: `theme-${plan.topologyKey}`,
    worldTheme: plan.worldTheme,
    ancientTreeIds: [],
    runestones: [],
    rootArches: [],
    mushrooms: [],
    fireflies: [],
    instanceBudget: 0,
  };
}

/**
 * Builds bounded, season-invariant visual language for the selected world.
 * Every anchor comes from already validated scatter or is rechecked against the
 * same terrain classifier before it reaches the renderer.
 */
export function createPlannedWorldThemeLayer(
  plan: WorldPlan,
  scatter: PlannedScatter,
): PlannedWorldThemeLayer {
  if (scatter.topologyKey !== `scatter-${plan.topologyKey}`) {
    throw new Error("World-theme scenery must use scatter from the same topology.");
  }
  if (plan.worldTheme !== "enchanted-forest") return emptyThemeLayer(plan);

  const rankedTrees = [...scatter.trees].sort(
    (first, second) =>
      stableHash(`${plan.topologyKey}:ancient:${first.id}`) -
        stableHash(`${plan.topologyKey}:ancient:${second.id}`) || first.id.localeCompare(second.id),
  );
  const preferredTrees = [
    ...rankedTrees.filter((tree) => tree.assetRole.includes("twisted")),
    ...rankedTrees.filter((tree) => !tree.assetRole.includes("twisted")),
  ];
  const ancientTarget = Math.min(
    MAX_ENCHANTED_ANCIENT_TREES,
    Math.max(6, Math.round(scatter.trees.length * 0.11)),
  );
  const ancientTreeIds = [...new Set(preferredTrees.map((tree) => tree.id))].slice(
    0,
    ancientTarget,
  );

  const rockDetails = scatter.ambientDetails
    .filter(
      (detail) =>
        detail.assetRole.startsWith("medium-rock") &&
        validDecorativeSurface(plan, detail.transform.position.x, detail.transform.position.z),
    )
    .sort(
      (first, second) =>
        stableHash(`${plan.topologyKey}:runestone:${first.id}`) -
          stableHash(`${plan.topologyKey}:runestone:${second.id}`) ||
        first.id.localeCompare(second.id),
    )
    .slice(0, MAX_ENCHANTED_RUNESTONES);
  const runestones = rockDetails.map((detail, index): PlannedRunestone => {
    const x = detail.transform.position.x;
    const z = detail.transform.position.z;
    return {
      id: `runestone-${detail.id}`,
      position: surfacePosition(plan, x, z, 0.04),
      rotationY: detail.transform.rotationY,
      scale: round(1.05 + stableFraction(`${plan.topologyKey}:runestone-scale:${index}`) * 0.52),
      glowPhase: round(
        stableFraction(`${plan.topologyKey}:runestone-phase:${index}`) * Math.PI * 2,
      ),
    };
  });

  const treesByGrove = new Map<string, typeof rankedTrees>();
  for (const tree of rankedTrees) {
    const groveTrees = treesByGrove.get(tree.groveId) ?? [];
    groveTrees.push(tree);
    treesByGrove.set(tree.groveId, groveTrees);
  }
  const rootArches: PlannedRootArch[] = [];
  for (const [groveId, groveTrees] of [...treesByGrove.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (rootArches.length >= MAX_ENCHANTED_ROOT_ARCHES || groveTrees.length < 2) break;
    const ordered = [...groveTrees].sort((first, second) => first.id.localeCompare(second.id));
    let pair: readonly [(typeof ordered)[number], (typeof ordered)[number]] | null = null;
    for (let firstIndex = 0; firstIndex < ordered.length && !pair; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < ordered.length; secondIndex += 1) {
        const first = ordered[firstIndex]!;
        const second = ordered[secondIndex]!;
        const span = Math.hypot(
          first.transform.position.x - second.transform.position.x,
          first.transform.position.z - second.transform.position.z,
        );
        if (span >= 4.5 && span <= 13.5) {
          pair = [first, second];
          break;
        }
      }
    }
    if (!pair) continue;
    const [first, second] = pair;
    rootArches.push({
      id: `root-arch-${groveId}`,
      start: surfacePosition(plan, first.transform.position.x, first.transform.position.z, 0.18),
      end: surfacePosition(plan, second.transform.position.x, second.transform.position.z, 0.18),
      height: round(2.2 + stableFraction(`${plan.topologyKey}:root-arch-height:${groveId}`) * 1.8),
      radius: round(0.18 + stableFraction(`${plan.topologyKey}:root-arch-radius:${groveId}`) * 0.1),
    });
  }

  const mushrooms: PlannedMushroom[] = [];
  const mushroomClusters = [...scatter.groundCoverClusters]
    .sort(
      (first, second) =>
        stableHash(`${plan.topologyKey}:mushroom-ring:${first.id}`) -
          stableHash(`${plan.topologyKey}:mushroom-ring:${second.id}`) ||
        first.id.localeCompare(second.id),
    )
    .slice(0, 5);
  for (const cluster of mushroomClusters) {
    const target = 6 + (stableHash(`${plan.topologyKey}:${cluster.id}:mushroom-count`) % 3);
    const radius = Math.min(1.5, cluster.radius * 0.48);
    const phase = stableFraction(`${plan.topologyKey}:${cluster.id}:mushroom-phase`) * Math.PI * 2;
    for (let index = 0; index < target && mushrooms.length < MAX_ENCHANTED_MUSHROOMS; index += 1) {
      const angle = phase + (index / target) * Math.PI * 2;
      const wobble =
        0.78 + stableFraction(`${plan.topologyKey}:${cluster.id}:${index}:wobble`) * 0.28;
      const x = cluster.center.x + Math.cos(angle) * radius * wobble;
      const z = cluster.center.z + Math.sin(angle) * radius * wobble;
      if (!validDecorativeSurface(plan, x, z)) continue;
      mushrooms.push({
        id: `enchanted-mushroom-${cluster.id}-${index}`,
        position: surfacePosition(plan, x, z, 0.025),
        rotationY: round(angle + Math.PI),
        scale: round(
          0.82 + stableFraction(`${plan.topologyKey}:${cluster.id}:${index}:scale`) * 0.5,
        ),
      });
    }
  }

  const fireflySources = rankedTrees.length > 0 ? rankedTrees : scatter.trees;
  const fireflyTarget = Math.min(
    MAX_ENCHANTED_FIREFLIES,
    Math.max(36, Math.round(scatter.trees.length * 0.72)),
  );
  const fireflies = Array.from({ length: fireflyTarget }, (_, index): PlannedFirefly => {
    const source = fireflySources[index % fireflySources.length];
    const fallback = plan.topology.envelope.center;
    const x = source?.transform.position.x ?? fallback.x;
    const z = source?.transform.position.z ?? fallback.z;
    const phase = stableFraction(`${plan.topologyKey}:firefly:${index}:phase`) * Math.PI * 2;
    const orbitRadius = 0.9 + stableFraction(`${plan.topologyKey}:firefly:${index}:orbit`) * 2.3;
    const anchorX = x + Math.cos(phase) * orbitRadius * 0.42;
    const anchorZ = z + Math.sin(phase) * orbitRadius * 0.42;
    return {
      id: `firefly-${index}`,
      anchor: {
        x: round(anchorX),
        y: round(samplePlannedTerrainHeight(plan, x, z) + 1.2 + (index % 5) * 0.62),
        z: round(anchorZ),
      },
      phase: round(phase),
      speed: round(0.28 + stableFraction(`${plan.topologyKey}:firefly:${index}:speed`) * 0.4),
      orbitRadius: round(orbitRadius),
      verticalTravel: round(
        0.32 + stableFraction(`${plan.topologyKey}:firefly:${index}:vertical`) * 0.65,
      ),
      size: round(0.7 + stableFraction(`${plan.topologyKey}:firefly:${index}:size`) * 0.5),
    };
  });

  return {
    schema: "repo-planned-world-theme/v1",
    topologyKey: `theme-${plan.topologyKey}`,
    worldTheme: plan.worldTheme,
    ancientTreeIds,
    runestones,
    rootArches,
    mushrooms,
    fireflies,
    instanceBudget: runestones.length + rootArches.length + mushrooms.length + fireflies.length,
  };
}
