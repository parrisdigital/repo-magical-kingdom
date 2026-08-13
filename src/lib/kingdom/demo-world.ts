import type { ProfileSnapshot, RepositorySnapshot } from "@/lib/github";

import { compileKingdom } from "./compiler";
import {
  DEFAULT_KINGDOM_SEASON,
  type KingdomSeason,
  type KingdomWorld,
  type RepositoryUniverse,
} from "./types";
import { DEFAULT_KINGDOM_WORLD_THEME, type KingdomWorldTheme } from "./world-theme";
import { compileUniverse } from "./universe";

const REPOSITORY_CITY_SHA = "0e61374af12387266c6fb13c273bee845b5f0864";

/**
 * A real, immutable Repository City snapshot used for the network-free landing preview.
 * Every path and blob SHA below was captured from the pinned public Git tree.
 */
const repositoryCitySnapshot: RepositorySnapshot = {
  repositoryId: 1_296_981_064,
  owner: "parrisdigital",
  repository: "repository-city",
  description: "Turn any public GitHub repository into an interactive isometric city.",
  defaultBranch: "main",
  commitSha: REPOSITORY_CITY_SHA,
  commitTreeSha: "e49a9f245137b1be976c69f79590d0fd85f16f8b",
  committedAt: "2026-07-11T23:19:08Z",
  canonicalUrl: "https://github.com/parrisdigital/repository-city",
  license: "MIT",
  treeTruncated: false,
  treeRecovered: false,
  warnings: [],
  files: [
    {
      path: ".editorconfig",
      size: 188,
      sha: "1014ba78880c899e842b397cb89a878be4671f7d",
    },
    {
      path: ".env.example",
      size: 246,
      sha: "a4e50d12638d7714ae93bcb7a62a9b6a9501a5ee",
    },
    {
      path: ".github/ISSUE_TEMPLATE/bug.yml",
      size: 512,
      sha: "048be84b26138c286cdc77c7e279b36f98daa1be",
    },
    {
      path: ".github/ISSUE_TEMPLATE/feature.yml",
      size: 362,
      sha: "b67a29500600fed67e6a20fda1ae448ba0f48ffe",
    },
    {
      path: ".github/dependabot.yml",
      size: 776,
      sha: "d3933ee9bcbbccf691349b35d261317c9b55fb9f",
    },
    {
      path: ".github/pull_request_template.md",
      size: 92,
      sha: "0afe7bd872ace28298a42dc3c5bf3596d291787d",
    },
    {
      path: ".github/workflows/ci.yml",
      size: 638,
      sha: "810108e2d8c143d485d2d6d7abb7ab3aee0be2bb",
    },
    {
      path: ".gitignore",
      size: 527,
      sha: "d3d256862259eb0b0568a451beb30d5f4f9256d1",
    },
    {
      path: ".prettierignore",
      size: 83,
      sha: "3783725f1c0452f49072eccf1605a0226852e01d",
    },
    {
      path: ".prettierrc.json",
      size: 116,
      sha: "19ec866cdfc241e925dc41d1f0783a987db3bf08",
    },
    {
      path: "AGENTS.md",
      size: 328,
      sha: "caeace23b0756908fefce5e3499ac8eb89e44486",
    },
    {
      path: "CLAUDE.md",
      size: 11,
      sha: "43c994c2d3617f947bcb5adf1933e21dabe46bb5",
    },
    {
      path: "CODE_OF_CONDUCT.md",
      size: 292,
      sha: "6076ef4ab7b8a6576c45e7f60fbd0dcb098fbaf7",
    },
    {
      path: "CONTRIBUTING.md",
      size: 578,
      sha: "b68a598a900bfa4299271b19404c59a97683c5aa",
    },
    {
      path: "LICENSE",
      size: 1071,
      sha: "e23b788d2886c92b10412f4d406759aeded9f1f5",
    },
    {
      path: "README.md",
      size: 8373,
      sha: "89abbd33907971d497639f34d8b6473abc90fe79",
    },
    {
      path: "SECURITY.md",
      size: 319,
      sha: "39f5f928df2a5f84104dd4f9c78629e90910dce6",
    },
    {
      path: "app/api/city/route.ts",
      size: 4154,
      sha: "178868913850989920bfd09542e6718798d7c23c",
    },
    {
      path: "app/city/[owner]/[repository]/page.tsx",
      size: 672,
      sha: "60f1d5e6d1e6638a1b423e1f0bc0fedcfeb94a6c",
    },
    {
      path: "app/globals.css",
      size: 968,
      sha: "5a4be7649e976b2bf8480ebe27241f187c56f29b",
    },
    {
      path: "app/icon.svg",
      size: 505,
      sha: "f1ef92b02e13fff30be9c19e593b91c64e26ba10",
    },
    {
      path: "app/layout.tsx",
      size: 1425,
      sha: "04421bdea904ba85721b55a72e27bc9e8d9782d3",
    },
    {
      path: "app/page.tsx",
      size: 131,
      sha: "97ece046d99dca14579a0676d50c6f6bce2c3763",
    },
    {
      path: "app/profile/[owner]/page.tsx",
      size: 624,
      sha: "8d418a70735aa2c4b3620b5177e29dd20a696a74",
    },
    {
      path: "components/city/city-canvas.tsx",
      size: 1352,
      sha: "a0b1442c1432e7072be4428af6f749a80029c9e4",
    },
    {
      path: "components/city/city-experience.tsx",
      size: 19145,
      sha: "bf0de9912c3cc7f11a6675e712de944436c5189e",
    },
    {
      path: "components/city/city-scene.tsx",
      size: 20262,
      sha: "d5985b60f17b84710ff4a85f091f1a59fbff785d",
    },
    {
      path: "components/city/city-tooltip.tsx",
      size: 1538,
      sha: "067e32f87f3cf596a85299d978f9c2996500e8ca",
    },
    {
      path: "components/city/repository-panel.tsx",
      size: 6287,
      sha: "77afb392679ab8ecd2ad2ef4f355dcf49f898a1f",
    },
    {
      path: "components/repository-city-logo.tsx",
      size: 1795,
      sha: "52ffef721a791112d0a607f3abd7967c8641d7b0",
    },
    {
      path: "docs/design/repository-city-desktop-concept.png",
      size: 2206253,
      sha: "9b2bcfc526b6bb5bbb82ccd30bf829e8413ffc45",
    },
    {
      path: "docs/design/repository-city-mobile-concept.png",
      size: 1879953,
      sha: "f55eaa83287e7b005ca2ee9c2e543ff3d585dbb5",
    },
    {
      path: "docs/images/repository-city-preview.png",
      size: 152123,
      sha: "6e87eed3d9a149ea2f4cc81bf2b1e5d2e1365163",
    },
    {
      path: "docs/plans/2026-07-10-repository-city-design.md",
      size: 2334,
      sha: "d67e87bbd52fad4c63cce02f870b494cb7360603",
    },
    {
      path: "eslint.config.mjs",
      size: 460,
      sha: "a9f8dc0e3f46206deb2245c6a19ecde129135d92",
    },
    {
      path: "lib/city/aggregate-files.test.ts",
      size: 1355,
      sha: "584686ca947f749c10ab4999ec97b6ae1983179f",
    },
    {
      path: "lib/city/aggregate-files.ts",
      size: 2385,
      sha: "e6885ea1b19dc9aa9ead14c4012c8d16b637300d",
    },
    {
      path: "lib/city/build-city.ts",
      size: 1643,
      sha: "26bfd7129f385f128ff3632744ae1e9b2c145115",
    },
    {
      path: "lib/city/build-profile-city.test.ts",
      size: 2714,
      sha: "ea68c5fdee80ef7d1683598a90dd0a1715f34e5e",
    },
    {
      path: "lib/city/build-profile-city.ts",
      size: 5241,
      sha: "aa58586aff114c2b6df1388ef820e0463d361fab",
    },
    {
      path: "lib/city/classify-file.test.ts",
      size: 1140,
      sha: "f02dd2694f6eab7b6d6af8f54a92ee718ea2108b",
    },
    {
      path: "lib/city/classify-file.ts",
      size: 3539,
      sha: "0f90ea7973b7f6a90a1f131e126189710a09eb6f",
    },
    {
      path: "lib/city/layout.test.ts",
      size: 1976,
      sha: "3e102530b39dc2e0e88c8880bf1c6e3957793c0a",
    },
    {
      path: "lib/city/layout.ts",
      size: 6187,
      sha: "a9813e1b56e333a4ae0bd78bf76ee2dc24b615cc",
    },
    {
      path: "lib/city/normalize-tree.ts",
      size: 1133,
      sha: "3ad90284f1c24438a5b51661696f330239c16de5",
    },
    {
      path: "lib/city/palette.ts",
      size: 709,
      sha: "caa150f0b64b11913ab909fcd0bddcdba6c93113",
    },
    {
      path: "lib/city/types.ts",
      size: 1893,
      sha: "a42bfa16b8477e1ca3c0a2c7f640300e7eb3d05e",
    },
    {
      path: "lib/github/client.ts",
      size: 2777,
      sha: "b9173a9f3fad69932cf10bfdec8a294524f016c0",
    },
    {
      path: "lib/github/errors.ts",
      size: 283,
      sha: "bf4ddacd3c0e64a24e6b9720c23b13d17b2da56f",
    },
    {
      path: "lib/github/parse-repository.test.ts",
      size: 1384,
      sha: "f6b6518e49c60a1a8fd8a57c627704ee00dd5a7e",
    },
    {
      path: "lib/github/parse-repository.ts",
      size: 1997,
      sha: "620d2435aa3200b1a72b58c21e54d589295d5394",
    },
    {
      path: "lib/github/types.ts",
      size: 855,
      sha: "28cb64108115cac10cfa5afcf50a6140a294b0b4",
    },
    {
      path: "lib/utils.ts",
      size: 634,
      sha: "5f350f359a09cf04afc7f04775a7037f02e9b27b",
    },
    {
      path: "next.config.ts",
      size: 126,
      sha: "a898b069b358873b734c0956a8e64b1b9755490c",
    },
    {
      path: "package.json",
      size: 1534,
      sha: "332e7a04e7723c42623c02da2e2caec2c725c188",
    },
    {
      path: "playwright.config.ts",
      size: 605,
      sha: "0f9ab81c80074b0bc96d0ad157e3043c8476100b",
    },
    {
      path: "pnpm-lock.yaml",
      size: 190933,
      sha: "140b6bfe0ed4df9f955062b497d7f5ee93b44f8e",
    },
    {
      path: "pnpm-workspace.yaml",
      size: 54,
      sha: "581a9d5b591dfcd01516bf429db120be05a6534f",
    },
    {
      path: "postcss.config.mjs",
      size: 92,
      sha: "2f8795a936c6fbca951780dd7da3eec156b43084",
    },
    {
      path: "tests/e2e/repository-city.spec.ts",
      size: 2536,
      sha: "f6933e16f80b804cd2d880cf1bc2da576000b32b",
    },
    {
      path: "tsconfig.json",
      size: 666,
      sha: "3a13f90a773b0facb675bf5b1a8239c8f33d36f5",
    },
    {
      path: "vitest.config.ts",
      size: 369,
      sha: "828400d0bc0e21087fb5cd8d8026847dc7caa64a",
    },
    {
      path: "vitest.setup.ts",
      size: 42,
      sha: "b9e76229961eddfc8ed9129ac11faeb5732aba1c",
    },
  ],
  relatedRepositories: [],
};

