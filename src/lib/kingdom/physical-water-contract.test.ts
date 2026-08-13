import { describe, expect, it } from "vitest";

import {
  canonicalLakeNormalizedRadius,
  type PhysicalLakeContract,
  routePhysicalCourseSegmentsAroundTerraces,
  segmentToExpandedEllipseDistance,
} from "./physical-water-contract";

function normalizedAngle(angle: number): number {
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

describe("canonical physical lake", () => {
  it("selects shoreline chords by ellipse-normalized angle for non-circular lakes", () => {
    const center = { x: 37, z: -23 };
    const radiusX = 48;
    const radiusZ = 6;
    const segmentCount = 24;
    const perimeter = Array.from({ length: segmentCount }, (_, index) => {
      const angle = (index / segmentCount) * Math.PI * 2;
      const multiplier = 0.92 + Math.sin(angle * 3 + 0.4) * 0.055 + Math.cos(angle * 5) * 0.025;
      return {
        x: center.x + Math.cos(angle) * radiusX * multiplier,
        z: center.z + Math.sin(angle) * radiusZ * multiplier,
      };
    });
    const lake: PhysicalLakeContract = {
      center,
      radiusX,
      radiusZ,
      surfaceHeight: 0,
      area: 0,
      footprintRatio: 0,
      inletAngle: -Math.PI / 2,
      perimeter,
      islet: {
        center,
        radiusX: 1,
        radiusZ: 1,
        rotation: 0,
      },
    };
    let worldAngleMismatchCount = 0;

    for (let index = 0; index < perimeter.length; index += 1) {
      const first = perimeter[index]!;
      const second = perimeter[(index + 1) % perimeter.length]!;
      const edgeProgress = 0.37;
      const boundary = {
        x: first.x + (second.x - first.x) * edgeProgress,
        z: first.z + (second.z - first.z) * edgeProgress,
      };
      const deltaX = boundary.x - center.x;
      const deltaZ = boundary.z - center.z;
      const ellipseAngle = normalizedAngle(Math.atan2(deltaZ / radiusZ, deltaX / radiusX));
      const worldAngle = normalizedAngle(Math.atan2(deltaZ, deltaX));
      const ellipseIndex = Math.floor((ellipseAngle / (Math.PI * 2)) * segmentCount);
      const worldIndex = Math.floor((worldAngle / (Math.PI * 2)) * segmentCount);

      expect(ellipseIndex, `ellipse edge index ${index}`).toBe(index);
      if (worldIndex !== ellipseIndex) worldAngleMismatchCount += 1;

      for (const radialDepth of [0.17, 0.61, 1, 1.28]) {
        const x = center.x + deltaX * radialDepth;
        const z = center.z + deltaZ * radialDepth;
        expect(
          canonicalLakeNormalizedRadius(lake, x, z),
          `edge ${index} at radial depth ${radialDepth}`,
        ).toBeCloseTo(radialDepth, 10);
      }
    }

    // The high-eccentricity fixture must exercise the regression: ordinary
    // world angles select different polygon edges through most of the ellipse.
    expect(worldAngleMismatchCount).toBeGreaterThan(segmentCount / 2);
  });
});

describe("physical water course routing", () => {
  it("retains authored curvature when the endpoints already provide a wide span", () => {
    const envelope = {
      minX: -80,
      maxX: 80,
      minZ: -60,
      maxZ: 60,
      width: 160,
      depth: 120,
      center: { x: 0, z: 0 },
      safeMargin: 8,
    } as const;
    const outline = [
      { x: -72, z: -52 },
      { x: 72, z: -52 },
      { x: 72, z: 52 },
      { x: -72, z: 52 },
    ];
    const start = { x: -28, z: -42 };
    const target = { x: 24, z: 42 };
    const guide = [start, { x: 30, z: -18 }, { x: -18, z: 2 }, { x: 34, z: 22 }, target];

    const routed = routePhysicalCourseSegmentsAroundTerraces(guide, [], 8, envelope, outline, 1);
    const chordXAtZ = (z: number) =>
      start.x + ((z - start.z) / (target.z - start.z)) * (target.x - start.x);
    const maximumDeviation = Math.max(
      0,
      ...routed.slice(1, -1).map(({ x, z }) => Math.abs(x - chordXAtZ(z))),
    );

    expect(routed[0]).toBe(start);
    expect(routed.at(-1)).toBe(target);
    expect(target.x - start.x).toBeGreaterThan(envelope.width * 0.09);
    expect(maximumDeviation).toBeGreaterThan(envelope.width * 0.08);
    expect(routed.length).toBeLessThanOrEqual(16);
  });

  it("preserves explicit endpoints while retaining a safe authored meander", () => {
    const envelope = {
      minX: -80,
      maxX: 80,
      minZ: -60,
      maxZ: 60,
      width: 160,
      depth: 120,
      center: { x: 0, z: 0 },
      safeMargin: 8,
    } as const;
    const outline = [
      { x: -72, z: -52 },
      { x: 72, z: -52 },
      { x: 72, z: 52 },
      { x: -72, z: 52 },
    ];
    const start = { x: -24, z: -42 };
    const guide = { x: 28, z: 0 };
    const target = { x: -24, z: 42 };
    const terrace = {
      id: "endpoint-contract-terrace",
      center: { x: 0, z: 0 },
      radiusX: 7,
      radiusZ: 5,
    };
    const sourceWidth = 8;
    const clearance = sourceWidth * 1.42 * 0.5 + 5.5;

    const routed = routePhysicalCourseSegmentsAroundTerraces(
      [start, guide, target],
      [terrace],
      sourceWidth,
      envelope,
      outline,
      1,
    );

    expect(routed[0]).toBe(start);
    expect(routed.at(-1)).toBe(target);
    expect(
      Math.max(...routed.map(({ x }) => x)) - Math.min(...routed.map(({ x }) => x)),
    ).toBeGreaterThan(envelope.width * 0.09);
    for (let index = 1; index < routed.length; index += 1) {
      expect(
        segmentToExpandedEllipseDistance(routed[index - 1]!, routed[index]!, terrace, clearance),
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("uses visibility-graph detours when an expanded terrace blocks the guide", () => {
    const envelope = {
      minX: -80,
      maxX: 80,
      minZ: -60,
      maxZ: 60,
      width: 160,
      depth: 120,
      center: { x: 0, z: 0 },
      safeMargin: 8,
    } as const;
    const outline = [
      { x: -72, z: -52 },
      { x: 72, z: -52 },
      { x: 72, z: 52 },
      { x: -72, z: 52 },
    ];
    const start = { x: -12, z: -44 };
    const target = { x: 12, z: 44 };
    const guide = [start, { x: 14, z: -14 }, { x: -14, z: 14 }, target];
    const terrace = {
      id: "obstacle-wall",
      center: { x: 0, z: 0 },
      radiusX: 30,
      radiusZ: 8,
    };
    const sourceWidth = 8;
    const clearance = sourceWidth * 1.42 * 0.5 + 5.5;

    expect(segmentToExpandedEllipseDistance(start, target, terrace, clearance)).toBeLessThan(1);

    const routed = routePhysicalCourseSegmentsAroundTerraces(
      guide,
      [terrace],
      sourceWidth,
      envelope,
      outline,
      -1,
    );

    expect(routed[0]).toBe(start);
    expect(routed.at(-1)).toBe(target);
    expect(routed.length).toBeGreaterThan(2);
    expect(routed.length).toBeLessThanOrEqual(16);
    for (let index = 1; index < routed.length; index += 1) {
      expect(
        segmentToExpandedEllipseDistance(routed[index - 1]!, routed[index]!, terrace, clearance),
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
