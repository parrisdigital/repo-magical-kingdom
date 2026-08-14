"use client";

import {
  ContactShadows,
  Grid,
  OrbitControls,
  PerspectiveCamera,
  PointerLockControls,
  useAnimations,
  useGLTF,
  useKTX2,
} from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { CustomAssetCatalogV1 } from "@/lib/world-assets-v2";

import {
  ASSET_LAB_LINEUP_POSITIONS,
  assetLabLodIndex,
  createAssetLabCollisionGeometry,
  createAssetLabLodTransition,
  type AssetLabControls,
  type AssetLabLodSlot,
  type AssetLabMaterialMode,
} from "./asset-lab-model";

type Family = CustomAssetCatalogV1["families"][number];
export type ArchiveTextures = Readonly<{
  baseColor: THREE.Texture;
  normal: THREE.Texture;
  orm: THREE.Texture;
}>;

function setWireframe(material: THREE.Material, wireframe: boolean) {
  if ("wireframe" in material) {
    (material as THREE.Material & { wireframe: boolean }).wireframe = wireframe;
  }
}

function basicChannelMaterial(
  source: THREE.MeshStandardMaterial,
  mode: AssetLabMaterialMode,
  textures: ArchiveTextures,
  textured: boolean,
  wireframe: boolean,
): THREE.Material {
  if (mode === "beauty") {
    const material = source.clone();
    if (textured) {
      material.map = textures.baseColor;
      material.normalMap = textures.normal;
      material.normalScale.set(0.72, 0.72);
      material.aoMap = textures.orm;
      material.aoMapIntensity = 0.9;
      material.roughnessMap = textures.orm;
      material.roughness = 1;
      material.metalnessMap = textures.orm;
      material.metalness = 1;
    }
    setWireframe(material, wireframe);
    material.needsUpdate = true;
    return material;
  }
  if (mode === "normal") {
    if (textured) {
      return new THREE.MeshBasicMaterial({ map: textures.normal, wireframe, toneMapped: false });
    }
    return new THREE.MeshNormalMaterial({ wireframe, flatShading: false });
  }
  if (mode === "albedo") {
    return new THREE.MeshBasicMaterial({
      color: textured ? 0xffffff : source.color,
      map: textured ? textures.baseColor : null,
      wireframe,
      toneMapped: false,
    });
  }
  if ((mode === "roughness" || mode === "metalness") && textured) {
    const component = mode === "roughness" ? "g" : "b";
    return new THREE.ShaderMaterial({
      name: `LAB_${mode}_${source.name}`,
      uniforms: { channelMap: { value: textures.orm } },
      vertexShader: `
        varying vec2 labUv;
        void main() {
          labUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D channelMap;
        varying vec2 labUv;
        void main() {
          float value = texture2D(channelMap, labUv).${component};
          gl_FragColor = vec4(vec3(value), 1.0);
        }
      `,
      wireframe,
      toneMapped: false,
    });
  }
  const scalar = mode === "roughness" ? source.roughness : source.metalness;
  const color = new THREE.Color(scalar, scalar, scalar);
  if (mode === "emissive") color.copy(source.emissive).multiplyScalar(source.emissiveIntensity);
  return new THREE.MeshBasicMaterial({ color, wireframe, toneMapped: false });
}

export function createReviewMaterial(
  source: THREE.Material,
  mode: AssetLabMaterialMode,
  textures: ArchiveTextures,
  wireframe: boolean,
): THREE.Material {
  if (!(source instanceof THREE.MeshStandardMaterial)) {
    const material = source.clone();
    setWireframe(material, wireframe);
    return material;
  }
  return basicChannelMaterial(
    source,
    mode,
    textures,
    source.name === "MAT_archive_spire_stone",
    wireframe,
  );
}

function requireTexturedMaterial(catalog: CustomAssetCatalogV1) {
  const material = catalog.families
    .flatMap((family) => family.materials)
    .find((candidate) => candidate.mode === "textured-pbr");
  if (!material || material.mode !== "textured-pbr") {
    throw new Error("Asset lab requires the validated KTX2 material proof");
  }
  return material;
}

