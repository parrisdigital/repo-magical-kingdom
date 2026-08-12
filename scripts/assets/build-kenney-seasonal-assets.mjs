#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, parse, resolve } from "node:path";
import process from "node:process";

import { GLTF_TRANSFORM_VERSION, KENNEY_SEASONAL_PACKS } from "./kenney-seasonal-manifest.mjs";

function printHelp() {
  console.log(`Build the curated Kenney seasonal browser asset bundle.

Usage:
  node scripts/assets/build-kenney-seasonal-assets.mjs [options]

Options:
  --nature-archive <file>  Kenney Nature Kit 2.1 ZIP archive
  --holiday-archive <file> Kenney Holiday Kit 2.0 ZIP archive
  --collections <list>     Comma-separated subset: nature,holiday
  --output <dir>           Output root ending in /kenney
                           (default: public/assets/world/kenney)
  --help                   Show this help

The script never downloads third-party media. Obtain each archive from its
canonical Kenney page, review its CC0 declaration, and provide it locally.
Exact accepted archive hashes are pinned in kenney-seasonal-manifest.mjs.`);
}

function parseArguments(argv) {
  const values = {
    output: resolve("public/assets/world/kenney"),
    collections: new Set(Object.keys(KENNEY_SEASONAL_PACKS)),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help") {
      printHelp();
      process.exit(0);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);

    if (argument === "--nature-archive") values.natureArchive = resolve(value);
    else if (argument === "--holiday-archive") values.holidayArchive = resolve(value);
    else if (argument === "--output") values.output = resolve(value);
    else if (argument === "--collections") {
      values.collections = new Set(value.split(",").map((item) => item.trim()));
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
    index += 1;
  }

  if (basename(values.output) !== "kenney" || values.output === parse(values.output).root) {
    throw new Error("--output must be a dedicated directory whose final segment is 'kenney'");
  }

  for (const collection of values.collections) {
    if (!Object.hasOwn(KENNEY_SEASONAL_PACKS, collection)) {
      throw new Error(`Unknown collection: ${collection}`);
    }
    const archiveKey = `${collection}Archive`;
    if (!values[archiveKey]) throw new Error(`--${collection}-archive is required`);
  }

  return values;
}

async function sha256(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

function extractArchiveEntry(archive, entry) {
  const result = spawnSync("unzip", ["-p", archive, entry], {
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0 || !result.stdout?.length) {
    const detail = result.stderr?.toString("utf8").trim();
    throw new Error(
      `Unable to extract ${entry} from ${basename(archive)}${detail ? `: ${detail}` : ""}`,
    );
  }
  return result.stdout;
}

function optimize(input, output) {
  const result = spawnSync(
    "pnpm",
    [
      "dlx",
      `@gltf-transform/cli@${GLTF_TRANSFORM_VERSION}`,
      "optimize",
      input,
      output,
      "--compress",
      "meshopt",
      "--texture-compress",
      "webp",
      "--texture-size",
      "512",
      "--simplify",
      "false",
      "--join",
      "false",
      "--palette",
      "false",
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) throw new Error(`glTF Transform failed for ${basename(input)}`);
}

async function stagePack(archive, pack, temporaryDirectory) {
  const sourceRoot = resolve(temporaryDirectory, pack.sourceDirectory);
  await mkdir(sourceRoot, { recursive: true });

  for (const asset of pack.assets) {
    const entry = `${pack.sourceDirectory}/${asset}.glb`;
    await writeFile(resolve(sourceRoot, `${asset}.glb`), extractArchiveEntry(archive, entry));
  }
  for (const dependency of pack.dependencies) {
    const entry = `${pack.sourceDirectory}/${dependency}`;
    const destination = resolve(sourceRoot, dependency);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, extractArchiveEntry(archive, entry));
  }

  return sourceRoot;
}

async function buildPack(collection, archive, output, temporaryDirectory) {
  const pack = KENNEY_SEASONAL_PACKS[collection];
  const archiveHash = await sha256(archive);
  if (archiveHash !== pack.archiveSha256) {
    throw new Error(
      `${pack.title} ${pack.version} archive hash mismatch: expected ${pack.archiveSha256}, received ${archiveHash}`,
    );
  }

  const sourceRoot = await stagePack(archive, pack, resolve(temporaryDirectory, collection));
  const outputDirectory = resolve(output, collection);
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  for (const asset of pack.assets) {
    optimize(resolve(sourceRoot, `${asset}.glb`), resolve(outputDirectory, `${asset}.glb`));
  }

  const license = extractArchiveEntry(archive, pack.licenseEntry);
  const licenseHash = createHash("sha256").update(license).digest("hex");
  if (licenseHash !== pack.licenseSha256) {
    throw new Error(`${pack.title} ${pack.version} license hash mismatch`);
  }
  await mkdir(resolve(output, "licenses"), { recursive: true });
  await writeFile(resolve(output, "licenses", pack.licenseFileName), license);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "repo-magical-kenney-assets-"));

  try {
    if (options.collections.size === Object.keys(KENNEY_SEASONAL_PACKS).length) {
      await rm(resolve(options.output, "licenses"), { recursive: true, force: true });
    }
    for (const collection of options.collections) {
      await buildPack(
        collection,
        options[`${collection}Archive`],
        options.output,
        temporaryDirectory,
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
