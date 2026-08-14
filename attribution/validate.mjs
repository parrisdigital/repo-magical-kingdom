import { createHash } from "node:crypto";
import { access, readdir, readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import process from "node:process";

const root = resolve(process.cwd());
const rootRealPath = await realpath(root);
const registryPath = resolve(root, "attribution", "registry.json");
const schemaPath = resolve(root, "attribution", "registry.schema.json");
const registry = JSON.parse(await readFile(registryPath, "utf8"));
const registrySchema = JSON.parse(await readFile(schemaPath, "utf8"));
const packageManifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const errors = [];

const requiredFiles = [
  "LICENSE",
  "NOTICE",
  "ACKNOWLEDGEMENTS.md",
  "THIRD_PARTY_NOTICES.md",
  "CITATION.cff",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  "GOVERNANCE.md",
  "MAINTAINERS.md",
  "SUPPORT.md",
  "CHANGELOG.md",
  "DCO",
];

for (const file of requiredFiles) {
  try {
    await access(resolve(root, file));
  } catch {
    errors.push(`required open-source file is missing: ${file}`);
  }
}

const supportedSchemaKeywords = new Set([
  "$defs",
  "$id",
  "$ref",
  "$schema",
  "additionalProperties",
  "allOf",
  "const",
  "description",
  "else",
  "enum",
  "format",
  "if",
  "items",
  "minItems",
  "minLength",
  "minProperties",
  "pattern",
  "properties",
  "required",
  "then",
  "title",
  "type",
  "uniqueItems",
]);

function inspectSchemaKeywords(schema, path = "$schema") {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return;

  for (const keyword of Object.keys(schema)) {
    if (!supportedSchemaKeywords.has(keyword)) {
      errors.push(`${path}: unsupported JSON Schema keyword ${keyword}`);
    }
  }

  for (const [key, child] of Object.entries(schema.properties || {})) {
    inspectSchemaKeywords(child, `${path}.properties.${key}`);
  }
  for (const [key, child] of Object.entries(schema.$defs || {})) {
    inspectSchemaKeywords(child, `${path}.$defs.${key}`);
  }
  if (schema.items && typeof schema.items === "object") {
    inspectSchemaKeywords(schema.items, `${path}.items`);
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    inspectSchemaKeywords(schema.additionalProperties, `${path}.additionalProperties`);
  }
  for (const [index, child] of (schema.allOf || []).entries()) {
    inspectSchemaKeywords(child, `${path}.allOf[${index}]`);
  }
  for (const keyword of ["if", "then", "else"]) {
    if (schema[keyword] && typeof schema[keyword] === "object") {
      inspectSchemaKeywords(schema[keyword], `${path}.${keyword}`);
    }
  }
}

function decodeJsonPointerToken(token) {
  return token.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveSchemaReference(reference) {
  if (!reference.startsWith("#/")) {
    throw new Error(`only local JSON Schema references are supported: ${reference}`);
  }

  let target = registrySchema;
  for (const token of reference.slice(2).split("/").map(decodeJsonPointerToken)) {
    target = target?.[token];
  }
  if (!target || typeof target !== "object") {
    throw new Error(`JSON Schema reference does not resolve: ${reference}`);
  }
  return target;
}

function isJsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function valueMatchesType(value, type) {
  switch (type) {
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    default:
      return false;
  }
}

function validateFormat(value, format) {
  if (typeof value !== "string") return true;
  if (format === "uri") {
    try {
      const url = new URL(value);
      return Boolean(url.protocol);
    } catch {
      return false;
    }
  }
  if (format === "date-time") {
    return (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      !Number.isNaN(Date.parse(value))
    );
  }
  return false;
}

function validateAgainstSchema(value, schema, path, findings) {
  if (schema.$ref) {
    validateAgainstSchema(value, resolveSchemaReference(schema.$ref), path, findings);
    return;
  }

  if (schema.const !== undefined && !isJsonEqual(value, schema.const)) {
    findings.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  }
  if (schema.enum && !schema.enum.some((candidate) => isJsonEqual(candidate, value))) {
    findings.push(`${path}: must be one of ${schema.enum.map(JSON.stringify).join(", ")}`);
  }

  if (schema.type) {
    const acceptedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!acceptedTypes.some((type) => valueMatchesType(value, type))) {
      findings.push(`${path}: must have type ${acceptedTypes.join(" or ")}`);
      return;
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      findings.push(`${path}: must contain at least ${schema.minLength} character(s)`);
    }
    if (schema.pattern !== undefined) {
      try {
        if (!new RegExp(schema.pattern).test(value)) {
          findings.push(`${path}: must match ${schema.pattern}`);
        }
      } catch {
        findings.push(`${path}: schema contains an invalid regular expression`);
      }
    }
    if (schema.format && !validateFormat(value, schema.format)) {
      findings.push(`${path}: must be a valid ${schema.format}`);
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      findings.push(`${path}: must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        findings.push(`${path}: must not contain duplicate items`);
      }
    }
    if (schema.items) {
      for (const [index, item] of value.entries()) {
        validateAgainstSchema(item, schema.items, `${path}[${index}]`, findings);
      }
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) {
      findings.push(`${path}: must contain at least ${schema.minProperties} property/properties`);
    }
    for (const requiredProperty of schema.required || []) {
      if (!Object.hasOwn(value, requiredProperty)) {
        findings.push(`${path}: missing required property ${requiredProperty}`);
      }
    }
    for (const [key, childValue] of Object.entries(value)) {
      if (schema.properties?.[key]) {
        validateAgainstSchema(childValue, schema.properties[key], `${path}.${key}`, findings);
      } else if (schema.additionalProperties === false) {
        findings.push(`${path}: unexpected property ${key}`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateAgainstSchema(childValue, schema.additionalProperties, `${path}.${key}`, findings);
      }
    }
  }

  for (const childSchema of schema.allOf || []) {
    validateAgainstSchema(value, childSchema, path, findings);
  }

  if (schema.if) {
    const conditionFindings = [];
    validateAgainstSchema(value, schema.if, path, conditionFindings);
    if (conditionFindings.length === 0 && schema.then) {
      validateAgainstSchema(value, schema.then, path, findings);
    }
    if (conditionFindings.length > 0 && schema.else) {
      validateAgainstSchema(value, schema.else, path, findings);
    }
  }
}

inspectSchemaKeywords(registrySchema);
try {
  validateAgainstSchema(registry, registrySchema, "$", errors);
} catch (error) {
  errors.push(`registry schema validation could not run: ${error.message}`);
}

function normalizeRepositoryPath(value, label) {
  if (typeof value !== "string") return null;
  if (value.length === 0 || value.includes("\0") || value.includes("\\") || isAbsolute(value)) {
    errors.push(`${label}: must be a non-empty, relative POSIX path`);
    return null;
  }

  const normalized = posix.normalize(value);
  if (
    normalized !== value ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    errors.push(`${label}: path is not safely normalized: ${value}`);
    return null;
  }

  const target = resolve(root, ...normalized.split("/"));
  const relation = relative(root, target);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    errors.push(`${label}: path escapes the repository: ${value}`);
    return null;
  }
  return normalized;
}

async function assertExistingContainedPath(value, label, options = {}) {
  const normalized = normalizeRepositoryPath(value, label);
  if (!normalized) return null;

  const target = resolve(root, ...normalized.split("/"));
  try {
    await access(target);
  } catch {
    errors.push(`${label}: path does not exist: ${normalized}`);
    return null;
  }

  const targetRealPath = await realpath(target);
  const relation = relative(rootRealPath, targetRealPath);
  if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    errors.push(`${label}: path resolves outside the repository: ${normalized}`);
    return null;
  }
  if (options.fileOnly && !(await stat(target)).isFile()) {
    errors.push(`${label}: path must resolve to a file: ${normalized}`);
    return null;
  }
  return normalized;
}

const entries = Array.isArray(registry.entries) ? registry.entries : [];
const ids = new Set();
const packageEntries = new Map();
const redistributedFiles = new Set();

for (const [index, entry] of entries.entries()) {
  const label = entry?.id || `entry ${index}`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

  if (ids.has(entry.id)) errors.push(`${label}: duplicate id`);
  ids.add(entry.id);

  if (entry.license?.status === "declared" && (!entry.license.spdx || !entry.license.url)) {
    errors.push(`${label}: declared licenses require an SPDX identifier and canonical URL`);
  }
  if (
    entry.license?.status === "not-declared" &&
    (entry.license.spdx !== null || entry.license.url !== null)
  ) {
    errors.push(`${label}: not-declared licenses must use null SPDX and URL values`);
  }

  if (entry.kind === "runtime-dependency" && (!entry.packageName || !entry.version)) {
    errors.push(`${label}: runtime dependencies require packageName and version`);
  }
  if (entry.packageName && entry.kind !== "runtime-dependency") {
    errors.push(`${label}: packageName is only valid for runtime-dependency entries`);
  }
  if (
    entry.kind === "runtime-dependency" &&
    !["bundled-runtime", "package-install-only"].includes(entry.distribution)
  ) {
    errors.push(`${label}: runtime dependencies require a package distribution mode`);
  }
  if (entry.generatedMediaProvenance && entry.kind !== "generated-media") {
    errors.push(`${label}: generatedMediaProvenance is only valid for generated-media entries`);
  }

  if (
    ["bundled-runtime", "package-install-only", "standalone-files"].includes(entry.distribution) &&
    entry.license?.status !== "declared"
  ) {
    errors.push(`${label}: distributed packages and files require a declared license`);
  }

  const locations = Array.isArray(entry.projectLocations) ? entry.projectLocations : [];
  for (const location of locations) {
    await assertExistingContainedPath(location, `${label}: project location`);
  }

  const files = Array.isArray(entry.redistributedFiles) ? entry.redistributedFiles : [];
  if (files.length > 0 && entry.distribution === "not-distributed") {
    errors.push(`${label}: not-distributed entries cannot register redistributed files`);
  }
  if (
    files.length > 0 &&
    entry.license?.status !== "declared" &&
    entry.kind !== "generated-media"
  ) {
    errors.push(`${label}: cannot redistribute files without a declared license`);
  }

  const normalizedFiles = new Set();
  for (const file of files) {
    const normalized = await assertExistingContainedPath(file, `${label}: redistributed file`, {
      fileOnly: true,
    });
    if (!normalized) continue;
    if (redistributedFiles.has(normalized)) {
      errors.push(`${label}: redistributed file is registered more than once: ${normalized}`);
    }
    redistributedFiles.add(normalized);
    normalizedFiles.add(normalized);

    const expectedHash = entry.contentHashes?.[normalized];
    if (!expectedHash) {
      errors.push(`${label}: redistributed file has no content hash: ${normalized}`);
      continue;
    }

    const content = await readFile(resolve(root, ...normalized.split("/")));
    const actualHash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    if (actualHash !== expectedHash) {
      errors.push(`${label}: content hash is stale for ${normalized}`);
    }
  }

  for (const hashPath of Object.keys(entry.contentHashes || {})) {
    const normalized = normalizeRepositoryPath(hashPath, `${label}: content hash path`);
    if (normalized && !normalizedFiles.has(normalized)) {
      errors.push(
        `${label}: content hash does not correspond to redistributedFiles: ${normalized}`,
      );
    }
  }

  if (entry.kind === "generated-media") {
    const references = entry.generatedMediaProvenance?.referenceAssets;
    if (Array.isArray(references)) {
      for (const [referenceIndex, reference] of references.entries()) {
        if (reference?.localFile) {
          await assertExistingContainedPath(
            reference.localFile,
            `${label}: referenceAssets[${referenceIndex}].localFile`,
            { fileOnly: true },
          );
        }
      }
    }
  }

  if (entry.packageName) {
    if (packageEntries.has(entry.packageName)) {
      errors.push(`${label}: duplicate package registration for ${entry.packageName}`);
    }
    packageEntries.set(entry.packageName, entry);
  }
}

for (const [packageName, version] of Object.entries(packageManifest.dependencies || {})) {
  const entry = packageEntries.get(packageName);
  if (!entry) {
    errors.push(`direct runtime dependency is not registered: ${packageName}`);
    continue;
  }
  if (entry.version !== version) {
    errors.push(
      `${packageName}: registry version ${entry.version} does not match package.json ${version}`,
    );
  }
}

for (const packageName of packageEntries.keys()) {
  if (!packageManifest.dependencies?.[packageName]) {
    errors.push(`registered runtime package is not in package.json dependencies: ${packageName}`);
  }
}

const assetExtensions = new Set([
  ".3ds",
  ".aac",
  ".avif",
  ".basis",
  ".blend",
  ".comp",
  ".dae",
  ".dds",
  ".exr",
  ".fbx",
  ".flac",
  ".frag",
  ".gif",
  ".geom",
  ".glb",
  ".glsl",
  ".gltf",
  ".hdr",
  ".ico",
  ".jpeg",
  ".jpg",
  ".ktx",
  ".ktx2",
  ".m4a",
  ".mov",
  ".mp3",
  ".mp4",
  ".mtl",
  ".obj",
  ".ogg",
  ".oga",
  ".opus",
  ".otf",
  ".ply",
  ".png",
  ".stl",
  ".svg",
  ".tesc",
  ".tese",
  ".tga",
  ".tif",
  ".tiff",
  ".ttf",
  ".usdz",
  ".vert",
  ".wav",
  ".webm",
  ".webp",
  ".wgsl",
  ".woff",
  ".woff2",
]);

const ignoredDirectories = new Set([
  ".cache",
  ".git",
  ".next",
  ".pnpm-store",
  ".turbo",
  ".vercel",
  ".yarn",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);

// Visual gauntlet captures are reproducible, gitignored QA output rather than
// redistributed project assets. Keep the attribution scan aligned with that
// shipping boundary so a local review run cannot make license validation
// nondeterministic.
const ignoredAssetDirectoryPaths = new Set(["artifacts/visual-review"]);

async function collectRepositoryAssets(directory, repositoryPath = "") {
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  const assets = [];

  for (const entry of directoryEntries) {
    if (entry.name === ".DS_Store") continue;
    const fullPath = resolve(directory, entry.name);
    const entryRepositoryPath = repositoryPath ? `${repositoryPath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (
        !ignoredDirectories.has(entry.name) &&
        !ignoredAssetDirectoryPaths.has(entryRepositoryPath)
      ) {
        assets.push(...(await collectRepositoryAssets(fullPath, entryRepositoryPath)));
      }
      continue;
    }
    if (entry.isFile() && assetExtensions.has(extname(entry.name).toLowerCase())) {
      assets.push(relative(root, fullPath).split(sep).join("/"));
    }
  }
  return assets;
}

const repositoryAssets = (await collectRepositoryAssets(root)).sort();
for (const asset of repositoryAssets) {
  if (!redistributedFiles.has(asset)) {
    errors.push(`repository asset is not registered: ${asset}`);
  }
}

if (errors.length > 0) {
  console.error("Attribution validation failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Attribution registry valid against registry.schema.json: ${entries.length} entries, ${repositoryAssets.length} repository assets.`,
);
