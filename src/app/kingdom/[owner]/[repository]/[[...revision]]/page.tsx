import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { KingdomExperience } from "@/components/kingdom";
import {
  DEFAULT_KINGDOM_SEASON,
  isKingdomSeason,
  isKingdomWorldTheme,
  KINGDOM_SEASON_LABELS,
  KINGDOM_WORLD_THEME_LABELS,
  type KingdomSeason,
  type KingdomWorldTheme,
} from "@/lib/kingdom";

type KingdomRouteParams = Readonly<{
  owner: string;
  repository: string;
  revision?: string[];
}>;

type KingdomPageProps = Readonly<{
  params: Promise<KingdomRouteParams>;
  searchParams: Promise<Readonly<{ world?: string | string[]; season?: string | string[] }>>;
}>;

function readRevision(revision: string[] | undefined): string | undefined {
  if (!revision) return undefined;
  if (revision.length !== 1 || !revision[0]) notFound();
  return revision[0];
}

function readSeason(value: string | string[] | undefined): KingdomSeason {
  if (value === undefined) return DEFAULT_KINGDOM_SEASON;
  if (!isKingdomSeason(value)) notFound();
  return value;
}

function readWorldTheme(value: string | string[] | undefined): KingdomWorldTheme | undefined {
  if (value === undefined) return undefined;
  if (!isKingdomWorldTheme(value)) notFound();
  return value;
}

export async function generateMetadata({
  params,
  searchParams,
}: KingdomPageProps): Promise<Metadata> {
  const [{ owner, repository }, query] = await Promise.all([params, searchParams]);
  const season = readSeason(query.season);
  const worldTheme = readWorldTheme(query.world);
  const worldLabel = worldTheme
    ? KINGDOM_WORLD_THEME_LABELS[worldTheme]
    : "Repository-selected world";
  return {
    title: `${owner}/${repository} · ${worldLabel} · ${KINGDOM_SEASON_LABELS[season]}`,
    description: `Explore ${owner}/${repository} as a living ${season} ${worldLabel.toLowerCase()}.`,
  };
}

export default async function KingdomPage({ params, searchParams }: KingdomPageProps) {
  const [{ owner, repository, revision }, query] = await Promise.all([params, searchParams]);

  return (
    <KingdomExperience
      initialMode="kingdom"
      initialOwner={owner}
      initialRepository={repository}
      initialRevision={readRevision(revision)}
      initialSeason={readSeason(query.season)}
      initialWorldTheme={readWorldTheme(query.world)}
    />
  );
}
