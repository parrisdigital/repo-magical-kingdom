import * as THREE from "three";

import type { KingdomWorld, Selection, WorldPlan } from "@/lib/kingdom";

import type { PlannedScatter } from "./planned-scatter";
import { classifyPlannedTerrainRegion, samplePlannedTerrainHeight } from "./planned-terrain-model";

export const PLANNED_SCENE_PICKING_DRAW_CALLS = 0;

type PickSelection = Exclude<Selection, null>;

type ArchitecturePickShape = Readonly<{
  kind: "box";
  bounds: THREE.Box3;
}>;

type ProvincePickShape = Readonly<{
  kind: "ellipse";
  center: THREE.Vector3;
  radiusX: number;
  radiusZ: number;
}>;

export type PlannedScenePickRecord = Readonly<{
  id: string;
  selection: PickSelection;
  sourceUrl: string | null;
  shape: ArchitecturePickShape | ProvincePickShape;
}>;

export function isPlannedStructurePickable(
  structure: PlannedScatter["buildings"][number] | PlannedScatter["landmarks"][number],
  plan: WorldPlan,
): boolean {
  const region = classifyPlannedTerrainRegion(
    plan,
    structure.transform.position.x,
    structure.transform.position.z,
  );
  return (
    region.inside &&
    region.water === null &&
    region.material !== "shore" &&
    region.slopeDegrees <= structure.terrain.maxSlopeDegrees
  );
}

/** Mirrors the previous transparent box/circle hit geometry as analytic records. */
export function createPlannedScenePickRecords(
  world: KingdomWorld,
  plan: WorldPlan,
  scatter: PlannedScatter,
): ReadonlyArray<PlannedScenePickRecord> {
  const entities = new Map(world.entities.map((entity) => [entity.id, entity]));
  const provinces = new Map(world.provinces.map((province) => [province.id, province]));
  const records: PlannedScenePickRecord[] = [];
  for (const structure of [...scatter.buildings, ...scatter.landmarks]) {
    if (!isPlannedStructurePickable(structure, plan)) continue;
    const entity = structure.entityId ? entities.get(structure.entityId) : undefined;
    const province = provinces.get(structure.provinceId);
    const selection: PickSelection | undefined = entity
      ? { kind: "entity", entity }
      : province
        ? { kind: "province", province }
        : undefined;
    if (!selection) continue;
    const x = structure.transform.position.x;
    const z = structure.transform.position.z;
    const horizontalScale = structure.architecture.desiredVisualScale;
    const heightScale = structure.architecture.desiredHeightScale;
    const center = new THREE.Vector3(
      x,
      samplePlannedTerrainHeight(plan, x, z) + heightScale * 2.8,
      z,
    );
    const size = new THREE.Vector3(4.8 * horizontalScale, 6.2 * heightScale, 4.8 * horizontalScale);
    records.push({
      id: `${structure.id}:hit`,
      selection,
      sourceUrl: entity?.sourceUrl ?? null,
      shape: { kind: "box", bounds: new THREE.Box3().setFromCenterAndSize(center, size) },
    });
  }
  for (const zone of scatter.semanticHitZones) {
    const province = provinces.get(zone.provinceId);
    if (!province) continue;
    records.push({
      id: zone.id,
      selection: { kind: "province", province },
      sourceUrl: null,
      shape: {
        kind: "ellipse",
        center: new THREE.Vector3(
          zone.center.x,
          samplePlannedTerrainHeight(plan, zone.center.x, zone.center.z) + 0.3,
          zone.center.z,
        ),
        radiusX: zone.radiusX,
        radiusZ: zone.radiusZ,
      },
    });
  }
  return records;
}

function ellipseIntersection(
  ray: THREE.Ray,
  shape: ProvincePickShape,
  target: THREE.Vector3,
): THREE.Vector3 | null {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -shape.center.y);
  const point = ray.intersectPlane(plane, target);
  if (!point) return null;
  const normalizedX = (point.x - shape.center.x) / shape.radiusX;
  const normalizedZ = (point.z - shape.center.z) / shape.radiusZ;
  return normalizedX * normalizedX + normalizedZ * normalizedZ <= 1 ? point : null;
}

/**
 * One event object, zero WebGL submissions. instanceId is the immutable record
 * index, so R3F still tracks per-entity hover transitions and provenance.
 */
export class PlannedScenePickProxy extends THREE.Object3D {
  readonly records: ReadonlyArray<PlannedScenePickRecord>;

  constructor(records: ReadonlyArray<PlannedScenePickRecord>) {
    super();
    this.name = "planned-raycast-interaction-index";
    this.records = records;
  }

  override raycast(raycaster: THREE.Raycaster, intersections: THREE.Intersection[]): void {
    const point = new THREE.Vector3();
    for (let index = 0; index < this.records.length; index += 1) {
      const record = this.records[index]!;
      const hit =
        record.shape.kind === "box"
          ? raycaster.ray.intersectBox(record.shape.bounds, point)
          : ellipseIntersection(raycaster.ray, record.shape, point);
      if (!hit) continue;
      const distance = raycaster.ray.origin.distanceTo(hit);
      if (distance < raycaster.near || distance > raycaster.far) continue;
      intersections.push({
        distance,
        point: hit.clone(),
        object: this,
        instanceId: index,
      });
    }
  }
}

export function plannedPickRecordForInstance(
  records: ReadonlyArray<PlannedScenePickRecord>,
  instanceId: number | undefined,
): PlannedScenePickRecord | null {
  return instanceId === undefined ? null : (records[instanceId] ?? null);
}
