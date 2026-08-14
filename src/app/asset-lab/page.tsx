import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AssetLabExperience } from "./asset-lab-experience";

export const metadata: Metadata = {
  title: "Repository Worlds V2 asset lab",
  description: "Internal turntable, orbit, walk, LOD, collision, and material-channel review.",
  robots: { index: false, follow: false },
};

export default function AssetLabPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AssetLabExperience />;
}
