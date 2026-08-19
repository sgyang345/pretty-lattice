import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { MOUSE, OrthographicCamera, PerspectiveCamera, Quaternion, TOUCH, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

import type { CameraInteractionStore } from "../model/cameraInteractionStore";
import type { PreviewSafeArea } from "../model/layout";
import {
  MAX_VIEW_SCALE,
  MIN_VIEW_SCALE,
  BASE_ORBIT_DRAG_SENSITIVITY,
  BASE_TRACKBALL_DRAG_SENSITIVITY,
  DEFAULT_VIEW_SCALE,
  clampViewScale,
  type InteractionMode,
} from "../model/viewState";
import {
  computeCrystalCameraPose,
  type CrystalCameraPose,
  type CrystalCameraState,
} from "./crystalCamera";
import type { SceneLayout } from "./sceneLayout";
import { previewSafeAreaForViewport } from "./sceneLayout";
import { cellCorners } from "./sceneGeometry";
import {
  applyOrthographicFrustum,
  computeCameraFitZoom,
  computeOrthographicFrustum,
  type StandardCameraPose,
  type VectorTuple,
} from "./viewMath";

const CAMERA_TARGET = new Vector3(0, 0, 0);
const CAMERA_LOCAL_FORWARD = new Vector3(0, 0, 1);
const CAMERA_LOCAL_UP = new Vector3(0, 1, 0);
const CAMERA_COMMAND_ANIMATION_DURATION_MS = 260;
const CAMERA_CONTROLS_IDLE_EPSILON_RADIANS = 0.0005;
const CAMERA_CONTROLS_IDLE_FRAMES = 1;
const CAMERA_CONTROLS_IDLE_ZOOM_EPSILON = 0.0005;
const CAMERA_CONTROLS_STATE_NONE = -1;
const CAMERA_CONTROLS_STATE_ROTATE = 0;
const CAMERA_CONTROLS_STATE_TOUCH_ROTATE = 3;
const CAMERA_CONTROLS_STATE_ORBIT_TOUCH_DOLLY_ROTATE = 6;
const VIEW_SCALE_SYNC_EPSILON = 0.0005;
const FRUSTUM_SYNC_EPSILON = 0.000001;
const PERSPECTIVE_CAMERA_FOV_DEGREES = 35;

type CameraControls = OrbitControls | TrackballControls;

interface CameraControlsStateSource {
  keyState?: number;
  state?: number;
}

interface CameraControlsInteractionState {
  active: boolean;
  idleFrames: number;
  lastQuaternion: Quaternion;
  lastZoom: number;
  waitingForIdle: boolean;
}

export function PreviewCameraController({
  cameraAnimatedCommandVersion,
  cameraCommandVersion,
  cameraInteractionStore,
  cameraPose,
  cellVectors,
  interactionLocked,
  interactionMode,
  dragSensitivity,
  layout,
  onCameraCommandAnimationActiveChange,
  onCameraControlsInteractionActiveChange,
  resetCounter,
  safeArea,
}: {
  cameraAnimatedCommandVersion: number;
  cameraCommandVersion: number;
  cameraInteractionStore: CameraInteractionStore;
  cameraPose: CrystalCameraPose;
  cellVectors: VectorTuple[];
  interactionLocked: boolean;
  interactionMode: InteractionMode;
  dragSensitivity: number;
  layout: SceneLayout;
  onCameraCommandAnimationActiveChange?: (isActive: boolean) => void;
  onCameraControlsInteractionActiveChange?: (
    isActive: boolean,
    quaternionSnapshot?: Quaternion,
  ) => void;
  resetCounter: number;
  safeArea: PreviewSafeArea;
}) {
  const { camera, gl, invalidate, size } = useThree();
  const controlsRef = useRef<CameraControls | null>(null);
  const cameraAnimationRef = useRef<CameraPoseAnimation | null>(null);
  const cameraControlsInteractionRef = useRef<CameraControlsInteractionState>({
    active: false,
    idleFrames: 0,
    lastQuaternion: new Quaternion(),
    lastZoom: DEFAULT_VIEW_SCALE,
    waitingForIdle: false,
  });
  const isCameraAnimationActiveRef = useRef(false);
  const onCameraCommandAnimationActiveChangeRef = useRef(onCameraCommandAnimationActiveChange);
  const onCameraControlsInteractionActiveChangeRef = useRef(
    onCameraControlsInteractionActiveChange,
  );
  const cameraPoseRef = useRef(cameraPose);
  const hasAppliedInitialPoseRef = useRef(false);
  const lastCameraAnimatedCommandVersionRef = useRef(cameraAnimatedCommandVersion);
  const lastCameraCommandVersionRef = useRef(cameraCommandVersion);
  const lastFrameCameraQuaternionRef = useRef(new Quaternion());
  const lastLayoutSpanRef = useRef(layout.span);
  const lastResetCounterRef = useRef(resetCounter);
  const syncedViewScaleRef = useRef(cameraInteractionStore.getViewScaleSnapshot());
  cameraPoseRef.current = cameraPose;
  const effectiveSafeArea = useMemo(
    () => previewSafeAreaForViewport(safeArea, size.width),
    [safeArea, size.width],
  );
  const fitZoom = useMemo(
    () => computeCameraFitZoom(layout.cameraFitBounds, size.width, size.height, effectiveSafeArea),
    [effectiveSafeArea, layout.cameraFitBounds, size.height, size.width],
  );
  onCameraCommandAnimationActiveChangeRef.current = onCameraCommandAnimationActiveChange;
  onCameraControlsInteractionActiveChangeRef.current =
    onCameraControlsInteractionActiveChange;

  const requestFrame = useCallback(() => {
    invalidate();
  }, [invalidate]);

  const setCameraAnimationActive = useCallback(
    (isActive: boolean, forceNotify = false) => {
      if (isCameraAnimationActiveRef.current === isActive && !forceNotify) {
        return;
      }

      isCameraAnimationActiveRef.current = isActive;
      onCameraCommandAnimationActiveChangeRef.current?.(isActive);
    },
    [],
  );

  const getCameraZoomSnapshot = useCallback(
    () =>
      cameraViewScaleSnapshot(
        camera,
        fitZoom,
        size.height,
        cameraPoseRef.current,
        cellVectors,
        layout.groupPosition,
      ),
    [camera, cellVectors, fitZoom, layout.groupPosition, size.height],
  );

  const publishCameraViewScaleSnapshot = useCallback(
    (nextViewScale: number) => {
      if (Math.abs(nextViewScale - syncedViewScaleRef.current) < VIEW_SCALE_SYNC_EPSILON) {
        return;
      }

      syncedViewScaleRef.current = nextViewScale;
      cameraInteractionStore.setViewScaleSnapshot(nextViewScale);
    },
    [cameraInteractionStore],
  );

  const startCameraControlsInteraction = useCallback(() => {
    const interaction = cameraControlsInteractionRef.current;
    interaction.idleFrames = 0;
    interaction.lastQuaternion.copy(camera.quaternion);
    interaction.lastZoom = getCameraZoomSnapshot();
    interaction.waitingForIdle = false;

    if (interaction.active) {
      requestFrame();
      return;
    }

    interaction.active = true;
    onCameraControlsInteractionActiveChangeRef.current?.(true);
    requestFrame();
  }, [camera, getCameraZoomSnapshot, requestFrame]);

  const finishCameraControlsInteraction = useCallback(() => {
    const interaction = cameraControlsInteractionRef.current;
    if (!interaction.active) {
      return;
    }

    interaction.active = false;
    interaction.idleFrames = 0;
    interaction.lastQuaternion.copy(camera.quaternion);
    interaction.lastZoom = getCameraZoomSnapshot();
    interaction.waitingForIdle = false;
    onCameraControlsInteractionActiveChangeRef.current?.(
      false,
      camera.quaternion.clone(),
    );
  }, [camera, getCameraZoomSnapshot]);

  const requestCameraControlsInteractionFinish = useCallback(() => {
    const interaction = cameraControlsInteractionRef.current;
    if (!interaction.active) {
      return;
    }

    interaction.idleFrames = 0;
    interaction.lastQuaternion.copy(camera.quaternion);
    interaction.lastZoom = getCameraZoomSnapshot();
    interaction.waitingForIdle = true;
    requestFrame();
  }, [camera, getCameraZoomSnapshot, requestFrame]);

  const settleCameraControlsInteraction = useCallback(() => {
    const interaction = cameraControlsInteractionRef.current;
    if (!interaction.active || !interaction.waitingForIdle) {
      return;
    }

    const nextZoom = getCameraZoomSnapshot();
    const orientationDelta = interaction.lastQuaternion.angleTo(camera.quaternion);
    const zoomDelta = Math.abs(nextZoom - interaction.lastZoom);
    interaction.lastQuaternion.copy(camera.quaternion);
    interaction.lastZoom = nextZoom;

    if (
      orientationDelta > CAMERA_CONTROLS_IDLE_EPSILON_RADIANS ||
      zoomDelta > CAMERA_CONTROLS_IDLE_ZOOM_EPSILON
    ) {
      interaction.idleFrames = 0;
      return;
    }

    interaction.idleFrames += 1;
    if (interaction.idleFrames >= CAMERA_CONTROLS_IDLE_FRAMES) {
      finishCameraControlsInteraction();
    }
  }, [camera, finishCameraControlsInteraction, getCameraZoomSnapshot]);

  useLayoutEffect(() => {
    const commandChanged = cameraCommandVersion !== lastCameraCommandVersionRef.current;
    const animatedCommandChanged =
      cameraAnimatedCommandVersion !== lastCameraAnimatedCommandVersionRef.current;
    const resetChanged = resetCounter !== lastResetCounterRef.current;
    const layoutSpanChanged = Math.abs(layout.span - lastLayoutSpanRef.current) > 1e-8;
    const shouldAnimate =
      hasAppliedInitialPoseRef.current &&
      commandChanged &&
      animatedCommandChanged &&
      !resetChanged &&
      !layoutSpanChanged &&
      !prefersReducedCameraMotion();

    lastCameraCommandVersionRef.current = cameraCommandVersion;
    lastCameraAnimatedCommandVersionRef.current = cameraAnimatedCommandVersion;
    lastResetCounterRef.current = resetCounter;
    lastLayoutSpanRef.current = layout.span;
    hasAppliedInitialPoseRef.current = true;

    if (shouldAnimate) {
      cameraAnimationRef.current = createCameraPoseAnimation(
        camera,
        cameraPoseRef.current,
        layout.span,
        syncedViewScaleRef.current,
        fitZoom,
        size.height,
        cellVectors,
        layout.groupPosition,
      );
      setCameraAnimationActive(true);
      requestFrame();
      return;
    }

    cameraAnimationRef.current = null;
    setCameraAnimationActive(false, commandChanged && animatedCommandChanged);
    applyStandardCameraPose(
      camera,
      cameraPoseRef.current,
      layout.span,
      syncedViewScaleRef.current,
      fitZoom,
      size.height,
      cellVectors,
      layout.groupPosition,
    );
    controlsRef.current?.target.copy(CAMERA_TARGET);
    controlsRef.current?.update();
    requestFrame();
  }, [
    camera,
    cameraAnimatedCommandVersion,
    cameraCommandVersion,
    cellVectors,
    fitZoom,
    layout.groupPosition,
    layout.span,
    requestFrame,
    resetCounter,
    setCameraAnimationActive,
    size.height,
  ]);

  useLayoutEffect(() => {
    const nextViewScale = cameraInteractionStore.getViewScaleSnapshot();
    syncedViewScaleRef.current = nextViewScale;

    syncCameraProjectionToViewScale(
      camera,
      cameraPoseRef.current,
      layout.span,
      size.width,
      size.height,
      fitZoom,
      nextViewScale,
      effectiveSafeArea,
      cellVectors,
      layout.groupPosition,
    );
    requestFrame();
  }, [
    camera,
    cameraInteractionStore,
    cellVectors,
    effectiveSafeArea,
    fitZoom,
    layout.groupPosition,
    layout.span,
    requestFrame,
    size.height,
    size.width,
  ]);

  useEffect(() => {
    return cameraInteractionStore.subscribeViewScaleCommand(() => {
      const { viewScale: commandViewScale } =
        cameraInteractionStore.getViewScaleCommandSnapshot();
      const nextViewScale = clampViewScale(commandViewScale);
      syncedViewScaleRef.current = nextViewScale;
      syncCameraProjectionToViewScale(
        camera,
        cameraPoseRef.current,
        layout.span,
        size.width,
        size.height,
        fitZoom,
        nextViewScale,
        effectiveSafeArea,
        cellVectors,
        layout.groupPosition,
      );
      requestFrame();
    });
  }, [
    camera,
    cameraInteractionStore,
    effectiveSafeArea,
    fitZoom,
    layout.span,
    requestFrame,
    size.height,
    size.width,
  ]);

  useEffect(() => {
    return cameraInteractionStore.subscribeCameraStateCommand(() => {
      const { cameraState } = cameraInteractionStore.getCameraStateCommandSnapshot();
      if (!cameraState) {
        return;
      }

      cameraAnimationRef.current = null;
      setCameraAnimationActive(false);
      applyStandardCameraPose(
        camera,
        computeCrystalCameraPose(cellVectors, cameraState, layout.span),
        layout.span,
        syncedViewScaleRef.current,
        fitZoom,
        size.height,
        cellVectors,
        layout.groupPosition,
      );
      syncCameraProjectionToViewScale(
        camera,
        cameraPoseRef.current,
        layout.span,
        size.width,
        size.height,
        fitZoom,
        syncedViewScaleRef.current,
        effectiveSafeArea,
        cellVectors,
        layout.groupPosition,
      );
      controlsRef.current?.target.copy(CAMERA_TARGET);
      controlsRef.current?.update();
      requestFrame();
    });
  }, [
    camera,
    cameraInteractionStore,
    cellVectors,
    effectiveSafeArea,
    fitZoom,
    layout.groupPosition,
    layout.span,
    requestFrame,
    setCameraAnimationActive,
    size.height,
    size.width,
  ]);

  useEffect(() => {
    const controls =
      interactionMode === "trackball"
        ? new TrackballControls(camera, gl.domElement)
        : new OrbitControls(camera, gl.domElement);
    function handleControlsStart() {
      if (isCameraDirectionControlsInteraction(controls)) {
        startCameraControlsInteraction();
      }
      cameraAnimationRef.current = null;
      setCameraAnimationActive(false);
      requestFrame();
    }
    function handleControlsEnd() {
      requestCameraControlsInteractionFinish();
      requestFrame();
    }
    const activePointerIds = new Set<number>();
    function handlePointerDown(event: PointerEvent) {
      activePointerIds.add(event.pointerId);
      requestFrame();
    }
    function handlePointerMove() {
      if (activePointerIds.size > 0) {
        requestFrame();
      }
    }
    function handlePointerEnd(event: PointerEvent) {
      activePointerIds.delete(event.pointerId);
      requestFrame();
    }
    function handleLostPointerCapture() {
      activePointerIds.clear();
      requestFrame();
    }
    function handleWheel() {
      requestFrame();
    }

    configureCameraControls(
      controls,
      interactionMode,
      interactionLocked,
      fitZoom,
      size.height,
      cameraPose,
      cellVectors,
      layout.groupPosition,
      dragSensitivity,
    );
    controls.target.copy(CAMERA_TARGET);
    resizeCameraControls(controls);
    controls.addEventListener("start", handleControlsStart);
    controls.addEventListener("end", handleControlsEnd);
    gl.domElement.addEventListener("lostpointercapture", handleLostPointerCapture);
    gl.domElement.addEventListener("pointercancel", handlePointerEnd);
    gl.domElement.addEventListener("pointerdown", handlePointerDown);
    gl.domElement.addEventListener("pointermove", handlePointerMove);
    gl.domElement.addEventListener("pointerup", handlePointerEnd);
    gl.domElement.addEventListener("wheel", handleWheel);
    controls.update();
    requestFrame();
    controlsRef.current = controls;

    return () => {
      controls.removeEventListener("start", handleControlsStart);
      controls.removeEventListener("end", handleControlsEnd);
      gl.domElement.removeEventListener("lostpointercapture", handleLostPointerCapture);
      gl.domElement.removeEventListener("pointercancel", handlePointerEnd);
      gl.domElement.removeEventListener("pointerdown", handlePointerDown);
      gl.domElement.removeEventListener("pointermove", handlePointerMove);
      gl.domElement.removeEventListener("pointerup", handlePointerEnd);
      gl.domElement.removeEventListener("wheel", handleWheel);
      finishCameraControlsInteraction();
      controls.dispose();
      if (controlsRef.current === controls) {
        controlsRef.current = null;
      }
    };
  }, [
    camera,
    finishCameraControlsInteraction,
    gl.domElement,
    dragSensitivity,
    interactionMode,
    fitZoom,
    cameraPose,
    cellVectors,
    layout.groupPosition,
    size.height,
    requestFrame,
    requestCameraControlsInteractionFinish,
    resetCounter,
    setCameraAnimationActive,
    startCameraControlsInteraction,
  ]);

  useEffect(() => {
    return () => setCameraAnimationActive(false);
  }, [setCameraAnimationActive]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    configureCameraControls(
      controls,
      interactionMode,
      interactionLocked,
      fitZoom,
      size.height,
      cameraPose,
      cellVectors,
      layout.groupPosition,
      dragSensitivity,
    );
    controls.target.copy(CAMERA_TARGET);
    controls.update();
    requestFrame();
  }, [
    dragSensitivity,
    fitZoom,
    cameraPose,
    cellVectors,
    layout.groupPosition,
    size.height,
    interactionLocked,
    interactionMode,
    requestFrame,
    resetCounter,
  ]);

  useEffect(() => {
    resizeCameraControls(controlsRef.current);
    requestFrame();
  }, [requestFrame, size.height, size.width]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    function handleControlsChange() {
      const nextViewScale = syncCameraProjectionToCamera(
        camera,
        cameraPoseRef.current,
        layout.span,
        fitZoom,
        size.width,
        size.height,
        effectiveSafeArea,
        cellVectors,
        layout.groupPosition,
      );

      publishCameraViewScaleSnapshot(nextViewScale);
      requestFrame();
    }

    controls.addEventListener("change", handleControlsChange);
    return () => controls.removeEventListener("change", handleControlsChange);
  }, [
    camera,
    cellVectors,
    effectiveSafeArea,
    fitZoom,
    interactionMode,
    layout.groupPosition,
    layout.span,
    publishCameraViewScaleSnapshot,
    requestFrame,
    resetCounter,
    size.height,
    size.width,
  ]);

  useFrame(() => {
    const previousFrameQuaternion = lastFrameCameraQuaternionRef.current.copy(
      camera.quaternion,
    );
    const previousFrameZoom = getCameraZoomSnapshot();
    const animation = cameraAnimationRef.current;
    if (animation) {
      const isComplete = applyCameraPoseAnimationFrame(camera, animation, performance.now());
      if (isComplete) {
        cameraAnimationRef.current = null;
        setCameraAnimationActive(false);
      }
      controlsRef.current?.target.copy(CAMERA_TARGET);
      controlsRef.current?.update();
    } else {
      controlsRef.current?.update();
    }

    {
      const nextViewScale = syncCameraProjectionToCamera(
        camera,
        cameraPoseRef.current,
        layout.span,
        fitZoom,
        size.width,
        size.height,
        effectiveSafeArea,
        cellVectors,
        layout.groupPosition,
      );
      publishCameraViewScaleSnapshot(nextViewScale);
    }

    settleCameraControlsInteraction();

    const cameraMoved =
      previousFrameQuaternion.angleTo(camera.quaternion) >
        CAMERA_CONTROLS_IDLE_EPSILON_RADIANS ||
      Math.abs(getCameraZoomSnapshot() - previousFrameZoom) >
        CAMERA_CONTROLS_IDLE_ZOOM_EPSILON;
    if (cameraMoved || cameraAnimationRef.current) {
      requestFrame();
    }
  });

  return null;
}

