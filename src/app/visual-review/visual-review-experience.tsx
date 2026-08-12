"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";

import { KingdomSceneCandidate } from "@/components/kingdom/kingdom-scene-candidate";
import {
  DEFAULT_KINGDOM_SEASON,
  KINGDOM_SEASONS,
  KINGDOM_SEASON_LABELS,
  createDemoKingdom,
  type KingdomSeason,
} from "@/lib/kingdom";
import type { Selection } from "@/lib/kingdom/types";

import styles from "./visual-review.module.css";

export function VisualReviewExperience({
  initialSeason = DEFAULT_KINGDOM_SEASON,
  clean = false,
}: Readonly<{ initialSeason?: KingdomSeason; clean?: boolean }>) {
  const [season, setSeason] = useState<KingdomSeason>(initialSeason);
  const [selection, setSelection] = useState<Selection>(null);
  const [resetToken, setResetToken] = useState(0);
  const world = useMemo(() => createDemoKingdom(season), [season]);

  return (
    <main className={styles.review} data-season={season}>
      <div className={styles.canvas} aria-label="Candidate 3D world visual review">
        <Canvas
          dpr={[1, 1.75]}
          shadows
          performance={{ min: 0.65, max: 1, debounce: 220 }}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
          onPointerMissed={() => setSelection(null)}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
          }}
        >
          <KingdomSceneCandidate
            world={world}
            season={season}
            selection={selection}
            onSelect={setSelection}
            onHover={() => undefined}
            onEnterPortal={() => undefined}
            resetToken={resetToken}
            reducedMotion={false}
            quality="high"
          />
        </Canvas>
      </div>

      {!clean ? (
        <aside className={styles.controls} aria-label="Visual review controls">
          <div>
            <span>Candidate scene</span>
            <strong>WorldClaw visual gate</strong>
          </div>
          <fieldset>
            <legend>Season</legend>
            {KINGDOM_SEASONS.map((option) => (
              <label key={option} data-active={option === season}>
                <input
                  type="radio"
                  name="review-season"
                  value={option}
                  checked={option === season}
                  onChange={() => {
                    setSeason(option);
                    setSelection(null);
                  }}
                />
                {KINGDOM_SEASON_LABELS[option]}
              </label>
            ))}
          </fieldset>
          <button type="button" onClick={() => setResetToken((token) => token + 1)}>
            Reset overview
          </button>
        </aside>
      ) : null}
    </main>
  );
}
