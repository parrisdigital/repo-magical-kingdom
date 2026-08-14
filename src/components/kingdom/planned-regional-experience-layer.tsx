"use client";

import { useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { quaterniusAssetUrl } from "@/lib/assets/quaternius";
import type { WorldPlan } from "@/lib/kingdom/world-plan";

import {
  PLANNED_REGIONAL_ASSET_COSTS,
  PLANNED_REGIONAL_EXPERIENCE_BUDGET,
  isPlannedRegionalExperienceRenderable,
  type PlannedRegionalAssetInstance,
  type PlannedRegionalAssetRole,
  type PlannedRegionalExperiencePlan,
  type PlannedRegionalMount,
  type PlannedRegionalMountBudget,
} from "./planned-regional-experience-model";
import { createPlannedWalkDetailGeometry } from "./planned-walk-detail";

export type PlannedRegionalQuality = "low" | "high";

export type PlannedRegionalExperienceLayerProps = Readonly<{
  plan: WorldPlan;
  regional: PlannedRegionalExperiencePlan;
  mount: PlannedRegionalMount;
  quality: PlannedRegionalQuality;
  reducedMotion: boolean;
}>;

export const PLANNED_REGIONAL_PROP_ASSET_URL = quaterniusAssetUrl(
  "medieval",
  "Prop_WoodenFence_Single",
);

export const PLANNED_REGIONAL_RENDER_LIMITS: Readonly<
  Record<
    PlannedRegionalQuality,
    Readonly<Record<PlannedRegionalMount, Readonly<Record<PlannedRegionalAssetRole, number>>>>
  >
> = Object.freeze({
  high: Object.freeze({
    near: Object.freeze({ grass: 24, flower: 8, reed: 0, stone: 6, fence: 8, waylight: 2 }),
    far: Object.freeze({ grass: 0, flower: 0, reed: 14, stone: 5, fence: 3, waylight: 2 }),
  }),
  low: Object.freeze({
    near: Object.freeze({ grass: 10, flower: 3, reed: 0, stone: 2, fence: 4, waylight: 1 }),
    far: Object.freeze({ grass: 0, flower: 0, reed: 7, stone: 2, fence: 1, waylight: 1 }),
  }),
});

export type PlannedRegionalPropBatch = Readonly<{
  url: typeof PLANNED_REGIONAL_PROP_ASSET_URL;
  instances: ReadonlyArray<PlannedRegionalAssetInstance>;
}>;

export type PlannedRegionalRenderSelection = Readonly<{
  instances: ReadonlyArray<PlannedRegionalAssetInstance>;
  mergedInstances: ReadonlyArray<PlannedRegionalAssetInstance>;
  propBatches: ReadonlyArray<PlannedRegionalPropBatch>;
  budget: PlannedRegionalMountBudget;
}>;

useGLTF.preload(PLANNED_REGIONAL_PROP_ASSET_URL);

function isShippedPropRole(role: PlannedRegionalAssetRole): boolean {
  return role === "fence";
}

function selectionBudget(
  mount: PlannedRegionalMount,
  instances: ReadonlyArray<PlannedRegionalAssetInstance>,
): PlannedRegionalMountBudget {
  const hasGroundOrMergedFar =
    mount === "far"
      ? instances.length > 0
      : instances.some((instance) => !isShippedPropRole(instance.role));
  const hasNearProps =
    mount === "near" && instances.some((instance) => isShippedPropRole(instance.role));
  return {
    instances: instances.length,
    drawCalls: Number(hasGroundOrMergedFar) + Number(hasNearProps),
    triangles: instances.reduce(
      (total, instance) => total + PLANNED_REGIONAL_ASSET_COSTS[instance.role].triangles,
      0,
    ),
  };
}

/** Quality selection stays cluster-first because priority zero contains one authored member per clump. */
export function createPlannedRegionalRenderSelection(
  regional: PlannedRegionalExperiencePlan,
  mount: PlannedRegionalMount,
  quality: PlannedRegionalQuality,
): PlannedRegionalRenderSelection {
  const limits = PLANNED_REGIONAL_RENDER_LIMITS[quality][mount];
  const selected = (Object.keys(limits) as PlannedRegionalAssetRole[]).flatMap((role) =>
    regional.instances
      .filter((instance) => instance.mount === mount && instance.role === role)
      .sort(
        (first, second) =>
          first.priority - second.priority ||
          first.clusterId.localeCompare(second.clusterId) ||
          first.id.localeCompare(second.id),
      )
      .slice(0, limits[role]),
  );
  selected.sort((first, second) => first.id.localeCompare(second.id));
  const mergedInstances =
    mount === "far" ? selected : selected.filter((instance) => !isShippedPropRole(instance.role));
  const propInstances =
    mount === "near" ? selected.filter((instance) => isShippedPropRole(instance.role)) : [];
  const propBatches =
    propInstances.length > 0
      ? [{ url: PLANNED_REGIONAL_PROP_ASSET_URL, instances: propInstances }]
      : [];
  const budget = selectionBudget(mount, selected);
  const ceiling = PLANNED_REGIONAL_EXPERIENCE_BUDGET;
  if (
    budget.instances > ceiling.maximumInstances[mount] ||
    budget.drawCalls > ceiling.maximumDrawCalls[mount] ||
    budget.triangles > ceiling.maximumTriangles[mount]
  ) {
    throw new RangeError(`Regional ${quality}/${mount} renderer selection exceeds its budget.`);
  }
  return { instances: selected, mergedInstances, propBatches, budget };
}

function regionalRoleColor(plan: WorldPlan, role: PlannedRegionalAssetRole): THREE.Color {
  if (role === "grass") return new THREE.Color(plan.appearance.terrain.meadow);
  if (role === "flower") {
    return new THREE.Color(
      plan.appearance.foliage.flowering[0] ?? plan.appearance.atmosphere.sunlight,
    );
  }
  if (role === "reed") {
    return new THREE.Color(plan.appearance.terrain.lowland).lerp(new THREE.Color("#9a965d"), 0.42);
  }
  if (role === "stone") {
    return new THREE.Color(plan.appearance.terrain.escarpment).lerp(
      new THREE.Color(plan.appearance.terrain.shore),
      0.24,
    );
  }
  if (role === "waylight") return new THREE.Color(plan.appearance.architecture.windowGlow);
  return new THREE.Color(plan.appearance.architecture.timberTint);
}

function addRegionalVertexData(
  geometry: THREE.BufferGeometry,
  color: THREE.Color,
  emissiveWeight: number,
): void {
  const vertexCount = geometry.getAttribute("position").count;
  const colors = new Float32Array(vertexCount * 3);
  const emission = new Float32Array(vertexCount);
  for (let index = 0; index < colors.length; index += 3) {
    colors[index] = color.r;
    colors[index + 1] = color.g;
    colors[index + 2] = color.b;
    emission[index / 3] = emissiveWeight;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("kingdomRegionalEmissive", new THREE.BufferAttribute(emission, 1));
}

function addRegionalWaylightEmission(
  material: THREE.MeshStandardMaterial,
  color: THREE.ColorRepresentation,
  intensity: number,
): void {
  const previousOnBeforeCompile = material.onBeforeCompile;
  const previousProgramKey = material.customProgramCacheKey.call(material);
  material.onBeforeCompile = function onBeforeCompile(shader, renderer) {
    previousOnBeforeCompile.call(this, shader, renderer);
    shader.uniforms.kingdomRegionalWaylightColor = { value: new THREE.Color(color) };
    shader.uniforms.kingdomRegionalWaylightIntensity = { value: intensity };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float kingdomRegionalEmissive;
varying float vKingdomRegionalEmissive;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vKingdomRegionalEmissive = kingdomRegionalEmissive;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 kingdomRegionalWaylightColor;
uniform float kingdomRegionalWaylightIntensity;
varying float vKingdomRegionalEmissive;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
totalEmissiveRadiance += kingdomRegionalWaylightColor *
  kingdomRegionalWaylightIntensity * vKingdomRegionalEmissive;`,
      );
  };
  material.customProgramCacheKey = () => `${previousProgramKey}|repo-regional-waylight-emission/v1`;
}

function createFarPropGeometry(role: "fence" | "waylight"): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (role === "fence") {
    for (const x of [-0.58, 0.58]) {
      const post = new THREE.BoxGeometry(0.12, 1.14, 0.12);
      post.translate(x, 0.57, 0);
      parts.push(post);
    }
    const rail = new THREE.BoxGeometry(1.3, 0.13, 0.13);
    rail.translate(0, 0.68, 0);
    parts.push(rail);
  } else {
    const post = new THREE.BoxGeometry(0.13, 1.26, 0.13);
    post.translate(0, 0.63, 0);
    const cap = new THREE.OctahedronGeometry(0.19, 0);
    cap.translate(0, 1.37, 0);
    parts.push(post, cap);
  }
  const compatibleParts = parts.map((part) => {
    const compatible = part.index ? part.toNonIndexed() : part.clone();
    part.dispose();
    for (const attribute of Object.keys(compatible.attributes)) {
      if (attribute !== "position" && attribute !== "normal") {
        compatible.deleteAttribute(attribute);
      }
    }
    return compatible;
  });
  const geometry = mergeGeometries(compatibleParts, false);
  compatibleParts.forEach((part) => part.dispose());
  if (!geometry) throw new Error(`Regional ${role} silhouette could not be merged.`);
  return geometry;
}

function createRegionalSourceGeometry(
  instance: PlannedRegionalAssetInstance,
): THREE.BufferGeometry {
  if (instance.role === "fence" || instance.role === "waylight") {
    return createFarPropGeometry(instance.role);
  }
  return createPlannedWalkDetailGeometry(instance.role);
}

/** One static merged draw for clustered ground detail, or the complete far silhouette mount. */
export function createPlannedRegionalMergedGeometry(
  plan: WorldPlan,
  instances: ReadonlyArray<PlannedRegionalAssetInstance>,
): THREE.BufferGeometry {
  const transformed = instances.map((instance) => {
    const source = createRegionalSourceGeometry(instance);
    const geometry = source.index ? source.toNonIndexed() : source.clone();
    source.dispose();
    for (const attribute of Object.keys(geometry.attributes)) {
      if (attribute !== "position" && attribute !== "normal") geometry.deleteAttribute(attribute);
    }
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const sourceHeight = Math.max(
      0.05,
      (geometry.boundingBox?.max.y ?? 1) - (geometry.boundingBox?.min.y ?? 0),
    );
    const scale = instance.targetHeight / sourceHeight;
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(instance.position.x, instance.position.y, instance.position.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, instance.rotationY, 0)),
        new THREE.Vector3(scale, scale, scale),
      ),
    );
    addRegionalVertexData(
      geometry,
      regionalRoleColor(plan, instance.role),
      instance.role === "waylight" ? 1 : 0,
    );
    return geometry;
  });
  if (transformed.length === 0) return new THREE.BufferGeometry();
  const geometry = mergeGeometries(transformed, false);
  transformed.forEach((item) => item.dispose());
  if (!geometry) throw new Error("Regional clustered geometry could not be merged.");
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function RegionalMergedBatch({
  plan,
  mount,
  instances,
}: Readonly<{
  plan: WorldPlan;
  mount: PlannedRegionalMount;
  instances: ReadonlyArray<PlannedRegionalAssetInstance>;
}>) {
  const geometry = useMemo(
    () => createPlannedRegionalMergedGeometry(plan, instances),
    [instances, plan],
  );
  const material = useMemo(() => {
    const next = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      vertexColors: true,
      roughness: 0.91,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: "#000000",
      emissiveIntensity: 0,
    });
    addRegionalWaylightEmission(
      next,
      plan.appearance.architecture.windowGlow,
      mount === "near" ? 0.62 : 0.38,
    );
    return next;
  }, [mount, plan.appearance.architecture.windowGlow]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  if (instances.length === 0) return null;
  return (
    <mesh
      geometry={geometry}
      material={material}
      castShadow={mount === "near"}
      receiveShadow
      frustumCulled
      name={`planned-regional-merged:${mount}`}
    />
  );
}

type AssetPrimitive = Readonly<{
  id: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  sourceMatrix: THREE.Matrix4;
}>;

type AssetTemplate = Readonly<{
  height: number;
  minimumY: number;
  center: THREE.Vector3;
  primitives: ReadonlyArray<AssetPrimitive>;
}>;

function createAssetTemplate(scene: THREE.Object3D): AssetTemplate {
  scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(scene);
  const primitives: AssetPrimitive[] = [];
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    primitives.push({
      id: `primitive-${primitives.length}`,
      geometry: child.geometry,
      material: child.material,
      sourceMatrix: child.matrixWorld.clone(),
    });
  });
  return {
    height: Math.max(0.1, bounds.max.y - bounds.min.y),
    minimumY: bounds.min.y,
    center: bounds.getCenter(new THREE.Vector3()),
    primitives,
  };
}

function createInstanceMatrices(
  batch: PlannedRegionalPropBatch,
  template: AssetTemplate,
): ReadonlyArray<THREE.Matrix4> {
  return batch.instances.map((instance) => {
    const scale = instance.targetHeight / template.height;
    const world = new THREE.Matrix4().compose(
      new THREE.Vector3(instance.position.x, instance.position.y, instance.position.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, instance.rotationY, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    const normalization = new THREE.Matrix4()
      .makeTranslation(
        -template.center.x * scale,
        -template.minimumY * scale,
        -template.center.z * scale,
      )
      .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
    return world.multiply(normalization);
  });
}

function AssetPrimitiveBatch({
  primitive,
  matrices,
}: Readonly<{
  primitive: AssetPrimitive;
  matrices: ReadonlyArray<THREE.Matrix4>;
}>) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!meshRef.current) return;
    const composed = new THREE.Matrix4();
    for (let index = 0; index < matrices.length; index += 1) {
      meshRef.current.setMatrixAt(
        index,
        composed.multiplyMatrices(matrices[index]!, primitive.sourceMatrix),
      );
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    meshRef.current.computeBoundingBox();
    meshRef.current.computeBoundingSphere();
  }, [matrices, primitive.sourceMatrix]);
  return (
    <instancedMesh
      ref={meshRef}
      args={[primitive.geometry, primitive.material, matrices.length]}
      castShadow
      receiveShadow
      frustumCulled
      name={`planned-regional-props:${primitive.id}`}
    />
  );
}

function RegionalPropBatchRenderer({ batch }: Readonly<{ batch: PlannedRegionalPropBatch }>) {
  const { scene } = useGLTF(batch.url);
  const template = useMemo(() => createAssetTemplate(scene), [scene]);
  const matrices = useMemo(() => createInstanceMatrices(batch, template), [batch, template]);
  return (
    <group name={`planned-regional-prop-batch:${batch.url}`} dispose={null}>
      {template.primitives.map((primitive) => (
        <AssetPrimitiveBatch key={primitive.id} primitive={primitive} matrices={matrices} />
      ))}
    </group>
  );
}

/**
 * Mount `near` for the two Walk chunks and `far` for the one-draw waterside
 * silhouette. The disjoint mounts can coexist without duplicate instances.
 */
export function PlannedRegionalExperienceLayer({
  plan,
  regional,
  mount,
  quality,
  reducedMotion,
}: PlannedRegionalExperienceLayerProps) {
  const selection = useMemo(
    () =>
      isPlannedRegionalExperienceRenderable(regional)
        ? createPlannedRegionalRenderSelection(regional, mount, quality)
        : null,
    [mount, quality, regional],
  );
  if (!selection) return null;
  if (selection.instances.length === 0) return null;
  return (
    <group
      name={`planned-regional-experience:${mount}`}
      userData={{ regionalKey: regional.key, mount, budget: selection.budget, reducedMotion }}
    >
      <RegionalMergedBatch plan={plan} mount={mount} instances={selection.mergedInstances} />
      {selection.propBatches.map((batch) => (
        <RegionalPropBatchRenderer key={batch.url} batch={batch} />
      ))}
    </group>
  );
}
