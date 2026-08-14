import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isRepositoryWorldsV2LabEnabled } from "@/lib/kingdom-v2";

import { AssetLabExperience } from "./asset-lab-experience";

export const metadata: Metadata = {
  title: "Repository Worlds V2 asset lab",
  description: "Internal turntable, orbit, walk, LOD, collision, and material-channel review.",
  robots: { index: false, follow: false },
};

export default function AssetLabPage() {
  if (
    !isRepositoryWorldsV2LabEnabled({
      nodeEnvironment: process.env.NODE_ENV,
      vercelEnvironment: process.env.VERCEL_ENV,
      explicitFlag: process.env.REPOSITORY_WORLDS_V2_LAB,
    })
  ) {
    notFound();
  }
  return <AssetLabExperience />;
}
