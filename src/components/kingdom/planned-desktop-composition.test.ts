import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { createPlannedScatter } from "./planned-scatter";
import { classifyPlannedTerrainRegion } from "./planned-terrain-model";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

type Point = Readonly<{ x: number; z: number }>;

function fixture(): KingdomWorld {
  return JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function pathLength(points: ReadonlyArray<Point>): number {
  return points
    .slice(1)
    .reduce((total, point, index) => total + distance(points[index]!, point), 0);
}

function connectedAt(points: ReadonlyArray<Point>, maximumStep: number): boolean {
  if (points.length < 2) return true;
  const reached = new Set([0]);
  const pending = [0];
  while (pending.length > 0) {
    const current = pending.pop()!;
    for (let index = 0; index < points.length; index += 1) {
      if (reached.has(index) || distance(points[current]!, points[index]!) > maximumStep) continue;
      reached.add(index);
      pending.push(index);
    }
  }
  return reached.size === points.length;
}

function connectedComponents(
  points: ReadonlyArray<Point>,
  maximumStep: number,
): ReadonlyArray<ReadonlyArray<number>> {
  const remaining = new Set(points.map((_, index) => index));
  const components: number[][] = [];
  while (remaining.size > 0) {
    const start = remaining.values().next().value!;
    remaining.delete(start);
    const pending = [start];
    const component: number[] = [];
    while (pending.length > 0) {
      const current = pending.pop()!;
      component.push(current);
      for (const candidate of [...remaining]) {
        if (distance(points[current]!, points[candidate]!) > maximumStep) continue;
        remaining.delete(candidate);
        pending.push(candidate);
      }
    }
    components.push(component);
  }
  return components.sort((first, second) => second.length - first.length);
}

function nearestNeighborDistances(points: ReadonlyArray<Point>): ReadonlyArray<number> {
  return points.map((point, index) =>
    Math.min(
      ...points
        .filter((_, candidateIndex) => candidateIndex !== index)
        .map((other) => distance(point, other)),
    ),
  );
}

function nearestVisibleGap(
  structures: ReadonlyArray<Readonly<{ transform: { position: Point }; footprintRadius: number }>>,
): ReadonlyArray<number> {
  return structures.map((structure, index) =>
    Math.min(
      ...structures
        .filter((_, candidateIndex) => candidateIndex !== index)
        .map(
          (other) =>
            distance(structure.transform.position, other.transform.position) -
            structure.footprintRadius -
            other.footprintRadius,
        ),
    ),
  );
}

describe("vast desktop composition", () => {
  it("derives distinct woodland macro signatures from repository topology", () => {
    const source = fixture();
    const signatures = Array.from({ length: 4 }, (_, index) => {
      const world: KingdomWorld = {
        ...source,
        seed: `desktop-composition-seed-${index}`,
        source: {
          ...source.source,
          repositoryId: source.source.repositoryId + index + 1,
          repository: `desktop-composition-${index}`,
        },
      };
      const plan = createWorldPlan(world);
      const scatter = createPlannedScatter(world, plan);
      const enrichment = createPlannedVisualEnrichment(plan, scatter);
      const envelope = plan.topology.envelope;
      const anchors = [
        ...Object.values(Object.groupBy(enrichment.supplementalTrees, (tree) => tree.beltId)),
      ]
        .map((trees) => ({
          x: trees!.reduce((total, tree) => total + tree.position.x, 0) / trees!.length,
          z: trees!.reduce((total, tree) => total + tree.position.z, 0) / trees!.length,
        }))
        .sort((first, second) => first.x - second.x);
      return `${plan.topology.geography.id}:${anchors
        .map(
          (point) =>
            `${Math.round(((point.x - envelope.minX) / envelope.width) * 10)}:${Math.round(
              ((point.z - envelope.minZ) / envelope.depth) * 10,
            )}`,
        )
        .join("|")}`;
    });

    expect(new Set(signatures).size).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it("turns the full canopy budget into a few continuous irregular woodland belts", () => {
    const world = fixture();
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const enrichment = createPlannedVisualEnrichment(plan, scatter);
    const belts = Object.groupBy(enrichment.supplementalTrees, (tree) => tree.beltId);

    expect(plan.identity.scaleTier).toBe("vast");
    expect(scatter.trees.length + enrichment.supplementalTrees.length).toBeGreaterThanOrEqual(205);
    expect(scatter.trees.length + enrichment.supplementalTrees.length).toBeLessThanOrEqual(240);
    const allTrees = [
      ...scatter.trees.map((tree) => tree.transform.position),
      ...enrichment.supplementalTrees.map((tree) => tree.position),
    ];
    const components = connectedComponents(allTrees, 18);
    expect(components[0]!.length / allTrees.length).toBeGreaterThanOrEqual(0.55);
    expect(components.length).toBeGreaterThanOrEqual(2);
    expect(
      components.slice(1).reduce((total, component) => total + component.length, 0) /
        allTrees.length,
    ).toBeGreaterThanOrEqual(0.2);
    expect(
      components.slice(1).reduce((total, component) => total + component.length, 0) /
        allTrees.length,
    ).toBeLessThanOrEqual(0.35);
    expect(enrichment.supplementalTrees.length / allTrees.length).toBeGreaterThanOrEqual(0.2);
    expect(enrichment.supplementalTrees.length / allTrees.length).toBeLessThanOrEqual(0.35);
    const dominantGroveIds = new Set(
      scatter.trees.filter((tree) => tree.woodlandRole === "dominant").map((tree) => tree.groveId),
    );
    const connectedGroveIds = new Set(
      enrichment.supplementalTrees.flatMap((tree) => [tree.beltStartGroveId, tree.beltEndGroveId]),
    );
    expect(connectedGroveIds).toEqual(dominantGroveIds);

    for (const [beltId, trees] of Object.entries(belts)) {
      expect(
        connectedAt(
          trees!.map((tree) => tree.position),
          18,
        ),
        beltId,
      ).toBe(true);
      const startTrees = scatter.trees
        .filter((tree) => tree.groveId === trees![0]!.beltStartGroveId)
        .map((tree) => tree.transform.position);
      const endTrees = scatter.trees
        .filter((tree) => tree.groveId === trees![0]!.beltEndGroveId)
        .map((tree) => tree.transform.position);
      expect(
        Math.min(
          ...trees!.flatMap((tree) => startTrees.map((base) => distance(tree.position, base))),
        ),
        `${beltId}:start attachment`,
      ).toBeLessThanOrEqual(18);
      expect(
        Math.min(
          ...trees!.flatMap((tree) => endTrees.map((base) => distance(tree.position, base))),
        ),
        `${beltId}:end attachment`,
      ).toBeLessThanOrEqual(18);

      for (const tree of trees!) {
        const region = classifyPlannedTerrainRegion(plan, tree.position.x, tree.position.z);
        expect(region.inside, tree.id).toBe(true);
        expect(region.water, tree.id).toBeNull();
        expect(["low-meadow", "high-meadow"], tree.id).toContain(region.material);
        expect(region.slopeDegrees, tree.id).toBeLessThanOrEqual(24);
      }
    }
  });

  it("keeps four primary compounds plus one subordinate commons and safe wildlife routes", () => {
    const world = fixture();
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const buildingsByHamlet = Object.groupBy(scatter.buildings, (building) => building.hamletId);
    const hamletsById = new Map(plan.topology.hamlets.map((hamlet) => [hamlet.id, hamlet]));
    const primarySpans: number[] = [];
    const satelliteSpans: number[] = [];
    const walkers = scatter.wildlife.filter(
      (animal) => animal.behavior === "wander" && animal.wanderPath.length >= 4,
    );

    expect(scatter.buildings).toHaveLength(28);
    expect(Object.keys(buildingsByHamlet)).toHaveLength(5);
    for (const [hamletId, buildings] of Object.entries(buildingsByHamlet)) {
      const satellite = hamletsById.get(hamletId)?.role === "commons-hamlet";
      expect(buildings, hamletId).toHaveLength(satellite ? 4 : 6);
      const xs = buildings!.map((building) => building.transform.position.x);
      const zs = buildings!.map((building) => building.transform.position.z);
      const span = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      (satellite ? satelliteSpans : primarySpans).push(span);
      expect(span, hamletId).toBeGreaterThanOrEqual(satellite ? 16 : 24);
      expect(span, hamletId).toBeLessThanOrEqual(satellite ? 34 : 42);
      const structureById = [
        ...buildings!,
        ...scatter.landmarks.filter((landmark) => landmark.hamletId === hamletId),
      ];
      const neighbors = nearestNeighborDistances(
        buildings!.map((building) => building.transform.position),
      );
      expect(Math.min(...neighbors), hamletId).toBeGreaterThanOrEqual(4);
      const visibleGaps = nearestVisibleGap(structureById);
      expect(Math.min(...visibleGaps), hamletId).toBeGreaterThanOrEqual(1.5);
      expect(Math.max(...visibleGaps), hamletId).toBeLessThanOrEqual(6);
    }
    expect(primarySpans).toHaveLength(4);
    expect(satelliteSpans).toHaveLength(1);
    expect(Math.max(...satelliteSpans)).toBeLessThan(Math.min(...primarySpans));

    const signatures = new Set(
      Object.values(buildingsByHamlet).flatMap((buildings) => [
        ...new Set(buildings!.map((building) => building.arrangement)),
      ]),
    );
    expect(signatures.size).toBeGreaterThanOrEqual(3);

    expect(scatter.wildlife).toHaveLength(12);
    expect(walkers.length).toBeGreaterThanOrEqual(8);
    expect(new Set(walkers.map((animal) => animal.zoneId)).size).toBeGreaterThanOrEqual(3);
    for (const animal of walkers) {
      expect(pathLength(animal.wanderPath), animal.id).toBeGreaterThanOrEqual(14);
      for (const waypoint of animal.wanderPath) {
        const region = classifyPlannedTerrainRegion(plan, waypoint.x, waypoint.z);
        expect(region.inside, `${animal.id}:waypoint`).toBe(true);
        expect(region.water, `${animal.id}:waypoint`).toBeNull();
        expect(region.material, `${animal.id}:waypoint`).not.toBe("shore");
        expect(region.slopeDegrees, `${animal.id}:waypoint`).toBeLessThanOrEqual(18);
      }
    }
  });

  it("uses broken transition clusters instead of a uniform shoreline necklace", () => {
    const world = fixture();
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const enrichment = createPlannedVisualEnrichment(plan, scatter);
    const shoreClusters = Object.groupBy(enrichment.shoreDetails, (detail) => detail.clusterId);
    const surfaceTotal =
      scatter.groundCoverClusters.reduce((total, cluster) => total + cluster.members.length, 0) +
      scatter.ambientDetails.length +
      enrichment.cliffFormations.length +
      enrichment.shoreDetails.length +
      enrichment.meadowDetails.length;

    expect(enrichment.shoreDetails.length).toBeGreaterThanOrEqual(28);
    expect(enrichment.shoreDetails.length).toBeLessThanOrEqual(40);
    expect(Object.keys(shoreClusters).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(shoreClusters).length).toBeLessThanOrEqual(10);
    for (const [clusterId, details] of Object.entries(shoreClusters)) {
      expect(details?.length, clusterId).toBeGreaterThanOrEqual(2);
      expect(details?.length, clusterId).toBeLessThanOrEqual(6);
    }
    expect(enrichment.cliffFormations.length).toBeGreaterThanOrEqual(6);
    expect(enrichment.cliffFormations.length).toBeLessThanOrEqual(8);
    expect(enrichment.meadowDetails.length).toBeGreaterThanOrEqual(48);
    expect(enrichment.meadowDetails.length).toBeLessThanOrEqual(72);
    expect(surfaceTotal).toBeLessThanOrEqual(plan.topology.visualBudgets.maxSurfaceScatter);
  });
});
