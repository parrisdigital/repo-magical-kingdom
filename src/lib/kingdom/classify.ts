import type { SourceFile } from "@/lib/github";

import type { FileCategory, OmissionSummary } from "./types";

type OmissionReason = OmissionSummary["reason"];

const GENERATED_SEGMENTS = new Set([
  "generated",
  "__generated__",
  "coverage",
  "dist",
  "build",
  ".next",
  ".cache",
]);
const VENDORED_SEGMENTS = new Set([
  "node_modules",
  "vendor",
  "vendors",
  "third_party",
  "third-party",
]);
const LOCKFILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "composer.lock",
  "poetry.lock",
  "cargo.lock",
  "gemfile.lock",
]);

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  rb: "Ruby",
  rs: "Rust",
  go: "Go",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  swift: "Swift",
  c: "C",
  h: "C",
  cc: "C++",
  cpp: "C++",
  cxx: "C++",
  hpp: "C++",
  cs: "C#",
  php: "PHP",
  scala: "Scala",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  fish: "Shell",
  sql: "SQL",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",
  vue: "Vue",
  svelte: "Svelte",
  json: "JSON",
  jsonc: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  xml: "XML",
  md: "Markdown",
  mdx: "MDX",
  rst: "reStructuredText",
  graphql: "GraphQL",
  gql: "GraphQL",
  proto: "Protocol Buffers",
  sol: "Solidity",
  ex: "Elixir",
  exs: "Elixir",
  dart: "Dart",
  lua: "Lua",
  r: "R",
  ipynb: "Jupyter Notebook",
};

const ASSET_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg",
  "ico",
  "glb",
  "gltf",
  "obj",
  "fbx",
  "hdr",
  "exr",
  "mp3",
  "wav",
  "ogg",
  "mp4",
  "webm",
  "woff",
  "woff2",
  "ttf",
  "otf",
]);

export type ClassifiedFile = SourceFile &
  Readonly<{
    category: FileCategory;
    language: string;
    rawProvince: string;
  }>;

function basename(path: string): string {
  return path.split("/").at(-1)?.toLowerCase() ?? path.toLowerCase();
}

function extension(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : "";
}

export function omissionReason(path: string): OmissionReason | null {
  const lowerPath = path.toLowerCase();
  const segments = lowerPath.split("/");
  const name = segments.at(-1) ?? lowerPath;

  if (segments.some((segment) => VENDORED_SEGMENTS.has(segment))) return "vendored";
  if (segments.some((segment) => GENERATED_SEGMENTS.has(segment))) return "generated";
  if (LOCKFILES.has(name)) return "lockfile";
  if (/\.min\.(?:js|css)$/.test(name)) return "minified";
  if (name.endsWith(".map")) return "source-map";
  return null;
}

export function classifyFile(file: SourceFile): ClassifiedFile {
  const lowerPath = file.path.toLowerCase();
  const name = basename(lowerPath);
  const ext = extension(lowerPath);
  const segments = lowerPath.split("/");
  let category: FileCategory = "source";

  if (
    segments.some(
      (segment) => segment === "test" || segment === "tests" || segment === "__tests__",
    ) ||
    /(?:^|\.|_)(?:test|spec)\.[^.]+$/.test(name)
  ) {
    category = "test";
  } else if (
    segments.some((segment) => segment === "docs" || segment === "documentation") ||
    /^(?:readme|changelog|contributing|security|code_of_conduct|license)(?:\.|$)/.test(name) ||
    ext === "md" ||
    ext === "mdx" ||
    ext === "rst"
  ) {
    category = "docs";
  } else if (
    name.startsWith(".") ||
    segments.includes(".github") ||
    /^(?:package|tsconfig|jsconfig|vite\.config|next\.config|eslint\.config|vitest\.config|playwright\.config)/.test(
      name,
    ) ||
    ["json", "jsonc", "yaml", "yml", "toml", "xml"].includes(ext)
  ) {
    category = "config";
  } else if (ASSET_EXTENSIONS.has(ext)) {
    category = "asset";
  } else if (!ext) {
    category = "other";
  }

  const rawProvince = file.path.includes("/") ? file.path.split("/")[0]! : "__root__";
  return {
    ...file,
    category,
    language:
      LANGUAGE_BY_EXTENSION[ext] ??
      (category === "asset" ? "Media" : ext ? ext.toUpperCase() : "Other"),
    rawProvince,
  };
}
