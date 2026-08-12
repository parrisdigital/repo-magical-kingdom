import { z } from "zod";

import { KingdomError } from "@/lib/kingdom/errors";

import type { RepositoryReference } from "./types";

const ownerSchema = z
  .string()
  .trim()
  .min(1)
  .max(39)
  .regex(/^(?!-)[A-Za-z0-9-]+(?<!-)$/, "Invalid GitHub owner");

const repositorySchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9._-]+$/, "Invalid GitHub repository");

const revisionSchema = z.string().trim().min(1).max(255);

export function parseGithubOwner(input: string): string {
  const candidate = input.trim().replace(/^@/, "");
  const parsed = ownerSchema.safeParse(candidate);

  if (!parsed.success) {
    throw new KingdomError("INVALID_INPUT", "Enter a valid GitHub owner.", {
      retryable: false,
    });
  }

  return parsed.data;
}

export function parseRepositoryReference(
  input: string,
  revision?: string | null,
): RepositoryReference {
  let candidate = input.trim();

  if (!candidate) {
    throw new KingdomError("INVALID_INPUT", "Enter a GitHub repository URL or owner/repository.", {
      retryable: false,
    });
  }

  if (/^https?:\/\//i.test(candidate)) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      throw new KingdomError("INVALID_INPUT", "The repository URL is not valid.", {
        retryable: false,
      });
    }

    if (url.hostname.toLowerCase() !== "github.com") {
      throw new KingdomError("INVALID_INPUT", "Only github.com repository URLs are supported.", {
        retryable: false,
      });
    }

    candidate = url.pathname.replace(/^\/+|\/+$/g, "");
  }

  candidate = candidate
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/g, "");
  const segments = candidate.split("/");

  if (segments.length !== 2) {
    throw new KingdomError("INVALID_INPUT", "Use the format owner/repository.", {
      retryable: false,
    });
  }

  const owner = ownerSchema.safeParse(segments[0]);
  const repository = repositorySchema.safeParse(segments[1]);
  const parsedRevision = revision ? revisionSchema.safeParse(revision) : null;

  if (!owner.success || !repository.success || (parsedRevision && !parsedRevision.success)) {
    throw new KingdomError("INVALID_INPUT", "The GitHub repository or revision is not valid.", {
      retryable: false,
    });
  }

  return {
    owner: owner.data,
    repository: repository.data,
    ...(parsedRevision ? { revision: parsedRevision.data } : {}),
  };
}
