"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { loadCustomAssetCatalogV1, type CustomAssetCatalogV1 } from "@/lib/world-assets-v2";

import {
  ASSET_LAB_LOD_SLOTS,
  ASSET_LAB_MATERIAL_MODES,
  ASSET_LAB_NAVIGATION_MODES,
  createAssetLabMetrics,
  createAssetLabLodTransition,
  DEFAULT_ASSET_LAB_CONTROLS,
  formatAssetLabBytes,
  type AssetLabControls,
  type AssetLabLodSlot,
  type AssetLabMaterialMode,
  type AssetLabNavigationMode,
} from "./asset-lab-model";
import styles from "./asset-lab.module.css";

const AssetLabCanvas = dynamic(
  () => import("./asset-lab-canvas").then((module) => module.AssetLabCanvas),
  {
    ssr: false,
    loading: () => <div className={styles.canvasMessage}>Preparing WebGL asset review…</div>,
  },
);

function useAssetCatalog() {
  const [state, setState] = useState<
    | Readonly<{ status: "loading" }>
    | Readonly<{ status: "ready"; catalog: CustomAssetCatalogV1 }>
    | Readonly<{ status: "error"; message: string }>
  >({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    loadCustomAssetCatalogV1({ signal: controller.signal }).then(
      (catalog) => setState({ status: "ready", catalog }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Unknown asset catalog failure.",
        });
      },
    );
    return () => controller.abort();
  }, []);

  return state;
}

