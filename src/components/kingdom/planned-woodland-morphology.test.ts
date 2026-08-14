import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { createPlannedScatter } from "./planned-scatter";
import {
  classifyPlannedTerrainRegion,
  getPlannedTerrainDefinition,
  queryPlannedWaterDistance,
} from "./planned-terrain-model";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

type Point = Readonly<{ x: number; z: number }>;

function fixture(): KingdomWorld {
  return JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
}

function distance(first: Point, second: Point): number {
  return Math.hypot(first.x - second.x, first.z - second.z);
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

function pcaAspectRatio(points: ReadonlyArray<Point>): number {
  const meanX = points.reduce((total, point) => total + point.x, 0) / points.length;
  const meanZ = points.reduce((total, point) => total + point.z, 0) / points.length;
  const xx = points.reduce((total, point) => total + (point.x - meanX) ** 2, 0) / points.length;
  const zz = points.reduce((total, point) => total + (point.z - meanZ) ** 2, 0) / points.length;
  const xz =
    points.reduce((total, point) => total + (point.x - meanX) * (point.z - meanZ), 0) /
    points.length;
  const trace = xx + zz;
  const discriminant = Math.sqrt(Math.max(0, (xx - zz) ** 2 + 4 * xz ** 2));
  const major = Math.max(0.001, (trace + discriminant) / 2);
  const minor = Math.max(0.001, (trace - discriminant) / 2);
  return Math.sqrt(major / minor);
}

function maximumSpan(points: ReadonlyArray<Point>): number {
  let span = 0;
  for (const [index, point] of points.entries()) {
    for (let candidate = index + 1; candidate < points.length; candidate += 1) {
      span = Math.max(span, distance(point, points[candidate]!));
    }
  }
  return span;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const deltaX = end.x - start.x;
  const deltaZ = end.z - start.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const progress = Math.min(
    1,
    Math.max(0, ((point.x - start.x) * deltaX + (point.z - start.z) * deltaZ) / lengthSquared),
  );
  return Math.hypot(
    point.x - (start.x + deltaX * progress),
    point.z - (start.z + deltaZ * progress),
  );
}

function settlementPathDistance(point: Point, plan: ReturnType<typeof createWorldPlan>): number {
  const terraces = [...getPlannedTerrainDefinition(plan).terraces].sort(
    (first, second) => first.center.z - second.center.z || first.id.localeCompare(second.id),
  );
  return Math.min(
    ...terraces
      .slice(1)
      .map((terrace, index) => distanceToSegment(point, terraces[index]!.center, terrace.center)),
  );
}

describe("vast woodland morphology", () => {
  it("forms a long, breathable dominant woodland with separate satellites", () => {
    const world = fixture();
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const enrichment = createPlannedVisualEnrichment(plan, scatter);
    const points = [
      ...scatter.trees.map((tree) => tree.transform.position),
      ...enrichment.supplementalTrees.map((tree) => tree.position),
    ];
    const components = connectedComponents(points, 18);
    const dominant = components[0]!.map((index) => points[index]!);
    const maximumWindowCount = Math.max(
      ...points.map(
        (center) => points.filter((candidate) => distance(center, candidate) <= 24).length,
      ),
    );
    const bearingBins = Array.from({ length: 12 }, () => 0);
    for (const [index, point] of points.entries()) {
      const nearest = points
        .map((candidate, candidateIndex) => ({
          candidate,
          candidateIndex,
          distance: distance(point, candidate),
        }))
        .filter(({ candidateIndex }) => candidateIndex !== index)
        .sort((first, second) => first.distance - second.distance)[0]!;
      const angle = Math.atan2(nearest.candidate.z - point.z, nearest.candidate.x - point.x);
      const bin = Math.floor(
        (((angle + Math.PI) / (Math.PI * 2)) * bearingBins.length) % bearingBins.length,
      );
      bearingBins[bin] = (bearingBins[bin] ?? 0) + 1;
    }
    const satelliteCount = components
      .slice(1)
      .reduce((total, component) => total + component.length, 0);

    expect(points.length).toBeGreaterThanOrEqual(205);
    expect(points.length).toBeLessThanOrEqual(240);
    expect(scatter.trees.filter((tree) => tree.woodlandRole === "dominant").length).toBeGreaterThan(
      0,
    );
    expect(
      scatter.trees.filter((tree) => tree.woodlandRole === "satellite").length,
    ).toBeGreaterThan(0);
    expect(enrichment.supplementalTrees.every((tree) => tree.woodlandRole === "dominant")).toBe(
      true,
    );
    expect(dominant.length / points.length).toBeGreaterThanOrEqual(0.55);
    expect(components.slice(1)).toHaveLength(2);
    expect(satelliteCount / points.length).toBeGreaterThanOrEqual(0.2);
    expect(satelliteCount / points.length).toBeLessThanOrEqual(0.35);
    expect(pcaAspectRatio(dominant)).toBeGreaterThanOrEqual(2.2);
    expect(
      maximumSpan(dominant) /
        Math.hypot(plan.topology.envelope.width, plan.topology.envelope.depth),
    ).toBeGreaterThanOrEqual(0.42);
    expect(maximumWindowCount / points.length).toBeLessThanOrEqual(0.22);
    expect(enrichment.supplementalTrees.length / points.length).toBeGreaterThanOrEqual(0.2);
    expect(enrichment.supplementalTrees.length / points.length).toBeLessThanOrEqual(0.35);
    expect(
      new Set([
        ...scatter.trees.map((tree) => tree.densityRole),
        ...enrichment.supplementalTrees.map((tree) => tree.densityRole),
      ]),
    ).toEqual(new Set(["core", "edge", "connector"]));
    expect(bearingBins.filter((count) => count > 0).length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...bearingBins) / points.length).toBeLessThanOrEqual(0.18);

    expect(scatter.canopyClearings).toHaveLength(3);
    for (const clearing of scatter.canopyClearings) {
      expect(clearing.woodlandRole).toBe("dominant");
      expect(clearing.radius * 2, clearing.id).toBeGreaterThanOrEqual(10);
      expect(clearing.radius * 2, clearing.id).toBeLessThanOrEqual(22);
      expect(
        Math.min(...points.map((point) => distance(point, clearing.center))),
        clearing.id,
      ).toBeGreaterThanOrEqual(clearing.radius);
      expect(
        points.filter((point) => {
          const gap = distance(point, clearing.center);
          return gap >= clearing.radius && gap <= clearing.radius + 14;
        }).length,
        `${clearing.id}:edge trees`,
      ).toBeGreaterThanOrEqual(4);
      const region = classifyPlannedTerrainRegion(plan, clearing.center.x, clearing.center.z);
      expect(region.inside, clearing.id).toBe(true);
      expect(region.water, clearing.id).toBeNull();
      expect(region.slopeDegrees, clearing.id).toBeLessThanOrEqual(28);
      expect(
        queryPlannedWaterDistance(plan, clearing.center.x, clearing.center.z).shoreDistance,
      ).toBeGreaterThanOrEqual(clearing.radius + 4.5);
      expect(settlementPathDistance(clearing.center, plan), clearing.id).toBeGreaterThanOrEqual(
        clearing.radius + 3.5,
      );
    }

    for (const point of points) {
      const region = classifyPlannedTerrainRegion(plan, point.x, point.z);
      expect(region.inside).toBe(true);
      expect(region.water).toBeNull();
      expect(region.material).not.toBe("shore");
      expect(region.material).not.toBe("outside");
      expect(region.slopeDegrees).toBeLessThanOrEqual(28);
    }
  }, 45_000);

  it("is repository deterministic and season invariant", () => {
    const spring = fixture();
    const springPlan = createWorldPlan(spring);
    const springScatter = createPlannedScatter(spring, springPlan);
    const springEnrichment = createPlannedVisualEnrichment(springPlan, springScatter);
    const winter: KingdomWorld = {
      ...spring,
      season: "winter",
      theme: {
        ...spring.theme,
        label: "Winter Kingdom",
        description: "The same repository woodland in winter.",
      },
    };
    const winterPlan = createWorldPlan(winter);
    const winterScatter = createPlannedScatter(winter, winterPlan);
    const winterEnrichment = createPlannedVisualEnrichment(winterPlan, winterScatter);

    expect(createPlannedScatter(spring, createWorldPlan(spring))).toEqual(springScatter);
    expect(winterScatter.trees).toEqual(springScatter.trees);
    expect(winterScatter.canopyClearings).toEqual(springScatter.canopyClearings);
    expect(winterEnrichment.supplementalTrees).toEqual(springEnrichment.supplementalTrees);
  }, 45_000);
});
