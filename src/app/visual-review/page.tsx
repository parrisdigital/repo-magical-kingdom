import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DEFAULT_KINGDOM_SEASON, isKingdomSeason } from "@/lib/kingdom";

import { VisualReviewExperience } from "./visual-review-experience";

export const metadata: Metadata = {
  title: "Visual review",
  robots: { index: false, follow: false },
};

export default async function VisualReviewPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<Readonly<{ season?: string | string[]; clean?: string | string[] }>>;
}>) {
  if (process.env.NODE_ENV !== "development") notFound();

  const query = await searchParams;
  const requestedSeason = Array.isArray(query.season) ? query.season[0] : query.season;
  const clean = (Array.isArray(query.clean) ? query.clean[0] : query.clean) === "1";

  return (
    <VisualReviewExperience
      initialSeason={
        requestedSeason && isKingdomSeason(requestedSeason)
          ? requestedSeason
          : DEFAULT_KINGDOM_SEASON
      }
      clean={clean}
    />
  );
}
