export type WildlifeWaypoint = readonly [number, number, number];

type WildlifeMotionSegment = Readonly<{
  start: WildlifeWaypoint;
  end: WildlifeWaypoint;
  length: number;
}>;

export type WildlifeMotion = Readonly<{
  segments: ReadonlyArray<WildlifeMotionSegment>;
  totalLength: number;
}>;

/**
 * Converts the planner's validated adjacent waypoints into a continuous
 * out-and-back route. The return leg retraces those same safe segments instead
 * of inventing an unchecked final-to-first shortcut.
 */
export function buildRetracedWildlifeMotion(
  wanderPath: ReadonlyArray<WildlifeWaypoint>,
): WildlifeMotion | null {
  const outward: WildlifeMotionSegment[] = [];
  for (let index = 1; index < wanderPath.length; index += 1) {
    const start = wanderPath[index - 1]!;
    const end = wanderPath[index]!;
    const length = Math.hypot(end[0] - start[0], end[2] - start[2]);
    if (length > 0.000_1) outward.push({ start, end, length });
  }
  if (outward.length === 0) return null;
  const returnTrip = [...outward].reverse().map((segment): WildlifeMotionSegment => ({
    start: segment.end,
    end: segment.start,
    length: segment.length,
  }));
  const segments = [...outward, ...returnTrip];
  return {
    segments,
    totalLength: segments.reduce((total, segment) => total + segment.length, 0),
  };
}
