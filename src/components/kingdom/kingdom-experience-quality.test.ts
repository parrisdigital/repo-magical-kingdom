import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./kingdom-experience.tsx", import.meta.url), "utf8");

describe("desktop visual-quality selection", () => {
  it("authors desktop as high quality without treating CPU count or reduced motion as GPU limits", () => {
    const start = source.indexOf("function useQualityTier(");
    const end = source.indexOf("function useDesktopWalkAvailability", start);
    const qualitySource = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(qualitySource).toContain('useState<"low" | "high">("high")');
    expect(qualitySource).toContain('setQuality(compact ? "low" : "high")');
    expect(qualitySource).not.toContain("hardwareConcurrency");
    expect(qualitySource).not.toContain("reducedMotion");
    expect(source).toContain("data-quality={quality}");
    expect(source).toContain('shadows={quality === "high" ? "percentage" : false}');
  });
});
