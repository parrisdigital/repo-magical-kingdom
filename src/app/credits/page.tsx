import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Credits & provenance",
  description: "Project lineage, research acknowledgements, and runtime technology credits.",
};

const credits = [
  {
    relationship: "Evolved from",
    title: "Repository City",
    href: "https://github.com/parrisdigital/repository-city",
    copy: "Parris Digital's MIT-licensed repository-to-geometry predecessor established the original data visualization lineage.",
  },
  {
    relationship: "Research inspiration",
    title: "Hunyuan3D-WorldClaw",
    href: "https://github.com/Tencent-Hunyuan/Hunyuan3D-WorldClaw",
    copy: "Its published coarse-to-fine semantic world-planning research informed the structured world compiler. No WorldClaw code, imagery, meshes, or generated assets are redistributed.",
  },
  {
    relationship: "README presentation",
    title: "ShieldCN",
    href: "https://shieldcn.dev",
    copy: "Justin Levine's MIT-licensed project renders the live repository badges and community signals used in this project's README.",
  },
  {
    relationship: "World art & wildlife",
    title: "Quaternius",
    href: "https://quaternius.com",
    copy: "The CC0 Medieval Village, Stylized Nature, and Ultimate Animated Animal packs supply the textured architecture, environment art, and living wildlife used throughout the kingdoms.",
  },
  {
    relationship: "Seasonal world art",
    title: "Kenney",
    href: "https://kenney.nl",
    copy: "The CC0 Nature and Holiday kits supply six paired green and autumn tree families, snowy silhouettes, crops, flowers, and surface treatments through an audited browser bundle.",
  },
  {
    relationship: "Built with",
    title: "Three.js · React Three Fiber · Drei",
    href: "https://threejs.org",
    copy: "The open-source browser 3D ecosystem powering scene composition, controls, instancing, and rendering.",
  },
] as const;

export default function CreditsPage() {
  return (
    <main className="credits-page">
      <div className="credits-page__inner">
        <Link className="credits-page__back" href="/">
          ← Return to the Crown Gate
        </Link>
        <p className="eyebrow">Credits & provenance</p>
        <h1>Every world remembers where it came from.</h1>
        <p className="credits-page__lede">
          Repo Magical Kingdom is an independent open-source project. We distinguish code we build
          with, services we use, research that inspires us, and source repositories that visitors
          choose to visualize.
        </p>
        <section className="credits-page__grid" aria-label="Project acknowledgements">
          {credits.map((credit) => (
            <article className="credits-page__card" key={credit.title}>
              <p>{credit.relationship}</p>
              <h2>
                <a href={credit.href} rel="noreferrer" target="_blank">
                  {credit.title}
                </a>
              </h2>
              <p>{credit.copy}</p>
            </article>
          ))}
        </section>
        <section className="credits-page__policy">
          <h2>Source kingdoms</h2>
          <p>
            Every generated kingdom retains its repository owner, canonical URL, detected license,
            immutable commit SHA, and exact source paths. Visualization does not imply affiliation,
            ownership, or endorsement.
          </p>
          <p>
            Complete dependency, source-lineage, and asset records live in the repository&apos;s
            NOTICE, acknowledgements, third-party notices, and attribution registry.
          </p>
        </section>
      </div>
    </main>
  );
}
