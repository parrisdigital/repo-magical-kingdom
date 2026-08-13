import type { RepositorySnapshot, SourceFile } from "@/lib/github";

import { classifyFile, omissionReason, type ClassifiedFile } from "./classify";
import { KingdomError } from "./errors";
import { stableDigest, stableFraction, stableHash, stableId } from "./hash";
import { kingdomWorldSchema } from "./schemas";
import {
  DEFAULT_KINGDOM_SEASON,
  FILE_CATEGORIES,
  type FileCategory,
  type KingdomEntity,
  type KingdomSeason,
  type KingdomWorld,
  type OmissionSummary,
  type Province,
  type RealmThemeIdentity,
  type Vec3,
} from "./types";
import { deriveDefaultKingdomWorldTheme, type KingdomWorldTheme } from "./world-theme";

const COMPILER_VERSION = "1.0.0" as const;
const STYLE_VERSION = "repo-world-themes/organic-realm-v3";
const MAX_NAMED_PROVINCES = 15;
const MAX_DIRECT_ENTITIES = 900;
const LARGE_WORLD_DIRECT_ENTITIES = 720;
const ENTRY_POSITION: Vec3 = { x: 0, y: 0, z: 24 };
const PROVINCE_CLEARANCE = 12;
const HAMLET_CLEARANCE = 0.45;
const COURTYARD_RADIUS = 3.8;

const LEGACY_THEME_BY_SEASON: Readonly<Record<KingdomSeason, RealmThemeIdentity>> = {
  spring: {
    id: "four-seasons",
    label: "Spring Kingdom",
    description: "The whole repository world is alive with spring growth and rain-washed color.",
  },
  summer: {
    id: "four-seasons",
    label: "Summer Kingdom",
    description: "The whole repository world is sunlit, verdant, and in full summer bloom.",
  },
  autumn: {
    id: "four-seasons",
    label: "Autumn Kingdom",
    description: "The whole repository world carries warm autumn foliage and harvest color.",
  },
  winter: {
    id: "four-seasons",
    label: "Winter Kingdom",
    description: "The whole repository world is frostbound beneath a quiet winter atmosphere.",
  },
};

export type CompileKingdomOptions = Readonly<{
  season?: KingdomSeason;
  worldTheme?: KingdomWorldTheme;
}>;

type EntitySpec = Omit<KingdomEntity, "position"> & Readonly<{ provinceKey: string }>;

type ProvinceStat = Readonly<{
  key: string;
  files: ReadonlyArray<ClassifiedFile>;
  representedFiles: number;
  representedBytes: number;
  dominantCategory: FileCategory;
}>;

type ProvinceLayout = Readonly<{
  positions: ReadonlyMap<string, Vec3>;
  routeOrigins: ReadonlyMap<string, Vec3>;
}>;

type ProvinceCompilation = Readonly<{
  provinces: ReadonlyArray<Province>;
  routeOriginsByProvinceId: ReadonlyMap<string, Vec3>;
}>;

type PlacedEntity = Readonly<{
  x: number;
  z: number;
  footprint: number;
}>;

function encodedPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function sourceUrl(snapshot: RepositorySnapshot, path?: string): string {
  const base = `${snapshot.canonicalUrl}/${path ? "blob" : "tree"}/${snapshot.commitSha}`;
  return path ? `${base}/${encodedPath(path)}` : base;
}

function directoryUrl(snapshot: RepositorySnapshot, key: string): string {
  if (key === "__root__" || key === "__frontier__") return sourceUrl(snapshot);
  return `${snapshot.canonicalUrl}/tree/${snapshot.commitSha}/${encodedPath(key)}`;
}

function humanize(value: string): string {
  return (
    value
      .replace(/^[@._-]+/, "")
      .replace(/[-_.]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase()) || "Untitled"
  );
}

