import { readFileSync } from "node:fs";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { KingdomWorld } from "@/lib/kingdom/types";
import { createWorldPlan } from "@/lib/kingdom/world-plan";

import { createPlannedScatter } from "./planned-scatter";
import {
  createPlannedScenePickRecords,
  isPlannedStructurePickable,
  plannedPickRecordForInstance,
  PlannedScenePickProxy,
} from "./planned-scene-picking";

const NEXTJS_FIXTURE_URL = new URL("./test-fixtures/nextjs-large-world.json", import.meta.url);

describe("planned analytic picking index", () => {
  it("retains every captured structure/province selection and exact entity provenance", () => {
    const world = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const records = createPlannedScenePickRecords(world, plan, scatter);
    const boxes = records.filter((record) => record.shape.kind === "box");
    const ellipses = records.filter((record) => record.shape.kind === "ellipse");
    const structures = [...scatter.buildings, ...scatter.landmarks];
    const entities = new Map(world.entities.map((entity) => [entity.id, entity]));
    const provinces = new Map(world.provinces.map((province) => [province.id, province]));

    expect(structures.every((structure) => isPlannedStructurePickable(structure, plan))).toBe(true);
    expect(boxes.map((record) => record.id)).toEqual(
      structures.map((structure) => `${structure.id}:hit`),
    );
    expect(ellipses.map((record) => record.id)).toEqual(
      scatter.semanticHitZones.map((zone) => zone.id),
    );
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length);
    for (const [index, record] of boxes.entries()) {
      const structure = structures[index]!;
      const entity = structure.entityId ? entities.get(structure.entityId) : undefined;
      if (entity) {
        expect(record.selection).toEqual({ kind: "entity", entity });
        expect(record.sourceUrl).toBe(entity.sourceUrl);
      } else {
        const province = provinces.get(structure.provinceId);
        expect(province, structure.id).toBeDefined();
        expect(record.selection).toEqual({ kind: "province", province });
        expect(record.sourceUrl).toBeNull();
      }
    }
    for (const [index, record] of ellipses.entries()) {
      const zone = scatter.semanticHitZones[index]!;
      const province = provinces.get(zone.provinceId);
      expect(province, zone.id).toBeDefined();
      expect(record.selection).toEqual({ kind: "province", province });
      expect(record.sourceUrl).toBeNull();
    }
  }, 10_000);

  it("returns per-record instance ids from one zero-draw Object3D proxy", () => {
    const world = JSON.parse(readFileSync(NEXTJS_FIXTURE_URL, "utf8")) as KingdomWorld;
    const plan = createWorldPlan(world);
    const scatter = createPlannedScatter(world, plan);
    const records = createPlannedScenePickRecords(world, plan, scatter);
    const recordIndex = records.findIndex((record) => record.shape.kind === "box");
    const record = records[recordIndex]!;
    if (record.shape.kind !== "box") throw new Error("Fixture requires a box record.");
    const center = record.shape.bounds.getCenter(new THREE.Vector3());
    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(center.x, center.y + 100, center.z),
      new THREE.Vector3(0, -1, 0),
    );
    const proxy = new PlannedScenePickProxy(records);
    const intersections: THREE.Intersection[] = [];
    proxy.raycast(raycaster, intersections);
    const hit = intersections.find((intersection) => intersection.instanceId === recordIndex);

    expect(proxy).toBeInstanceOf(THREE.Object3D);
    expect(proxy).not.toBeInstanceOf(THREE.Mesh);
    expect(hit?.object).toBe(proxy);
    expect(plannedPickRecordForInstance(records, hit?.instanceId)).toBe(record);
  }, 10_000);
});
