"use client";

import { Canvas } from "@react-three/fiber";
import { useMemo, useState } from "react";
import * as THREE from "three";

import { KingdomSceneCandidate } from "@/components/kingdom/kingdom-scene-candidate";
import {
  DEFAULT_KINGDOM_SEASON,
  KINGDOM_SEASONS,
  KINGDOM_SEASON_LABELS,
  KINGDOM_WORLD_THEMES,
  KINGDOM_WORLD_THEME_LABELS,
  createDemoKingdom,
  type KingdomSeason,
  type KingdomWorldTheme,
} from "@/lib/kingdom";
import type { Selection } from "@/lib/kingdom/types";

import styles from "./visual-review.module.css";

export function VisualReviewExperience({
  initialSeason = DEFAULT_KINGDOM_SEASON,
  initialWorldTheme = "enchanted-forest",
  clean = false,
}: Readonly<{
  initialSeason?: KingdomSeason;
  initialWorldTheme?: KingdomWorldTheme;
  clean?: boolean;
}>) {
  const [season, setSeason] = useState<KingdomSeason>(initialSeason);
  const [worldTheme, setWorldTheme] = useState<KingdomWorldTheme>(initialWorldTheme);
  const [selection, setSelection] = useState<Selection>(null);
  const [resetToken, setResetToken] = useState(0);
  const world = useMemo(() => createDemoKingdom(season, worldTheme), [season, worldTheme]);

  return (
    <main className={styles.review} data-season={season} data-world-theme={worldTheme}>
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
            <legend>World</legend>
            {KINGDOM_WORLD_THEMES.map((option) => (
              <label key={option} data-active={option === worldTheme}>
                <input
                  type="radio"
                  name="review-world"
                  value={option}
                  checked={option === worldTheme}
                  onChange={() => {
                    setWorldTheme(option);
                    setSelection(null);
                  }}
                />
                {KINGDOM_WORLD_THEME_LABELS[option]}
              </label>
            ))}
          </fieldset>
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