function Toggle({
  checked,
  label,
  onChange,
}: Readonly<{ checked: boolean; label: string; onChange: (checked: boolean) => void }>) {
  return (
    <label className={styles.toggle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function AssetLabExperience() {
  const catalogState = useAssetCatalog();
  const [controls, setControls] = useState<AssetLabControls>(DEFAULT_ASSET_LAB_CONTROLS);
  const [selectedFamilyId, setSelectedFamilyId] = useState("archive-spire");
  const catalog = catalogState.status === "ready" ? catalogState.catalog : null;
  const metrics = useMemo(
    () => (catalog ? createAssetLabMetrics(catalog, selectedFamilyId, controls.lod) : null),
    [catalog, controls.lod, selectedFamilyId],
  );
  const lodTransition = useMemo(
    () => createAssetLabLodTransition(controls.lod, controls.lodBlend),
    [controls.lod, controls.lodBlend],
  );
  const updateControls = (update: Partial<AssetLabControls>) =>
    setControls((current) => ({ ...current, ...update }));

  return (
    <main className={styles.root}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Repository Worlds V2 · Batch 1</p>
          <h1>Original asset lab</h1>
          <p>
            Five project-authored proof families. Inspect their actual GLBs, LODs, collisions,
            animation, PBR channels, and walk-scale silhouettes.
          </p>
        </div>
        <div className={styles.provenance}>
          <span>Original art only</span>
          <strong>Proof quality · not AAA-complete</strong>
        </div>
      </header>

      {catalogState.status === "error" ? (
        <section className={styles.error} role="alert">
          <h2>Catalog rejected</h2>
          <p>{catalogState.message}</p>
        </section>
      ) : null}

      <section className={styles.workspace}>
        <aside className={styles.controls} aria-label="Asset lab controls">
          <fieldset>
            <legend>Family</legend>
            <div className={styles.familyGrid}>
              {catalog?.families.map((family) => (
                <button
                  key={family.id}
                  type="button"
                  data-active={family.id === selectedFamilyId}
                  onClick={() => setSelectedFamilyId(family.id)}
                >
                  <span>{family.kind}</span>
                  {family.title}
                </button>
              )) ?? <p>Validating catalog…</p>}
            </div>
          </fieldset>

          <fieldset>
            <legend>Camera</legend>
            <div className={styles.segmented}>
              {ASSET_LAB_NAVIGATION_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-active={controls.navigation === mode}
                  onClick={() => updateControls({ navigation: mode as AssetLabNavigationMode })}
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              {controls.navigation === "walk"
                ? "Click the view to lock the pointer. WASD moves; Escape releases."
                : controls.navigation === "orbit"
                  ? "Drag to orbit the five-family lineup; scroll to dolly."
                  : "The selected family rotates at inspection distance."}
            </p>
          </fieldset>

          <fieldset>
            <legend>LOD</legend>
            <div className={styles.segmented}>
              {ASSET_LAB_LOD_SLOTS.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  data-active={controls.lod === slot}
                  onClick={() => updateControls({ lod: slot as AssetLabLodSlot })}
                >
                  {slot.toUpperCase()}
                </button>
              ))}
            </div>
            <div className={styles.lodReview}>
              <Toggle
                label="Crossfade inspection"
                checked={controls.lodReview === "crossfade"}
                onChange={(crossfade) =>
                  updateControls({ lodReview: crossfade ? "crossfade" : "single" })
                }
              />
              <input
                aria-label="LOD crossfade position"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={controls.lodBlend}
                disabled={controls.lodReview !== "crossfade"}
                onChange={(event) =>
                  updateControls({ lodBlend: Number(event.currentTarget.value) })
                }
              />
              <output>
                {lodTransition.from.toUpperCase()} → {lodTransition.to.toUpperCase()} ·{" "}
                {Math.round(lodTransition.blend * 100)}%
              </output>
            </div>
          </fieldset>

          <fieldset>
            <legend>Material channel</legend>
            <div className={styles.channelGrid}>
              {ASSET_LAB_MATERIAL_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-active={controls.material === mode}
                  onClick={() => updateControls({ material: mode as AssetLabMaterialMode })}
                >
                  {mode}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Debug layers</legend>
            <div className={styles.toggleGrid}>
              <Toggle
                label="Wireframe"
                checked={controls.wireframe}
                onChange={(wireframe) => updateControls({ wireframe })}
              />
              <Toggle
                label="Contact shadows"
                checked={controls.contactShadows}
                onChange={(contactShadows) => updateControls({ contactShadows })}
              />
              <Toggle
                label="Collisions"
                checked={controls.collisions}
                onChange={(collisions) => updateControls({ collisions })}
              />
              <Toggle
                label="Animation"
                checked={controls.animation}
                onChange={(animation) => updateControls({ animation })}
              />
            </div>
          </fieldset>
        </aside>

        <div className={styles.viewport}>
          {catalog ? (
            <AssetLabCanvas
              catalog={catalog}
              selectedFamilyId={selectedFamilyId}
              controls={controls}
              onSelectFamily={setSelectedFamilyId}
            />
          ) : (
            <div className={styles.canvasMessage}>Validating original asset catalog…</div>
          )}
          <div className={styles.viewLabel}>
            <span>
              {controls.navigation}
              {controls.lodReview === "crossfade"
                ? ` · ${lodTransition.from}→${lodTransition.to} ${Math.round(lodTransition.blend * 100)}%`
                : ` · ${controls.lod}`}
            </span>
            <strong>{metrics?.title ?? "Catalog loading"}</strong>
          </div>
        </div>

        <aside className={styles.metrics} aria-label="Selected asset metrics">
          <p className={styles.eyebrow}>Measured shipping data</p>
          <h2>{metrics?.title ?? "—"}</h2>
          <p className={styles.kind}>{metrics ? `${metrics.kind} · ${metrics.lod}` : "—"}</p>
          <dl>
            <div>
              <dt>Triangles</dt>
              <dd>{metrics?.triangles.toLocaleString() ?? "—"}</dd>
            </div>
            <div>
              <dt>Vertices</dt>
              <dd>{metrics?.vertices.toLocaleString() ?? "—"}</dd>
            </div>
            <div>
              <dt>Draw calls</dt>
              <dd>{metrics?.drawCalls ?? "—"}</dd>
            </div>
            <div>
              <dt>Meshes</dt>
              <dd>{metrics?.meshes ?? "—"}</dd>
            </div>
            <div>
              <dt>Materials</dt>
              <dd>{metrics?.materials ?? "—"}</dd>
            </div>
            <div>
              <dt>GLB bytes</dt>
              <dd>{metrics ? formatAssetLabBytes(metrics.shippedBytes) : "—"}</dd>
            </div>
            <div>
              <dt>Geometry GPU</dt>
              <dd>{metrics ? formatAssetLabBytes(metrics.estimatedGpuBytes) : "—"}</dd>
            </div>
            <div>
              <dt>KTX2 samplers</dt>
              <dd>{metrics?.textureSamplers ?? "—"}</dd>
            </div>
            <div>
              <dt>KTX2 shipped</dt>
              <dd>{metrics ? formatAssetLabBytes(metrics.textureShippedBytes) : "—"}</dd>
            </div>
            <div>
              <dt>Texture decoded</dt>
              <dd>{metrics ? formatAssetLabBytes(metrics.textureDecodedGpuBytes) : "—"}</dd>
            </div>
            <div>
              <dt>Collision nodes</dt>
              <dd>{metrics?.collisionNodes ?? "—"}</dd>
            </div>
            <div>
              <dt>Placement footprint</dt>
              <dd>
                {metrics
                  ? `${metrics.footprintShape} · ${metrics.footprintDimensionsMeters
                      .map((value) => value.toFixed(2))
                      .join(" × ")} m`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Placement clearance</dt>
              <dd>{metrics ? `${metrics.footprintClearanceMeters.toFixed(2)} m` : "—"}</dd>
            </div>
            <div>
              <dt>Primary biome</dt>
              <dd>{metrics?.primaryBiome ?? "—"}</dd>
            </div>
            <div>
              <dt>Compatible biomes</dt>
              <dd>{metrics?.compatibleBiomes.join(" · ") ?? "—"}</dd>
            </div>
            <div>
              <dt>Animation</dt>
              <dd>{metrics?.animation ?? "—"}</dd>
            </div>
            <div>
              <dt>LOD envelope drift</dt>
              <dd>{metrics ? `${metrics.silhouetteEnvelopeDeltaPercent.toFixed(2)}%` : "—"}</dd>
            </div>
            <div>
              <dt>LOD extent drift</dt>
              <dd>{metrics ? `${metrics.silhouetteExtentDeltaPercent.toFixed(2)}%` : "—"}</dd>
            </div>
            <div>
              <dt>LOD center drift</dt>
              <dd>{metrics ? `${metrics.silhouetteCenterDriftPercent.toFixed(2)}%` : "—"}</dd>
            </div>
          </dl>
          {metrics ? (
            <div className={styles.bounds}>
              <span>Bounds</span>
              <code>min {metrics.bounds.min.join(" · ")}</code>
              <code>max {metrics.bounds.max.join(" · ")}</code>
            </div>
          ) : null}
          <p className={styles.disclaimer}>
            This lab proves the asset contract and review loop. Sculpted bakes, complete texture
            coverage, mesh compression, and final AAA art direction remain future batches.
          </p>
        </aside>
      </section>
    </main>
  );
}
