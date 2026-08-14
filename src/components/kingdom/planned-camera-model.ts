export type PlannedOverviewFitInput = Readonly<{
  viewportWidth: number;
  viewportHeight: number;
  projectedWidth: number;
  projectedHeight: number;
  repositoryProgress: number;
  portrait: boolean;
}>;

export type PlannedOverviewFit = Readonly<{
  margin: number;
  verticalOffsetPixels: number;
  zoom: number;
  viewportCoverageX: number;
  viewportCoverageY: number;
}>;

export type PlannedCameraTransitionDistances = Readonly<{
  position: number;
  target: number;
  zoom: number;
}>;

const LANDSCAPE_OVERVIEW_MARGIN = Object.freeze({ minimumScale: 1.44, maximumScale: 1.18 });
const PORTRAIT_OVERVIEW_MARGIN = Object.freeze({ minimumScale: 1.18, maximumScale: 1.08 });

const CAMERA_TRANSITION_RATE = 3.7;

/**
 * Moves a portrait overview below the persistent repository card and toward
 * the center of the remaining scene area. The cap keeps unusually tall phones
 * from pushing the floating silhouette into the bottom controls.
 */
export function plannedOverviewVerticalOffset(viewportHeight: number, portrait: boolean): number {
  return portrait ? Math.min(Math.max(1, viewportHeight) * 0.08, 72) : 0;
}

/** Frame-rate-independent interpolation used by the camera rig. */
export function plannedCameraTransitionAlpha(deltaSeconds: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  return 1 - Math.exp(-Math.max(0, deltaSeconds) * CAMERA_TRANSITION_RATE);
}

export function isPlannedCameraTransitionSettled({
  position,
  target,
  zoom,
}: PlannedCameraTransitionDistances): boolean {
  return position < 0.04 && target < 0.03 && zoom < 0.002;
}

/**
 * Keeps an overview wide enough to preserve the complete floating silhouette,
 * while allowing continuous repository scale to remain visible on screen.
 * Without this scale-aware margin, orthographic auto-fit normalizes every
 * repository to almost the same apparent footprint.
 */
export function plannedOverviewMargin(repositoryProgress: number, portrait: boolean): number {
  const progress = Number.isFinite(repositoryProgress)
    ? Math.min(1, Math.max(0, repositoryProgress))
    : 0;
  const range = portrait ? PORTRAIT_OVERVIEW_MARGIN : LANDSCAPE_OVERVIEW_MARGIN;
  return range.minimumScale + (range.maximumScale - range.minimumScale) * progress;
}

/** Pure orthographic fitting contract shared by the renderer and tests. */
export function fitPlannedOverview({
  viewportWidth,
  viewportHeight,
  projectedWidth,
  projectedHeight,
  repositoryProgress,
  portrait,
}: PlannedOverviewFitInput): PlannedOverviewFit {
  const safeViewportWidth = Math.max(1, viewportWidth);
  const safeViewportHeight = Math.max(1, viewportHeight);
  const safeProjectedWidth = Math.max(1, projectedWidth);
  const safeProjectedHeight = Math.max(1, projectedHeight);
  const margin = plannedOverviewMargin(repositoryProgress, portrait);
  const zoom = Math.max(
    1,
    Math.min(
      safeViewportWidth / (safeProjectedWidth * margin),
      safeViewportHeight / (safeProjectedHeight * margin),
    ),
  );

  return {
    margin,
    verticalOffsetPixels: plannedOverviewVerticalOffset(safeViewportHeight, portrait),
    zoom,
    viewportCoverageX: (safeProjectedWidth * zoom) / safeViewportWidth,
    viewportCoverageY: (safeProjectedHeight * zoom) / safeViewportHeight,
  };
}