interface CameraPoseAnimation {
  durationMs: number;
  startDistance: number;
  startQuaternion: Quaternion;
  startTimeMs: number;
  targetDistance: number;
  targetPose: CrystalCameraPose;
  targetQuaternion: Quaternion;
  targetSpan: number;
}

function createCameraPoseAnimation(
  camera: { position: Vector3; quaternion: Quaternion },
  targetPose: CrystalCameraPose,
  targetSpan: number,
  viewScale: number,
  fitZoom: number,
  viewportHeight: number,
  cellVectors: VectorTuple[],
  groupPosition: VectorTuple,
): CameraPoseAnimation {
  return {
    durationMs: CAMERA_COMMAND_ANIMATION_DURATION_MS,
    startDistance: Math.max(camera.position.distanceTo(CAMERA_TARGET), 1e-6),
    startQuaternion: camera.quaternion.clone().normalize(),
    startTimeMs: performance.now(),
    targetDistance:
      camera instanceof PerspectiveCamera
        ? perspectiveDistanceForViewScale(
            fitZoom,
            viewportHeight,
            viewScale,
            targetPose,
            cellVectors,
            groupPosition,
          )
        : Math.max(targetPose.distance, 1e-6),
    targetPose,
    targetQuaternion: targetPose.quaternion.clone().normalize(),
    targetSpan,
  };
}

