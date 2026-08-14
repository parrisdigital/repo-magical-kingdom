import * as THREE from "three";

export const PLANNED_TREE_LOD_SCHEMA = "planned-tree-lod/v1" as const;

export const PLANNED_TREE_LOD_CONTRACT = Object.freeze({
  overviewTrianglesPerInstanceByPalette: Object.freeze({
    broadleaf: 348,
    flowering: 348,
    pine: 56,
    winter: 56,
  }),
  maximumOverviewTrianglesPerInstance: 400,
  overviewDrawCallsPerPalette: 2,
  maximumOverviewPaletteCount: 4,
  maximumWalkLodFamilyCount: 2,
  walkLodDrawCallsPerFamily: 2,
  walkDetailRadius: 46,
  maximumWalkDetailInstances: 12,
  maximumWalkDetailSourcePrimitives: 2,
  maximumWalkDetailTriangleDelta: 16_000,
  targetHeight: 8.6,
});

export type PlannedTreeLodPalette = "broadleaf" | "flowering" | "pine" | "winter";

export type PlannedTreeLodRenderMode = "overview-lod" | "walk-hybrid";

export type PlannedTreeLodFamily = "deciduous" | "conifer";

export type PlannedTreeLodInstance = Readonly<{
  id: string;
  palette: PlannedTreeLodPalette;
  matrix: THREE.Matrix4;
}>;

export type PlannedTreeLodBatch = Readonly<{
  palette: PlannedTreeLodPalette;
  matrices: ReadonlyArray<THREE.Matrix4>;
}>;

export type PlannedWalkTreeLodBatch = Readonly<{
  family: PlannedTreeLodFamily;
  matrices: ReadonlyArray<THREE.Matrix4>;
  palettes: ReadonlyArray<PlannedTreeLodPalette>;
}>;

export type PlannedWalkTreeDetailCandidate = PlannedTreeLodInstance &
  Readonly<{
    detailKey: string;
    detailSourcePrimitives: number;
    detailTriangles: number;
    lodTriangles: number;
  }>;

export type PlannedWalkTreeHybrid = Readonly<{
  detail: ReadonlyArray<PlannedWalkTreeDetailCandidate>;
  far: ReadonlyArray<PlannedWalkTreeDetailCandidate>;
  detailSourcePrimitives: number;
  detailTriangleDelta: number;
}>;

export type PlannedTreeLodGeometry = Readonly<{
  trunk: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  trianglesPerInstance: number;
}>;

export function plannedTreeLodPaletteFor(
  season: "spring" | "summer" | "autumn" | "winter",
  source: Readonly<{
    paletteRole: "broadleaf" | "pine" | "flowering" | "twisted" | "mixed";
    ancient: boolean;
  }>,
): PlannedTreeLodPalette {
  if (season === "winter") return "winter";
  if (source.paletteRole === "pine") return "pine";
  if (source.paletteRole === "flowering" || source.paletteRole === "twisted" || source.ancient) {
    return "flowering";
  }
  return "broadleaf";
}

export function plannedTreeLodMode(navigationMode: "orbit" | "walk"): PlannedTreeLodRenderMode {
  return navigationMode === "walk" ? "walk-hybrid" : "overview-lod";
}

export function plannedTreeLodFamilyFor(palette: PlannedTreeLodPalette): PlannedTreeLodFamily {
  return palette === "pine" || palette === "winter" ? "conifer" : "deciduous";
}

/** Stable palette grouping keeps overview draw calls independent of repository size. */
export function createPlannedTreeLodBatches(
  instances: ReadonlyArray<PlannedTreeLodInstance>,
): ReadonlyArray<PlannedTreeLodBatch> {
  const groups = new Map<PlannedTreeLodPalette, THREE.Matrix4[]>();
  for (const instance of [...instances].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    const matrices = groups.get(instance.palette);
    if (matrices) matrices.push(instance.matrix);
    else groups.set(instance.palette, [instance.matrix]);
  }
  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([palette, matrices]) => ({ palette, matrices }));
}

