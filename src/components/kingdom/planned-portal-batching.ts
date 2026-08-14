import * as THREE from "three";

import type { KingdomWorld, RepositoryPortal, WorldPlan } from "@/lib/kingdom";

import { samplePlannedTerrainHeight } from "./planned-terrain-model";

export const PLANNED_PORTAL_BATCH_DRAW_CALLS = 2;

export type PlannedPortalInstance = Readonly<{
  portal: RepositoryPortal;
  position: THREE.Vector3;
}>;

export function createPlannedPortalInstances(
  world: KingdomWorld,
  plan: WorldPlan,
): ReadonlyArray<PlannedPortalInstance> {
  return world.portals.map((portal) => ({
    portal,
    position: new THREE.Vector3(
      portal.position.x,
      samplePlannedTerrainHeight(plan, portal.position.x, portal.position.z) + 2.3,
      portal.position.z,
    ),
  }));
}

export function writePlannedPortalMatrices(
  instances: ReadonlyArray<PlannedPortalInstance>,
  rotationY: number,
  rings: THREE.InstancedMesh,
  disks: THREE.InstancedMesh,
): void {
  const scale = new THREE.Vector3(1, 1, 1);
  const ringRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0));
  const diskRotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, rotationY + Math.PI / 2, 0),
  );
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index]!;
    rings.setMatrixAt(index, matrix.compose(instance.position, ringRotation, scale));
    disks.setMatrixAt(index, matrix.compose(instance.position, diskRotation, scale));
  }
  rings.instanceMatrix.needsUpdate = true;
  disks.instanceMatrix.needsUpdate = true;
}

export function plannedPortalForInstance(
  instances: ReadonlyArray<PlannedPortalInstance>,
  instanceId: number | undefined,
): RepositoryPortal | null {
  return instanceId === undefined ? null : (instances[instanceId]?.portal ?? null);
}
