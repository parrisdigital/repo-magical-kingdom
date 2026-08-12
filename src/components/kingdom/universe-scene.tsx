"use client";

import { Html, Line, OrbitControls, PerspectiveCamera, Sparkles, Stars } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { RepositoryUniverse, Selection, UniverseRepository } from "@/lib/kingdom/types";

import { seededUnit } from "./world-utils";

type RepositoryUniverseSceneProps = Readonly<{
  universe: RepositoryUniverse;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onHover: (selection: Selection) => void;
  onEnterRepository: (repository: UniverseRepository) => void;
  resetToken: number;
  reducedMotion: boolean;
  quality: "low" | "high";
}>;

function ProfileStar({ reducedMotion }: Readonly<{ reducedMotion: boolean }>) {
  const core = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!reducedMotion && core.current) {
      const scale = 1 + Math.sin(clock.elapsedTime * 0.7) * 0.04;
      core.current.scale.setScalar(scale);
    }
  });

  return (
    <group>
      <mesh ref={core}>
        <icosahedronGeometry args={[1.6, 3]} />
        <meshStandardMaterial
          color="#fff0ad"
          emissive="#f5a835"
          emissiveIntensity={2.8}
          roughness={0.32}
        />
      </mesh>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[2.4, 0.045, 8, 80]} />
        <meshBasicMaterial color="#f5d779" transparent opacity={0.52} />
      </mesh>
      <pointLight color="#ffd57c" intensity={42} distance={28} decay={1.4} />
      <Sparkles count={28} scale={7} size={2.5} speed={reducedMotion ? 0 : 0.25} color="#ffe3a1" />
    </group>
  );
}

