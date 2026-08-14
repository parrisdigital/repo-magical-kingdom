"use client";

import { PerspectiveCamera, PointerLockControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { WorldPlan } from "@/lib/kingdom/world-plan";

import type { PlannedLandUse } from "./planned-land-use";
import {
  advanceWalkMotion,
  clearWalkInputState,
  constrainWalkMotionForResolution,
  createWalkInputState,
  createWalkMotionState,
  findWalkSpawn,
  normalizedWalkAxisScale,
  resolveWalkStep,
  sampleWalkNavigationHeight,
  updateWalkInputState,
  walkActionForKey,
  walkForwardAxis,
  walkNavigationGridAllows,
  walkRightAxis,
  walkSpeedForPlan,
  WALK_EYE_HEIGHT,
  type WalkNavigationGrid,
  type WalkObstacle,
} from "./kingdom-navigation-model";
import {
  acquireWalkTarget,
  createWalkLocationRegions,
  createWalkTargetPrompt,
  walkCompassHeading,
  walkLocationLabel,
  type LivingWalkSpawn,
  type WalkTarget,
  type WalkViewStatus,
} from "./kingdom-walk-experience-model";

type KingdomWalkControlsProps = Readonly<{
  plan: WorldPlan;
  landUse: PlannedLandUse;
  obstacles: ReadonlyArray<WalkObstacle>;
  navigationGrid: WalkNavigationGrid;
  livingSpawn: LivingWalkSpawn | null;
  targets?: ReadonlyArray<WalkTarget>;
  reducedMotion: boolean;
  onLockChange: (locked: boolean) => void;
  onStatusChange?: (status: WalkViewStatus) => void;
  onTargetSelect?: (target: WalkTarget) => void;
}>;

type PointerLockRequest = (() => void | PromiseLike<void>) | undefined;

/**
 * Pointer lock is permission-gated and may reject in embedded/automated
 * browsers. Always settle that browser promise inside our interaction
 * boundary so a denial never becomes an unhandled rejection.
 */
export async function settlePointerLockRequest(request: PointerLockRequest): Promise<boolean> {
  if (!request) return false;
  try {
    await request();
    return true;
  } catch {
    return false;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(?:INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName))
  );
}

