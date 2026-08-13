"use client";

import { Canvas } from "@react-three/fiber";
import { useRouter } from "next/navigation";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import * as THREE from "three";

import {
  DEFAULT_KINGDOM_SEASON,
  KINGDOM_SEASON_LABELS,
  KINGDOM_WORLD_THEME_LABELS,
  type KingdomSeason,
  type KingdomWorldTheme,
} from "@/lib/kingdom";
import { createDemoKingdom, createDemoUniverse } from "@/lib/kingdom/demo-world";
import { kingdomWorldSchema, repositoryUniverseSchema } from "@/lib/kingdom/schemas";
import type {
  KingdomWorld,
  RepositoryPortal,
  RepositoryUniverse,
  Selection,
  UniverseRepository,
} from "@/lib/kingdom/types";

import styles from "./kingdom-experience.module.css";
import { KingdomHud, type ExperienceMode } from "./kingdom-hud";
import { KingdomScenePlanned as KingdomScene } from "./kingdom-scene-planned";
import { RepositoryUniverseScene } from "./universe-scene";

const DEMO_WORLD = createDemoKingdom(DEFAULT_KINGDOM_SEASON, "enchanted-forest");
const DEMO_UNIVERSE = createDemoUniverse();

type NavigateOptions = Readonly<{ replace?: boolean }>;

type WorldTravelState = Readonly<{
  direction: "enter" | "exit";
  phase: "approach" | "cover" | "reveal";
  label: string;
  repositoryId: number | null;
}> | null;

type KingdomTravelOptions = Readonly<{
  repositoryId: number;
  label: string;
}>;

function waitForTravel(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Travel aborted.", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export type KingdomExperienceProps = Readonly<{
  initialOwner?: string;
  initialRepository?: string;
  initialRevision?: string;
  initialSeason?: KingdomSeason;
  initialWorldTheme?: KingdomWorldTheme;
  initialMode?: ExperienceMode;
  kingdomEndpoint?: string;
  universeEndpoint?: string;
  onWorldLoaded?: (world: KingdomWorld) => void;
  onUniverseLoaded?: (universe: RepositoryUniverse) => void;
  onSelectionChange?: (selection: Selection) => void;
  onNavigate?: (href: string, options: NavigateOptions) => void;
  className?: string;
}>;

type ErrorPayload = Readonly<{
  error?: Readonly<{ message?: string }>;
  message?: string;
}>;

type ParsedSource =
  | Readonly<{ kind: "repository"; owner: string; repository: string }>
  | Readonly<{ kind: "owner"; owner: string }>;

function parseSourceInput(input: string): ParsedSource | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let path = trimmed;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    if (url.hostname === "github.com" || url.hostname === "www.github.com") path = url.pathname;
  } catch {
    // The compact owner/repository form is handled below.
  }

  const segments = path
    .replace(/^https?:\/\/(?:www\.)?github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "")
    .split(/[/?#]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const validSegment = (segment: string) => /^[a-zA-Z0-9_.-]+$/.test(segment);
  if (!segments[0] || !validSegment(segments[0])) return null;
  if (segments[1] && validSegment(segments[1])) {
    return { kind: "repository", owner: segments[0], repository: segments[1] };
  }
  return { kind: "owner", owner: segments[0] };
}

function responseMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const errorPayload = payload as ErrorPayload;
  return errorPayload.error?.message ?? errorPayload.message ?? fallback;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useWebGlSupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        setSupported(Boolean(context));
      } catch {
        setSupported(false);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return supported;
}