/**
 * Walk uses one trunk and one canopy draw per silhouette family. Palette stays
 * per instance so spring flowers and winter canopies remain visually distinct.
 */
export function createPlannedWalkTreeLodBatches(
  instances: ReadonlyArray<PlannedTreeLodInstance>,
): ReadonlyArray<PlannedWalkTreeLodBatch> {
  const groups = new Map<
    PlannedTreeLodFamily,
    Array<Readonly<{ matrix: THREE.Matrix4; palette: PlannedTreeLodPalette }>>
  >();
  for (const instance of [...instances].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    const family = plannedTreeLodFamilyFor(instance.palette);
    const members = groups.get(family);
    const member = { matrix: instance.matrix, palette: instance.palette };
    if (members) members.push(member);
    else groups.set(family, [member]);
  }
  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([family, members]) => ({
      family,
      matrices: members.map((member) => member.matrix),
      palettes: members.map((member) => member.palette),
    }));
}

function horizontalDistanceSquared(matrix: THREE.Matrix4, x: number, z: number): number {
  const elements = matrix.elements;
  const deltaX = (elements[12] ?? 0) - x;
  const deltaZ = (elements[14] ?? 0) - z;
  return deltaX * deltaX + deltaZ * deltaZ;
}

/**
 * Keeps one nearest shipped-asset family around the living spawn. The explicit
 * draw and triangle-delta limits make the hybrid safe for the whole Walk scene,
 * while every non-selected semantic tree remains in the far LOD set.
 */
export function selectPlannedWalkTreeHybrid(
  instances: ReadonlyArray<PlannedWalkTreeDetailCandidate>,
  focus: Readonly<{ x: number; z: number }>,
): PlannedWalkTreeHybrid {
  const maximumDistanceSquared = PLANNED_TREE_LOD_CONTRACT.walkDetailRadius ** 2;
  const eligible = [...instances]
    .filter(
      (instance) =>
        instance.detailSourcePrimitives > 0 &&
        instance.detailSourcePrimitives <=
          PLANNED_TREE_LOD_CONTRACT.maximumWalkDetailSourcePrimitives &&
        horizontalDistanceSquared(instance.matrix, focus.x, focus.z) <= maximumDistanceSquared,
    )
    .sort((first, second) => {
      const distance =
        horizontalDistanceSquared(first.matrix, focus.x, focus.z) -
        horizontalDistanceSquared(second.matrix, focus.x, focus.z);
      return distance === 0 ? first.id.localeCompare(second.id) : distance;
    });
  const groups = new Map<string, PlannedWalkTreeDetailCandidate[]>();
  for (const instance of eligible) {
    const members = groups.get(instance.detailKey);
    if (members) members.push(instance);
    else groups.set(instance.detailKey, [instance]);
  }
  const orderedGroups = [...groups.entries()].sort((first, second) => {
    const firstMember = first[1][0]!;
    const secondMember = second[1][0]!;
    const distance =
      horizontalDistanceSquared(firstMember.matrix, focus.x, focus.z) -
      horizontalDistanceSquared(secondMember.matrix, focus.x, focus.z);
    return distance === 0 ? first[0].localeCompare(second[0]) : distance;
  });

  let detail: PlannedWalkTreeDetailCandidate[] = [];
  let detailTriangleDelta = 0;
  let detailSourcePrimitives = 0;
  for (const [, members] of orderedGroups) {
    const selected: PlannedWalkTreeDetailCandidate[] = [];
    let selectedDelta = 0;
    for (const member of members) {
      const delta = Math.max(0, member.detailTriangles - member.lodTriangles);
      if (
        selected.length >= PLANNED_TREE_LOD_CONTRACT.maximumWalkDetailInstances ||
        selectedDelta + delta > PLANNED_TREE_LOD_CONTRACT.maximumWalkDetailTriangleDelta
      ) {
        continue;
      }
      selected.push(member);
      selectedDelta += delta;
    }
    if (selected.length > 0) {
      detail = selected;
      detailTriangleDelta = selectedDelta;
      detailSourcePrimitives = selected[0]!.detailSourcePrimitives;
      break;
    }
  }

  const detailIds = new Set(detail.map((instance) => instance.id));
  const far = instances.filter((instance) => !detailIds.has(instance.id));
  return { detail, far, detailSourcePrimitives, detailTriangleDelta };
}

