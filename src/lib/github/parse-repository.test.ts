import { describe, expect, it } from "vitest";

import { KingdomError } from "@/lib/kingdom/errors";

import { parseGithubOwner, parseRepositoryReference } from "./parse-repository";

describe("parseRepositoryReference", () => {
  it.each([
    "parrisdigital/repo-magical-kingdom",
    "https://github.com/parrisdigital/repo-magical-kingdom",
    "https://github.com/parrisdigital/repo-magical-kingdom.git",
    "github.com/parrisdigital/repo-magical-kingdom",
  ])("canonicalizes %s", (input) => {
    expect(parseRepositoryReference(input, "main")).toEqual({
      owner: "parrisdigital",
      repository: "repo-magical-kingdom",
      revision: "main",
    });
  });

  it("rejects non-GitHub hosts", () => {
    expect(() => parseRepositoryReference("https://example.com/owner/repo")).toThrowError(
      KingdomError,
    );
  });

  it("rejects repository subpaths instead of guessing", () => {
    expect(() => parseRepositoryReference("owner/repo/tree/main")).toThrowError(
      "Use the format owner/repository",
    );
  });
});

describe("parseGithubOwner", () => {
  it("accepts an optional at-sign", () => {
    expect(parseGithubOwner("@parrisdigital")).toBe("parrisdigital");
  });

  it("rejects path separators", () => {
    expect(() => parseGithubOwner("owner/repo")).toThrowError(KingdomError);
  });
});