function requireTextureUri(
  material: ReturnType<typeof requireTexturedMaterial>,
  channel: "baseColor" | "normal" | "orm",
) {
  const map = material.textureSet.maps.find((candidate) => candidate.channel === channel);
  if (!map) throw new Error(`Asset lab KTX2 proof is missing ${channel}`);
  return map.uri;
}

function prepareArchiveTextures(source: ArchiveTextures): ArchiveTextures {
  const textures = {
    baseColor: source.baseColor.clone(),
    normal: source.normal.clone(),
    orm: source.orm.clone(),
  };
  textures.baseColor.colorSpace = THREE.SRGBColorSpace;
  textures.normal.colorSpace = THREE.NoColorSpace;
  textures.orm.colorSpace = THREE.NoColorSpace;
  for (const texture of Object.values(textures)) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2.2, 2.2);
    texture.needsUpdate = true;
  }
  return textures;
}

function CollisionOverlay({ family }: Readonly<{ family: Family }>) {
  const footprint = family.footprint;
  return (
    <group>
      {family.collision.nodes.map((node) => {
        const geometry = createAssetLabCollisionGeometry(node);
        return (
          <mesh key={node.name} name={`LAB_${node.name}`} position={node.center}>
            {geometry.shape === "sphere" ? <sphereGeometry args={geometry.args} /> : null}
            {geometry.shape === "capsule" ? <capsuleGeometry args={geometry.args} /> : null}
            {geometry.shape === "box" ? <boxGeometry args={geometry.args} /> : null}
            <meshBasicMaterial
              color="#ff4f9b"
              wireframe
              transparent
              opacity={0.82}
              depthTest={false}
            />
          </mesh>
        );
      })}
      <mesh
        name={`LAB_FOOTPRINT_${family.id}`}
        position={[footprint.center[0], 0.025, footprint.center[1]]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={
          footprint.shape === "ellipse"
            ? [footprint.halfExtents[0], footprint.halfExtents[1], 1]
            : 1
        }
      >
        {footprint.shape === "ellipse" ? (
          <ringGeometry args={[0.985, 1, 64]} />
        ) : (
          <planeGeometry args={[footprint.halfExtents[0] * 2, footprint.halfExtents[1] * 2]} />
        )}
        <meshBasicMaterial
          color="#35e6d2"
          wireframe={footprint.shape === "rectangle"}
          transparent
          opacity={0.9}
          depthTest={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function setReviewOpacity(material: THREE.Material, opacity: number) {
  material.opacity = opacity;
  material.transparent = opacity < 0.999;
  material.depthWrite = opacity >= 0.999;
  material.needsUpdate = true;
}

function ReviewAssetLod({
  family,
  controls,
  textures,
  slot,
  opacity,
}: Readonly<{
  family: Family;
  controls: AssetLabControls;
  textures: ArchiveTextures;
  slot: AssetLabLodSlot;
  opacity: number;
}>) {
  const lod = family.lods[assetLabLodIndex(slot)];
  const gltf = useGLTF(lod.uri);
  const review = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const materials: THREE.Material[] = [];
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const sources = Array.isArray(node.material) ? node.material : [node.material];
      const replacements = sources.map((source) => {
        const material = createReviewMaterial(
          source,
          controls.material,
          textures,
          controls.wireframe,
        );
        setReviewOpacity(material, opacity);
        materials.push(material);
        return material;
      });
      node.material = Array.isArray(node.material) ? replacements : replacements[0]!;
      node.castShadow = controls.material === "beauty" && opacity >= 0.5;
      node.receiveShadow = controls.material === "beauty" && opacity >= 0.5;
    });
    return { scene: clone, materials };
  }, [controls.material, controls.wireframe, gltf.scene, opacity, textures]);
  const { actions } = useAnimations(gltf.animations, review.scene);

  useEffect(
    () => () => {
      for (const material of review.materials) material.dispose();
    },
    [review],
  );

  useEffect(() => {
    const animationName = family.animations[0]?.name;
    if (!animationName) return;
    const action = actions[animationName];
    if (controls.animation) action?.reset().fadeIn(0.15).play();
    else action?.stop();
    return () => {
      action?.stop();
    };
  }, [actions, controls.animation, family.animations]);

  return <primitive object={review.scene} visible={opacity > 0.001} />;
}

