"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import type { WorldPlan } from "@/lib/kingdom/world-plan";

import type { PlannedScatter } from "./planned-scatter";
import type { PlannedVisualEnrichment } from "./planned-visual-enrichment";
import {
  createPlannedLifePlan,
  isPlannedLifeKindVisible,
  samplePlannedLifeParticle,
  type PlannedLifeParticle,
} from "./planned-life-model";

export type PlannedLifeProps = Readonly<{
  plan: WorldPlan;
  scatter: PlannedScatter;
  enrichment: PlannedVisualEnrichment;
  reducedMotion: boolean;
}>;

type LifePointsProps = Readonly<{
  particles: ReadonlyArray<PlannedLifeParticle>;
  color: string;
  opacity: number;
  reducedMotion: boolean;
  visible: boolean;
}>;

function averageSize(particles: ReadonlyArray<PlannedLifeParticle>): number {
  if (particles.length === 0) return 0.4;
  return particles.reduce((total, particle) => total + particle.size, 0) / particles.length;
}

function createGeometry(particles: ReadonlyArray<PlannedLifeParticle>): THREE.BufferGeometry {
  const positions = new Float32Array(particles.length * 3);
  for (let index = 0; index < particles.length; index += 1) {
    const anchor = particles[index]!.anchor;
    positions[index * 3] = anchor.x;
    positions[index * 3 + 1] = anchor.y;
    positions[index * 3 + 2] = anchor.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function LifePoints({ particles, color, opacity, reducedMotion, visible }: LifePointsProps) {
  const geometry = useMemo(() => createGeometry(particles), [particles]);
  const size = useMemo(() => averageSize(particles), [particles]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    if (!reducedMotion) return;
    const attribute = geometry.getAttribute("position");
    if (!(attribute instanceof THREE.BufferAttribute)) return;
    for (let index = 0; index < particles.length; index += 1) {
      const anchor = particles[index]!.anchor;
      attribute.array[index * 3] = anchor.x;
      attribute.array[index * 3 + 1] = anchor.y;
      attribute.array[index * 3 + 2] = anchor.z;
    }
    attribute.needsUpdate = true;
  }, [geometry, particles, reducedMotion]);

  useFrame(({ clock }) => {
    if (reducedMotion || !visible || particles.length === 0) return;
    const attribute = geometry.getAttribute("position");
    if (!(attribute instanceof THREE.BufferAttribute)) return;
    const positions = attribute.array;
    const elapsed = clock.getElapsedTime();
    for (let index = 0; index < particles.length; index += 1) {
      const position = samplePlannedLifeParticle(particles[index]!, elapsed, false);
      positions[index * 3] = position.x;
      positions[index * 3 + 1] = position.y;
      positions[index * 3 + 2] = position.z;
    }
    attribute.needsUpdate = true;
  });

  if (particles.length === 0) return null;
  return (
    <points geometry={geometry} visible={visible} frustumCulled={false}>
      <pointsMaterial
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

/** Lightweight, deterministic seasonal motion layered over planned world data. */
export function PlannedLife({ plan, scatter, enrichment, reducedMotion }: PlannedLifeProps) {
  const life = useMemo(
    () => createPlannedLifePlan(plan, scatter, enrichment),
    [enrichment, plan, scatter],
  );
  const season = plan.appearance.season;
  return (
    <group name="planned-seasonal-life">
      <LifePoints
        particles={life.petals}
        color={plan.appearance.foliage.flowering[1] ?? "#f6cbd9"}
        opacity={0.78}
        reducedMotion={reducedMotion}
        visible={isPlannedLifeKindVisible("petal", season)}
      />
      <LifePoints
        particles={life.smoke}
        color="#d9d2c8"
        opacity={0.3}
        reducedMotion={reducedMotion}
        visible={isPlannedLifeKindVisible("smoke", season)}
      />
      <LifePoints
        particles={life.waterMotes}
        color={plan.appearance.atmosphere.sunlight}
        opacity={0.58}
        reducedMotion={reducedMotion}
        visible={isPlannedLifeKindVisible("water-mote", season)}
      />
    </group>
  );
}
