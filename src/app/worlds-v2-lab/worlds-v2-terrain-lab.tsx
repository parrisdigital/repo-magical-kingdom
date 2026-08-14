"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import Link from "next/link";
import { useMemo, useState } from "react";
import * as THREE from "three";

import { TerrainV2Layer } from "@/components/kingdom-v2/terrain-v2-layer";
import type { KingdomWorld } from "@/lib/kingdom/types";
import { createRepositoryWorldFoundationV2, type TerrainArtifactV2LodId } from "@/lib/kingdom-v2";

import styles from "./worlds-v2-terrain-lab.module.css";

type WorldsV2TerrainLabProps = Readonly<{
  selected: "compact" | "medium" | "vast";
  world: KingdomWorld;
}>;

const LODS: ReadonlyArray<TerrainArtifactV2LodId> = ["near", "mid", "far"];

function metric(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function WorldsV2TerrainLab({ selected, world }: WorldsV2TerrainLabProps) {
  const [lod, setLod] = useState<TerrainArtifactV2LodId>("far");
  const foundation = useMemo(() => createRepositoryWorldFoundationV2(world), [world]);
  const { design, terrain } = foundation;
  const span = Math.max(terrain.envelope.width, terrain.envelope.depth);
  const cameraPosition = useMemo<[number, number, number]>(
    () => [span * 0.58, Math.max(72, span * 0.46), span * 0.64],
    [span],
  );

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Repository Worlds V2 · terrain laboratory</p>
          <h1>{world.title}</h1>
          <p>
            Development-only terrain and hydrology proof. This is not the production renderer and is
            not an AAA acceptance claim.
          </p>
        </div>
        <nav aria-label="Gold repository">
          {(["compact", "medium", "vast"] as const).map((id) => (
            <Link
              aria-current={selected === id ? "page" : undefined}
              className={selected === id ? styles.active : undefined}
              href={`/worlds-v2-lab?world=${id}`}
              key={id}
            >
              {id}
            </Link>
          ))}
          <Link href="/asset-lab">Asset lab</Link>
        </nav>
      </header>

      <section className={styles.stage} aria-label="Terrain V2 interactive preview">
        <Canvas
          camera={{ position: cameraPosition, fov: 38, near: 0.1, far: span * 16 }}
          dpr={[1, 1.5]}
          frameloop="demand"
          gl={{ antialias: true, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 0.92;
          }}
          shadows
        >
          <color attach="background" args={["#9eb5ba"]} />
          <fog attach="fog" args={["#9eb5ba", span * 0.72, span * 2.1]} />
          <hemisphereLight args={["#dce8e5", "#29362f", 1.15]} />
          <directionalLight
            castShadow
            color="#fff0d4"
            intensity={3.1}
            position={[span * 0.34, span * 0.55, span * 0.18]}
          />
          <TerrainV2Layer artifact={terrain} lod={lod} />
          <OrbitControls
            makeDefault
            target={[terrain.envelope.center.x, 2.5, terrain.envelope.center.z]}
            minDistance={span * 0.24}
            maxDistance={span * 1.7}
            maxPolarAngle={Math.PI * 0.48}
          />
        </Canvas>

        <aside className={styles.panel}>
          <p className={styles.panelLabel}>Live artifact</p>
          <dl>
            <div>
              <dt>Grid</dt>
              <dd>513² · 16 chunks</dd>
            </div>
            <div>
              <dt>Allocated</dt>
              <dd>{metric(terrain.metrics.allocatedBytes / 1_048_576)} MiB</dd>
            </div>
            <div>
              <dt>Height</dt>
              <dd>
                {metric(terrain.metrics.minimumHeight)}–{metric(terrain.metrics.maximumHeight)} m
              </dd>
            </div>
            <div>
              <dt>Morphology</dt>
              <dd>{design.terrain.morphology.coastOpening} coast</dd>
            </div>
            <div>
              <dt>Checksum</dt>
              <dd>{terrain.metrics.checksums.combined}</dd>
            </div>
          </dl>
          <div className={styles.lods} aria-label="Terrain mesh LOD">
            {LODS.map((id) => (
              <button aria-pressed={lod === id} key={id} onClick={() => setLod(id)} type="button">
                {id}
              </button>
            ))}
          </div>
        </aside>
      </section>
    </main>
  );
}
