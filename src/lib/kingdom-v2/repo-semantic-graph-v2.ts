import { stableDigest, stableId } from "../kingdom/hash";
import type { CoverageSummary, FileCategory, KingdomEntity, KingdomWorld } from "../kingdom/types";

export const REPO_SEMANTIC_GRAPH_V2_SCHEMA = "repo-semantic-graph/v2" as const;
/**
 * Bump this revision whenever the graph compiler changes structural identity
 * semantics. It is part of the cache key so previously cached downstream
 * artifacts cannot be reused across incompatible graph compilers.
 */
export const REPO_SEMANTIC_GRAPH_V2_COMPILER_REVISION = 2 as const;

export type RepoSemanticMagnitude = Readonly<{
  bytes: number;
  representedFiles: number;
  normalized: number;
  /** Monotonic visual height multiplier. Horizontal footprint is resolved later. */
  heightScale: number;
}>;

export type RepoSemanticRepositoryNode = Readonly<{
  kind: "repository";
  id: string;
  label: string;
  path: "";
  sourceUrl: string;
  magnitude: RepoSemanticMagnitude;
}>;

export type RepoSemanticRegionNode = Readonly<{
  kind: "region";
  id: string;
  provinceId: string;
  label: string;
  path: string;
  sourceUrl: string;
  category: FileCategory;
  role: "nexus" | "province" | "frontier";
  magnitude: RepoSemanticMagnitude;
}>;

export type RepoSemanticEntityNode = Readonly<{
  kind: "entity";
  id: string;
  entityId: string;
  provinceId: string;
  label: string;
  path: string;
  sourceUrl: string;
  category: FileCategory;
  language: string;
  aggregate: boolean;
  magnitude: RepoSemanticMagnitude;
}>;

export type RepoSemanticNode =
  RepoSemanticRepositoryNode | RepoSemanticRegionNode | RepoSemanticEntityNode;

export type RepoSemanticEdgeKind = "contains" | "route" | "dependency";

export type RepoSemanticEdge = Readonly<{
  id: string;
  kind: RepoSemanticEdgeKind;
  from: string;
  to: string;
  evidence: Readonly<{
    source: "compiler" | "world-plan" | "manifest";
    reference: string;
  }>;
}>;

export type RepoDependencyHint = Readonly<{
  fromPath: string;
  toPath: string;
  reference: string;
}>;

export type RepoSemanticGraphWarning = Readonly<{
  code: "UNRESOLVED_DEPENDENCY_HINT";
  message: string;
}>;

export type RepoSemanticGraphV2 = Readonly<{
  schema: typeof REPO_SEMANTIC_GRAPH_V2_SCHEMA;
  compilerRevision: typeof REPO_SEMANTIC_GRAPH_V2_COMPILER_REVISION;
  sourceCompilerVersion: KingdomWorld["compilerVersion"];
  key: string;
  repository: Readonly<{
    id: number;
    owner: string;
    name: string;
    commitSha: string;
  }>;
  rootNodeId: string;
  nodes: ReadonlyArray<RepoSemanticNode>;
  edges: ReadonlyArray<RepoSemanticEdge>;
  coverage: CoverageSummary;
  warnings: ReadonlyArray<RepoSemanticGraphWarning>;
}>;

export type CreateRepoSemanticGraphV2Options = Readonly<{
  /**
   * Optional relationships parsed from repository manifests. No dependency
   * edge is invented when manifest contents are unavailable.
   */
  dependencies?: ReadonlyArray<RepoDependencyHint>;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function percentile(sorted: ReadonlyArray<number>, amount: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.round((sorted.length - 1) * clamp(amount, 0, 1));
  return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
}

function magnitudeNormalizer(values: ReadonlyArray<number>): (value: number) => number {
  const logs = values.map((value) => Math.log2(Math.max(0, value) + 1)).sort((a, b) => a - b);
  const low = percentile(logs, 0.1);
  const high = percentile(logs, 0.9);
  if (high - low < 1e-9) return () => 0.5;
  return (value: number) =>
    round(clamp((Math.log2(Math.max(0, value) + 1) - low) / (high - low), 0, 1));
}

function magnitude(
  bytes: number,
  representedFiles: number,
  normalize: (value: number) => number,
): RepoSemanticMagnitude {
  const normalized = normalize(bytes);
  return {
    bytes,
    representedFiles,
    normalized,
    heightScale: round(0.75 + normalized * 1.75),
  };
}

function regionPath(provinceId: string, entities: ReadonlyArray<KingdomEntity>): string {
  const paths = entities
    .filter((entity) => entity.provinceId === provinceId && entity.path.length > 0)
    .map((entity) => entity.path)
    .sort((first, second) => first.localeCompare(second));
  if (paths.length === 0) return "";
  const segments = paths.map((path) => path.split("/"));
  const shared: string[] = [];
  for (let index = 0; ; index += 1) {
    const candidate = segments[0]?.[index];
    if (!candidate || segments.some((parts) => parts[index] !== candidate)) break;
    shared.push(candidate);
  }
  return shared.join("/");
}

function edge(
  kind: RepoSemanticEdgeKind,
  from: string,
  to: string,
  source: RepoSemanticEdge["evidence"]["source"],
  reference: string,
): RepoSemanticEdge {
  return {
    id: stableId("semantic-edge", `${kind}:${from}:${to}:${reference}`),
    kind,
    from,
    to,
    evidence: { source, reference },
  };
}

function assertGraphIntegrity(
  nodes: ReadonlyArray<RepoSemanticNode>,
  edges: ReadonlyArray<RepoSemanticEdge>,
): void {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`Duplicate semantic node id: ${node.id}`);
    ids.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const relation of edges) {
    if (edgeIds.has(relation.id)) throw new Error(`Duplicate semantic edge id: ${relation.id}`);
    edgeIds.add(relation.id);
    if (
      !(["contains", "route", "dependency"] as const).includes(relation.kind) ||
      !(["compiler", "world-plan", "manifest"] as const).includes(relation.evidence.source) ||
      relation.evidence.reference.trim().length === 0 ||
      relation.id !==
        stableId(
          "semantic-edge",
          `${relation.kind}:${relation.from}:${relation.to}:${relation.evidence.reference}`,
        )
    ) {
      throw new Error(`Semantic edge ${relation.id} has invalid evidence or identity.`);
    }
    if (!ids.has(relation.from) || !ids.has(relation.to)) {
      throw new Error(`Semantic edge ${relation.id} references an unknown node.`);
    }
    if (relation.from === relation.to) {
      throw new Error(`Semantic edge ${relation.id} cannot reference itself.`);
    }
  }
}

function freezeSemanticGraphValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((child) => freezeSemanticGraphValue(child))) as T;
  }
  if (typeof value === "object" && value !== null) {
    const frozen: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      frozen[key] = freezeSemanticGraphValue(child);
    }
    return Object.freeze(frozen) as T;
  }
  return value;
}

function deriveRepoSemanticGraphV2Key(
  graph: Omit<RepoSemanticGraphV2, "key" | "warnings">,
): string {
  return `repo-semantic-graph-v2:${stableDigest(
    JSON.stringify({
      schema: graph.schema,
      compilerRevision: graph.compilerRevision,
      sourceCompilerVersion: graph.sourceCompilerVersion,
      repository: graph.repository,
      rootNodeId: graph.rootNodeId,
      nodes: graph.nodes,
      edges: graph.edges,
      coverage: graph.coverage,
    }),
  )}`;
}

/** Validates graph identity once at worker/cache and manifest trust boundaries. */
export function assertRepoSemanticGraphV2Integrity(
  graph: RepoSemanticGraphV2,
): asserts graph is RepoSemanticGraphV2 {
  if (
    graph.schema !== REPO_SEMANTIC_GRAPH_V2_SCHEMA ||
    graph.compilerRevision !== REPO_SEMANTIC_GRAPH_V2_COMPILER_REVISION ||
    typeof graph.sourceCompilerVersion !== "string" ||
    graph.sourceCompilerVersion.trim().length === 0
  ) {
    throw new Error("RepoSemanticGraphV2 has an unsupported compiler identity.");
  }
  if (
    !Number.isInteger(graph.repository.id) ||
    graph.repository.id < 0 ||
    [
      graph.repository.owner,
      graph.repository.name,
      graph.repository.commitSha,
      graph.rootNodeId,
    ].some((value) => typeof value !== "string" || value.trim().length === 0)
  ) {
    throw new Error("RepoSemanticGraphV2 has invalid repository identity.");
  }
  assertGraphIntegrity(graph.nodes, graph.edges);
  if (!graph.nodes.some((node) => node.id === graph.rootNodeId && node.kind === "repository")) {
    throw new Error("RepoSemanticGraphV2 root node is missing or has the wrong role.");
  }
  for (const node of graph.nodes) {
    const magnitude = node.magnitude;
    if (
      !Number.isFinite(magnitude.bytes) ||
      magnitude.bytes < 0 ||
      !Number.isInteger(magnitude.representedFiles) ||
      magnitude.representedFiles < 0 ||
      !Number.isFinite(magnitude.normalized) ||
      magnitude.normalized < 0 ||
      magnitude.normalized > 1 ||
      Math.abs(magnitude.heightScale - round(0.75 + magnitude.normalized * 1.75)) > 1e-6 ||
      [node.id, node.label, node.sourceUrl].some(
        (value) => typeof value !== "string" || value.trim().length === 0,
      )
    ) {
      throw new Error(`RepoSemanticGraphV2 node ${node.id} has invalid semantic metadata.`);
    }
  }
  const expectedKey = deriveRepoSemanticGraphV2Key({
    schema: graph.schema,
    compilerRevision: graph.compilerRevision,
    sourceCompilerVersion: graph.sourceCompilerVersion,
    repository: graph.repository,
    rootNodeId: graph.rootNodeId,
    nodes: graph.nodes,
    edges: graph.edges,
    coverage: graph.coverage,
  });
  if (graph.key !== expectedKey) {
    throw new Error("RepoSemanticGraphV2 key does not match its structural semantics.");
  }
}

