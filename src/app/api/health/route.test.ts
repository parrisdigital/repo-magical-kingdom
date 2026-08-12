import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("health route", () => {
  it("reports the public runtime contract without secrets", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "operational",
      service: "repo-magical-kingdom",
      worldSchema: "repo-kingdom/v1",
      seasons: 4,
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(body)).not.toContain("GITHUB_TOKEN");
  });
});