export function KingdomWalkControls({
  plan,
  landUse,
  obstacles,
  navigationGrid,
  livingSpawn,
  targets = [],
  reducedMotion,
  onLockChange,
  onStatusChange,
  onTargetSelect,
}: KingdomWalkControlsProps) {
  const camera = useRef<THREE.PerspectiveCamera>(null);
  const controls = useRef<React.ElementRef<typeof PointerLockControls>>(null);
  const input = useRef(createWalkInputState());
  const motion = useRef(createWalkMotionState());
  const onTargetSelectRef = useRef(onTargetSelect);
  const locked = useRef(false);
  const activeTarget = useRef<WalkTarget | null>(null);
  const publishedHeading = useRef<WalkViewStatus["heading"] | null>(null);
  const publishedLocationLabel = useRef<string | null>(null);
  const publishedTargetId = useRef<string | null>(null);
  const publishedTargetDistance = useRef(-1);
  const forward = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  const locationRegions = useMemo(() => createWalkLocationRegions(plan), [plan]);
  const spawn = useMemo(
    () => livingSpawn?.position ?? findWalkSpawn(plan, obstacles, landUse, navigationGrid),
    [landUse, livingSpawn, navigationGrid, obstacles, plan],
  );
  const invalidate = useThree((state) => state.invalidate);
  const pointerLockElement = useThree((state) => state.gl.domElement);
  const speed = walkSpeedForPlan(plan, reducedMotion);
  const initialLocationLabel = livingSpawn?.locationLabel ?? "Repository frontier";

  const publishStatus = useCallback(
    (
      heading: WalkViewStatus["heading"],
      locationLabel: string,
      target: WalkTarget | null,
      distance: number,
    ) => {
      const activeCamera = camera.current;
      if (!activeCamera) return;
      const targetId = target?.id ?? null;
      if (
        publishedHeading.current === heading &&
        publishedLocationLabel.current === locationLabel &&
        publishedTargetId.current === targetId &&
        publishedTargetDistance.current === distance
      ) {
        return;
      }
      publishedHeading.current = heading;
      publishedLocationLabel.current = locationLabel;
      publishedTargetId.current = targetId;
      publishedTargetDistance.current = distance;
      onStatusChange?.({
        heading,
        locationLabel,
        target: target
          ? createWalkTargetPrompt(
              target,
              activeCamera.position.x,
              activeCamera.position.y,
              activeCamera.position.z,
            )
          : null,
      });
    },
    [onStatusChange],
  );

  const canOccupy = useCallback(
    (x: number, z: number) => walkNavigationGridAllows(navigationGrid, x, z),
    [navigationGrid],
  );

  const clearInput = useCallback(() => {
    input.current = clearWalkInputState();
  }, []);

  const selectActiveTarget = useCallback(() => {
    const target = activeTarget.current;
    if (!target) return;
    controls.current?.unlock();
    onTargetSelectRef.current?.(target);
  }, []);

  useEffect(() => {
    onTargetSelectRef.current = onTargetSelect;
  }, [onTargetSelect]);

  useLayoutEffect(() => {
    if (!camera.current || !spawn) return;
    camera.current.position.set(spawn.x, spawn.y, spawn.z);
    const target = livingSpawn?.lookTarget ?? plan.topology.camera.entry.target;
    const targetHeight = livingSpawn
      ? target.y
      : sampleWalkNavigationHeight(navigationGrid, target.x, target.z) + WALK_EYE_HEIGHT;
    camera.current.lookAt(target.x, targetHeight, target.z);
    camera.current.updateMatrixWorld();
    camera.current.getWorldDirection(forward.current);
    publishStatus(
      walkCompassHeading(forward.current.x, forward.current.z),
      initialLocationLabel,
      null,
      -1,
    );
  }, [initialLocationLabel, livingSpawn, navigationGrid, plan, publishStatus, spawn]);

  useEffect(() => {
    const pointerControls = controls.current;
    const changeInput = (event: KeyboardEvent, pressed: boolean) => {
      if (isEditableTarget(event.target) && !locked.current) return;
      if (pressed && event.key === "Enter" && locked.current && activeTarget.current) {
        event.preventDefault();
        selectActiveTarget();
        return;
      }
      if (!walkActionForKey(event.key)) return;
      event.preventDefault();
      input.current = updateWalkInputState(input.current, event.key, pressed);
      invalidate();
    };
    const keyDown = (event: KeyboardEvent) => changeInput(event, true);
    const keyUp = (event: KeyboardEvent) => changeInput(event, false);
    const clearOnVisibilityChange = () => {
      if (document.visibilityState !== "visible") clearInput();
    };

    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", clearInput);
    document.addEventListener("visibilitychange", clearOnVisibilityChange);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", clearInput);
      document.removeEventListener("visibilitychange", clearOnVisibilityChange);
      clearInput();
      locked.current = false;
      pointerControls?.unlock();
      onLockChange(false);
    };
  }, [clearInput, invalidate, onLockChange, selectActiveTarget]);

  useEffect(() => {
    const ownerDocument = pointerLockElement.ownerDocument;
    const denyPointerLock = () => {
      clearInput();
      locked.current = false;
      onLockChange(false);
      invalidate();
    };
    const handlePointerLockError = (event: Event) => {
      // three-stdlib's handler logs an expected permissions failure as an app
      // error. Capture the event first and report the truthful unlocked state
      // through our UI boundary instead.
      event.preventDefault();
      event.stopImmediatePropagation();
      denyPointerLock();
    };
    const requestPointerLock = (event: MouseEvent) => {
      if (ownerDocument.pointerLockElement === pointerLockElement) {
        if (event.button === 0 && activeTarget.current) {
          selectActiveTarget();
        }
        return;
      }
      const browserRequest = pointerLockElement.requestPointerLock;
      void settlePointerLockRequest(
        typeof browserRequest === "function"
          ? () => browserRequest.call(pointerLockElement)
          : undefined,
      ).then((accepted) => {
        if (!accepted) denyPointerLock();
      });
    };

    ownerDocument.addEventListener("pointerlockerror", handlePointerLockError, true);
    pointerLockElement.addEventListener("click", requestPointerLock);
    return () => {
      ownerDocument.removeEventListener("pointerlockerror", handlePointerLockError, true);
      pointerLockElement.removeEventListener("click", requestPointerLock);
    };
  }, [clearInput, invalidate, onLockChange, pointerLockElement, selectActiveTarget]);

  useFrame((_, delta) => {
    const activeCamera = camera.current;
    if (!activeCamera || !spawn || !locked.current) return;

    const rightAxis = walkRightAxis(input.current);
    const forwardAxis = walkForwardAxis(input.current);
    const axisScale = normalizedWalkAxisScale(rightAxis, forwardAxis);
    activeCamera.getWorldDirection(forward.current);
    forward.current.y = 0;
    if (forward.current.lengthSq() < 0.0001) forward.current.set(0, 0, -1);
    else forward.current.normalize();
    right.current.crossVectors(forward.current, activeCamera.up).normalize();
    const desiredX = (right.current.x * rightAxis + forward.current.x * forwardAxis) * axisScale;
    const desiredZ = (right.current.z * rightAxis + forward.current.z * forwardAxis) * axisScale;
    advanceWalkMotion(
      motion.current,
      desiredX,
      desiredZ,
      input.current.sprint,
      delta,
      speed,
      reducedMotion,
    );
    const frameDelta = Math.min(Math.max(delta, 0), 0.05);
    const deltaX = motion.current.velocityX * frameDelta;
    const deltaZ = motion.current.velocityZ * frameDelta;
    const resolution = resolveWalkStep(
      activeCamera.position.x,
      activeCamera.position.z,
      deltaX,
      deltaZ,
      canOccupy,
    );
    constrainWalkMotionForResolution(motion.current, resolution);
    if (resolution === "full" || resolution === "x") activeCamera.position.x += deltaX;
    if (resolution === "full" || resolution === "z") activeCamera.position.z += deltaZ;
    activeCamera.position.y =
      sampleWalkNavigationHeight(navigationGrid, activeCamera.position.x, activeCamera.position.z) +
      WALK_EYE_HEIGHT +
      motion.current.bobY;
    activeCamera.rotation.z = reducedMotion ? 0 : motion.current.swayX * 0.22;

    activeCamera.getWorldDirection(forward.current);
    const target = acquireWalkTarget(
      activeCamera.position.x,
      activeCamera.position.y,
      activeCamera.position.z,
      forward.current.x,
      forward.current.y,
      forward.current.z,
      targets,
    );
    activeTarget.current = target;
    let distance = -1;
    if (target) {
      const targetX = target.runtimePosition?.x ?? target.x;
      const targetY = target.runtimePosition?.y ?? target.y;
      const targetZ = target.runtimePosition?.z ?? target.z;
      distance = Math.round(
        Math.hypot(
          targetX - activeCamera.position.x,
          targetY - activeCamera.position.y,
          targetZ - activeCamera.position.z,
        ),
      );
    }
    publishStatus(
      walkCompassHeading(forward.current.x, forward.current.z),
      walkLocationLabel(locationRegions, activeCamera.position.x, activeCamera.position.z),
      target,
      distance,
    );
    if (!reducedMotion || rightAxis !== 0 || forwardAxis !== 0 || motion.current.speed > 0.012) {
      invalidate();
    }
  });

  if (!spawn) return null;

  return (
    <>
      <PerspectiveCamera
        ref={camera}
        makeDefault
        near={Math.max(0.08, plan.topology.camera.overview.near)}
        far={plan.topology.camera.overview.far}
        fov={Math.min(72, Math.max(54, plan.topology.camera.entry.fieldOfViewDegrees))}
        position={[spawn.x, spawn.y, spawn.z]}
      />
      <PointerLockControls
        ref={controls}
        makeDefault
        // Drei normally installs its own click-to-lock listener, but that path
        // discards requestPointerLock's promise. Use an intentionally empty
        // selector and own the permission-gated request above.
        selector='[data-kingdom-pointer-lock-owned="false"]'
        onLock={() => {
          clearInput();
          locked.current = true;
          onLockChange(true);
          invalidate();
        }}
        onUnlock={() => {
          clearInput();
          motion.current.velocityX = 0;
          motion.current.velocityZ = 0;
          motion.current.speed = 0;
          motion.current.bobY = 0;
          motion.current.swayX = 0;
          activeTarget.current = null;
          locked.current = false;
          onLockChange(false);
          if (camera.current) camera.current.rotation.z = 0;
          publishStatus(
            publishedHeading.current ?? "N",
            walkLocationLabel(
              locationRegions,
              camera.current?.position.x ?? 0,
              camera.current?.position.z ?? 0,
            ),
            null,
            -1,
          );
          invalidate();
        }}
      />
    </>
  );
}
