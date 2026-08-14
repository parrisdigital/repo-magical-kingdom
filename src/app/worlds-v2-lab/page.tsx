import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { notFound } from "next/navigation";

import { legacyKingdomWorldSchema } from "@/lib/kingdom/schemas";
import { isRepositoryWorldsV2LabEnabled } from "@/lib/kingdom-v2";

import { WorldsV2TerrainLab } from "./worlds-v2-terrain-lab";

const GOLD_FIXTURES = {
  compact: "repository-city-live-world.json",
  medium: "magical-kingdom-medium-world.json",
  vast: "nextjs-large-world.json",
} as const;

type GoldFixtureId = keyof typeof GOLD_FIXTURES;

function fixtureId(value: string | string[] | undefined): GoldFixtureId {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "compact" || candidate === "vast" ? candidate : "medium";
}

export default async function WorldsV2LabPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  if (
    !isRepositoryWorldsV2LabEnabled({
      nodeEnvironment: process.env.NODE_ENV,
      vercelEnvironment: process.env.VERCEL_ENV,
      explicitFlag: process.env.REPOSITORY_WORLDS_V2_LAB,
    })
  ) {
    notFound();
  }

  const selected = fixtureId((await searchParams).world);
  const fixturePath = resolve(
    process.cwd(),
    "src/components/kingdom/test-fixtures",
    GOLD_FIXTURES[selected],
  );
  const candidate = JSON.parse(readFileSync(fixturePath, "utf8"));
  const world = legacyKingdomWorldSchema.parse({
    ...candidate,
    worldTheme: candidate.worldTheme ?? "enchanted-forest",
  });

  return <WorldsV2TerrainLab selected={selected} world={world} />;
}
