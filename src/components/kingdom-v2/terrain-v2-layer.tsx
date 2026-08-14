"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import {
  createTerrainArtifactV2PreviewMeshData,
  createTerrainArtifactV2WaterMeshData,
  TERRAIN_ARTIFACT_V2_MATERIAL_CHANNELS,
  type TerrainArtifactV2,
  type TerrainArtifactV2LodId,
  type TerrainArtifactV2MaterialChannel,
  type TerrainArtifactV2MeshData,
  type TerrainArtifactV2WaterMeshData,
} from "@/lib/kingdom-v2/terrain-artifact-v2";

export const TERRAIN_V2_LAYER_SCHEMA = "repo-terrain-v2-preview-layer/v1" as const;
export const TERRAIN_V2_HORIZON_TRIANGLES = 8 as const;
export const TERRAIN_V2_HORIZON_ENVELOPE_SCALE = 12 as const;

export type TerrainV2ProceduralPalette = Readonly<Record<TerrainArtifactV2MaterialChannel, string>>;

export const TERRAIN_V2_DEFAULT_PROCEDURAL_PALETTE: TerrainV2ProceduralPalette = Object.freeze({
  meadow: "#42683d",
  "forest-floor": "#304a34",
  soil: "#745b42",
  rock: "#5c625d",
  shore: "#a18f68",
  "river-bed": "#315c61",
  "lake-bed": "#264d57",
  submerged: "#203b40",
});

export type TerrainV2LayerProps = Readonly<{
  artifact: TerrainArtifactV2;
  lod?: TerrainArtifactV2LodId;
  palette?: TerrainV2ProceduralPalette;
  receiveShadow?: boolean;
}>;

export type TerrainV2PreviewResources = Readonly<{
  terrainGeometry: THREE.BufferGeometry;
  waterGeometry: THREE.BufferGeometry;
  terrainMaterial: THREE.MeshStandardMaterial;
  waterMaterial: THREE.MeshPhysicalMaterial;
  metrics: Readonly<{
    drawCalls: 2;
    terrainTriangles: number;
    waterTriangles: number;
    totalTriangles: number;
    terrainSkirtTriangles: number;
  }>;
}>;

function splitMaterialWeights(mesh: TerrainArtifactV2MeshData) {
  const first = new Uint8Array(mesh.vertexCount * 4);
  const second = new Uint8Array(mesh.vertexCount * 4);
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const sourceOffset = vertex * TERRAIN_ARTIFACT_V2_MATERIAL_CHANNELS.length;
    const targetOffset = vertex * 4;
    first[targetOffset] = mesh.materialWeights[sourceOffset]!;
    first[targetOffset + 1] = mesh.materialWeights[sourceOffset + 1]!;
    first[targetOffset + 2] = mesh.materialWeights[sourceOffset + 2]!;
    first[targetOffset + 3] = mesh.materialWeights[sourceOffset + 3]!;
    second[targetOffset] = mesh.materialWeights[sourceOffset + 4]!;
    second[targetOffset + 1] = mesh.materialWeights[sourceOffset + 5]!;
    second[targetOffset + 2] = mesh.materialWeights[sourceOffset + 6]!;
    second[targetOffset + 3] = mesh.materialWeights[sourceOffset + 7]!;
  }
  return { first, second };
}

export function createTerrainV2PreviewVertexColors(
  mesh: TerrainArtifactV2MeshData,
  palette: TerrainV2ProceduralPalette = TERRAIN_V2_DEFAULT_PROCEDURAL_PALETTE,
): Float32Array {
  const colors = TERRAIN_ARTIFACT_V2_MATERIAL_CHANNELS.map(
    (channel) => new THREE.Color(palette[channel]),
  );
  const output = new Float32Array(mesh.vertexCount * 3);
  for (let vertex = 0; vertex < mesh.vertexCount; vertex += 1) {
    const weightOffset = vertex * TERRAIN_ARTIFACT_V2_MATERIAL_CHANNELS.length;
    let red = 0;
    let green = 0;
    let blue = 0;
    for (let channel = 0; channel < colors.length; channel += 1) {
      const weight = mesh.materialWeights[weightOffset + channel]! / 255;
      const color = colors[channel]!;
      red += color.r * weight;
      green += color.g * weight;
      blue += color.b * weight;
    }
    const colorOffset = vertex * 3;
    output[colorOffset] = red;
    output[colorOffset + 1] = green;
    output[colorOffset + 2] = blue;
  }
  return output;
}

