import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Repo Magical Kingdom",
    short_name: "Magical Kingdom",
    description: "Turn public GitHub repositories into living, explorable 3D worlds.",
    start_url: "/",
    display: "standalone",
    background_color: "#090d18",
    theme_color: "#090d18",
  };
}