function ReviewAsset({
  family,
  controls,
  textures,
  position,
  selected,
  onSelect,
  turntable,
}: Readonly<{
  family: Family;
  controls: AssetLabControls;
  textures: ArchiveTextures;
  position: readonly [number, number, number];
  selected: boolean;
  onSelect: () => void;
  turntable: boolean;
}>) {
  const rotation = useRef<THREE.Group>(null);
  const transition = createAssetLabLodTransition(controls.lod, controls.lodBlend);

  useFrame((_, delta) => {
    if (turntable && rotation.current) rotation.current.rotation.y += delta * 0.42;
  });

  return (
    <group
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <group ref={rotation}>
        {controls.lodReview === "crossfade" ? (
          <>
            <ReviewAssetLod
              family={family}
              controls={controls}
              textures={textures}
              slot={transition.from}
              opacity={transition.fromOpacity}
            />
            <ReviewAssetLod
              family={family}
              controls={controls}
              textures={textures}
              slot={transition.to}
              opacity={transition.toOpacity}
            />
          </>
        ) : (
          <ReviewAssetLod
            family={family}
            controls={controls}
            textures={textures}
            slot={controls.lod}
            opacity={1}
          />
        )}
        {controls.collisions ? <CollisionOverlay family={family} /> : null}
      </group>
      {selected && !turntable ? (
        <mesh rotation-x={-Math.PI / 2} position-y={0.025}>
          <ringGeometry args={[3.8, 4.05, 64]} />
          <meshBasicMaterial color="#64e6c2" transparent opacity={0.82} />
        </mesh>
      ) : null}
    </group>
  );
}

