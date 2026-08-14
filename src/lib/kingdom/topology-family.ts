import { stableFraction, stableHash } from "./hash";
import type { KingdomWorld } from "./types";

export const REPOSITORY_TOPOLOGY_FAMILY_IDS = [
  "foreground-estuary",
  "eastern-lake-run",
  "western-basin-watershed",
  "central-meander",
] as const;

export type RepositoryTopologyFamilyId = (typeof REPOSITORY_TOPOLOGY_FAMILY_IDS)[number];

export type NormalizedTopologyPoint = Readonly<{ x: number; z: number }>;

export type RepositoryTopologyFamily = Readonly<{
  id: RepositoryTopologyFamilyId;
  label: string;
  lake: Readonly<{
    center: NormalizedTopologyPoint;
    aspect: number;
    rotation: number;
  }>;
  course: Readonly<{
    points: ReadonlyArray<NormalizedTopologyPoint>;
    preferredSide: -1 | 1;
  }>;
  ridge: Readonly<{
    angle: number;
    openingX: number;
  }>;
  meadows: Readonly<{
    middle: Readonly<
      NormalizedTopologyPoint & { radiusX: number; radiusZ: number; rotation: number }
    >;
    front: Readonly<
      NormalizedTopologyPoint & { radiusX: number; radiusZ: number; rotation: number }
    >;
  }>;
  coast: Readonly<{
    frontOpeningX: number;
    basinProgress: number;
    waistProgress: number;
  }>;
}>;

type TopologyFamilyTemplate = RepositoryTopologyFamily;

const FAMILY_TEMPLATES: ReadonlyArray<TopologyFamilyTemplate> = [
  {
    id: "foreground-estuary",
    label: "Foreground estuary",
    lake: { center: { x: 0.2, z: 0.76 }, aspect: 1.08, rotation: 0.12 },
    course: {
      points: [
        { x: -0.28, z: 0.1 },
        { x: -0.22, z: 0.29 },
        { x: -0.02, z: 0.48 },
        { x: 0.17, z: 0.68 },
        { x: 0.24, z: 0.94 },
      ],
      preferredSide: 1,
    },
    ridge: { angle: 0.018, openingX: -0.28 },
    meadows: {
      middle: { x: -0.24, z: 0.49, radiusX: 0.24, radiusZ: 0.2, rotation: -0.08 },
      front: { x: -0.2, z: 0.78, radiusX: 0.18, radiusZ: 0.14, rotation: 0.08 },
    },
    coast: { frontOpeningX: 0.2, basinProgress: 0.78, waistProgress: 0.53 },
  },
  {
    id: "eastern-lake-run",
    label: "Eastern lake run",
    lake: { center: { x: 0.31, z: 0.59 }, aspect: 1.48, rotation: -0.52 },
    course: {
      points: [
        { x: -0.34, z: 0.1 },
        { x: -0.18, z: 0.25 },
        { x: 0.04, z: 0.39 },
        { x: 0.28, z: 0.55 },
        { x: 0.38, z: 0.94 },
      ],
      preferredSide: 1,
    },
    ridge: { angle: 0.048, openingX: -0.34 },
    meadows: {
      middle: { x: -0.23, z: 0.55, radiusX: 0.23, radiusZ: 0.18, rotation: 0.18 },
      front: { x: 0.03, z: 0.8, radiusX: 0.2, radiusZ: 0.13, rotation: -0.28 },
    },
    coast: { frontOpeningX: 0.34, basinProgress: 0.61, waistProgress: 0.46 },
  },
  {
    id: "western-basin-watershed",
    label: "Western basin watershed",
    lake: { center: { x: -0.27, z: 0.68 }, aspect: 0.74, rotation: 0.42 },
    course: {
      points: [
        { x: 0.31, z: 0.1 },
        { x: 0.2, z: 0.27 },
        { x: -0.02, z: 0.42 },
        { x: -0.24, z: 0.62 },
        { x: -0.34, z: 0.94 },
      ],
      preferredSide: -1,
    },
    ridge: { angle: -0.047, openingX: 0.31 },
    meadows: {
      middle: { x: 0.25, z: 0.48, radiusX: 0.22, radiusZ: 0.19, rotation: -0.18 },
      front: { x: 0.18, z: 0.78, radiusX: 0.2, radiusZ: 0.13, rotation: 0.24 },
    },
    coast: { frontOpeningX: -0.28, basinProgress: 0.7, waistProgress: 0.58 },
  },
  {
    id: "central-meander",
    label: "Central meander",
    lake: { center: { x: -0.04, z: 0.53 }, aspect: 1.26, rotation: 0.64 },
    course: {
      points: [
        { x: 0.14, z: 0.1 },
        { x: -0.27, z: 0.25 },
        { x: 0.25, z: 0.38 },
        { x: -0.1, z: 0.5 },
        { x: 0.08, z: 0.94 },
      ],
      preferredSide: -1,
    },
    ridge: { angle: -0.024, openingX: 0.14 },
    meadows: {
      middle: { x: 0.25, z: 0.53, radiusX: 0.2, radiusZ: 0.17, rotation: 0.3 },
      front: { x: -0.24, z: 0.78, radiusX: 0.19, radiusZ: 0.14, rotation: -0.2 },
    },
    coast: { frontOpeningX: -0.04, basinProgress: 0.56, waistProgress: 0.62 },
  },
];

function rounded(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

/**
 * Selects a geography from immutable repository identity only. Season, theme,
 * render budgets, and clock time are deliberately absent from the key.
 */
export function deriveRepositoryTopologyFamily(
  world: Pick<KingdomWorld, "seed" | "source">,
): RepositoryTopologyFamily {
  const repositoryKey = `${world.source.repositoryId}:${world.source.owner.toLowerCase()}/${world.source.repository.toLowerCase()}:${world.seed}`;
  const template =
    FAMILY_TEMPLATES[stableHash(`${repositoryKey}:topology-family/v1`) % FAMILY_TEMPLATES.length]!;
  const jitter = (channel: string, amount: number) =>
    (stableFraction(`${repositoryKey}:topology-family/v1:${channel}`) - 0.5) * amount;
  const pointWithJitter = (
    source: NormalizedTopologyPoint,
    channel: string,
    amountX: number,
    amountZ: number,
  ): NormalizedTopologyPoint => ({
    x: rounded(source.x + jitter(`${channel}:x`, amountX)),
    z: rounded(source.z + jitter(`${channel}:z`, amountZ)),
  });

  return {
    ...template,
    lake: {
      center: pointWithJitter(template.lake.center, "lake", 0.035, 0.025),
      aspect: rounded(template.lake.aspect + jitter("lake:aspect", 0.08)),
      rotation: rounded(template.lake.rotation + jitter("lake:rotation", 0.08)),
    },
    course: {
      ...template.course,
      points: template.course.points.map((sample, index) =>
        pointWithJitter(sample, `course:${index}`, index === 0 ? 0.025 : 0.045, 0.012),
      ),
    },
    ridge: {
      angle: rounded(template.ridge.angle + jitter("ridge:angle", 0.012)),
      openingX: rounded(template.ridge.openingX + jitter("ridge:opening", 0.035)),
    },
    meadows: {
      middle: {
        ...template.meadows.middle,
        ...pointWithJitter(template.meadows.middle, "meadow:middle", 0.035, 0.025),
      },
      front: {
        ...template.meadows.front,
        ...pointWithJitter(template.meadows.front, "meadow:front", 0.035, 0.025),
      },
    },
    coast: {
      ...template.coast,
      frontOpeningX: rounded(template.coast.frontOpeningX + jitter("coast:opening", 0.03)),
    },
  };
}
