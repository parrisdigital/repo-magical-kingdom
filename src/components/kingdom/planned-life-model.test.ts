import { describe, expect, it } from "vitest";

import { createDemoKingdom } from "@/lib/kingdom/demo-world";
import { KINGDOM_SEASONS, type KingdomSeason } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { createPlannedScatter } from "./planned-scatter";
import { samplePlannedTerrainHeight, samplePlannedWaterSurface } from "./planned-terrain-model";
import { createPlannedVisualEnrichment } from "./planned-visual-enrichment";
import {
  createPlannedLifePlan,
  isPlannedLifeKindVisible,
  MAX_PLANNED_LIFE_PARTICLES,
  samplePlannedLifeParticle,
} from "./planned-life-model";

function createFixture(season: KingdomSeason = "spring") {
  const world = createDemoKingdom(season);
  const plan = createWorldPlan(world);
  const scatter = createPlannedScatter(world, plan);
  const enrichment = createPlannedVisualEnrichment(plan, scatter);
  return {
    plan,
    scatter,
    enrichment,
    life: createPlannedLifePlan(plan, scatter, enrichment),
  };
}

describe("createPlannedLifePlan", () => {
  it("is deterministic and keeps all particle anchors season-invariant", () => {
    const spring = createFixture("spring");
    expect(createPlannedLifePlan(spring.plan, spring.scatter, spring.enrichment)).toEqual(
      spring.life,
    );

    const seasonal = KINGDOM_SEASONS.map((season) => createFixture(season).life);
    expect(seasonal[1]).toEqual(seasonal[0]);
    expect(seasonal[2]).toEqual(seasonal[0]);
    expect(seasonal[3]).toEqual(seasonal[0]);
  });

  it("stays under its hard budget with a restrained mix of visible life", () => {
    const { life } = createFixture();
    expect(life.schema).toBe("repo-planned-life/v1");
    expect(life.petals).toHaveLength(48);
    expect(life.smoke).toHaveLength(24);
    expect(life.waterMotes).toHaveLength(20);
    expect(life.totalParticles).toBe(92);
    expect(life.totalParticles).toBeLessThanOrEqual(MAX_PLANNED_LIFE_PARTICLES);

    const particles = [...life.petals, ...life.smoke, ...life.waterMotes];
    expect(new Set(particles.map((particle) => particle.id)).size).toBe(particles.length);
    for (const particle of particles) {
      expect(Object.values(particle.anchor).every(Number.isFinite), particle.id).toBe(true);
      expect(particle.speed, particle.id).toBeGreaterThan(0);
      expect(particle.amplitude, particle.id).toBeGreaterThan(0);
      expect(particle.travel, particle.id).toBeGreaterThan(0);
      expect(particle.size, particle.id).toBeGreaterThan(0);
    }
  });

  it("anchors spring petals locally around flowering canopies", () => {
    const { life, scatter, enrichment } = createFixture();
    const treePositions = new Map([
      ...scatter.trees.map((tree) => [tree.id, tree.transform.position] as const),
      ...enrichment.supplementalTrees.map(
        (tree) => [tree.id, { x: tree.position.x, y: 0, z: tree.position.z }] as const,
      ),
    ]);
    for (const petal of life.petals) {
      const tree = treePositions.get(petal.sourceId);
      expect(tree, petal.id).toBeDefined();
      expect(Math.hypot(petal.anchor.x - tree!.x, petal.anchor.z - tree!.z), petal.id).toBeLessThan(
        3.51,
      );
    }
  });

  it("places chimney smoke above buildings and distributes it across every hamlet", () => {
    const { life, plan, scatter } = createFixture();
    const buildings = new Map(scatter.buildings.map((building) => [building.id, building]));
    const coveredHamlets = new Set<string>();
    for (const puff of life.smoke) {
      const building = buildings.get(puff.sourceId);
      expect(building, puff.id).toBeDefined();
      coveredHamlets.add(building!.hamletId);
      expect(puff.anchor.y, puff.id).toBeGreaterThan(
        samplePlannedTerrainHeight(
          plan,
          building!.transform.position.x,
          building!.transform.position.z,
        ) + 5,
      );
    }
    expect(coveredHamlets).toEqual(new Set(plan.topology.hamlets.map((hamlet) => hamlet.id)));
  });

  it("keeps motes low over the planned lake", () => {
    const { life, plan } = createFixture();
    for (const mote of life.waterMotes) {
      const surface = samplePlannedWaterSurface(plan, mote.anchor.x, mote.anchor.z);
      expect(surface, mote.id).not.toBeNull();
      expect(mote.anchor.y - surface!, mote.id).toBeGreaterThanOrEqual(0.54);
      expect(mote.anchor.y - surface!, mote.id).toBeLessThanOrEqual(1.71);
    }
  });
});

describe("planned life motion", () => {
  it("freezes exactly at topology anchors for reduced motion", () => {
    const { life } = createFixture();
    for (const particle of [...life.petals, ...life.smoke, ...life.waterMotes]) {
      expect(samplePlannedLifeParticle(particle, 42, true), particle.id).toBe(particle.anchor);
    }
  });

  it("keeps animated paths restrained around their anchors", () => {
    const { life } = createFixture();
    for (const particle of [...life.petals, ...life.smoke, ...life.waterMotes]) {
      const position = samplePlannedLifeParticle(particle, 17.25, false);
      expect(Math.abs(position.x - particle.anchor.x), particle.id).toBeLessThanOrEqual(
        particle.amplitude + 0.000_1,
      );
      expect(Math.abs(position.z - particle.anchor.z), particle.id).toBeLessThanOrEqual(
        particle.amplitude + 0.000_1,
      );
      expect(Math.abs(position.y - particle.anchor.y), particle.id).toBeLessThanOrEqual(
        particle.travel + 0.000_1,
      );
    }
  });

  it("changes only petal visibility with season", () => {
    expect(isPlannedLifeKindVisible("petal", "spring")).toBe(true);
    expect(isPlannedLifeKindVisible("petal", "winter")).toBe(false);
    for (const season of KINGDOM_SEASONS) {
      expect(isPlannedLifeKindVisible("smoke", season)).toBe(true);
      expect(isPlannedLifeKindVisible("water-mote", season)).toBe(true);
    }
  });
});
