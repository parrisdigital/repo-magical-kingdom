import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const PLANNED_WALK_WILDLIFE_LOD_SCHEMA = "planned-walk-wildlife-lod/v1" as const;

export type PlannedWalkWildlifeLodRole = "deer" | "fox" | "stag";

export const PLANNED_WALK_WILDLIFE_LOD_CONTRACT = Object.freeze({
  maximumFarDrawCallsPerPopulatedRole: 1,
  maximumAnimatedSourcePrimitives: 6,
  trianglesPerFarInstanceByRole: Object.freeze({
    deer: 196,
    fox: 216,
    stag: 292,
  }),
});

type PartOptions = Readonly<{
  color: THREE.ColorRepresentation;
  position?: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
}>;

function coloredPart(geometry: THREE.BufferGeometry, options: PartOptions): THREE.BufferGeometry {
  const part = geometry.index ? geometry.toNonIndexed() : geometry;
  if (part !== geometry) geometry.dispose();
  const color = new THREE.Color(options.color);
  const count = part.getAttribute("position").count;
  part.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(
      Array.from({ length: count }, () => [color.r, color.g, color.b]).flat(),
      3,
    ),
  );
  if (options.scale) part.scale(...options.scale);
  if (options.rotation) part.rotateX(options.rotation[0]);
  if (options.rotation) part.rotateY(options.rotation[1]);
  if (options.rotation) part.rotateZ(options.rotation[2]);
  if (options.position) part.translate(...options.position);
  return part;
}

function ellipsoid(
  scale: readonly [number, number, number],
  position: readonly [number, number, number],
  color: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  return coloredPart(new THREE.IcosahedronGeometry(1, 0), { color, position, scale });
}

function leg(
  position: readonly [number, number, number],
  height: number,
  color: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  return coloredPart(new THREE.CylinderGeometry(0.035, 0.045, height, 5, 1), {
    color,
    position,
  });
}

function ear(
  position: readonly [number, number, number],
  scale: readonly [number, number, number],
  color: THREE.ColorRepresentation,
  rotationZ = 0,
): THREE.BufferGeometry {
  return coloredPart(new THREE.ConeGeometry(1, 1, 4, 1), {
    color,
    position,
    rotation: [0, 0, rotationZ],
    scale,
  });
}

function branch(
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  radius: number,
  color: THREE.ColorRepresentation,
): THREE.BufferGeometry {
  const startVector = new THREE.Vector3(...start);
  const endVector = new THREE.Vector3(...end);
  const direction = endVector.clone().sub(startVector);
  const geometry = new THREE.CylinderGeometry(radius, radius * 0.82, direction.length(), 4, 1);
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    ),
  );
  const midpoint = startVector.add(endVector).multiplyScalar(0.5);
  return coloredPart(geometry, {
    color,
    position: [midpoint.x, midpoint.y, midpoint.z],
  });
}

function deerParts(): THREE.BufferGeometry[] {
  const coat = "#8f6747";
  const dark = "#4a3024";
  const cream = "#d8c2a1";
  return [
    ellipsoid([0.25, 0.27, 0.42], [0, 0.54, -0.03], coat),
    ellipsoid([0.15, 0.25, 0.14], [0, 0.72, 0.29], coat),
    ellipsoid([0.15, 0.14, 0.19], [0, 0.84, 0.45], coat),
    ellipsoid([0.095, 0.075, 0.12], [0, 0.81, 0.6], dark),
    ellipsoid([0.1, 0.08, 0.13], [0, 0.52, -0.42], cream),
    leg([-0.15, 0.23, 0.22], 0.42, dark),
    leg([0.15, 0.23, 0.22], 0.42, dark),
    leg([-0.15, 0.23, -0.23], 0.42, dark),
    leg([0.15, 0.23, -0.23], 0.42, dark),
    ear([-0.09, 0.95, 0.43], [0.055, 0.14, 0.045], dark, 0.18),
    ear([0.09, 0.95, 0.43], [0.055, 0.14, 0.045], dark, -0.18),
  ];
}

