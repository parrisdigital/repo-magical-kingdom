import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DEFAULT_KINGDOM_SEASON, isKingdomSeason, isKingdomWorldTheme } from "@/lib/kingdom";

import { VisualReviewExperience } from "./visual-review-experience";

export const metadata: Metadata = {
  title: "Visual review",
  robots: { index: false, follow: false },
};

export default async function VisualReviewPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<
    Readonly<{
      world?: string | string[];
      season?: string | string[];
      clean?: string | string[];
    }>
  >;
}>) {
  if (process.env.NODE_ENV !== "development") notFound();

  const query = await searchParams;
  const requestedSeason = Array.isArray(query.season) ? query.season[0] : query.season;
  const requestedWorldTheme = Array.isArray(query.world) ? query.world[0] : query.world;
  const clean = (Array.isArray(query.clean) ? query.clean[0] : query.clean) === "1";

  return (
    <VisualReviewExperience
      initialSeason={
        requestedSeason && isKingdomSeason(requestedSeason)
          ? requestedSeason
          : DEFAULT_KINGDOM_SEASON
      }
      initialWorldTheme={
        requestedWorldTheme && isKingdomWorldTheme(requestedWorldTheme)
          ? requestedWorldTheme
          : "enchanted-forest"
      }
      clean={clean}
    />
  );
}