const demoProfileSnapshot: ProfileSnapshot = {
  owner: "parrisdigital",
  displayName: "Parris Digital",
  avatarUrl: "https://avatars.githubusercontent.com/u/9919?v=4",
  profileUrl: "https://github.com/parrisdigital",
  publicRepositoryCount: 1,
  truncated: false,
  repositories: [
    {
      id: repositoryCitySnapshot.repositoryId,
      owner: repositoryCitySnapshot.owner,
      repository: repositoryCitySnapshot.repository,
      description: repositoryCitySnapshot.description,
      language: "TypeScript",
      stars: 5,
      forks: 0,
      updatedAt: repositoryCitySnapshot.committedAt,
      defaultBranch: repositoryCitySnapshot.defaultBranch,
      license: repositoryCitySnapshot.license,
      canonicalUrl: repositoryCitySnapshot.canonicalUrl,
    },
  ],
};

export function createDemoKingdom(
  season: KingdomSeason = DEFAULT_KINGDOM_SEASON,
  worldTheme: KingdomWorldTheme = DEFAULT_KINGDOM_WORLD_THEME,
): KingdomWorld {
  return compileKingdom(repositoryCitySnapshot, { season, worldTheme });
}

export function createDemoUniverse(): RepositoryUniverse {
  return compileUniverse(demoProfileSnapshot);
}