function useQualityTier(reducedMotion: boolean): "low" | "high" {
  // Begin with the inexpensive tier so a cold scene never compiles a high-DPR,
  // shadowed frame that an effect immediately discards on compact, low-core,
  // or reduced-motion devices.
  const [quality, setQuality] = useState<"low" | "high">("low");
  useEffect(() => {
    const update = () => {
      const compact = window.matchMedia("(max-width: 780px)").matches;
      const fewerCores = navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
      setQuality(compact || fewerCores || reducedMotion ? "low" : "high");
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, [reducedMotion]);
  return quality;
}

function useProceduralAmbience(enabled: boolean) {
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    audioRef.current = context;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(0.032, context.currentTime + 1.6);
    master.connect(context.destination);

    const seconds = 2.2;
    const noiseBuffer = context.createBuffer(
      1,
      Math.floor(context.sampleRate * seconds),
      context.sampleRate,
    );
    const channel = noiseBuffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      const envelope = Math.sin((index / channel.length) * Math.PI);
      channel[index] = (Math.random() * 2 - 1) * (0.62 + envelope * 0.38);
    }
    const water = context.createBufferSource();
    const waterFilter = context.createBiquadFilter();
    const waterGain = context.createGain();
    water.buffer = noiseBuffer;
    water.loop = true;
    waterFilter.type = "lowpass";
    waterFilter.frequency.value = 520;
    waterFilter.Q.value = 0.6;
    waterGain.gain.value = 0.24;
    water.connect(waterFilter).connect(waterGain).connect(master);

    const chime = context.createOscillator();
    const chimeOvertone = context.createOscillator();
    const chimeGain = context.createGain();
    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    chime.type = "sine";
    chime.frequency.value = 196;
    chimeOvertone.type = "sine";
    chimeOvertone.frequency.value = 293.66;
    chimeGain.gain.value = 0.035;
    lfo.type = "sine";
    lfo.frequency.value = 0.075;
    lfoGain.gain.value = 0.026;
    lfo.connect(lfoGain).connect(chimeGain.gain);
    chime.connect(chimeGain);
    chimeOvertone.connect(chimeGain);
    chimeGain.connect(master);

    void context.resume();
    water.start();
    chime.start();
    chimeOvertone.start();
    lfo.start();

    return () => {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(0.0001, context.currentTime, 0.08);
      window.setTimeout(() => void context.close(), 220);
      audioRef.current = null;
    };
  }, [enabled]);
}

type SceneBoundaryProps = Readonly<{ children: ReactNode; onError: () => void }>;

class SceneBoundary extends Component<SceneBoundaryProps, { failed: boolean }> {
  public override state = { failed: false };