function applyCameraPoseAnimationFrame(
  camera: {
    lookAt: (x: number, y: number, z: number) => void;
    position: Vector3;
    quaternion: Quaternion;
    up: Vector3;
  },
  animation: CameraPoseAnimation,
  nowMs: number,
): boolean {
  const progress = Math.max(
    0,
    Math.min(1, (nowMs - animation.startTimeMs) / animation.durationMs),
  );

  if (progress >= 1) {
    applyStandardCameraPose(
      camera,
      animation.targetPose,
      animation.targetSpan,
      DEFAULT_VIEW_SCALE,
      1,
      1,
      [],
      [0, 0, 0],
      animation.targetDistance,
    );
    return true;
  }

  const easedProgress = easeOutCubic(progress);
  const quaternion = animation.startQuaternion.clone().slerp(
    animation.targetQuaternion,
    easedProgress,
  );
  const outward = CAMERA_LOCAL_FORWARD.clone().applyQuaternion(quaternion).normalize();
  const up = CAMERA_LOCAL_UP.clone().applyQuaternion(quaternion).normalize();
  const distance =
    animation.startDistance +
    (animation.targetDistance - animation.startDistance) * easedProgress;

  camera.position.copy(outward.multiplyScalar(distance));
  camera.up.copy(up);
  camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
  return false;
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function prefersReducedCameraMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function syncOrthographicFrustumToCameraZoom(
  camera: OrthographicCamera,
  fitZoom: number,
  width: number,
  height: number,
  safeArea: PreviewSafeArea,
): number {
  const nextViewScale = clampViewScale(camera.zoom / fitZoom);
  const nextZoom = fitZoom * nextViewScale;

  syncOrthographicFrustumToZoom(camera, width, height, nextZoom, safeArea);

  return nextViewScale;
}

function syncOrthographicFrustumToZoom(
  camera: OrthographicCamera,
  width: number,
  height: number,
  zoom: number,
  safeArea: PreviewSafeArea,
) {
  const frustum = computeOrthographicFrustum(width, height, zoom, safeArea);

  if (
    Math.abs(camera.zoom - zoom) > FRUSTUM_SYNC_EPSILON ||
    Math.abs(camera.left - frustum.left) > FRUSTUM_SYNC_EPSILON ||
    Math.abs(camera.right - frustum.right) > FRUSTUM_SYNC_EPSILON ||
    Math.abs(camera.top - frustum.top) > FRUSTUM_SYNC_EPSILON ||
    Math.abs(camera.bottom - frustum.bottom) > FRUSTUM_SYNC_EPSILON
  ) {
    applyOrthographicFrustum(camera, width, height, zoom, safeArea);
  }
}

function syncCameraProjectionToViewScale(
  camera: Parameters<typeof applyStandardCameraPose>[0],
  pose: CrystalCameraPose,
  span: number,
  width: number,
  height: number,
  fitZoom: number,
  viewScale: number,
  safeArea: PreviewSafeArea,
  cellVectors: VectorTuple[],
  groupPosition: VectorTuple,
) {
  if (camera instanceof OrthographicCamera) {
    syncOrthographicFrustumToZoom(camera, width, height, fitZoom * viewScale, safeArea);
    return;
  }

  if (camera instanceof PerspectiveCamera) {
    syncPerspectiveDistanceToViewScale(
      camera,
      pose,
      span,
      viewScale,
      width,
      height,
      fitZoom,
      safeArea,
      cellVectors,
      groupPosition,
    );
  }
}

function syncCameraProjectionToCamera(
  camera: Parameters<typeof applyStandardCameraPose>[0],
  pose: CrystalCameraPose,
  span: number,
  fitZoom: number,
  width: number,
  height: number,
  safeArea: PreviewSafeArea,
  cellVectors: VectorTuple[],
  groupPosition: VectorTuple,
): number {
  if (camera instanceof OrthographicCamera) {
    return syncOrthographicFrustumToCameraZoom(
      camera,
      fitZoom,
      width,
      height,
      safeArea,
    );
  }

  if (camera instanceof PerspectiveCamera) {
    return syncPerspectiveDistanceToCameraPosition(
      camera,
      pose,
      span,
      fitZoom,
      width,
      height,
      safeArea,
      cellVectors,
      groupPosition,
    );
  }

  return DEFAULT_VIEW_SCALE;
}

function cameraViewScaleSnapshot(
  camera: Parameters<typeof applyStandardCameraPose>[0],
  fitZoom: number,
  viewportHeight: number,
  pose: CrystalCameraPose,
  cellVectors: VectorTuple[],
  groupPosition: VectorTuple,
): number {
  if (camera instanceof OrthographicCamera) {
    return camera.zoom;
  }

  if (camera instanceof PerspectiveCamera) {
    const frontDepth = perspectiveFrontDepth(pose, cellVectors, groupPosition);
    return perspectiveViewScaleFromDistance(
      perspectiveTargetPlaneDistanceForFitZoom(fitZoom, viewportHeight),
      frontDepth,
      camera.position.distanceTo(CAMERA_TARGET),
    );
  }

  return DEFAULT_VIEW_SCALE;
}

function syncPerspectiveDistanceToViewScale(
  camera: PerspectiveCamera,
  pose: CrystalCameraPose,
  span: number,
  viewScale: number,
  width: number,
  height: number,
  fitZoom: number,
  safeArea: PreviewSafeArea,
  cellVectors: VectorTuple[],
  groupPosition: VectorTuple,
) {
  const distance = perspectiveDistanceForViewScale(
    fitZoom,
    height,
    viewScale,
    pose,
    cellVectors,
    groupPosition,
  );
  const direction = camera.position.clone().sub(CAMERA_TARGET);
  if (direction.lengthSq() < 1e-12) {
    direction.set(...pose.outward);
  }
  direction.normalize();
  camera.position.copy(CAMERA_TARGET).add(direction.multiplyScalar(distance));
  syncPerspectiveProjection(camera, distance, span, width, height, safeArea);
}

function syncPerspectiveDistanceToCameraPosition(
  camera: PerspectiveCamera,
  pose: CrystalCameraPose,
  span: number,
  fitZoom: number,
  width: number,
  height: number,
  safeArea: PreviewSafeArea,
  cellVectors: VectorTuple[],
  groupPosition: VectorTuple,
): number {
  const frontDepth = perspectiveFrontDepth(pose, cellVectors, groupPosition);
  const nextViewScale = perspectiveViewScaleFromDistance(
    perspectiveTargetPlaneDistanceForFitZoom(fitZoom, height),
    frontDepth,
    camera.position.distanceTo(CAMERA_TARGET),
  );
  syncPerspectiveDistanceToViewScale(
    camera,
    pose,
    span,
    nextViewScale,
    width,
    height,
    fitZoom,
    safeArea,
    cellVectors,
    groupPosition,
  );
  return nextViewScale;
}

function perspectiveDistanceForViewScale(
  fitZoom: number,
  viewportHeight: number,
  viewScale: number,
  pose: Pick<CrystalCameraPose, "outward">,
  cellVectors: VectorTuple[],
  groupPosition: VectorTuple,
): number {
  return Math.max(
    1e-6,
    perspectiveFrontDepth(pose, cellVectors, groupPosition) +
      perspectiveTargetPlaneDistanceForFitZoom(fitZoom, viewportHeight) *
        (DEFAULT_VIEW_SCALE / clampViewScale(viewScale)),
  );
}

function perspectiveViewScaleFromDistance(
  targetPlaneDistance: number,
  frontDepth: number,
  distance: number,
): number {
  return clampViewScale(
    (targetPlaneDistance * DEFAULT_VIEW_SCALE) /
      Math.max(distance - frontDepth, 1e-6),
  );
}

function perspectiveTargetPlaneDistanceForFitZoom(
  fitZoom: number,
  viewportHeight: number,
): number {
  const safeFitZoom = Math.max(0.01, fitZoom);
  const safeViewportHeight = Math.max(1, viewportHeight);
  const halfFovRadians = (PERSPECTIVE_CAMERA_FOV_DEGREES * Math.PI) / 360;
  return safeViewportHeight / (2 * Math.tan(halfFovRadians) * safeFitZoom);
}

function perspectiveFrontDepth(
  pose: Pick<CrystalCameraPose, "outward">,
  cellVectors: VectorTuple[],
  groupPosition: VectorTuple,
): number {
  const outward = new Vector3(...pose.outward).normalize();
  const offset = new Vector3(...groupPosition);
  let frontDepth = 0;

  for (const corner of cellCorners(cellVectors)) {
    frontDepth = Math.max(
      frontDepth,
      new Vector3(...corner).add(offset).dot(outward),
    );
  }

  return frontDepth;
}

function syncPerspectiveProjection(
  camera: PerspectiveCamera,
  distance: number,
  span: number,
  width: number,
  height: number,
  safeArea: PreviewSafeArea,
) {
  applyPerspectiveSafeAreaViewOffset(camera, width, height, safeArea);
  camera.near = 0.01;
  camera.far = Math.max(1000, distance + span * 8);
  camera.updateProjectionMatrix();
}

function applyPerspectiveSafeAreaViewOffset(
  camera: PerspectiveCamera,
  width: number,
  height: number,
  safeArea: PreviewSafeArea,
) {
  const viewportWidth = Math.max(1, width);
  const viewportHeight = Math.max(1, height);
  const offsetX = (safeArea.right - safeArea.left) / 2;
  const offsetY = (safeArea.bottom - safeArea.top) / 2;

  if (Math.abs(offsetX) < 0.5 && Math.abs(offsetY) < 0.5) {
    camera.clearViewOffset();
    return;
  }

  camera.setViewOffset(
    viewportWidth,
    viewportHeight,
    offsetX,
    offsetY,
    viewportWidth,
    viewportHeight,
  );
}

function configureCameraControls(
  controls: CameraControls,
  interactionMode: InteractionMode,
  interactionLocked: boolean,
  fitZoom: number,
  viewportHeight: number,
  pose: CrystalCameraPose,
  cellVectors: VectorTuple[],
  groupPosition: VectorTuple,
  dragSensitivity: number,
) {
  controls.enabled = !interactionLocked;
  controls.minZoom = fitZoom * MIN_VIEW_SCALE;
  controls.maxZoom = fitZoom * MAX_VIEW_SCALE;
  controls.minDistance = perspectiveDistanceForViewScale(
    fitZoom,
    viewportHeight,
    MAX_VIEW_SCALE,
    pose,
    cellVectors,
    groupPosition,
  );
  controls.maxDistance = perspectiveDistanceForViewScale(
    fitZoom,
    viewportHeight,
    MIN_VIEW_SCALE,
    pose,
    cellVectors,
    groupPosition,
  );

  if (interactionMode === "trackball" && controls instanceof TrackballControls) {
    controls.rotateSpeed = BASE_TRACKBALL_DRAG_SENSITIVITY * dragSensitivity;
    controls.noPan = true;
    controls.noZoom = interactionLocked;
    controls.noRotate = interactionLocked;
    controls.mouseButtons.LEFT = MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = null;
    return;
  }

  if (interactionMode === "orbit" && controls instanceof OrbitControls) {
    controls.rotateSpeed = BASE_ORBIT_DRAG_SENSITIVITY * dragSensitivity;
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableRotate = !interactionLocked;
    controls.enableZoom = !interactionLocked;
    controls.mouseButtons.LEFT = MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = null;
    controls.touches.ONE = TOUCH.ROTATE;
    controls.touches.TWO = TOUCH.DOLLY_ROTATE;
  }
}

function resizeCameraControls(controls: CameraControls | null) {
  if (controls instanceof TrackballControls) {
    controls.handleResize();
  }
}

function isCameraDirectionControlsInteraction(controls: CameraControls): boolean {
  const stateSource = controls as CameraControlsStateSource;
  const state =
    stateSource.keyState !== undefined &&
    stateSource.keyState !== CAMERA_CONTROLS_STATE_NONE
      ? stateSource.keyState
      : stateSource.state;

  return (
    state === CAMERA_CONTROLS_STATE_ROTATE ||
    state === CAMERA_CONTROLS_STATE_TOUCH_ROTATE ||
    state === CAMERA_CONTROLS_STATE_ORBIT_TOUCH_DOLLY_ROTATE
  );
}

function applyStandardCameraPose(
  camera: { lookAt: (x: number, y: number, z: number) => void; position: Vector3; up: Vector3 },
  standardPose: StandardCameraPose,
  span: number,
  viewScale = DEFAULT_VIEW_SCALE,
  fitZoom = 1,
  viewportHeight = 1,
  cellVectors: VectorTuple[] = [],
  groupPosition: VectorTuple = [0, 0, 0],
  perspectiveDistance?: number,
) {
  const cameraPosition =
    camera instanceof PerspectiveCamera
      ? new Vector3(...standardPose.outward).multiplyScalar(
          perspectiveDistance ??
            perspectiveDistanceForViewScale(
              fitZoom,
              viewportHeight,
              viewScale,
              standardPose,
              cellVectors,
              groupPosition,
            ),
        )
      : new Vector3(...standardPose.cameraPosition);

  camera.position.copy(cameraPosition);
  camera.up.set(...standardPose.cameraUp);
  camera.lookAt(...standardPose.target);

  if (camera instanceof OrthographicCamera) {
    camera.near = 0.01;
    camera.far = Math.max(1000, standardPose.distance + span * 8);
    camera.updateProjectionMatrix();
  }

  if (camera instanceof PerspectiveCamera) {
    camera.near = 0.01;
    camera.far = Math.max(1000, cameraPosition.distanceTo(CAMERA_TARGET) + span * 8);
    camera.updateProjectionMatrix();
  }

  camera.position.copy(cameraPosition);
}
