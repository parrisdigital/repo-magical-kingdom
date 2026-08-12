"use client";

import { useMemo, useState, type FormEvent } from "react";

import { KINGDOM_SEASONS, KINGDOM_SEASON_LABELS, type KingdomSeason } from "@/lib/kingdom";
import type { KingdomWorld, RepositoryUniverse, Selection } from "@/lib/kingdom/types";

import styles from "./kingdom-experience.module.css";
import { BIOME_COLORS, BIOME_LABELS, CATEGORY_LABELS } from "./world-utils";

export type ExperienceMode = "landing" | "kingdom" | "universe";

type KingdomHudProps = Readonly<{
  mode: ExperienceMode;
  world: KingdomWorld;
  universe: RepositoryUniverse | null;
  selection: Selection;
  hovered: Selection;
  repositoryInput: string;
  loadingMessage: string | null;
  errorMessage: string | null;
  isDemo: boolean;
  soundEnabled: boolean;
  season: KingdomSeason;
  onRepositoryInput: (value: string) => void;
  onSubmit: () => void;
  onSelect: (selection: Selection) => void;
  onEnterSelection: () => void;
  onResetCamera: () => void;
  onShowLanding: () => void;
  onShowUniverse: () => void;
  onToggleSound: () => void;
  onSeasonChange: (season: KingdomSeason) => void;
}>;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function SeasonPicker({
  season,
  onChange,
  compact = false,
}: Readonly<{
  season: KingdomSeason;
  onChange: (season: KingdomSeason) => void;
  compact?: boolean;
}>) {
  return (
    <fieldset
      className={compact ? styles.seasonPickerCompact : styles.seasonPicker}
      role="radiogroup"
    >
      <legend>{compact ? "Season" : "Choose your kingdom's season"}</legend>
      <div>
        {KINGDOM_SEASONS.map((option) => (
          <label key={option} data-selected={season === option ? "true" : "false"}>
            <input
              type="radio"
              name={compact ? "world-season" : "forge-season"}
              value={option}
              checked={season === option}
              onChange={() => onChange(option)}
              required
            />
            <span aria-hidden="true" data-season={option} />
            {KINGDOM_SEASON_LABELS[option]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CoveragePanel({ world }: Readonly<{ world: KingdomWorld }>) {
  const [open, setOpen] = useState(false);
  const shortCommit = world.source.commitSha.slice(0, 7);

  return (
    <div className={styles.explorerWrap}>
      <button
        className={styles.toolButton}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span aria-hidden="true">◈</span>
        Provenance
      </button>
      {open ? (
        <section className={styles.explorer} aria-label="World provenance and coverage">
          <div className={styles.drawerHeading}>
            <div>
              <span className={styles.kicker}>Truth before spectacle</span>
              <h2>World provenance</h2>
            </div>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close provenance"
            >
              ×
            </button>
          </div>
          <dl className={styles.facts}>
            <div>
              <dt>Source</dt>
              <dd>
                {world.source.owner}/{world.source.repository}
              </dd>
            </div>
            <div>
              <dt>Commit</dt>
              <dd>{shortCommit}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>{world.source.license ?? "Not detected"}</dd>
            </div>
            <div>
              <dt>World schema</dt>
              <dd>
                {world.schema} · compiler {world.compilerVersion}
              </dd>
            </div>
            <div>
              <dt>Discovered</dt>
              <dd>{world.coverage.discoveredFiles.toLocaleString()} files</dd>
            </div>
            <div>
              <dt>Represented</dt>
              <dd>{world.coverage.representedFiles.toLocaleString()} files</dd>
            </div>
          </dl>
          {world.coverage.omissions.length ? (
            <div className={styles.provenanceNotes}>
              <strong>Intentional omissions</strong>
              <ul>
                {world.coverage.omissions.map((omission) => (
                  <li key={omission.reason}>
                    {omission.reason}: {omission.files.toLocaleString()} files (
                    {formatBytes(omission.bytes)})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {world.warnings.length ? (
            <div className={styles.provenanceNotes}>
              <strong>Compiler notices</strong>
              <ul>
                {world.warnings.map((warning) => (
                  <li key={`${warning.code}:${warning.message}`}>{warning.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className={styles.selectionActions}>
            <a
              className={styles.secondaryButton}
              href={world.source.revisionUrl}
              target="_blank"
              rel="noreferrer"
            >
              View commit <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Brand({ mode, isDemo }: Readonly<{ mode: ExperienceMode; isDemo: boolean }>) {
  return (
    <div className={styles.brand}>
      <div className={styles.brandSigil} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div>
        <p>Repo Magical Kingdom</p>
        <span>
          {mode === "universe"
            ? "Repository universe"
            : isDemo
              ? "Living world preview"
              : "Immutable kingdom"}
        </span>
      </div>
    </div>
  );
}

function ExplorerDrawer({
  world,
  selection,
  onSelect,
}: Readonly<{
  world: KingdomWorld;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];
    const provinces = world.provinces
      .filter((province) =>
        `${province.label} ${province.description} ${province.biome}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
      .slice(0, 5)
      .map((province) => ({
        key: province.id,
        label: province.label,
        detail: `${BIOME_LABELS[province.biome]} realm`,
        selection: { kind: "province", province } as const,
      }));
    const entities = world.entities
      .filter((entity) =>
        `${entity.label} ${entity.path} ${entity.category} ${entity.language}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
      .slice(0, 8)
      .map((entity) => ({
        key: entity.id,
        label: entity.label,
        detail: entity.path,
        selection: { kind: "entity", entity } as const,
      }));
    return [...provinces, ...entities].slice(0, 10);
  }, [query, world.entities, world.provinces]);

  return (
    <div className={styles.explorerWrap}>
      <button
        className={styles.toolButton}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span aria-hidden="true">⌕</span>
        Explore
      </button>
      {open ? (
        <section className={styles.explorer} aria-label="Kingdom explorer">
          <div className={styles.drawerHeading}>
            <div>
              <span className={styles.kicker}>Kingdom atlas</span>
              <h2>Find a landmark</h2>
            </div>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close explorer"
            >
              ×
            </button>
          </div>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search paths and provinces</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search paths or provinces…"
              autoFocus
            />
          </label>
          {query ? (
            <div className={styles.searchResults} aria-live="polite">
              {results.length ? (
                results.map((result) => (
                  <button
                    key={result.key}
                    type="button"
                    onClick={() => {
                      onSelect(result.selection);
                      setOpen(false);
                    }}
                  >
                    <strong>{result.label}</strong>
                    <span>{result.detail}</span>
                  </button>
                ))
              ) : (
                <p>No landmarks match that search.</p>
              )}
            </div>
          ) : (
            <>
              <div
                className={styles.miniMap}
                role="img"
                aria-label={`Map of the ${world.theme.label} kingdom`}
              >
                <span className={styles.miniMapNexus} aria-hidden="true" />
                {world.provinces.map((province) => {
                  const radius = world.bounds.radius * 1.12;
                  const left = 50 + (province.position.x / radius) * 44;
                  const top = 50 + (province.position.z / radius) * 44;
                  const isSelected =
                    selection?.kind === "province" && selection.province.id === province.id;
                  return (
                    <button
                      key={province.id}
                      type="button"
                      className={isSelected ? styles.miniMapSelected : undefined}
                      style={{
                        left: `${left}%`,
                        top: `${top}%`,
                        backgroundColor: BIOME_COLORS[province.biome],
                      }}
                      onClick={() => {
                        onSelect({ kind: "province", province });
                        setOpen(false);
                      }}
                      aria-label={`Focus ${province.label}, ${BIOME_LABELS[province.biome]} realm`}
                    />
                  );
                })}
              </div>
              <div className={styles.provinceList}>
                {world.provinces.map((province) => (
                  <button
                    key={province.id}
                    type="button"
                    onClick={() => {
                      onSelect({ kind: "province", province });
                      setOpen(false);
                    }}
                  >
                    <i style={{ backgroundColor: BIOME_COLORS[province.biome] }} />
                    <span>{province.label}</span>
                    <small>{province.representedFiles}</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

function UniverseDrawer({
  universe,
  selection,
  onSelect,
}: Readonly<{
  universe: RepositoryUniverse;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const repositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return universe.repositories
      .filter((repository) =>
        normalizedQuery
          ? `${repository.owner}/${repository.repository} ${repository.description ?? ""} ${repository.language ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery)
          : true,
      )
      .slice(0, 40);
  }, [query, universe.repositories]);

  return (
    <div className={styles.explorerWrap}>
      <button
        className={styles.toolButton}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span aria-hidden="true">✦</span>
        Worlds
      </button>
      {open ? (
        <section className={styles.explorer} aria-label="Repository worlds">
          <div className={styles.drawerHeading}>
            <div>
              <span className={styles.kicker}>@{universe.owner}&apos;s universe</span>
              <h2>Choose a world</h2>
            </div>
            <button
              className={styles.iconButton}
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close worlds"
            >
              ×
            </button>
          </div>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search repository worlds</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search repository worlds…"
              autoFocus
            />
          </label>
          <div className={styles.universeList} role="list">
            {repositories.map((repository) => {
              const isSelected =
                selection?.kind === "repository" && selection.repository.id === repository.id;
              return (
                <button
                  key={repository.id}
                  type="button"
                  className={isSelected ? styles.universeSelected : undefined}
                  onClick={() => {
                    onSelect({ kind: "repository", repository });
                    setOpen(false);
                  }}
                >
                  <i style={{ backgroundColor: `hsl(${repository.hue} 64% 59%)` }} />
                  <span>
                    <strong>{repository.repository}</strong>
                    <small>
                      {repository.language ?? "Repository"} · ★ {repository.stars.toLocaleString()}
                    </small>
                  </span>
                  <b aria-hidden="true">→</b>
                </button>
              );
            })}
          </div>
          {universe.truncated ? (
            <p className={styles.drawerNote}>
              Showing the first {universe.repositories.length} of {universe.repositoryCount} public
              repositories.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function SelectionCard({
  selection,
  onClose,
  onEnter,
}: Readonly<{ selection: NonNullable<Selection>; onClose: () => void; onEnter: () => void }>) {
  let kicker = "Kingdom discovery";
  let title = "";
  let description = "";
  let sourceUrl: string | null = null;
  const facts: Array<readonly [string, string]> = [];
  let canEnter = false;

  if (selection.kind === "province") {
    const { province } = selection;
    kicker = `${BIOME_LABELS[province.biome]} · ${province.role}`;
    title = province.label;
    description = province.description;
    sourceUrl = province.sourceUrl;
    facts.push(
      ["Files", province.representedFiles.toLocaleString()],
      ["Source", formatBytes(province.representedBytes)],
    );
  } else if (selection.kind === "entity") {
    const { entity } = selection;
    kicker = entity.aggregate ? "Aggregated landmark" : CATEGORY_LABELS[entity.category];
    title = entity.label;
    description = entity.path;
    sourceUrl = entity.sourceUrl;
    facts.push(
      ["Language", entity.language || "Unknown"],
      [
        entity.aggregate ? "Represents" : "Size",
        entity.aggregate ? `${entity.representedFiles} files` : formatBytes(entity.size),
      ],
    );
  } else if (selection.kind === "portal") {
    const { portal } = selection;
    kicker = "Repository portal";
    title = `${portal.owner}/${portal.repository}`;
    description = portal.description ?? "A neighboring repository kingdom.";
    sourceUrl = portal.canonicalUrl;
    facts.push(
      ["Language", portal.language ?? "Unknown"],
      ["Stars", portal.stars.toLocaleString()],
    );
    canEnter = true;
  } else {
    const { repository } = selection;
    kicker = "Repository world";
    title = `${repository.owner}/${repository.repository}`;
    description = repository.description ?? "An explorable repository world.";
    facts.push(
      ["Language", repository.language ?? "Unknown"],
      ["Stars", repository.stars.toLocaleString()],
    );
    canEnter = true;
  }

  return (
    <aside className={styles.selectionCard} aria-live="polite">
      <div className={styles.drawerHeading}>
        <div>
          <span className={styles.kicker}>{kicker}</span>
          <h2>{title}</h2>
        </div>
        <button
          className={styles.iconButton}
          type="button"
          onClick={onClose}
          aria-label="Close details"
        >
          ×
        </button>
      </div>
      <p className={styles.selectionDescription}>{description}</p>
      <dl className={styles.facts}>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className={styles.selectionActions}>
        {canEnter ? (
          <button className={styles.primaryButton} type="button" onClick={onEnter}>
            Enter world <span aria-hidden="true">→</span>
          </button>
        ) : null}
        {sourceUrl ? (
          <a className={styles.secondaryButton} href={sourceUrl} target="_blank" rel="noreferrer">
            View source <span aria-hidden="true">↗</span>
          </a>
        ) : null}
      </div>
    </aside>
  );
}

function HoverHint({ selection }: Readonly<{ selection: NonNullable<Selection> }>) {
  const text =
    selection.kind === "province"
      ? selection.province.label
      : selection.kind === "entity"
        ? selection.entity.path
        : selection.kind === "portal"
          ? `Portal to ${selection.portal.owner}/${selection.portal.repository}`
          : `${selection.repository.owner}/${selection.repository.repository}`;
  return (
    <div className={styles.hoverHint}>
      <span>{text}</span>
      <small>select to focus</small>
    </div>
  );
}

export function KingdomHud({
  mode,
  world,
  universe,
  selection,
  hovered,
  repositoryInput,
  loadingMessage,
  errorMessage,
  isDemo,
  soundEnabled,
  season,
  onRepositoryInput,
  onSubmit,
  onSelect,
  onEnterSelection,
  onResetCamera,
  onShowLanding,
  onShowUniverse,
  onToggleSound,
  onSeasonChange,
}: KingdomHudProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  const title =
    mode === "universe" ? (universe?.displayName ?? "Repository Universe") : world.title;
  const subtitle =
    mode === "universe"
      ? `${universe?.repositoryCount ?? 0} explorable worlds`
      : `${KINGDOM_SEASON_LABELS[season]} kingdom · ${world.statistics.provinces} settlements · ${world.coverage.representedFiles.toLocaleString()} files represented`;

  return (
    <div className={styles.hud}>
      <header className={styles.topBar}>
        <button
          className={styles.brandButton}
          type="button"
          onClick={onShowLanding}
          aria-label="Return to the Repo Magical Kingdom gateway"
        >
          <Brand mode={mode} isDemo={isDemo} />
        </button>
        <nav className={styles.tools} aria-label="World tools">
          {mode === "kingdom" ? (
            <ExplorerDrawer world={world} selection={selection} onSelect={onSelect} />
          ) : null}
          {mode === "universe" && universe ? (
            <UniverseDrawer universe={universe} selection={selection} onSelect={onSelect} />
          ) : null}
          {mode === "kingdom" ? <CoveragePanel world={world} /> : null}
          <button className={styles.toolButton} type="button" onClick={onResetCamera}>
            <span aria-hidden="true">⌂</span>
            Overview
          </button>
          <button
            className={styles.toolButton}
            type="button"
            onClick={onToggleSound}
            aria-pressed={soundEnabled}
          >
            <span aria-hidden="true">{soundEnabled ? "◖))" : "◖×"}</span>
            {soundEnabled ? "Sound on" : "Sound off"}
          </button>
          <a className={styles.toolButton} href="/credits">
            <span aria-hidden="true">◇</span>
            Credits
          </a>
        </nav>
      </header>

      {mode === "landing" ? (
        <section className={styles.gateway}>
          <span className={styles.kicker}>Repository worlds, made explorable</span>
          <h1>Your code already has a kingdom.</h1>
          <p>Forge a public GitHub repository into one living, explorable world.</p>
          <form className={styles.gatewayForm} onSubmit={submit}>
            <label>
              <span className={styles.srOnly}>GitHub repository or profile</span>
              <input
                value={repositoryInput}
                onChange={(event) => onRepositoryInput(event.target.value)}
                placeholder="owner/repository or GitHub URL"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </label>
            <button type="submit" disabled={!repositoryInput.trim() || Boolean(loadingMessage)}>
              <span>{loadingMessage ? "Opening gate…" : "Forge kingdom"}</span>
              <i aria-hidden="true">→</i>
            </button>
          </form>
          <SeasonPicker season={season} onChange={onSeasonChange} />
          <div className={styles.gatewayMeta}>
            <span>Public repositories only</span>
            <span>·</span>
            <span>Deterministic at every commit</span>
          </div>
          {errorMessage ? (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}
        </section>
      ) : (
        <section className={styles.worldIdentity}>
          <span className={styles.kicker}>
            {mode === "universe"
              ? `@${universe?.owner ?? "explorer"}`
              : `${world.source.owner}/${world.source.repository}`}
          </span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          {mode === "kingdom" ? (
            <SeasonPicker season={season} onChange={onSeasonChange} compact />
          ) : null}
        </section>
      )}

      {mode === "kingdom" && !isDemo ? (
        <div className={styles.modeSwitch}>
          <button type="button" onClick={onShowUniverse}>
            <span aria-hidden="true">✦</span>
            View @{world.source.owner}&apos;s universe
          </button>
        </div>
      ) : null}

      {loadingMessage && mode !== "landing" ? (
        <div className={styles.loadingToast} role="status">
          <i aria-hidden="true" />
          {loadingMessage}
        </div>
      ) : null}
      {errorMessage && mode !== "landing" ? (
        <div className={styles.errorToast} role="alert">
          {errorMessage}
        </div>
      ) : null}
      {hovered && !selection ? <HoverHint selection={hovered} /> : null}
      {selection ? (
        <SelectionCard
          selection={selection}
          onClose={() => onSelect(null)}
          onEnter={onEnterSelection}
        />
      ) : null}

      <footer className={styles.controlHint}>
        <span>
          <b>Drag</b> orbit
        </span>
        <span>
          <b>Scroll</b> zoom
        </span>
        <span>
          <b>Select</b> discover
        </span>
      </footer>
    </div>
  );
}