function countByCategory(
  files: ReadonlyArray<ClassifiedFile>,
): Map<FileCategory, Readonly<{ files: number; bytes: number }>> {
  const totals = new Map<FileCategory, { files: number; bytes: number }>();
  for (const category of FILE_CATEGORIES) totals.set(category, { files: 0, bytes: 0 });
  for (const file of files) {
    const current = totals.get(file.category)!;
    current.files += 1;
    current.bytes += file.size;
  }
  return totals;
}

function dominantCategory(files: ReadonlyArray<ClassifiedFile>): FileCategory {
  const totals = countByCategory(files);
  return (
    [...totals.entries()].sort(
      ([categoryA, a], [categoryB, b]) =>
        b.bytes - a.bytes || b.files - a.files || categoryA.localeCompare(categoryB),
    )[0]?.[0] ?? "other"
  );
}

function dominantLanguage(files: ReadonlyArray<ClassifiedFile>): string {
  const totals = new Map<string, { files: number; bytes: number }>();
  for (const file of files) {
    const current = totals.get(file.language) ?? { files: 0, bytes: 0 };
    current.files += 1;
    current.bytes += file.size;
    totals.set(file.language, current);
  }
  return (
    [...totals.entries()].sort(
      ([nameA, a], [nameB, b]) =>
        b.bytes - a.bytes || b.files - a.files || nameA.localeCompare(nameB),
    )[0]?.[0] ?? "Other"
  );
}

function chooseProvinceKeys(files: ReadonlyArray<ClassifiedFile>): ReadonlySet<string> {
  const totals = new Map<string, { files: number; bytes: number }>();
  for (const file of files) {
    if (file.rawProvince === "__root__") continue;
    const current = totals.get(file.rawProvince) ?? { files: 0, bytes: 0 };
    current.files += 1;
    current.bytes += file.size;
    totals.set(file.rawProvince, current);
  }

  const selected = [...totals.entries()]
    .sort(
      ([keyA, a], [keyB, b]) => b.bytes - a.bytes || b.files - a.files || keyA.localeCompare(keyB),
    )
    .slice(0, MAX_NAMED_PROVINCES)
    .map(([key]) => key);
  return new Set(["__root__", ...selected]);
}

function groupedProvinceKey(file: ClassifiedFile, selected: ReadonlySet<string>): string {
  return selected.has(file.rawProvince) ? file.rawProvince : "__frontier__";
}

function importance(file: ClassifiedFile): number {
  const name = file.path.split("/").at(-1)?.toLowerCase() ?? "";
  const depth = file.path.split("/").length;
  let score = Math.log2(file.size + 2) - depth * 0.5;
  if (file.rawProvince === "__root__") score += 14;
  if (
    /^(?:readme|package\.json|pyproject\.toml|cargo\.toml|go\.mod|main\.|index\.|app\.)/.test(name)
  )
    score += 10;
  if (file.category === "docs" || file.category === "config") score += 3;
  return score + stableFraction(file.path);
}

