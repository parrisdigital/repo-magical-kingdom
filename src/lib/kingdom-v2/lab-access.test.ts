import { describe, expect, it } from "vitest";

import { isRepositoryWorldsV2LabEnabled } from "./lab-access";

describe("Repository Worlds V2 lab access", () => {
  it("allows local development and Vercel Preview deployments", () => {
    expect(isRepositoryWorldsV2LabEnabled({ nodeEnvironment: "development" })).toBe(true);
    expect(
      isRepositoryWorldsV2LabEnabled({
        nodeEnvironment: "production",
        vercelEnvironment: "preview",
      }),
    ).toBe(true);
  });

  it("keeps production closed unless its explicit server-side flag is enabled", () => {
    expect(
      isRepositoryWorldsV2LabEnabled({
        nodeEnvironment: "production",
        vercelEnvironment: "production",
      }),
    ).toBe(false);
    expect(
      isRepositoryWorldsV2LabEnabled({
        nodeEnvironment: "production",
        vercelEnvironment: "production",
        explicitFlag: "1",
      }),
    ).toBe(true);
  });
});