function foxParts(): THREE.BufferGeometry[] {
  const coat = "#c9662d";
  const dark = "#432c28";
  const cream = "#f0d5ae";
  return [
    ellipsoid([0.22, 0.22, 0.46], [0, 0.46, -0.06], coat),
    ellipsoid([0.2, 0.19, 0.22], [0, 0.72, 0.4], coat),
    ellipsoid([0.11, 0.09, 0.17], [0, 0.67, 0.59], cream),
    ellipsoid([0.055, 0.045, 0.065], [0, 0.68, 0.73], dark),
    ellipsoid([0.15, 0.16, 0.5], [0, 0.56, -0.5], coat),
    ellipsoid([0.13, 0.13, 0.2], [0, 0.66, -0.81], cream),
    leg([-0.13, 0.2, 0.21], 0.35, dark),
    leg([0.13, 0.2, 0.21], 0.35, dark),
    leg([-0.13, 0.2, -0.24], 0.35, dark),
    leg([0.13, 0.2, -0.24], 0.35, dark),
    ear([-0.1, 0.9, 0.38], [0.08, 0.22, 0.065], dark, 0.12),
    ear([0.1, 0.9, 0.38], [0.08, 0.22, 0.065], dark, -0.12),
  ];
}

function stagParts(): THREE.BufferGeometry[] {
  const coat = "#745137";
  const dark = "#382a22";
  const antler = "#c2a277";
  return [
    ellipsoid([0.29, 0.29, 0.46], [0, 0.49, -0.04], coat),
    ellipsoid([0.17, 0.28, 0.16], [0, 0.7, 0.3], coat),
    ellipsoid([0.16, 0.14, 0.2], [0, 0.8, 0.48], coat),
    ellipsoid([0.1, 0.075, 0.13], [0, 0.77, 0.64], dark),
    ellipsoid([0.11, 0.09, 0.14], [0, 0.48, -0.46], dark),
    leg([-0.17, 0.22, 0.23], 0.4, dark),
    leg([0.17, 0.22, 0.23], 0.4, dark),
    leg([-0.17, 0.22, -0.24], 0.4, dark),
    leg([0.17, 0.22, -0.24], 0.4, dark),
    ear([-0.1, 0.9, 0.46], [0.055, 0.13, 0.045], dark, 0.18),
    ear([0.1, 0.9, 0.46], [0.055, 0.13, 0.045], dark, -0.18),
    branch([-0.09, 0.88, 0.45], [-0.16, 1, 0.43], 0.018, antler),
    branch([-0.16, 0.96, 0.43], [-0.27, 1.02, 0.43], 0.015, antler),
    branch([-0.14, 0.94, 0.43], [-0.12, 1.04, 0.42], 0.014, antler),
    branch([0.09, 0.88, 0.45], [0.16, 1, 0.43], 0.018, antler),
    branch([0.16, 0.96, 0.43], [0.27, 1.02, 0.43], 0.015, antler),
    branch([0.14, 0.94, 0.43], [0.12, 1.04, 0.42], 0.014, antler),
  ];
}

function normalizedGeometry(parts: THREE.BufferGeometry[], role: PlannedWalkWildlifeLodRole) {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error(`Unable to merge ${role} Walk wildlife LOD geometry.`);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) {
    geometry.dispose();
    throw new Error(`${role} Walk wildlife LOD geometry requires finite bounds.`);
  }
  const height = Math.max(0.000_001, bounds.max.y - bounds.min.y);
  geometry.translate(0, -bounds.min.y, 0);
  geometry.scale(1 / height, 1 / height, 1 / height);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * One stylized, normalized geometry per animal role is instanced for every far
 * actor. Vertex colors retain the role's face, coat, tail, and antler accents
 * in a single material draw while the nearest Walk actor keeps its authored,
 * skinned GLB and animation clips.
 */
export function createPlannedWalkWildlifeLodGeometry(
  role: PlannedWalkWildlifeLodRole,
): THREE.BufferGeometry {
  const geometry = normalizedGeometry(
    role === "deer" ? deerParts() : role === "fox" ? foxParts() : stagParts(),
    role,
  );
  const triangles = (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
  const expected = PLANNED_WALK_WILDLIFE_LOD_CONTRACT.trianglesPerFarInstanceByRole[role];
  if (triangles !== expected) {
    geometry.dispose();
    throw new Error(
      `${role} Walk wildlife LOD drifted to ${triangles} triangles; expected ${expected}.`,
    );
  }
  return geometry;
}
