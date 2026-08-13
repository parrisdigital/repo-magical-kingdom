import { describe, expect, it } from "vitest";

import { buildRetracedWildlifeMotion } from "./wildlife-motion";

describe("buildRetracedWildlifeMotion", () => {
  it("uses only adjacent validated edges and retraces them to loop", () => {
    const first = [0, 1, 0] as const;
    const second = [3, 2, 4] as const;
    const third = [8, 3, 4] as const;

    const motion = buildRetracedWildlifeMotion([first, second, third]);

    expect(motion?.segments).toEqual([
      { start: first, end: second, length: 5 },
      { start: second, end: third, length: 5 },
      { start: third, end: second, length: 5 },
      { start: second, end: first, length: 5 },
    ]);
    expect(motion?.segments).not.toContainEqual({ start: third, end: first, length: 8 });
    expect(motion?.totalLength).toBe(20);
  });

  it("ignores zero-length edges and requires one usable segment", () => {
    const point = [2, 0, 2] as const;
    expect(buildRetracedWildlifeMotion([])).toBeNull();
    expect(buildRetracedWildlifeMotion([point, point])).toBeNull();
  });
});
