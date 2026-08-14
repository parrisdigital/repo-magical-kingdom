import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";

import { createReviewMaterial, type ArchiveTextures } from "./asset-lab-canvas";

const textures: ArchiveTextures = {
  baseColor: new THREE.Texture(),
  normal: new THREE.Texture(),
  orm: new THREE.Texture(),
};
const created: THREE.Material[] = [];

afterEach(() => {
  for (const material of created.splice(0)) material.dispose();
});

function sourceMaterial(name = "MAT_archive_spire_stone") {
  return new THREE.MeshStandardMaterial({
    name,
    color: "#77838f",
    emissive: "#19333d",
    emissiveIntensity: 0.5,
    roughness: 0.82,
    metalness: 0.04,
  });
}

function review(
  source: THREE.Material,
  mode: Parameters<typeof createReviewMaterial>[1],
  wireframe = false,
) {
  const material = createReviewMaterial(source, mode, textures, wireframe);
  created.push(source, material);
  return material;
}

describe("asset lab material review", () => {
  it("adds the authored base-color, normal, and ORM maps without mutating the GLB material", () => {
    const source = sourceMaterial();
    const material = review(source, "beauty", true);

    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(material).not.toBe(source);
    expect(source.map).toBeNull();
    const beauty = material as THREE.MeshStandardMaterial;
    expect(beauty.map).toBe(textures.baseColor);
    expect(beauty.normalMap).toBe(textures.normal);
    expect(beauty.aoMap).toBe(textures.orm);
    expect(beauty.roughnessMap).toBe(textures.orm);
    expect(beauty.metalnessMap).toBe(textures.orm);
    expect(beauty.wireframe).toBe(true);
  });

  it("keeps constant authored materials texture-free and creates independent channel views", () => {
    const source = sourceMaterial("MAT_archive_spire_timber");
    const beauty = review(source, "beauty") as THREE.MeshStandardMaterial;
    const albedo = review(sourceMaterial("MAT_archive_spire_timber"), "albedo");
    const normal = review(sourceMaterial("MAT_archive_spire_timber"), "normal");
    const emissive = review(sourceMaterial("MAT_archive_spire_timber"), "emissive");

    expect(beauty.map).toBeNull();
    expect(albedo).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(normal).toBeInstanceOf(THREE.MeshNormalMaterial);
    expect(emissive).toBeInstanceOf(THREE.MeshBasicMaterial);
  });

  it("isolates authored ORM roughness and metalness channels in shader review materials", () => {
    const roughness = review(sourceMaterial(), "roughness", true);
    const metalness = review(sourceMaterial(), "metalness");

    expect(roughness).toBeInstanceOf(THREE.ShaderMaterial);
    expect(metalness).toBeInstanceOf(THREE.ShaderMaterial);
    expect((roughness as THREE.ShaderMaterial).uniforms.channelMap?.value).toBe(textures.orm);
    expect((roughness as THREE.ShaderMaterial).wireframe).toBe(true);
    expect((metalness as THREE.ShaderMaterial).fragmentShader).toContain(".b");
  });
});
