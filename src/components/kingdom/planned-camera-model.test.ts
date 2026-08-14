import { describe, expect, it } from "vitest";

import { deriveRepositoryPlanningScale } from "@/lib/kingdom/repository-scale";

import {
  fitPlannedOverview,
  isPlannedCameraTransitionSettled,
  plannedCameraTransitionAlpha,
  plannedOverviewMargin,
  plannedOverviewVerticalOffset,
} from "./planned-camera-model";

const REPOSITORY_PROGRESS_SAMPLES = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;

describe("planned overview camera", () => {
  it("makes continuous repository scale perceptible instead of normalizing every world", () => {
    const coverage = REPOSITORY_PROGRESS_SAMPLES.map((repositoryProgress) =>
      fitPlannedOverview({
        viewportWidth: 1_440,
        viewportHeight: 900,
        projectedWidth: 250,
        projectedHeight: 180,
        repositoryProgress,
        portrait: false,
      }),
    );

    for (let index = 1; index < coverage.length; index += 1) {
      expect(coverage[index]!.margin).toBeLessThan(coverage[index - 1]!.margin);
      expect(coverage[index]!.viewportCoverageX).toBeGreaterThan(
        coverage[index - 1]!.viewportCoverageX,
      );
    }
    expect(coverage.at(-1)!.viewportCoverageX).toBeGreaterThan(
      coverage[0]!.viewportCoverageX * 1.2,
    );
  });

  it("remains continuous across every former scale-tier boundary", () => {
    for (const boundary of [64, 512, 4_096]) {
      const fits = [boundary - 1, boundary, boundary + 1].map((eligibleFiles) =>
        fitPlannedOverview({
          viewportWidth: 1_440,
          viewportHeight: 900,
          projectedWidth: 250,
          projectedHeight: 180,
          repositoryProgress: deriveRepositoryPlanningScale(eligibleFiles).logarithmicProgress,
          portrait: false,
        }),
      );

      for (let index = 1; index < fits.length; index += 1) {
        expect(fits[index]!.margin).toBeLessThanOrEqual(fits[index - 1]!.margin);
        expect(fits[index]!.viewportCoverageX).toBeGreaterThanOrEqual(
          fits[index - 1]!.viewportCoverageX,
        );
        expect(Math.abs(fits[index]!.margin - fits[index - 1]!.margin)).toBeLessThan(0.001);
        expect(
          Math.abs(fits[index]!.viewportCoverageX - fits[index - 1]!.viewportCoverageX),
        ).toBeLessThan(0.001);
      }
    }
  });

  it("keeps the complete silhouette inside desktop and portrait viewports", () => {
    for (const repositoryProgress of REPOSITORY_PROGRESS_SAMPLES) {
      const desktop = fitPlannedOverview({
        viewportWidth: 1_440,
        viewportHeight: 900,
        projectedWidth: 286,
        projectedHeight: 254,
        repositoryProgress,
        portrait: false,
      });
      const portrait = fitPlannedOverview({
        viewportWidth: 390,
        viewportHeight: 844,
        projectedWidth: 286,
        projectedHeight: 254,
        repositoryProgress,
        portrait: true,
      });

      expect(Math.max(desktop.viewportCoverageX, desktop.viewportCoverageY)).toBeLessThan(1);
      expect(Math.max(portrait.viewportCoverageX, portrait.viewportCoverageY)).toBeLessThan(1);
      expect(desktop.margin).toBeGreaterThan(1);
      expect(portrait.margin).toBeGreaterThan(1);
    }
  });

  it("uses a conservative portrait fit without erasing the scale ordering", () => {
    expect(plannedOverviewMargin(0, true)).toBeGreaterThan(plannedOverviewMargin(1, true));
    expect(plannedOverviewMargin(1, true)).toBeGreaterThan(1);
  });

  it("clamps out-of-range progress without introducing a camera discontinuity", () => {
    expect(plannedOverviewMargin(-1, false)).toBe(plannedOverviewMargin(0, false));
    expect(plannedOverviewMargin(2, false)).toBe(plannedOverviewMargin(1, false));
    expect(plannedOverviewMargin(Number.NaN, false)).toBe(plannedOverviewMargin(0, false));
  });

  it("centers portrait worlds in the usable scene below the repository card", () => {
    expect(plannedOverviewVerticalOffset(844, true)).toBeCloseTo(67.52);
    expect(plannedOverviewVerticalOffset(1_200, true)).toBe(72);
    expect(plannedOverviewVerticalOffset(900, false)).toBe(0);
  });

  it("uses frame-rate-independent camera easing and includes zoom in convergence", () => {
    const sixtyFpsAlpha = plannedCameraTransitionAlpha(1 / 60, false);
    const thirtyFpsAlpha = plannedCameraTransitionAlpha(1 / 30, false);
    expect(1 - (1 - sixtyFpsAlpha) ** 60).toBeCloseTo(1 - Math.exp(-3.7), 8);
    expect(1 - (1 - thirtyFpsAlpha) ** 30).toBeCloseTo(1 - Math.exp(-3.7), 8);
    expect(plannedCameraTransitionAlpha(1 / 60, true)).toBe(1);
    expect(isPlannedCameraTransitionSettled({ position: 0.039, target: 0.029, zoom: 0.001 })).toBe(
      true,
    );
    expect(isPlannedCameraTransitionSettled({ position: 0.039, target: 0.029, zoom: 0.01 })).toBe(
      false,
    );
  });
});