/**
 * Builds the repository evidence graph consumed by Worlds V2. This function is
 * deliberately renderer- and season-independent. It records dependencies only
 * when a manifest parser supplies explicit evidence.
 */
export function createRepoSemanticGraphV2(
  world: KingdomWorld,
  options: CreateRepoSemanticGraphV2Options = {},
): RepoSemanticGraphV2 {
  const rootNodeId = `repository:${world.source.repositoryId}`;
  const entityNormalize = magnitudeNormalizer(world.entities.map((entity) => entity.size));
  const regionNormalize = magnitudeNormalizer(
    world.provinces.map((province) => province.representedBytes),
  );
  const totalBytes = world.entities.reduce((total, entity) => total + entity.size, 0);
  const rootNormalize = magnitudeNormalizer([totalBytes]);

  const repositoryNode: RepoSemanticRepositoryNode = {
    kind: "repository",
    id: rootNodeId,
    label: world.title,
    path: "",
    sourceUrl: world.source.revisionUrl,
    magnitude: magnitude(totalBytes, world.coverage.representedFiles, rootNormalize),
  };
  const regionNodes: RepoSemanticRegionNode[] = world.provinces.map((province) => ({
    kind: "region",
    id: `region:${province.id}`,
    provinceId: province.id,
    label: province.label,
    path: regionPath(province.id, world.entities),
    sourceUrl: province.sourceUrl,
    category: province.dominantCategory,
    role: province.role,
    magnitude: magnitude(province.representedBytes, province.representedFiles, regionNormalize),
  }));
  const entityNodes: RepoSemanticEntityNode[] = world.entities.map((entity) => ({
    kind: "entity",
    id: `entity:${entity.id}`,
    entityId: entity.id,
    provinceId: entity.provinceId,
    label: entity.label,
    path: entity.path,
    sourceUrl: entity.sourceUrl,
    category: entity.category,
    language: entity.language,
    aggregate: entity.aggregate,
    magnitude: magnitude(entity.size, entity.representedFiles, entityNormalize),
  }));
  const nodes: RepoSemanticNode[] = [repositoryNode, ...regionNodes, ...entityNodes];
  const edges: RepoSemanticEdge[] = [];

  for (const region of regionNodes) {
    edges.push(edge("contains", rootNodeId, region.id, "compiler", region.provinceId));
  }
  for (const entity of entityNodes) {
    edges.push(
      edge("contains", `region:${entity.provinceId}`, entity.id, "compiler", entity.entityId),
    );
  }
  for (const route of world.routes) {
    edges.push(edge("route", rootNodeId, `region:${route.provinceId}`, "world-plan", route.id));
  }

  const entityIdByPath = new Map<string, string>();
  for (const node of [...entityNodes].sort(
    (first, second) =>
      Number(first.aggregate) - Number(second.aggregate) || first.id.localeCompare(second.id),
  )) {
    if (!entityIdByPath.has(node.path)) entityIdByPath.set(node.path, node.id);
  }
  const warnings: RepoSemanticGraphWarning[] = [];
  const edgeIds = new Set(edges.map(({ id }) => id));
  for (const dependency of options.dependencies ?? []) {
    if (
      dependency.fromPath.trim().length === 0 ||
      dependency.toPath.trim().length === 0 ||
      dependency.reference.trim().length === 0
    ) {
      throw new Error("Repository dependency hints require non-empty paths and evidence.");
    }
    const from = entityIdByPath.get(dependency.fromPath);
    const to = entityIdByPath.get(dependency.toPath);
    if (!from || !to) {
      warnings.push({
        code: "UNRESOLVED_DEPENDENCY_HINT",
        message: `Dependency ${dependency.fromPath} -> ${dependency.toPath} did not match represented entities.`,
      });
      continue;
    }
    const relation = edge("dependency", from, to, "manifest", dependency.reference);
    if (edgeIds.has(relation.id)) continue;
    edgeIds.add(relation.id);
    edges.push(relation);
  }

  const orderedEdges = edges.sort(
    (first, second) =>
      first.kind.localeCompare(second.kind) ||
      first.from.localeCompare(second.from) ||
      first.to.localeCompare(second.to) ||
      first.id.localeCompare(second.id),
  );
  assertGraphIntegrity(nodes, orderedEdges);
  const repository = {
    id: world.source.repositoryId,
    owner: world.source.owner,
    name: world.source.repository,
    commitSha: world.source.commitSha,
  } as const;
  const graphWithoutKey = {
    schema: REPO_SEMANTIC_GRAPH_V2_SCHEMA,
    compilerRevision: REPO_SEMANTIC_GRAPH_V2_COMPILER_REVISION,
    sourceCompilerVersion: world.compilerVersion,
    repository,
    rootNodeId,
    nodes,
    edges: orderedEdges,
    coverage: world.coverage,
  } as const;
  const graph: RepoSemanticGraphV2 = {
    ...graphWithoutKey,
    key: deriveRepoSemanticGraphV2Key(graphWithoutKey),
    warnings,
  };
  assertRepoSemanticGraphV2Integrity(graph);
  return freezeSemanticGraphValue(graph);
}