function createTerrainGeometry(
  mesh: TerrainArtifactV2MeshData,
  palette: TerrainV2ProceduralPalette,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const weights = splitMaterialWeights(mesh);
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(createTerrainV2PreviewVertexColors(mesh, palette), 3),
  );
  geometry.setAttribute("terrainV2WeightsA", new THREE.BufferAttribute(weights.first, 4, true));
  geometry.setAttribute("terrainV2WeightsB", new THREE.BufferAttribute(weights.second, 4, true));
  geometry.setAttribute(
    "terrainV2LandCoverage",
    new THREE.BufferAttribute(mesh.landCoverage, 1, true),
  );
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createWaterGeometry(mesh: TerrainArtifactV2WaterMeshData): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
  geometry.setAttribute("terrainV2WaterDepth", new THREE.BufferAttribute(mesh.depth, 1));
  geometry.setAttribute("terrainV2Wetness", new THREE.BufferAttribute(mesh.wetness, 1, true));
  geometry.setAttribute("terrainV2Flow", new THREE.BufferAttribute(mesh.flow, 2));
  geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createWaterHorizonGeometry(artifact: TerrainArtifactV2): THREE.BufferGeometry {
  const outerMinX =
    artifact.envelope.center.x - artifact.envelope.width * TERRAIN_V2_HORIZON_ENVELOPE_SCALE;
  const outerMaxX =
    artifact.envelope.center.x + artifact.envelope.width * TERRAIN_V2_HORIZON_ENVELOPE_SCALE;
  const outerMinZ =
    artifact.envelope.center.z - artifact.envelope.depth * TERRAIN_V2_HORIZON_ENVELOPE_SCALE;
  const outerMaxZ =
    artifact.envelope.center.z + artifact.envelope.depth * TERRAIN_V2_HORIZON_ENVELOPE_SCALE;
  const innerMinX = artifact.envelope.minX;
  const innerMaxX = artifact.envelope.maxX;
  const innerMinZ = artifact.envelope.minZ;
  const innerMaxZ = artifact.envelope.maxZ;
  const waterY = -0.035;
  const strips = [
    [outerMinX, innerMaxZ, outerMaxX, outerMaxZ],
    [outerMinX, outerMinZ, outerMaxX, innerMinZ],
    [outerMinX, innerMinZ, innerMinX, innerMaxZ],
    [innerMaxX, innerMinZ, outerMaxX, innerMaxZ],
  ] as const;
  const positions = new Float32Array(strips.length * 12);
  const normals = new Float32Array(strips.length * 12);
  const uvs = new Float32Array(strips.length * 8);
  const indices = new Uint16Array(strips.length * 6);
  const outerWidth = outerMaxX - outerMinX;
  const outerDepth = outerMaxZ - outerMinZ;

  strips.forEach(([minX, minZ, maxX, maxZ], stripIndex) => {
    const vertexOffset = stripIndex * 4;
    const positionOffset = vertexOffset * 3;
    const uvOffset = vertexOffset * 2;
    positions.set(
      [minX, waterY, minZ, maxX, waterY, minZ, maxX, waterY, maxZ, minX, waterY, maxZ],
      positionOffset,
    );
    normals.set([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], positionOffset);
    uvs.set(
      [
        (minX - outerMinX) / outerWidth,
        (minZ - outerMinZ) / outerDepth,
        (maxX - outerMinX) / outerWidth,
        (minZ - outerMinZ) / outerDepth,
        (maxX - outerMinX) / outerWidth,
        (maxZ - outerMinZ) / outerDepth,
        (minX - outerMinX) / outerWidth,
        (maxZ - outerMinZ) / outerDepth,
      ],
      uvOffset,
    );
    indices.set(
      [
        vertexOffset,
        vertexOffset + 1,
        vertexOffset + 2,
        vertexOffset,
        vertexOffset + 2,
        vertexOffset + 3,
      ],
      stripIndex * 6,
    );
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const vertexCount = positions.length / 3;
  geometry.setAttribute(
    "terrainV2WaterDepth",
    new THREE.BufferAttribute(new Float32Array(vertexCount).fill(32), 1),
  );
  geometry.setAttribute(
    "terrainV2Wetness",
    new THREE.BufferAttribute(new Uint8Array(vertexCount), 1, true),
  );
  geometry.setAttribute(
    "terrainV2Flow",
    new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2),
  );
  return geometry;
}

function createWaterAndHorizonGeometry(
  artifact: TerrainArtifactV2,
  mesh: TerrainArtifactV2WaterMeshData,
): THREE.BufferGeometry {
  const water = createWaterGeometry(mesh);
  const horizon = createWaterHorizonGeometry(artifact);
  const geometry = mergeGeometries([water, horizon], false);
  water.dispose();
  horizon.dispose();
  if (!geometry) throw new Error("Terrain V2 could not merge shared water and horizon geometry.");
  geometry.name = "terrain-v2-shared-water-and-horizon";
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Creates the bounded two-draw preview resources. It performs no loading and
 * uses only the artifact's original procedural semantic weights.
 */
export function createTerrainV2PreviewResources(
  artifact: TerrainArtifactV2,
  lod: TerrainArtifactV2LodId = "mid",
  palette: TerrainV2ProceduralPalette = TERRAIN_V2_DEFAULT_PROCEDURAL_PALETTE,
): TerrainV2PreviewResources {
  const terrainMesh = createTerrainArtifactV2PreviewMeshData(artifact, lod);
  const waterMesh = createTerrainArtifactV2WaterMeshData(artifact, lod);
  const terrainGeometry = createTerrainGeometry(terrainMesh, palette);
  const waterGeometry = createWaterAndHorizonGeometry(artifact, waterMesh);
  const terrainMaterial = new THREE.MeshStandardMaterial({
    name: "terrain-v2-procedural-weight-preview",
    color: "#ffffff",
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
    dithering: true,
  });
  const waterMaterial = new THREE.MeshPhysicalMaterial({
    name: "terrain-v2-shared-hydrology-preview",
    color: "#3d8491",
    roughness: 0.22,
    metalness: 0.02,
    clearcoat: 0.8,
    clearcoatRoughness: 0.16,
    ior: 1.333,
    transparent: true,
    opacity: 0.9,
    depthWrite: true,
    side: THREE.DoubleSide,
    dithering: true,
  });
  return Object.freeze({
    terrainGeometry,
    waterGeometry,
    terrainMaterial,
    waterMaterial,
    metrics: Object.freeze({
      drawCalls: 2,
      terrainTriangles: terrainMesh.triangleCount,
      waterTriangles: waterMesh.triangleCount + TERRAIN_V2_HORIZON_TRIANGLES,
      totalTriangles:
        terrainMesh.triangleCount + waterMesh.triangleCount + TERRAIN_V2_HORIZON_TRIANGLES,
      terrainSkirtTriangles: terrainMesh.skirtTriangleCount,
    }),
  });
}

export function disposeTerrainV2PreviewResources(resources: TerrainV2PreviewResources) {
  resources.terrainGeometry.dispose();
  resources.waterGeometry.dispose();
  resources.terrainMaterial.dispose();
  resources.waterMaterial.dispose();
}

/** Isolated R3F preview. Production scenes intentionally do not import it yet. */
export function TerrainV2Layer({
  artifact,
  lod = "mid",
  palette = TERRAIN_V2_DEFAULT_PROCEDURAL_PALETTE,
  receiveShadow = true,
}: TerrainV2LayerProps) {
  const resources = useMemo(
    () => createTerrainV2PreviewResources(artifact, lod, palette),
    [artifact, lod, palette],
  );

  useEffect(
    () => () => {
      disposeTerrainV2PreviewResources(resources);
    },
    [resources],
  );

  return (
    <group
      name="terrain-v2-preview-layer"
      userData={{
        schema: TERRAIN_V2_LAYER_SCHEMA,
        artifactKey: artifact.key,
        structureKey: artifact.structureKey,
        lod,
        metrics: resources.metrics,
      }}
    >
      <mesh
        name="terrain-v2-surface-and-horizon-skirt"
        geometry={resources.terrainGeometry}
        material={resources.terrainMaterial}
        receiveShadow={receiveShadow}
        castShadow={false}
        dispose={null}
      />
      <mesh
        name="terrain-v2-shared-water"
        geometry={resources.waterGeometry}
        material={resources.waterMaterial}
        receiveShadow={false}
        castShadow={false}
        renderOrder={2}
        dispose={null}
      />
    </group>
  );
}