function createEntitySpecs(
  snapshot: RepositorySnapshot,
  files: ReadonlyArray<ClassifiedFile>,
  selectedProvinces: ReadonlySet<string>,
): ReadonlyArray<EntitySpec> {
  const directLimit =
    files.length <= MAX_DIRECT_ENTITIES ? files.length : LARGE_WORLD_DIRECT_ENTITIES;
  const sorted = [...files].sort(
    (a, b) => importance(b) - importance(a) || a.path.localeCompare(b.path),
  );
  const direct = sorted.slice(0, directLimit);
  const remaining = sorted.slice(directLimit);
  const specs: EntitySpec[] = direct.map((file) => {
    const provinceKey = groupedProvinceKey(file, selectedProvinces);
    const width = 0.85 + stableFraction(`${file.path}:width`) * 0.7;
    const depth = 0.85 + stableFraction(`${file.path}:depth`) * 0.7;
    const height = Math.min(11, 1.4 + Math.log2(file.size + 1) * 0.48);
    return {
      id: stableId("file", `${snapshot.repositoryId}:${file.path}`),
      provinceId: stableId("province", `${snapshot.repositoryId}:${provinceKey}`),
      provinceKey,
      label: file.path.split("/").at(-1) ?? file.path,
      path: file.path,
      category: file.category,
      language: file.language,
      size: file.size,
      representedFiles: 1,
      aggregate: false,
      scale: { x: width, y: height, z: depth },
      sourceUrl: sourceUrl(snapshot, file.path),
    };
  });

  const aggregates = new Map<
    string,
    { provinceKey: string; category: FileCategory; files: ClassifiedFile[] }
  >();
  for (const file of remaining) {
    const provinceKey = groupedProvinceKey(file, selectedProvinces);
    const key = `${provinceKey}\u0000${file.category}`;
    const group = aggregates.get(key) ?? { provinceKey, category: file.category, files: [] };
    group.files.push(file);
    aggregates.set(key, group);
  }

  for (const [key, group] of [...aggregates.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const size = group.files.reduce((total, file) => total + file.size, 0);
    const language = dominantLanguage(group.files);
    const height = Math.min(13, 2.6 + Math.log2(size + 1) * 0.5);
    specs.push({
      id: stableId("aggregate", `${snapshot.repositoryId}:${key}`),
      provinceId: stableId("province", `${snapshot.repositoryId}:${group.provinceKey}`),
      provinceKey: group.provinceKey,
      label: `${group.files.length.toLocaleString("en-US")} ${group.category} files`,
      path: group.provinceKey === "__root__" ? "/" : group.provinceKey,
      category: group.category,
      language,
      size,
      representedFiles: group.files.length,
      aggregate: true,
      scale: { x: 2.6, y: height, z: 2.6 },
      sourceUrl: directoryUrl(snapshot, group.provinceKey),
    });
  }

  return specs;
}

function createProvinceStats(
  files: ReadonlyArray<ClassifiedFile>,
  selectedProvinces: ReadonlySet<string>,
): ReadonlyArray<ProvinceStat> {
  const groups = new Map<string, ClassifiedFile[]>();
  groups.set("__root__", []);
  for (const file of files) {
    const key = groupedProvinceKey(file, selectedProvinces);
    const group = groups.get(key) ?? [];
    group.push(file);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => ({
      key,
      files: group,
      representedFiles: group.length,
      representedBytes: group.reduce((total, file) => total + file.size, 0),
      dominantCategory: dominantCategory(group),
    }))
    .sort((a, b) =>
      a.key === "__root__" ? -1 : b.key === "__root__" ? 1 : a.key.localeCompare(b.key),
    );
}

function provinceDescription(key: string, category: FileCategory, files: number): string {
  if (key === "__root__")
    return "The Crown Nexus represents repository-root files and anchors every province.";
  if (key === "__frontier__")
    return `${files.toLocaleString("en-US")} files from smaller directories gather in the Outer Marches.`;
  return `${humanize(key)} is a ${category}-led province representing ${files.toLocaleString("en-US")} files.`;
}

function provinceRadius(key: string, entityCount: number): number {
  const settlementRadius = Math.ceil(Math.sqrt(Math.max(1, entityCount))) * 1.9 + 5;
  return Math.max(key === "__root__" ? 10 : 8, settlementRadius);
}

function provinceAnchorsOverlap(
  candidate: Vec3,
  radius: number,
  placed: ReadonlyArray<Readonly<{ position: Vec3; radius: number }>>,
): boolean {
  return placed.some(
    (other) =>
      Math.hypot(candidate.x - other.position.x, candidate.z - other.position.z) <
      radius + other.radius + PROVINCE_CLEARANCE,
  );
}

/**
 * Author a single valley rather than arranging repository folders as a chart.
 * The entry settlement sits in the foreground. Folder settlements advance
 * toward the mountain edge along two or three independently meandering trails.
 */
function createProvinceLayout(
  snapshot: RepositorySnapshot,
  stats: ReadonlyArray<ProvinceStat>,
  radiusByKey: ReadonlyMap<string, number>,
): ProvinceLayout {
  const positions = new Map<string, Vec3>([["__root__", ENTRY_POSITION]]);
  const routeOrigins = new Map<string, Vec3>();
  const rootRadius = radiusByKey.get("__root__") ?? 10;
  const placed: Array<Readonly<{ position: Vec3; radius: number }>> = [
    { position: ENTRY_POSITION, radius: rootRadius },
  ];
  const ordered = stats
    .filter((stat) => stat.key !== "__root__")
    .sort(
      (a, b) =>
        stableHash(`${snapshot.repositoryId}:${a.key}:valley-order`) -
          stableHash(`${snapshot.repositoryId}:${b.key}:valley-order`) ||
        a.key.localeCompare(b.key),
    );

  const corridorCount = ordered.length >= 9 ? 3 : ordered.length >= 2 ? 2 : ordered.length;
  if (corridorCount === 0) return { positions, routeOrigins };

  const largestRadius = Math.max(8, ...ordered.map((stat) => radiusByKey.get(stat.key) ?? 8));
  const corridorSpread = Math.max(34, largestRadius * 1.35 + 24);
  const corridorOffsets =
    corridorCount === 1
      ? [0]
      : corridorCount === 2
        ? [-corridorSpread * 0.55, corridorSpread * 0.55]
        : [-corridorSpread, 0, corridorSpread];
  const corridors = Array.from({ length: corridorCount }, () => [] as ProvinceStat[]);
  ordered.forEach((stat, index) => corridors[index % corridorCount]!.push(stat));

  corridors.forEach((corridor, corridorIndex) => {
    const phase =
      stableFraction(`${snapshot.repositoryId}:valley-corridor:${corridorIndex}:phase`) *
      Math.PI *
      2;
    const amplitude = Math.min(12, corridorSpread * 0.2);
    let previousKey = "__root__";
    let previousPosition = ENTRY_POSITION;
    let previousRadius = rootRadius;

    corridor.forEach((stat, depthIndex) => {
      const radius = radiusByKey.get(stat.key) ?? 8;
      const breathingRoom =
        17 + stableFraction(`${snapshot.repositoryId}:${stat.key}:valley-gap`) * 15;
      const targetZ = previousPosition.z - previousRadius - radius - breathingRoom;
      const meander = Math.sin(phase + depthIndex * 1.13) * amplitude;
      const irregularity =
        (stableFraction(`${snapshot.repositoryId}:${stat.key}:valley-x`) - 0.5) * 7;
      let candidate: Vec3 = {
        x: (corridorOffsets[corridorIndex] ?? 0) + meander + irregularity,
        y: 0,
        z: targetZ,
      };
      let collisionStep = 0;

      while (provinceAnchorsOverlap(candidate, radius, placed)) {
        collisionStep += 1;
        candidate = {
          x:
            candidate.x +
            Math.sin(phase + depthIndex * 0.9 + collisionStep * 1.7) * Math.min(2.5, amplitude),
          y: 0,
          z:
            candidate.z -
            7 -
            stableFraction(`${snapshot.repositoryId}:${stat.key}:collision:${collisionStep}`) * 4,
        };
      }

      positions.set(stat.key, candidate);
      routeOrigins.set(stat.key, positions.get(previousKey) ?? ENTRY_POSITION);
      placed.push({ position: candidate, radius });
      previousKey = stat.key;
      previousPosition = candidate;
      previousRadius = radius;
    });
  });

  return { positions, routeOrigins };
}

function createProvinces(
  snapshot: RepositorySnapshot,
  stats: ReadonlyArray<ProvinceStat>,
  specs: ReadonlyArray<EntitySpec>,
  season: KingdomSeason,
): ProvinceCompilation {
  const entityCounts = new Map<string, number>();
  for (const spec of specs)
    entityCounts.set(spec.provinceKey, (entityCounts.get(spec.provinceKey) ?? 0) + 1);

  const radiusByKey = new Map(
    stats.map((stat) => [stat.key, provinceRadius(stat.key, entityCounts.get(stat.key) ?? 0)]),
  );
  const layout = createProvinceLayout(snapshot, stats, radiusByKey);
  const routeOriginsByProvinceId = new Map<string, Vec3>();
  const provinces = stats.map((stat) => {
    const id = stableId("province", `${snapshot.repositoryId}:${stat.key}`);
    const routeOrigin = layout.routeOrigins.get(stat.key);
    if (routeOrigin) routeOriginsByProvinceId.set(id, routeOrigin);
    return {
      id,
      label:
        stat.key === "__root__"
          ? "Crown Nexus"
          : stat.key === "__frontier__"
            ? "Outer Marches"
            : humanize(stat.key),
      // `biome` and province-level `season` remain in the v1 payload for older
      // renderers. Both mirror the one world-level season; provinces no longer
      // receive independently selected biome themes.
      biome: season,
      season,
      position: layout.positions.get(stat.key) ?? ENTRY_POSITION,
      radius: radiusByKey.get(stat.key) ?? 8,
      representedFiles: stat.representedFiles,
      representedBytes: stat.representedBytes,
      dominantCategory: stat.dominantCategory,
      description: provinceDescription(stat.key, stat.dominantCategory, stat.representedFiles),
      sourceUrl: directoryUrl(snapshot, stat.key),
      role:
        stat.key === "__root__"
          ? ("nexus" as const)
          : stat.key === "__frontier__"
            ? ("frontier" as const)
            : ("province" as const),
    };
  });

  return { provinces, routeOriginsByProvinceId };
}

function entityFootprint(spec: EntitySpec): number {
  return Math.max(spec.scale.x, spec.scale.z) / 2;
}

function hamletCandidates(province: Province): ReadonlyArray<Readonly<{ x: number; z: number }>> {
  const spacingX = 3.05;
  const spacingZ = 2.85;
  const limit = Math.ceil(province.radius / Math.min(spacingX, spacingZ)) + 1;
  const phase = stableFraction(`${province.id}:street-phase`) * Math.PI * 2;
  const candidates: Array<Readonly<{ x: number; z: number; score: number }>> = [];

  for (let row = -limit; row <= limit; row += 1) {
    for (let column = -limit; column <= limit; column += 1) {
      if (row === 0 && column === 0) continue;
      const x =
        column * spacingX +
        Math.sin(row * 0.72 + phase) * 0.42 +
        (stableFraction(`${province.id}:street:${column}:${row}:x`) - 0.5) * 0.16;
      const z =
        row * spacingZ +
        Math.sin(column * 0.66 + phase) * 0.34 +
        (stableFraction(`${province.id}:street:${column}:${row}:z`) - 0.5) * 0.16;
      const distance = Math.hypot(x, z);
      if (distance < COURTYARD_RADIUS || distance > province.radius - 1.9) continue;

      const vacancy = stableFraction(`${province.id}:street:${column}:${row}:vacancy`);
      const negativeSpacePenalty = vacancy < 0.14 ? province.radius * 0.55 : 0;
      const variation =
        stableFraction(`${province.id}:street:${column}:${row}:order`) *
        Math.min(7, province.radius * 0.18);
      candidates.push({ x, z, score: distance + variation + negativeSpacePenalty });
    }
  }

  return candidates
    .sort((a, b) => a.score - b.score || a.z - b.z || a.x - b.x)
    .map(({ x, z }) => ({ x, z }));
}

function overlapsPlacedEntity(
  candidate: Readonly<{ x: number; z: number }>,
  footprint: number,
  placed: ReadonlyArray<PlacedEntity>,
): boolean {
  return placed.some(
    (other) =>
      Math.hypot(candidate.x - other.x, candidate.z - other.z) <
      footprint + other.footprint + HAMLET_CLEARANCE,
  );
}

function placeEntities(
  specs: ReadonlyArray<EntitySpec>,
  provinces: ReadonlyArray<Province>,
): ReadonlyArray<KingdomEntity> {
  const provinceById = new Map(provinces.map((province) => [province.id, province]));
  const groups = new Map<string, EntitySpec[]>();
  for (const spec of specs) {
    const group = groups.get(spec.provinceId) ?? [];
    group.push(spec);
    groups.set(spec.provinceId, group);
  }

  const entities: KingdomEntity[] = [];
  for (const [provinceId, group] of groups) {
    const province = provinceById.get(provinceId);
    if (!province) continue;
    group.sort(
      (a, b) =>
        b.scale.y - a.scale.y ||
        b.size - a.size ||
        Number(b.aggregate) - Number(a.aggregate) ||
        a.id.localeCompare(b.id),
    );
    const candidates = hamletCandidates(province);
    const placed: PlacedEntity[] = [];
    let candidateCursor = 0;
    const streetBearing = (stableFraction(`${province.id}:street-bearing`) - 0.5) * 0.58;
    const bearingCosine = Math.cos(streetBearing);
    const bearingSine = Math.sin(streetBearing);

    group.forEach((spec, index) => {
      const footprint = entityFootprint(spec);
      let localPosition: Readonly<{ x: number; z: number }> | undefined;

      if (index === 0) {
        localPosition = { x: 0, z: 0 };
      } else {
        while (candidateCursor < candidates.length) {
          const candidate = candidates[candidateCursor]!;
          candidateCursor += 1;
          if (Math.hypot(candidate.x, candidate.z) + footprint > province.radius - 0.5) continue;
          if (overlapsPlacedEntity(candidate, footprint, placed)) continue;
          localPosition = candidate;
          break;
        }
      }

      if (!localPosition) {
        throw new KingdomError(
          "WORLD_INVALID",
          "A repository settlement exceeded its valley plot.",
          {
            retryable: false,
            details: { provinceId, entities: group.length, radius: province.radius },
          },
        );
      }

      placed.push({ ...localPosition, footprint });
      const rotatedX = localPosition.x * bearingCosine - localPosition.z * bearingSine;
      const rotatedZ = localPosition.x * bearingSine + localPosition.z * bearingCosine;
      entities.push({
        id: spec.id,
        provinceId: spec.provinceId,
        label: spec.label,
        path: spec.path,
        category: spec.category,
        language: spec.language,
        size: spec.size,
        representedFiles: spec.representedFiles,
        aggregate: spec.aggregate,
        scale: spec.scale,
        sourceUrl: spec.sourceUrl,
        position: {
          x: province.position.x + rotatedX,
          y: spec.scale.y / 2,
          z: province.position.z + rotatedZ,
        },
      });
    });
  }
  return entities.sort((a, b) => a.id.localeCompare(b.id));
}

function summarizeOmissions(files: ReadonlyArray<SourceFile>): ReadonlyArray<OmissionSummary> {
  const order: ReadonlyArray<OmissionSummary["reason"]> = [
    "generated",
    "vendored",
    "lockfile",
    "minified",
    "source-map",
  ];
  const totals = new Map<OmissionSummary["reason"], { files: number; bytes: number }>();
  for (const file of files) {
    const reason = omissionReason(file.path);
    if (!reason) continue;
    const current = totals.get(reason) ?? { files: 0, bytes: 0 };
    current.files += 1;
    current.bytes += file.size;
    totals.set(reason, current);
  }
  return order.flatMap((reason) => {
    const total = totals.get(reason);
    return total ? [{ reason, ...total }] : [];
  });
}

export function compileKingdom(
  snapshot: RepositorySnapshot,
  options: CompileKingdomOptions = {},
): KingdomWorld {
  const season = options.season ?? DEFAULT_KINGDOM_SEASON;
  const seed = `${snapshot.owner}/${snapshot.repository}`;
  const omissions = summarizeOmissions(snapshot.files);
  const eligibleFiles = snapshot.files
    .filter((file) => omissionReason(file.path) === null)
    .map(classifyFile);
  const categoryTotals = countByCategory(eligibleFiles);
  const categories = [...categoryTotals.entries()].map(([category, total]) => ({
    category,
    ...total,
  }));
  const languageTotals = new Map<string, { files: number; bytes: number }>();
  for (const file of eligibleFiles) {
    const current = languageTotals.get(file.language) ?? { files: 0, bytes: 0 };
    current.files += 1;
    current.bytes += file.size;
    languageTotals.set(file.language, current);
  }
  const languages = [...languageTotals.entries()]
    .map(([name, total]) => ({ name, ...total }))
    .sort((a, b) => b.bytes - a.bytes || b.files - a.files || a.name.localeCompare(b.name));
  const worldTheme =
    options.worldTheme ??
    deriveDefaultKingdomWorldTheme({
      repositoryId: snapshot.repositoryId,
      categories,
      languages,
    });
  const selectedProvinces = chooseProvinceKeys(eligibleFiles);
  const specs = createEntitySpecs(snapshot, eligibleFiles, selectedProvinces);
  const provinceStats = createProvinceStats(eligibleFiles, selectedProvinces);
  const legacyTheme = LEGACY_THEME_BY_SEASON[season];
  const provinceCompilation = createProvinces(snapshot, provinceStats, specs, season);
  const provinces = provinceCompilation.provinces;
  const entities = placeEntities(specs, provinces);
  const nexus = provinces.find((province) => province.role === "nexus")!;
  const routes = provinces
    .filter((province) => province.role !== "nexus")
    .map((province) => ({
      id: stableId("route", `${snapshot.repositoryId}:${province.id}`),
      from: provinceCompilation.routeOriginsByProvinceId.get(province.id) ?? nexus.position,
      to: province.position,
      kind: "root-path" as const,
      provinceId: province.id,
    }));

  const terrainRadius = Math.max(
    38,
    ...provinces.map(
      (province) => Math.hypot(province.position.x, province.position.z) + province.radius + 14,
    ),
  );
  const orderedRelatedRepositories = [...snapshot.relatedRepositories].sort(
    (a, b) => a.id - b.id || a.repository.localeCompare(b.repository),
  );
  const foregroundEdge = Math.max(
    ENTRY_POSITION.z + (nexus.radius ?? 10),
    ...provinces.map((province) => province.position.z + province.radius),
  );
  const portals = orderedRelatedRepositories.map((repository, index, all) => {
    const centeredIndex = index - (all.length - 1) / 2;
    const trailPhase = stableFraction(`${snapshot.repositoryId}:portal-trail`) * Math.PI * 2;
    return {
      id: stableId("portal", String(repository.id)),
      owner: repository.owner,
      repository: repository.repository,
      description: repository.description,
      language: repository.language,
      stars: repository.stars,
      forks: repository.forks,
      updatedAt: repository.updatedAt,
      canonicalUrl: repository.canonicalUrl,
      defaultBranch: repository.defaultBranch,
      position: {
        x:
          centeredIndex * 13.5 +
          Math.sin(trailPhase + index * 1.31) * 2.7 +
          (stableFraction(`${repository.id}:portal-x`) - 0.5) * 2,
        y: 0,
        z:
          foregroundEdge +
          18 +
          Math.sin(trailPhase + index * 0.83) * 4 +
          stableFraction(`${repository.id}:portal-z`) * 2.5,
      },
    };
  });
  const boundsRadius = Math.max(
    terrainRadius,
    ...portals.map((portal) => Math.hypot(portal.position.x, portal.position.z) + 10),
  );

  const representedFiles = entities.reduce((total, entity) => total + entity.representedFiles, 0);
  const omittedFiles = omissions.reduce((total, omission) => total + omission.files, 0);
  const maxHeight = Math.max(14, ...entities.map((entity) => entity.scale.y));
  const buildKey = stableDigest(
    [
      "github",
      snapshot.repositoryId,
      snapshot.commitSha,
      snapshot.owner,
      snapshot.repository,
      snapshot.description ?? "",
      snapshot.defaultBranch,
      snapshot.canonicalUrl,
      snapshot.license ?? "",
      snapshot.committedAt,
      snapshot.commitTreeSha,
      snapshot.treeTruncated,
      snapshot.treeRecovered,
      stableDigest(
        [...snapshot.files]
          .sort((a, b) => a.path.localeCompare(b.path) || a.sha.localeCompare(b.sha))
          .map((file) => `${file.path}\u0000${file.size}\u0000${file.sha}`)
          .join("\u0001"),
      ),
      COMPILER_VERSION,
      STYLE_VERSION,
      season,
      worldTheme,
      seed,
      orderedRelatedRepositories
        .map((repository) =>
          [
            repository.id,
            repository.owner,
            repository.repository,
            repository.description ?? "",
            repository.language ?? "",
            repository.stars,
            repository.forks,
            repository.updatedAt,
            repository.canonicalUrl,
            repository.defaultBranch,
          ].join("/"),
        )
        .sort()
        .join("|"),
      snapshot.warnings
        .map((warning) => `${warning.code}:${warning.message}`)
        .sort()
        .join("|"),
    ].join(":"),
  );
  const candidate: KingdomWorld = {
    schema: "repo-kingdom/v1",
    compilerVersion: COMPILER_VERSION,
    buildKey,
    seed,
    source: {
      provider: "github",
      owner: snapshot.owner,
      repository: snapshot.repository,
      repositoryId: snapshot.repositoryId,
      commitSha: snapshot.commitSha,
      defaultBranch: snapshot.defaultBranch,
      visibility: "public",
      canonicalUrl: snapshot.canonicalUrl,
      license: snapshot.license,
      revisionUrl: `${snapshot.canonicalUrl}/tree/${snapshot.commitSha}`,
    },
    title: `${humanize(snapshot.repository)} Kingdom`,
    description: snapshot.description,
    generatedAt: snapshot.committedAt,
    season,
    worldTheme,
    theme: {
      id: legacyTheme.id,
      label: legacyTheme.label,
      description: legacyTheme.description,
    },
    bounds: {
      radius: boundsRadius,
      height: maxHeight + 20,
    },
    provinces,
    entities,
    routes,
    portals,
    coverage: {
      discoveredFiles: snapshot.files.length,
      eligibleFiles: eligibleFiles.length,
      representedFiles,
      directEntities: entities.filter((entity) => !entity.aggregate).length,
      aggregateEntities: entities.filter((entity) => entity.aggregate).length,
      omittedFiles,
      treeTruncated: snapshot.treeTruncated,
      treeRecovered: snapshot.treeRecovered,
      sourceComplete: !snapshot.treeTruncated || snapshot.treeRecovered,
      omissions,
    },
    statistics: {
      files: eligibleFiles.length,
      bytes: eligibleFiles.reduce((total, file) => total + file.size, 0),
      provinces: provinces.length,
      languages,
      categories,
    },
    warnings: [
      ...snapshot.warnings,
      ...(omittedFiles > 0
        ? [
            {
              code: "FILES_OMITTED",
              message: `${omittedFiles.toLocaleString("en-US")} generated, vendored, lock, minified, or source-map files were intentionally omitted.`,
            },
          ]
        : []),
      ...(eligibleFiles.length === 0
        ? [
            {
              code: "EMPTY_KINGDOM",
              message:
                "No eligible files were found; the Crown Nexus remains as an empty-world landmark.",
            },
          ]
        : []),
    ],
  };

  if (representedFiles !== eligibleFiles.length) {
    throw new KingdomError(
      "WORLD_INVALID",
      "The compiler did not account for every eligible file.",
      {
        retryable: false,
        details: { eligibleFiles: eligibleFiles.length, representedFiles },
      },
    );
  }

  const parsed = kingdomWorldSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new KingdomError("WORLD_INVALID", "The generated world package failed validation.", {
      retryable: false,
      cause: parsed.error,
      details: { issue: parsed.error.issues[0]?.message ?? "Unknown validation issue" },
    });
  }

  return parsed.data;
}
