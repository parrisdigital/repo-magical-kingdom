import type { Metadata } from "next";

import { KingdomExperience } from "@/components/kingdom";

type ProfilePageProps = Readonly<{
  params: Promise<Readonly<{ owner: string }>>;
}>;

export async function generateMetadata({ params }: ProfilePageProps): Promise<Metadata> {
  const { owner } = await params;
  return {
    title: `@${owner}'s universe`,
    description: `Explore the public repository worlds in @${owner}'s universe.`,
  };
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { owner } = await params;
  return <KingdomExperience initialMode="universe" initialOwner={owner} />;
}