  public static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("The WebGL kingdom scene failed to render.", error, info);
    this.props.onError();
  }

  public override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function KingdomExperience({
  initialOwner,
  initialRepository,
  initialRevision,
  initialSeason = DEFAULT_KINGDOM_SEASON,
  initialWorldTheme,
  initialMode = initialOwner && initialRepository ? "kingdom" : "landing",
  kingdomEndpoint = "/api/kingdom",
  universeEndpoint = "/api/universe",
  onWorldLoaded,
  onUniverseLoaded,
  onSelectionChange,
  onNavigate,
  className,
}: KingdomExperienceProps) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const webglSupported = useWebGlSupport();
  const quality = useQualityTier(reducedMotion);
  const [contextFailureCount, setContextFailureCount] = useState(0);
  const [mode, setMode] = useState<ExperienceMode>(initialMode);
  const [season, setSeason] = useState<KingdomSeason>(initialSeason);
  const [worldThemeChoice, setWorldThemeChoice] = useState<KingdomWorldTheme | null>(
    initialWorldTheme ?? null,
  );
  const [world, setWorld] = useState<KingdomWorld>(DEMO_WORLD);
  const [universe, setUniverse] = useState<RepositoryUniverse | null>(
    initialMode === "universe" ? DEMO_UNIVERSE : null,
  );
  const [selection, setSelectionState] = useState<Selection>(null);
  const [hovered, setHovered] = useState<Selection>(null);
  const [repositoryInput, setRepositoryInput] = useState(
    initialOwner && initialRepository ? `${initialOwner}/${initialRepository}` : "",
  );
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [travel, setTravel] = useState<WorldTravelState>(null);
  const requestRef = useRef<AbortController | null>(null);
  useProceduralAmbience(soundEnabled);

  const navigate = useCallback(
    (href: string, options: NavigateOptions = {}) => {
      if (onNavigate) {
        onNavigate(href, options);
      } else if (options.replace) {
        router.replace(href, { scroll: false });
      } else {
        router.push(href, { scroll: false });
      }
    },
    [onNavigate, router],
  );

  const preserveSceneLocation = useCallback(
    (href: string, options: NavigateOptions = {}) => {
      if (onNavigate) {
        onNavigate(href, options);
        return;
      }
      if (options.replace) window.history.replaceState(null, "", href);
      else window.history.pushState(null, "", href);
    },
    [onNavigate],
  );

  const setSelection = useCallback(
    (nextSelection: Selection) => {
      setSelectionState(nextSelection);
      onSelectionChange?.(nextSelection);
    },
    [onSelectionChange],
  );

  const loadKingdom = useCallback(
    async (
      owner: string,
      repository: string,
      requestedSeason: KingdomSeason,
      requestedWorldTheme: KingdomWorldTheme | null,
      revision?: string,
      history: "push" | "replace" | "none" = "push",
      travelOptions?: KingdomTravelOptions,
    ) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoadingMessage(`Reading ${owner}/${repository}…`);
      setErrorMessage(null);
      if (!travelOptions) setSelection(null);
      const travelStartedAt = performance.now();
      if (travelOptions) {
        setTravel({
          direction: "enter",
          phase: "approach",
          label: travelOptions.label,
          repositoryId: travelOptions.repositoryId,
        });
      }

      try {
        const params = new URLSearchParams({ repository: `${owner}/${repository}` });
        if (requestedWorldTheme) params.set("world", requestedWorldTheme);
        params.set("season", requestedSeason);
        if (revision) params.set("revision", revision);
        const response = await fetch(`${kingdomEndpoint}?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(responseMessage(payload, `GitHub returned ${response.status}.`));
        const candidate =
          payload && typeof payload === "object" && "world" in payload
            ? (payload as Readonly<{ world: unknown }>).world
            : payload;
        const parsedWorld = kingdomWorldSchema.safeParse(candidate);
        if (!parsedWorld.success)
          throw new Error("The kingdom compiler returned an invalid world package.");
        if (controller.signal.aborted) return;

        const nextWorld = parsedWorld.data;
        if (travelOptions) {
          await waitForTravel(
            Math.max(0, 620 - (performance.now() - travelStartedAt)),
            controller.signal,
          );
          setTravel({
            direction: "enter",
            phase: "cover",
            label: travelOptions.label,
            repositoryId: travelOptions.repositoryId,
          });
          await waitForTravel(360, controller.signal);
        }
        setSelection(null);
        setWorld(nextWorld);
        setSeason(nextWorld.season);
        setWorldThemeChoice(nextWorld.worldTheme);
        setUniverse(null);
        setMode("kingdom");
        setRepositoryInput(`${nextWorld.source.owner}/${nextWorld.source.repository}`);
        setResetToken((token) => token + 1);
        onWorldLoaded?.(nextWorld);
        const canonicalPath = `/kingdom/${encodeURIComponent(nextWorld.source.owner)}/${encodeURIComponent(nextWorld.source.repository)}/${nextWorld.source.commitSha}?world=${nextWorld.worldTheme}&season=${nextWorld.season}`;
        if (history !== "none") {
          const navigationOptions = { replace: history === "replace" };
          if (travelOptions) {
            preserveSceneLocation(canonicalPath, navigationOptions);
            document.title = `${nextWorld.source.owner}/${nextWorld.source.repository} · ${KINGDOM_WORLD_THEME_LABELS[nextWorld.worldTheme]} · ${KINGDOM_SEASON_LABELS[nextWorld.season]} · Repo Magical Kingdom`;
          } else navigate(canonicalPath, navigationOptions);
        }
        if (travelOptions) {
          setLoadingMessage(null);
          setTravel({
            direction: "enter",
            phase: "reveal",
            label: travelOptions.label,
            repositoryId: null,
          });
          await waitForTravel(620, controller.signal);
          setTravel(null);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          if (requestRef.current === controller) setTravel(null);
          return;
        }
        setTravel(null);
        setErrorMessage(
          error instanceof Error ? error.message : "The gateway could not forge that repository.",
        );
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setLoadingMessage(null);
        }
      }
    },
    [kingdomEndpoint, navigate, onWorldLoaded, preserveSceneLocation, setSelection],
  );

  const loadUniverse = useCallback(
    async (owner: string, history: "push" | "replace" | "none" = "push", cinematic = false) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoadingMessage(`Charting @${owner}'s universe…`);
      setErrorMessage(null);
      setSelection(null);
      const travelStartedAt = performance.now();
      if (cinematic) {
        setTravel({
          direction: "exit",
          phase: "approach",
          label: `@${owner}'s universe`,
          repositoryId: null,
        });
      }

      try {
        const params = new URLSearchParams({ owner });
        const response = await fetch(`${universeEndpoint}?${params.toString()}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(responseMessage(payload, `GitHub returned ${response.status}.`));
        const candidate =
          payload && typeof payload === "object" && "universe" in payload
            ? (payload as Readonly<{ universe: unknown }>).universe
            : payload;
        const parsedUniverse = repositoryUniverseSchema.safeParse(candidate);
        if (!parsedUniverse.success)
          throw new Error("The universe compiler returned an invalid world package.");
        if (controller.signal.aborted) return;

        const nextUniverse = parsedUniverse.data;
        if (cinematic) {
          await waitForTravel(
            Math.max(0, 420 - (performance.now() - travelStartedAt)),
            controller.signal,
          );
          setTravel({
            direction: "exit",
            phase: "cover",
            label: `@${owner}'s universe`,
            repositoryId: null,
          });
          await waitForTravel(320, controller.signal);
        }
        setUniverse(nextUniverse);
        setMode("universe");
        setRepositoryInput(nextUniverse.owner);
        setResetToken((token) => token + 1);
        onUniverseLoaded?.(nextUniverse);
        if (history !== "none") {
          const href = `/profile/${encodeURIComponent(nextUniverse.owner)}`;
          const navigationOptions = { replace: history === "replace" };
          if (cinematic) {
            preserveSceneLocation(href, navigationOptions);
            document.title = `@${nextUniverse.owner}'s universe · Repo Magical Kingdom`;
          } else navigate(href, navigationOptions);
        }
        if (cinematic) {
          setLoadingMessage(null);
          setTravel({
            direction: "exit",
            phase: "reveal",
            label: `@${owner}'s universe`,
            repositoryId: null,
          });
          await waitForTravel(560, controller.signal);
          setTravel(null);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          if (requestRef.current === controller) setTravel(null);
          return;
        }
        setTravel(null);
        setErrorMessage(
          error instanceof Error ? error.message : "The atlas could not chart that profile.",
        );
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setLoadingMessage(null);
        }
      }
    },
    [navigate, onUniverseLoaded, preserveSceneLocation, setSelection, universeEndpoint],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (initialMode === "kingdom" && initialOwner && initialRepository) {
        void loadKingdom(
          initialOwner,
          initialRepository,
          initialSeason,
          initialWorldTheme ?? null,
          initialRevision,
          "replace",
        );
      } else if (initialMode === "universe" && initialOwner) {
        void loadUniverse(initialOwner, "replace");
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    initialMode,
    initialOwner,
    initialRepository,
    initialRevision,
    initialSeason,
    initialWorldTheme,
    loadKingdom,
    loadUniverse,
  ]);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      document.body.style.cursor = "default";
    },
    [],
  );

  const submitRepository = useCallback(() => {
    const parsed = parseSourceInput(repositoryInput);
    if (!parsed) {
      setErrorMessage("Enter a GitHub owner or an owner/repository pair.");
      return;
    }
    if (parsed.kind === "owner") {
      void loadUniverse(parsed.owner);
    } else {
      void loadKingdom(parsed.owner, parsed.repository, season, worldThemeChoice);
    }
  }, [loadKingdom, loadUniverse, repositoryInput, season, worldThemeChoice]);

  const enterRepository = useCallback(
    (repository: UniverseRepository | RepositoryPortal) => {
      const universeRepository = "season" in repository ? repository : null;
      const repositorySeason = universeRepository?.season ?? season;
      setSeason(repositorySeason);
      const travelOptions =
        mode === "universe" && !reducedMotion && universeRepository
          ? {
              repositoryId: universeRepository.id,
              label: `${repository.owner}/${repository.repository}`,
            }
          : undefined;
      void loadKingdom(
        repository.owner,
        repository.repository,
        repositorySeason,
        worldThemeChoice,
        undefined,
        "push",
        travelOptions,
      );
    },
    [loadKingdom, mode, reducedMotion, season, worldThemeChoice],
  );

  const isDemo = mode === "landing";

  const changeSeason = useCallback(
    (nextSeason: KingdomSeason) => {
      setSeason(nextSeason);
      if (mode === "landing") {
        setWorld(createDemoKingdom(nextSeason, worldThemeChoice ?? "enchanted-forest"));
      } else if (mode === "kingdom") {
        void loadKingdom(
          world.source.owner,
          world.source.repository,
          nextSeason,
          world.worldTheme,
          world.source.commitSha,
          "push",
        );
      }
    },
    [
      loadKingdom,
      mode,
      world.worldTheme,
      world.source.commitSha,
      world.source.owner,
      world.source.repository,
      worldThemeChoice,
    ],
  );

  const changeWorldTheme = useCallback(
    (nextWorldTheme: KingdomWorldTheme | null) => {
      setWorldThemeChoice(nextWorldTheme);
      if (mode === "landing") {
        setWorld(createDemoKingdom(season, nextWorldTheme ?? "enchanted-forest"));
      } else if (mode === "kingdom") {
        void loadKingdom(
          world.source.owner,
          world.source.repository,
          season,
          nextWorldTheme,
          world.source.commitSha,
          "push",
        );
      }
    },
    [
      loadKingdom,
      mode,
      season,
      world.source.commitSha,
      world.source.owner,
      world.source.repository,
    ],
  );

  const enterSelection = useCallback(() => {
    if (selection?.kind === "repository") enterRepository(selection.repository);
    if (selection?.kind === "portal") enterRepository(selection.portal);
  }, [enterRepository, selection]);

  const activeUniverse = universe ?? DEMO_UNIVERSE;
  const sceneKey =
    mode === "universe" ? `universe:${activeUniverse.owner}` : `kingdom:${world.buildKey}`;
  const dpr = useMemo<[number, number]>(
    () => (quality === "high" ? [1, 1.75] : [0.85, 1.25]),
    [quality],
  );
  const rootClassName = className ? `${styles.experience} ${className}` : styles.experience;

  return (
    <main
      className={rootClassName}
      data-mode={mode}
      data-travel-phase={travel?.phase ?? "idle"}
      aria-busy={travel !== null}
    >
      {webglSupported && contextFailureCount < 2 ? (
        <SceneBoundary onError={() => setContextFailureCount(2)}>
          <div className={styles.canvasWrap} aria-hidden="true">
            <Canvas
              dpr={dpr}
              frameloop={reducedMotion ? "demand" : "always"}
              shadows={quality === "high"}
              performance={{ min: 0.55, max: 1, debounce: 220 }}
              gl={{
                antialias: quality === "high",
                alpha: false,
                powerPreference: "high-performance",
              }}
              onPointerMissed={() => setSelection(null)}
              onCreated={({ gl }) => {
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.1;
                gl.domElement.addEventListener("webglcontextlost", (event) => {
                  event.preventDefault();
                  setContextFailureCount((count) => count + 1);
                });
                gl.domElement.addEventListener("webglcontextrestored", () => {
                  setContextFailureCount(0);
                });
              }}
            >
              {mode === "universe" ? (
                <RepositoryUniverseScene
                  key={sceneKey}
                  universe={activeUniverse}
                  selection={selection}
                  onSelect={setSelection}
                  onHover={setHovered}
                  onEnterRepository={enterRepository}
                  travelingRepositoryId={travel?.repositoryId ?? null}
                  resetToken={resetToken}
                  reducedMotion={reducedMotion}
                  quality={quality}
                />
              ) : (
                <KingdomScene
                  key={sceneKey}
                  world={world}
                  season={season}
                  selection={selection}
                  onSelect={setSelection}
                  onHover={setHovered}
                  onEnterPortal={enterRepository}
                  resetToken={resetToken}
                  reducedMotion={reducedMotion}
                  quality={quality}
                />
              )}
            </Canvas>
          </div>
        </SceneBoundary>
      ) : webglSupported === false || contextFailureCount >= 2 ? (
        <div className={styles.webglFallback} role="status">
          <h2>The kingdom needs WebGL.</h2>
          <p>
            This browser could not open the 3D gateway. Hardware acceleration or another modern
            browser should restore the world; repository links and source information remain
            available through GitHub.
          </p>
        </div>
      ) : null}
      <div className={styles.vignette} aria-hidden="true" />
      {travel ? (
        <div
          className={styles.worldTransition}
          data-direction={travel.direction}
          data-phase={travel.phase}
          aria-hidden="true"
        >
          <div className={styles.worldTransitionPortal}>
            <i />
            <i />
            <span>{travel.direction === "enter" ? "Entering world" : "Returning to atlas"}</span>
            <strong>{travel.label}</strong>
          </div>
        </div>
      ) : null}
      <KingdomHud
        mode={mode}
        world={world}
        universe={mode === "universe" ? activeUniverse : universe}
        selection={selection}
        hovered={hovered}
        repositoryInput={repositoryInput}
        loadingMessage={loadingMessage}
        errorMessage={errorMessage}
        isDemo={isDemo}
        soundEnabled={soundEnabled}
        season={season}
        worldTheme={worldThemeChoice}
        onRepositoryInput={setRepositoryInput}
        onSubmit={submitRepository}
        onSelect={setSelection}
        onEnterSelection={enterSelection}
        onResetCamera={() => {
          setSelection(null);
          setResetToken((token) => token + 1);
        }}
        onShowLanding={() => {
          requestRef.current?.abort();
          setTravel(null);
          setMode("landing");
          setWorld(createDemoKingdom(season, worldThemeChoice ?? "enchanted-forest"));
          setUniverse(null);
          setSelection(null);
          setErrorMessage(null);
          navigate("/");
        }}
        onShowUniverse={() => void loadUniverse(world.source.owner, "push", !reducedMotion)}
        onToggleSound={() => setSoundEnabled((enabled) => !enabled)}
        onSeasonChange={changeSeason}
        onWorldThemeChange={changeWorldTheme}
      />
    </main>
  );
}