function RepositoryWorld({
  repository,
  selected,
  showLabel,
  reducedMotion,
  onSelect,
  onHover,
  onEnter,
}: Readonly<{
  repository: UniverseRepository;
  selected: boolean;
  showLabel: boolean;
  reducedMotion: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onEnter: () => void;
}>) {
  const group = useRef<THREE.Group>(null);
  const color = `hsl(${repository.hue} 64% 59%)`;
  const textureSeed = seededUnit(`${repository.owner}/${repository.repository}`);

  useFrame(({ clock }) => {
    if (!reducedMotion && group.current) {
      group.current.rotation.y = clock.elapsedTime * (0.025 + textureSeed * 0.035);
      group.current.position.y =
        repository.position.y + Math.sin(clock.elapsedTime * 0.32 + textureSeed * 8) * 0.12;
    }
  });

  return (
    <group
      ref={group}
      position={[repository.position.x, repository.position.y, repository.position.z]}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onEnter();
      }}
      onPointerEnter={(event) => {
        event.stopPropagation();
        onHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerLeave={() => {
        onHover(false);
        document.body.style.cursor = "default";
      }}
    >
      <mesh castShadow scale={selected ? 1.13 : 1}>
        <icosahedronGeometry args={[repository.radius, 3]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.55 : 0.13}
          roughness={0.62}
          metalness={0.16}
        />
      </mesh>
      {repository.stars > 0 ? (
        <mesh rotation={[Math.PI * 0.62, textureSeed * Math.PI, 0]}>
          <torusGeometry
            args={[repository.radius * 1.55, Math.max(0.025, repository.radius * 0.04), 7, 52]}
          />
          <meshBasicMaterial color="#d9e7ff" transparent opacity={selected ? 0.8 : 0.36} />
        </mesh>
      ) : null}
      {selected ? <pointLight color={color} intensity={8} distance={7} /> : null}
      {showLabel || selected ? (
        <Html
          center
          distanceFactor={12}
          position={[0, repository.radius + 0.85, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div className="kingdom-world-label kingdom-world-label--universe" aria-hidden="true">
            <span>{repository.language ?? "Repository"}</span>
            {repository.repository}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

function OrbitalLines({
  repositories,
}: Readonly<{ repositories: ReadonlyArray<UniverseRepository> }>) {
  return (
    <group>
      {repositories.slice(0, 18).map((repository) => (
        <Line
          key={repository.id}
          points={[
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(repository.position.x, repository.position.y, repository.position.z),
          ]}
          color={`hsl(${repository.hue} 50% 65%)`}
          lineWidth={0.45}
          opacity={0.12}
          transparent
        />
      ))}
    </group>
  );
}

function Nebula({
  quality,
  reducedMotion,
}: Readonly<{ quality: "low" | "high"; reducedMotion: boolean }>) {
  const nebula = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = quality === "high" ? 900 : 350;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const angle = seededUnit(`nebula:${index}:angle`) * Math.PI * 6;
      const distance = 5 + Math.sqrt(seededUnit(`nebula:${index}:distance`)) * 38;
      const spread = (seededUnit(`nebula:${index}:spread`) - 0.5) * 6;
      const color = new THREE.Color(
        index % 3 === 0 ? "#8e79f0" : index % 3 === 1 ? "#3ac7d8" : "#de6ba8",
      );
      positions.set([Math.cos(angle) * distance, spread, Math.sin(angle) * distance], index * 3);
      colors.set([color.r, color.g, color.b], index * 3);
    }
    const nextGeometry = new THREE.BufferGeometry();
    nextGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    nextGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return nextGeometry;
  }, [quality]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame((_, delta) => {
    if (!reducedMotion && nebula.current) nebula.current.rotation.y += delta * 0.006;
  });

  return (
    <points ref={nebula} geometry={geometry} rotation-x={0.18}>
      <pointsMaterial size={0.11} vertexColors opacity={0.42} transparent depthWrite={false} />
    </points>
  );
}

function UniverseCamera({
  universe,
  selection,
  resetToken,
  reducedMotion,
}: Readonly<{
  universe: RepositoryUniverse;
  selection: Selection;
  resetToken: number;
  reducedMotion: boolean;
}>) {
  const { camera } = useThree();
  const controls = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const goalPosition = useRef(new THREE.Vector3(20, 16, 27));
  const goalTarget = useRef(new THREE.Vector3());
  const animating = useRef(true);
  const maximumOrbit = useMemo(
    () =>
      Math.max(
        14,
        ...universe.repositories.map((repository) =>
          Math.hypot(repository.position.x, repository.position.y, repository.position.z),
        ),
      ),
    [universe.repositories],
  );

  useEffect(() => {
    if (selection?.kind === "repository") {
      const { position, radius } = selection.repository;
      goalTarget.current.set(position.x, position.y, position.z);
      goalPosition.current.set(
        position.x + radius * 5,
        position.y + radius * 3.3,
        position.z + radius * 6.5,
      );
    } else {
      goalTarget.current.set(0, 0, 0);
      goalPosition.current.set(maximumOrbit * 0.9, maximumOrbit * 0.66, maximumOrbit * 1.2);
    }
    animating.current = true;
    if (reducedMotion) {
      camera.position.copy(goalPosition.current);
      controls.current?.target.copy(goalTarget.current);
      controls.current?.update();
      animating.current = false;
    }
  }, [camera, maximumOrbit, reducedMotion, resetToken, selection]);

  useFrame((_, delta) => {
    if (!animating.current || !controls.current) return;
    const alpha = 1 - Math.exp(-delta * 3.4);
    camera.position.lerp(goalPosition.current, alpha);
    controls.current.target.lerp(goalTarget.current, alpha);
    controls.current.update();
    if (camera.position.distanceTo(goalPosition.current) < 0.04) animating.current = false;
  });

  return (
    <>
      <PerspectiveCamera makeDefault fov={44} near={0.08} far={650} position={[20, 16, 27]} />
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping={!reducedMotion}
        dampingFactor={0.06}
        minDistance={3.5}
        maxDistance={maximumOrbit * 5}
        onStart={() => {
          animating.current = false;
        }}
      />
    </>
  );
}

export function RepositoryUniverseScene({
  universe,
  selection,
  onSelect,
  onHover,
  onEnterRepository,
  resetToken,
  reducedMotion,
  quality,
}: RepositoryUniverseSceneProps) {
  const selectedId = selection?.kind === "repository" ? selection.repository.id : null;

  return (
    <>
      <color attach="background" args={["#030611"]} />
      <fog attach="fog" args={["#040818", 55, 180]} />
      <ambientLight intensity={0.38} color="#8fa6d8" />
      <Stars
        radius={180}
        depth={80}
        count={quality === "high" ? 3600 : 1500}
        factor={3.2}
        saturation={0.58}
        fade
        speed={reducedMotion ? 0 : 0.18}
      />
      <Nebula quality={quality} reducedMotion={reducedMotion} />
      <ProfileStar reducedMotion={reducedMotion} />
      <OrbitalLines repositories={universe.repositories} />
      {universe.repositories.map((repository, index) => (
        <RepositoryWorld
          key={repository.id}
          repository={repository}
          selected={selectedId === repository.id}
          showLabel={index < 16}
          reducedMotion={reducedMotion}
          onSelect={() => onSelect({ kind: "repository", repository })}
          onHover={(hovered) => onHover(hovered ? { kind: "repository", repository } : null)}
          onEnter={() => onEnterRepository(repository)}
        />
      ))}
      <UniverseCamera
        universe={universe}
        selection={selection}
        resetToken={resetToken}
        reducedMotion={reducedMotion}
      />
    </>
  );
}