function canopyGeometry(palette: PlannedTreeLodPalette): THREE.BufferGeometry {
  if (palette === "pine" || palette === "winter") {
    const upper = new THREE.ConeGeometry(1.36, 3.5, 7, 1, false);
    upper.translate(0, 4.42, 0);
    const lower = new THREE.ConeGeometry(1.72, 4.1, 7, 1, false);
    lower.translate(0, 3.05, 0);
    const geometry = mergeIndexedGeometries([upper, lower]);
    upper.dispose();
    lower.dispose();
    return geometry;
  }
  const canopy = new THREE.IcosahedronGeometry(1.92, 3);
  canopy.scale(1.04, palette === "flowering" ? 1.05 : 1.16, 0.98);
  canopy.translate(0, 3.75, 0);
  return canopy;
}

function mergeIndexedGeometries(
  geometries: ReadonlyArray<THREE.BufferGeometry>,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const source of geometries) {
    const geometry = source.index ? source : source.toNonIndexed();
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    for (let index = 0; index < position.count; index += 1) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
      normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
    }
    if (geometry.index) {
      for (let index = 0; index < geometry.index.count; index += 1) {
        indices.push(geometry.index.getX(index) + offset);
      }
    } else {
      for (let index = 0; index < position.count; index += 1) indices.push(offset + index);
    }
    offset += position.count;
    if (geometry !== source) geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createPlannedTreeLodGeometry(
  palette: PlannedTreeLodPalette,
): PlannedTreeLodGeometry {
  const trunk = new THREE.CylinderGeometry(0.34, 0.5, 3.2, 7, 1, false);
  trunk.translate(0, 1.6, 0);
  const canopy = canopyGeometry(palette);
  trunk.computeBoundingBox();
  canopy.computeBoundingBox();
  const minimumY = Math.min(trunk.boundingBox!.min.y, canopy.boundingBox!.min.y);
  const maximumY = Math.max(trunk.boundingBox!.max.y, canopy.boundingBox!.max.y);
  const height = maximumY - minimumY;
  const visualScale = PLANNED_TREE_LOD_CONTRACT.targetHeight / height;
  for (const geometry of [trunk, canopy]) {
    geometry.translate(0, -minimumY, 0);
    geometry.scale(visualScale, visualScale, visualScale);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  const triangleCount = (geometry: THREE.BufferGeometry) =>
    (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
  const trianglesPerInstance = triangleCount(trunk) + triangleCount(canopy);
  const expectedTriangles =
    PLANNED_TREE_LOD_CONTRACT.overviewTrianglesPerInstanceByPalette[palette];
  if (trianglesPerInstance !== expectedTriangles) {
    trunk.dispose();
    canopy.dispose();
    throw new Error(
      `Overview tree LOD ${palette} geometry drifted to ${trianglesPerInstance} triangles; expected ${expectedTriangles}.`,
    );
  }
  if (trianglesPerInstance > PLANNED_TREE_LOD_CONTRACT.maximumOverviewTrianglesPerInstance) {
    trunk.dispose();
    canopy.dispose();
    throw new RangeError(
      `Overview tree LOD generated ${trianglesPerInstance} triangles; maximum is ${PLANNED_TREE_LOD_CONTRACT.maximumOverviewTrianglesPerInstance}.`,
    );
  }
  return { trunk, canopy, trianglesPerInstance };
}

export function disposePlannedTreeLodGeometry(geometry: PlannedTreeLodGeometry): void {
  geometry.trunk.dispose();
  geometry.canopy.dispose();
}