function WalkRig() {
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const input = useRef(new Set<string>());
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());

  useEffect(() => {
    const activeCamera = camera.current;
    if (!activeCamera) return;
    activeCamera.position.set(-24, 1.75, 14);
    activeCamera.lookAt(0, 2.2, 0);
    const change = (event: KeyboardEvent, pressed: boolean) => {
      if (!["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) return;
      event.preventDefault();
      if (pressed) input.current.add(event.code);
      else input.current.delete(event.code);
    };
    const keyDown = (event: KeyboardEvent) => change(event, true);
    const keyUp = (event: KeyboardEvent) => change(event, false);
    const clear = () => input.current.clear();
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [camera]);

  useFrame((_, delta) => {
    const activeCamera = camera.current;
    if (!activeCamera) return;
    const cappedDelta = Math.min(delta, 0.05);
    let forwardAxis = Number(input.current.has("KeyW")) - Number(input.current.has("KeyS"));
    let rightAxis = Number(input.current.has("KeyD")) - Number(input.current.has("KeyA"));
    if (forwardAxis === 0 && rightAxis === 0) return;
    const scale = Math.hypot(forwardAxis, rightAxis);
    forwardAxis /= scale;
    rightAxis /= scale;
    activeCamera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    right.current.crossVectors(forward.current, activeCamera.up).normalize();
    activeCamera.position.addScaledVector(forward.current, forwardAxis * cappedDelta * 6.2);
    activeCamera.position.addScaledVector(right.current, rightAxis * cappedDelta * 6.2);
    activeCamera.position.x = THREE.MathUtils.clamp(activeCamera.position.x, -30, 30);
    activeCamera.position.z = THREE.MathUtils.clamp(activeCamera.position.z, -18, 18);
    activeCamera.position.y = 1.75;
  });
  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault fov={64} near={0.08} far={180} />
      <PointerLockControls makeDefault />
    </>
  );
}

function ReviewWorld({
  catalog,
  selectedFamilyId,
  controls,
  onSelectFamily,
}: Readonly<{
  catalog: CustomAssetCatalogV1;
  selectedFamilyId: string;
  controls: AssetLabControls;
  onSelectFamily: (familyId: string) => void;
}>) {
  const texturedMaterial = requireTexturedMaterial(catalog);
  const textureUrls = useMemo(
    () => ({
      baseColor: requireTextureUri(texturedMaterial, "baseColor"),
      normal: requireTextureUri(texturedMaterial, "normal"),
      orm: requireTextureUri(texturedMaterial, "orm"),
    }),
    [texturedMaterial],
  );
  const loadedTextures = useKTX2(
    textureUrls,
    catalog.textureDelivery.localTranscoder.basePath,
  ) as ArchiveTextures;
  const { baseColor: sourceBaseColor, normal: sourceNormal, orm: sourceOrm } = loadedTextures;
  const textures = useMemo(
    () =>
      prepareArchiveTextures({
        baseColor: sourceBaseColor,
        normal: sourceNormal,
        orm: sourceOrm,
      }),
    [sourceBaseColor, sourceNormal, sourceOrm],
  );
  useEffect(() => {
    return () => {
      for (const texture of Object.values(textures)) texture.dispose();
    };
  }, [textures]);

  const selectedFamily = catalog.families.find((family) => family.id === selectedFamilyId)!;
  const turntable = controls.navigation === "turntable";

  return (
    <>
      <color attach="background" args={[controls.material === "beauty" ? "#111a20" : "#181818"]} />
      <fog attach="fog" args={["#111a20", 34, 74]} />
      <ambientLight intensity={0.5} />
      <hemisphereLight args={["#bfe7ff", "#26331f", 1.05]} />
      <directionalLight
        castShadow
        color="#fff0cf"
        intensity={2.6}
        position={[13, 22, 11]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-32}
        shadow-camera-right={32}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
      />

      {controls.navigation !== "walk" ? (
        <PerspectiveCamera
          makeDefault
          fov={turntable ? 34 : 42}
          near={0.08}
          far={180}
          position={turntable ? [15, 9, 18] : [25, 18, 33]}
        />
      ) : null}

      {turntable ? (
        <ReviewAsset
          family={selectedFamily}
          controls={controls}
          textures={textures}
          position={[0, 0, 0]}
          selected
          onSelect={() => undefined}
          turntable
        />
      ) : (
        catalog.families.map((family, index) => (
          <ReviewAsset
            key={`${family.id}-${controls.lod}`}
            family={family}
            controls={controls}
            textures={textures}
            position={ASSET_LAB_LINEUP_POSITIONS[index]!}
            selected={family.id === selectedFamilyId}
            onSelect={() => onSelectFamily(family.id)}
            turntable={false}
          />
        ))
      )}

      <mesh rotation-x={-Math.PI / 2} receiveShadow position-y={-0.035}>
        <planeGeometry args={[72, 40]} />
        <meshStandardMaterial color="#26332f" roughness={0.95} metalness={0} />
      </mesh>
      <Grid
        position={[0, 0.015, 0]}
        args={[72, 40]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#40534d"
        sectionSize={5}
        sectionThickness={0.8}
        sectionColor="#55746b"
        fadeDistance={58}
        fadeStrength={1.4}
        infiniteGrid={false}
      />
      {controls.contactShadows ? (
        <ContactShadows
          position={[0, 0.02, 0]}
          scale={62}
          opacity={0.58}
          blur={2.2}
          far={24}
          frames={1}
        />
      ) : null}

      {controls.navigation === "walk" ? <WalkRig /> : null}
      {controls.navigation === "orbit" ? (
        <OrbitControls makeDefault target={[0, 4, 0]} minDistance={9} maxDistance={78} />
      ) : null}
      {turntable ? (
        <OrbitControls
          makeDefault
          target={[0, Math.min(6, selectedFamily.bounds.max[1] * 0.42), 0]}
          minDistance={8}
          maxDistance={38}
        />
      ) : null}
    </>
  );
}

export function AssetLabCanvas({
  catalog,
  selectedFamilyId,
  controls,
  onSelectFamily,
}: Readonly<{
  catalog: CustomAssetCatalogV1;
  selectedFamilyId: string;
  controls: AssetLabControls;
  onSelectFamily: (familyId: string) => void;
}>) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      shadows
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <Suspense fallback={null}>
        <ReviewWorld
          catalog={catalog}
          selectedFamilyId={selectedFamilyId}
          controls={controls}
          onSelectFamily={onSelectFamily}
        />
      </Suspense>
    </Canvas>
  );
}
