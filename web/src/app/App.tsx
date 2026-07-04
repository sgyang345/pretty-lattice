import {
  AlertTriangleIcon,
  Orbit,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  ClipboardPaste,
  Copy,
  FileDown,
  FolderOpen,
  ImageDown,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AtomDistanceCard } from "./AtomDistanceCard";
import { AtomInspectorCard } from "./AtomInspectorCard";
import { KPointInspectorCard } from "./KPointInspectorCard";
import {
  loadStartupProjectFile,
  saveStartupTextFile,
  saveStartupProjectFile,
  shouldLoadStartupProjectFile,
  StartupFileExistsError,
  StartupProjectExistsError,
  type SceneSpec,
} from "../api/scene";
import {
  atomMeasurementInfoForIds,
  inspectedAtomInfoForId,
} from "./atomInspector";
import {
  type AtomBoxSelectionSnapshot,
  LatticeScene,
  previewSafeAreaForViewport,
} from "../scene/LatticeScene";
import { sceneForBrillouinZoneView } from "../scene/brillouinScene";
import {
  selectablePointsForBrillouinZone,
  type BrillouinSelectablePoint,
} from "../scene/brillouinSelection";
import { ATOM_HIGHLIGHT_PULSE_MS } from "../scene/atomHighlight";
import { OrientationGizmo } from "../scene/OrientationGizmo";
import {
  CommonControlsPanel,
  type CommonPanelTab,
} from "./controls/CommonControlsPanel";
import { ViewControlRail } from "./controls/ViewControlRail";
import { createCameraInteractionStore } from "./cameraInteractionStore";
import { createPreviewFpsStore } from "../model/previewFpsStore";
import { deriveElementLegendEntries } from "./elementLegend";
import { useFigureExportController } from "./hooks/useFigureExportController";
import { useLockedInteractionFeedback } from "./hooks/useLockedInteractionFeedback";
import {
  usePreviewCameraCommands,
  type CameraScreenRotationAxis,
} from "./hooks/usePreviewCameraCommands";
import { useStructurePreview } from "./hooks/useStructurePreview";
import { ElementLegend } from "./legend/ElementLegend";
import {
  orientationGizmoContainerStyle,
  orientationGizmoSizeForViewport,
  useViewportSize,
} from "./layout/overlayLayout";
import { StructureSummaryCard } from "./panels/StructureSummaryCard";
import {
  InspectorSidebar,
  InspectorToggle,
} from "./inspector/InspectorSidebar";
import {
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultAtomVectorSettings,
  createDefaultStyle,
  createPrettyLatticeProject,
  clampDragSensitivity,
  clampLightStrength,
  clampViewScale,
  baseColorSchemeForStyle,
  DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  DEFAULT_UNIT_CELL_LINE_STYLE,
  createCustomColormapFromScheme,
  defaultPreviewMeshQualityForScene,
  elementColorOverridesForStyle,
  type MeshQuality,
  type UnitCellLineStyle,
  hasPolyhedra,
  isPrettyLatticeProjectFileName,
  normalizeAtomVectorSettings,
  parsePrettyLatticeProjectFile,
  prettyLatticeProjectFileName,
  prettyLatticeProjectJson,
  type AtomVectorSettings,
  type CrystalCameraState,
  type InteractionMode,
  type PreviewViewState,
  previewSafeAreaForInspector,
  sceneOffsetXForInspector,
  visibleSceneForComponents,
} from "../model";
import {
  createStructureTextExportFile,
  STRUCTURE_TEXT_EXPORT_FORMATS,
  type StructureTextExportFormat,
} from "../export/structureTextExport";
import { downloadBlob } from "./exportFigure";
import {
  GLASS_SURFACE_CLASS,
  TOOL_ICON_BUTTON_ACTIVE_CLASS,
  TOOL_ICON_BUTTON_CLASS,
} from "./surface";

interface ResetLoadedPreviewOptions {
  preserveActiveCommonPanelTab?: boolean;
  preserveInspectorOpen?: boolean;
}

interface AtomBoxSelectionDrag {
  currentX: number;
  currentY: number;
  isDragging: boolean;
  pointerId: number;
  startX: number;
  startY: number;
}

interface PendingFileSaveConflict {
  fileName: string;
  kind: "project" | "structure";
  path: string;
  text: string;
  suggestedFileName: string;
}

type ResetLoadedPreviewState = (
  nextScene: SceneSpec | null,
  options?: ResetLoadedPreviewOptions,
) => void;

const SESSION_HEARTBEAT_INTERVAL_MS = 3000;
const SAVE_PROJECT_MESSAGE_TIMEOUT_MS = 5000;
const VIEW_SETTINGS_MESSAGE_TIMEOUT_MS = 3000;
const ATOM_BOX_SELECTION_DRAG_THRESHOLD_PX = 4;
const VIEW_SETTINGS_CLIPBOARD_FORMAT = "pretty-lattice-view-settings";
const VIEW_SETTINGS_CLIPBOARD_VERSION = 1;
const RECIPROCAL_AXIS_LABELS = {
  a: "a*",
  b: "b*",
  c: "c*",
} as const;

type ClipboardViewState = Pick<
  PreviewViewState,
  "camera" | "dragSensitivity" | "interactionMode" | "lightStrength" | "viewScale"
>;

interface ClipboardViewSettings {
  format: typeof VIEW_SETTINGS_CLIPBOARD_FORMAT;
  version: typeof VIEW_SETTINGS_CLIPBOARD_VERSION;
  view: ClipboardViewState;
}

function sendSessionHeartbeat() {
  void fetch("/api/session-heartbeat", {
    method: "POST",
    keepalive: true,
  }).catch(() => {});
}

function viewSettingsClipboardJson(viewState: PreviewViewState): string {
  const viewSettings: ClipboardViewSettings = {
    format: VIEW_SETTINGS_CLIPBOARD_FORMAT,
    version: VIEW_SETTINGS_CLIPBOARD_VERSION,
    view: {
      camera: viewState.camera,
      dragSensitivity: viewState.dragSensitivity,
      interactionMode: viewState.interactionMode,
      lightStrength: viewState.lightStrength,
      viewScale: viewState.viewScale,
    },
  };

  return `${JSON.stringify(viewSettings, null, 2)}\n`;
}

function parseViewSettingsClipboardText(text: string): ClipboardViewState {
  const value = JSON.parse(text) as unknown;
  if (!isClipboardViewSettings(value)) {
    throw new Error("Clipboard does not contain Pretty Lattice view settings.");
  }

  return {
    ...value.view,
    dragSensitivity: clampDragSensitivity(value.view.dragSensitivity),
    lightStrength: clampLightStrength(value.view.lightStrength),
    viewScale: clampViewScale(value.view.viewScale),
  };
}

function isClipboardViewSettings(value: unknown): value is ClipboardViewSettings {
  return (
    isRecord(value) &&
    value.format === VIEW_SETTINGS_CLIPBOARD_FORMAT &&
    value.version === VIEW_SETTINGS_CLIPBOARD_VERSION &&
    isRecord(value.view) &&
    isCrystalCameraState(value.view.camera) &&
    isInteractionMode(value.view.interactionMode) &&
    typeof value.view.dragSensitivity === "number" &&
    typeof value.view.lightStrength === "number" &&
    typeof value.view.viewScale === "number"
  );
}

function isCrystalCameraState(value: unknown): value is CrystalCameraState {
  return (
    isRecord(value) &&
    isVectorTuple(value.direct) &&
    isVectorTuple(value.reciprocal) &&
    isCameraScreenDirection(value.primary) &&
    isCameraScreenDirection(value.secondary) &&
    typeof value.rollDegrees === "number" &&
    Number.isFinite(value.rollDegrees)
  );
}

function isVectorTuple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function isCameraScreenDirection(value: unknown): value is CrystalCameraState["primary"] {
  return value === "right" || value === "upward" || value === "outward";
}

function isInteractionMode(value: unknown): value is InteractionMode {
  return value === "trackball" || value === "orbit";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ViewAxisRotationControl({
  onRotate,
}: {
  onRotate: (axis: CameraScreenRotationAxis, deltaDegrees: number) => void;
}) {
  const [zRotation, setZRotation] = useState(0);
  const [xRotation, setXRotation] = useState(0);
  const [yRotation, setYRotation] = useState(0);
  const [presetAngle, setPresetAngle] = useState(15);

  function rotateAxis(
    axis: CameraScreenRotationAxis,
    deltaDegrees: number,
    currentValue: number,
    setValue: (value: number) => void,
  ) {
    if (!Number.isFinite(deltaDegrees) || Math.abs(deltaDegrees) < 0.000001) {
      return;
    }

    setValue(normalizeDialDegrees(currentValue + deltaDegrees));
    onRotate(axis, deltaDegrees);
  }

  return (
    <TooltipProvider>
      <div
        className="absolute right-4 top-16 z-30 h-24 w-24"
        aria-label="View rotation dials"
      >
        <ViewCrossAxisSlider
          presetAngle={presetAngle}
          onPresetAngleChange={setPresetAngle}
          onRotateHorizontal={(deltaDegrees) =>
            rotateAxis("outward", deltaDegrees, zRotation, setZRotation)
          }
          onRotateVertical={(deltaDegrees) =>
            rotateAxis("right", deltaDegrees, xRotation, setXRotation)
          }
        />
        <ViewYawOvalSlider
          className="absolute left-1/2 top-full mt-2 -translate-x-1/2"
          presetAngle={presetAngle}
          onRotate={(deltaDegrees) =>
            rotateAxis("upward", deltaDegrees, yRotation, setYRotation)
          }
        />
      </div>
    </TooltipProvider>
  );
}

function ViewCrossAxisSlider({
  onRotateHorizontal,
  onRotateVertical,
  onPresetAngleChange,
  presetAngle,
}: {
  onRotateHorizontal: (deltaDegrees: number) => void;
  onRotateVertical: (deltaDegrees: number) => void;
  onPresetAngleChange: (presetAngle: number) => void;
  presetAngle: number;
}) {
  function rotateHorizontalByPreset(direction: -1 | 1) {
    onRotateHorizontal(direction * presetAngle);
  }

  function rotateVerticalByPreset(direction: -1 | 1) {
    onRotateVertical(direction * presetAngle);
  }

  function rotateButtonByWheel(
    event: WheelEvent<HTMLButtonElement>,
    buttonDirection: -1 | 1,
    rotate: (direction: -1 | 1) => void,
  ) {
    if (event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const wheelDirection: -1 | 1 =
      event.deltaY < 0 ? buttonDirection : buttonDirection === 1 ? -1 : 1;
    rotate(wheelDirection);
  }

  function handlePresetAngleChange(event: ChangeEvent<HTMLInputElement>) {
    onPresetAngleChange(normalizePresetAngle(event.target.value));
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="group absolute inset-0 opacity-95 transition-opacity hover:opacity-100 focus-within:opacity-100"
          role="group"
          aria-label="View cross-axis rotation controls"
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-visible drop-shadow-xl"
            viewBox="0 0 96 96"
          >
            <path
              d="M48 0C57.941 0 66 8.059 66 18V30H78C87.941 30 96 38.059 96 48C96 57.941 87.941 66 78 66H66V78C66 87.941 57.941 96 48 96C38.059 96 30 87.941 30 78V66H18C8.059 66 0 57.941 0 48C0 38.059 8.059 30 18 30H30V18C30 8.059 38.059 0 48 0Z"
              style={{
                fill: "color-mix(in srgb, var(--card) 72%, transparent)",
                stroke: "color-mix(in srgb, var(--foreground) 10%, transparent)",
              }}
            />
          </svg>
          <button
            type="button"
            aria-label="Rotate view around screen Z backward by preset angle"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              "absolute left-1 top-1/2 z-30 grid !rounded-full -translate-y-1/2 place-items-center",
            )}
            onClick={(event) => {
              event.stopPropagation();
              rotateHorizontalByPreset(-1);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) =>
              rotateButtonByWheel(event, -1, rotateHorizontalByPreset)
            }
          >
            <ChevronsDown aria-hidden="true" className="size-3.5" />
          </button>
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 z-40 size-8 -translate-x-1/2 -translate-y-1/2 group-hover:pointer-events-auto group-focus-within:pointer-events-auto"
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const direction = event.deltaY < 0 ? 1 : -1;
              onPresetAngleChange(normalizePresetAngle(presetAngle + direction));
            }}
          >
            <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg text-center font-mono text-[0.68rem] font-medium leading-8 text-foreground transition-opacity group-hover:opacity-0 group-focus-within:opacity-0">
              {presetAngle}°
            </span>
            <div
              className="opacity-value-control pointer-events-none absolute inset-0 rounded-lg border opacity-0 transition-[background-color,border-color,box-shadow,opacity] duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
              data-disabled="false"
            >
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={presetAngle}
                aria-label="View rotation preset angle"
                className="size-full rounded-lg border-0 bg-transparent p-0 pr-2 text-center align-middle font-mono text-[0.68rem] leading-8 text-foreground outline-none"
                onChange={handlePresetAngleChange}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[0.55rem] font-medium text-muted-foreground"
              >
                °
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Rotate view around screen Z forward by preset angle"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              "absolute right-1 top-1/2 z-30 grid !rounded-full -translate-y-1/2 place-items-center",
            )}
            onClick={(event) => {
              event.stopPropagation();
              rotateHorizontalByPreset(1);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) =>
              rotateButtonByWheel(event, 1, rotateHorizontalByPreset)
            }
          >
            <ChevronsUp aria-hidden="true" className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Rotate view around horizontal X forward by preset angle"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              "absolute left-1/2 top-1 z-30 grid !rounded-full -translate-x-1/2 place-items-center",
            )}
            onClick={(event) => {
              event.stopPropagation();
              rotateVerticalByPreset(1);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) =>
              rotateButtonByWheel(event, 1, rotateVerticalByPreset)
            }
          >
            <ChevronsUp aria-hidden="true" className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Rotate view around horizontal X backward by preset angle"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              "absolute bottom-1 left-1/2 z-30 grid !rounded-full -translate-x-1/2 place-items-center",
            )}
            onClick={(event) => {
              event.stopPropagation();
              rotateVerticalByPreset(-1);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) =>
              rotateButtonByWheel(event, -1, rotateVerticalByPreset)
            }
          >
            <ChevronsDown aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left">Rotate around screen Z / horizontal X</TooltipContent>
    </Tooltip>
  );
}

function ViewYawOvalSlider({
  className,
  onRotate,
  presetAngle,
}: {
  className?: string;
  onRotate: (deltaDegrees: number) => void;
  presetAngle: number;
}) {
  function rotateByPreset(direction: -1 | 1) {
    onRotate(direction * presetAngle);
  }

  function rotateButtonByWheel(
    event: WheelEvent<HTMLButtonElement>,
    buttonDirection: -1 | 1,
  ) {
    if (event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const wheelDirection: -1 | 1 =
      event.deltaY < 0 ? buttonDirection : buttonDirection === 1 ? -1 : 1;
    rotateByPreset(wheelDirection);
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "group relative flex h-9 w-24 items-center justify-between rounded-full border px-1 opacity-95 shadow-xl shadow-foreground/10 transition-opacity hover:opacity-100 focus-within:opacity-100",
            GLASS_SURFACE_CLASS,
            className,
          )}
          role="group"
          aria-label="Rotate view around current vertical Y axis"
        >
          <button
            type="button"
            aria-label="Rotate view counterclockwise around vertical axis by preset angle"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              "relative z-30 grid !rounded-full place-items-center",
            )}
            onClick={(event) => {
              event.stopPropagation();
              rotateByPreset(-1);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => rotateButtonByWheel(event, -1)}
          >
            <ChevronsLeft aria-hidden="true" className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Rotate view clockwise around vertical axis by preset angle"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              "relative z-30 grid !rounded-full place-items-center",
            )}
            onClick={(event) => {
              event.stopPropagation();
              rotateByPreset(1);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => rotateButtonByWheel(event, 1)}
          >
            <ChevronsRight aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">Rotate in the XY plane</TooltipContent>
    </Tooltip>
  );
}

function normalizeDialDegrees(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = ((value % 360) + 360) % 360;
  return Math.abs(normalized) < 0.000001 ? 0 : normalized;
}

function normalizePresetAngle(value: number | string): number {
  const parsedValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsedValue)) {
    return 15;
  }

  return Math.min(90, Math.max(1, Math.round(parsedValue)));
}

export function App() {
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [componentVisibility, setComponentVisibility] = useState(
    createDefaultComponentVisibility,
  );
  const [componentOpacity, setComponentOpacity] = useState(createDefaultComponentOpacity);
  const [style, setStyle] = useState(createDefaultStyle);
  const [previewMeshQuality, setPreviewMeshQuality] = useState<MeshQuality>(
    () => defaultPreviewMeshQualityForScene(null),
  );
  const [unitCellLineStyle, setUnitCellLineStyle] = useState<UnitCellLineStyle>(
    DEFAULT_UNIT_CELL_LINE_STYLE,
  );
  const [showCrystalAxisLabels, setShowCrystalAxisLabels] = useState(
    DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  );
  const [atomVectors, setAtomVectors] = useState<AtomVectorSettings>(() =>
    createDefaultAtomVectorSettings(null),
  );
  const [inspectedAtomId, setInspectedAtomId] = useState<string | null>(null);
  const [inspectedKPointIds, setInspectedKPointIds] = useState<string[]>([]);
  const [measuredAtomIds, setMeasuredAtomIds] = useState<string[]>([]);
  const [atomBoxSelection, setAtomBoxSelection] = useState<AtomBoxSelectionDrag | null>(null);
  const [pulseAtom, setPulseAtom] = useState<{ atomId: string; token: number } | null>(null);
  const [saveProjectMessage, setSaveProjectMessage] = useState<string | null>(null);
  const [viewSettingsMessage, setViewSettingsMessage] = useState<string | null>(null);
  const [pendingFileSaveConflict, setPendingFileSaveConflict] =
    useState<PendingFileSaveConflict | null>(null);
  const [activeCommonPanelTab, setActiveCommonPanelTab] =
    useState<CommonPanelTab>("display");
  const [cameraInteractionStore] = useState(createCameraInteractionStore);
  const [previewFpsStore] = useState(createPreviewFpsStore);
  const [isStructureSummaryCollapsed, setIsStructureSummaryCollapsed] = useState(false);
  const viewportSize = useViewportSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const atomBoxSelectionSnapshotRef = useRef<AtomBoxSelectionSnapshot | null>(null);
  const inspectedAtomIdRef = useRef<string | null>(null);
  const previousBrillouinZoneViewRef = useRef(false);
  const resetLoadedPreviewStateRef = useRef<ResetLoadedPreviewState>(() => {});
  const resetLoadedPreviewStateForPreview = useCallback<ResetLoadedPreviewState>(
    (nextScene, options) => {
      resetLoadedPreviewStateRef.current(nextScene, options);
    },
    [],
  );
  const clearAtomSelection = useCallback(() => {
    inspectedAtomIdRef.current = null;
    setInspectedAtomId(null);
    setInspectedKPointIds([]);
    setMeasuredAtomIds([]);
    setAtomBoxSelection(null);
    setPulseAtom(null);
  }, []);
  useEffect(() => {
    sendSessionHeartbeat();
    const heartbeatInterval = window.setInterval(
      sendSessionHeartbeat,
      SESSION_HEARTBEAT_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(heartbeatInterval);
    };
  }, []);
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      clearAtomSelection();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [clearAtomSelection]);
  const handlePreviewCleared = useCallback(() => {
    clearAtomSelection();
    setIsInspectorOpen(false);
    setIsStructureSummaryCollapsed(true);
  }, [clearAtomSelection]);
  const handleBondAlgorithmSceneLoaded = useCallback((nextScene: SceneSpec) => {
    clearAtomSelection();
    setPreviewMeshQuality(defaultPreviewMeshQualityForScene(nextScene));
    setUnitCellLineStyle(DEFAULT_UNIT_CELL_LINE_STYLE);
    setShowCrystalAxisLabels(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS);
    setAtomVectors(createDefaultAtomVectorSettings(nextScene));
  }, [clearAtomSelection]);
  const {
    bondAlgorithm,
    canSaveProjectToStartupPath,
    errorMessage,
    errorTitle,
    handleBondAlgorithmChange,
    handleFileChange,
    handleResetAllSettings,
    loadProjectPreview,
    previewStatus,
    scene,
    selectedFileName,
    setErrorMessage,
  } = useStructurePreview({
    onBondAlgorithmSceneLoaded: handleBondAlgorithmSceneLoaded,
    onPreviewCleared: handlePreviewCleared,
    resetLoadedPreviewState: resetLoadedPreviewStateForPreview,
  });
  const visibleScene = useMemo(
    () => visibleSceneForComponents(scene, componentVisibility),
    [componentVisibility, scene],
  );
  const brillouinZoneScene = useMemo(
    () => sceneForBrillouinZoneView(visibleScene),
    [visibleScene],
  );
  const isBrillouinZoneView =
    componentVisibility.brillouinZone && brillouinZoneScene !== null;
  const displayScene = isBrillouinZoneView ? brillouinZoneScene : visibleScene;
  const inspectedAtomInfo = useMemo(
    () =>
      isBrillouinZoneView
        ? null
        : inspectedAtomInfoForId(visibleScene, inspectedAtomId),
    [inspectedAtomId, isBrillouinZoneView, visibleScene],
  );
  const inspectedKPointInfos = useMemo<BrillouinSelectablePoint[]>(
    () => {
      if (!isBrillouinZoneView || !displayScene?.brillouinZone) {
        return [];
      }

      const selectablePoints = selectablePointsForBrillouinZone(displayScene.brillouinZone);
      const selectablePointsById = new Map(
        selectablePoints.map((point) => [point.id, point]),
      );
      return inspectedKPointIds.flatMap((kpointId) => {
        const point = selectablePointsById.get(kpointId);
        return point ? [point] : [];
      });
    },
    [displayScene, inspectedKPointIds, isBrillouinZoneView],
  );
  const atomMeasurementInfo = useMemo(
    () =>
      isBrillouinZoneView
        ? null
        : atomMeasurementInfoForIds(visibleScene, measuredAtomIds),
    [isBrillouinZoneView, measuredAtomIds, visibleScene],
  );
  const hasVisibleScene = displayScene !== null;
  const {
    cameraAnimatedCommandVersion,
    cameraCommandVersion,
    cameraControlsPanelState,
    cameraOrientationRef,
    cameraOrientationVersion,
    handleCameraCommandAnimationActiveChange,
    handleCameraControlsInteractionActiveChange,
    handleCameraOrientationChange,
    handleCameraPrimaryChange,
    handleCameraRollChange,
    handleCameraRollPreviewChange,
    handleCameraRollPreviewStart,
    handleCameraScreenAxisRotation,
    handleCameraSecondaryChange,
    handleCameraStateChange,
    handleDragSensitivityChange,
    handleGizmoAxisClick,
    handleInteractionLockedChange,
    handleInteractionModeChange,
    handleLightStrengthChange,
    handleResetView,
    handleShowFpsOverlayChange,
    isCameraCommandAnimationActive,
    isCameraControlsInteractionActive,
    isCameraRollInteractionActive,
    orientationGizmoFrameRequestRef,
    requestOrientationGizmoFrame,
    resetCameraForScene,
    restoreViewStateForScene,
    viewState,
  } = usePreviewCameraCommands({
    cameraInteractionStore,
    previewFpsStore,
    scene: displayScene,
    visibleScene: displayScene,
  });
  useEffect(() => {
    if (previousBrillouinZoneViewRef.current === isBrillouinZoneView) {
      return;
    }

    previousBrillouinZoneViewRef.current = isBrillouinZoneView;
    clearAtomSelection();
    resetCameraForScene(displayScene);
  }, [
    clearAtomSelection,
    displayScene,
    isBrillouinZoneView,
    resetCameraForScene,
  ]);
  const {
    exportError,
    exportProjectedSize,
    exportSettings,
    handleExportFigure,
    handleExportSettingsChange,
    isExporting,
    resetExportState,
    setExportError,
    syncProjectedSizeForExportTab,
  } = useFigureExportController({
    atomVectors,
    cameraOrientationRef,
    componentOpacity,
    componentVisibility,
    lightStrength: viewState.lightStrength,
    scene,
    selectedFileName,
    showCrystalAxisLabels,
    style,
    unitCellLineStyle,
    visibleScene: displayScene,
  });
  const {
    handleSceneContextMenuCapture,
    handleScenePointerDownCapture,
    handleScenePointerEndCapture,
    handleScenePointerMoveCapture,
    handleSceneWheelCapture,
    lockedInteractionFeedbackCount,
    resetLockedInteractionFeedback,
    triggerLockedInteractionFeedback,
  } = useLockedInteractionFeedback({
    hasVisibleScene,
    interactionLocked: viewState.interactionLocked,
  });

  const handleCopyViewSettings = useCallback(async () => {
    if (!scene) {
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setErrorMessage("Clipboard write is not available in this browser.");
      return;
    }

    try {
      await navigator.clipboard.writeText(
        viewSettingsClipboardJson({
          ...viewState,
          viewScale: cameraInteractionStore.getViewScaleSnapshot(),
        }),
      );
      setViewSettingsMessage("View settings copied.");
      setErrorMessage(null);
    } catch {
      setErrorMessage("View settings could not be copied.");
    }
  }, [cameraInteractionStore, scene, setErrorMessage, viewState]);

  const handlePasteViewSettings = useCallback(async () => {
    if (!scene) {
      return;
    }

    if (!navigator.clipboard?.readText) {
      setErrorMessage("Clipboard read is not available in this browser.");
      return;
    }

    try {
      const clipboardView = parseViewSettingsClipboardText(
        await navigator.clipboard.readText(),
      );
      restoreViewStateForScene(
        {
          ...viewState,
          ...clipboardView,
          interactionLocked: false,
          showFpsOverlay: viewState.showFpsOverlay,
        },
        scene,
      );
      setViewSettingsMessage("View settings applied.");
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "View settings could not be applied.",
      );
    }
  }, [restoreViewStateForScene, scene, setErrorMessage, viewState]);

  useEffect(() => {
    inspectedAtomIdRef.current = inspectedAtomId;
  }, [inspectedAtomId]);

  useEffect(() => {
    if (!pulseAtom) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPulseAtom((currentPulseAtom) =>
        currentPulseAtom?.token === pulseAtom.token ? null : currentPulseAtom,
      );
    }, ATOM_HIGHLIGHT_PULSE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [pulseAtom]);

  const resetLoadedPreviewState = useCallback(
    (
      nextScene: SceneSpec | null,
      options: ResetLoadedPreviewOptions = {},
    ) => {
      setErrorMessage(null);
      resetExportState();
      clearAtomSelection();
      if (!options.preserveInspectorOpen) {
        setIsInspectorOpen(false);
      }
      setComponentVisibility(createDefaultComponentVisibility(nextScene));
      setComponentOpacity(createDefaultComponentOpacity());
      setStyle(createDefaultStyle());
      setPreviewMeshQuality(defaultPreviewMeshQualityForScene(nextScene));
      setUnitCellLineStyle(DEFAULT_UNIT_CELL_LINE_STYLE);
      setShowCrystalAxisLabels(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS);
      setAtomVectors(createDefaultAtomVectorSettings(nextScene));
      if (!options.preserveActiveCommonPanelTab) {
        setActiveCommonPanelTab("display");
      }
      resetLockedInteractionFeedback();
      setIsStructureSummaryCollapsed(nextScene === null);
      resetCameraForScene(nextScene);
    },
    [
      clearAtomSelection,
      resetCameraForScene,
      resetExportState,
      resetLockedInteractionFeedback,
    ],
  );

  useLayoutEffect(() => {
    resetLoadedPreviewStateRef.current = resetLoadedPreviewState;
  }, [resetLoadedPreviewState]);

  const handlePreviewMeshQualityChange = useCallback((nextQuality: MeshQuality) => {
    setPreviewMeshQuality(nextQuality);
  }, []);

  const handleFogAffectsUnitCellChange = useCallback((fogAffectsUnitCell: boolean) => {
    setStyle((currentStyle) => ({
      ...currentStyle,
      fogAffectsUnitCell,
    }));
  }, []);
  const handleDistinguishSimilarColorsChange = useCallback((distinguishSimilarColors: boolean) => {
    setStyle((currentStyle) => ({
      ...currentStyle,
      distinguishSimilarColors,
    }));
  }, []);

  const handleAtomPulse = useCallback((atomId: string) => {
    if (atomId === inspectedAtomIdRef.current) {
      return;
    }

    inspectedAtomIdRef.current = null;
    setInspectedAtomId(null);
    setInspectedKPointIds([]);
    setPulseAtom((currentPulseAtom) => ({
      atomId,
      token: (currentPulseAtom?.token ?? 0) + 1,
    }));
  }, []);

  const handleAtomInspect = useCallback((atomId: string | null) => {
    inspectedAtomIdRef.current = atomId;
    setInspectedAtomId(atomId);
    if (atomId) {
      setInspectedKPointIds([]);
      setMeasuredAtomIds([]);
    }
  }, []);

  const handleKPointInspect = useCallback((kpointId: string | null) => {
    if (!kpointId) {
      setInspectedKPointIds([]);
      return;
    }

    setInspectedKPointIds((currentIds) =>
      currentIds.includes(kpointId)
        ? currentIds.filter((currentId) => currentId !== kpointId)
        : [...currentIds, kpointId],
    );
    if (kpointId) {
      inspectedAtomIdRef.current = null;
      setInspectedAtomId(null);
      setMeasuredAtomIds([]);
      setPulseAtom(null);
    }
  }, []);

  const toggleMeasuredAtomIds = useCallback((atomIds: readonly string[]) => {
    if (atomIds.length === 0) {
      return;
    }

    inspectedAtomIdRef.current = null;
    setInspectedAtomId(null);
    setInspectedKPointIds([]);
    setMeasuredAtomIds((currentAtomIds) => {
      let nextAtomIds = [...currentAtomIds];
      for (const atomId of atomIds) {
        if (nextAtomIds.includes(atomId)) {
          nextAtomIds = nextAtomIds.filter((currentAtomId) => currentAtomId !== atomId);
          continue;
        }

        nextAtomIds.push(atomId);
      }

      return nextAtomIds;
    });
  }, []);

  const handleAtomMeasure = useCallback((atomId: string) => {
    toggleMeasuredAtomIds([atomId]);
  }, [toggleMeasuredAtomIds]);

  const handleAtomBoxSelectionSnapshotChange = useCallback(
    (snapshot: AtomBoxSelectionSnapshot | null) => {
      atomBoxSelectionSnapshotRef.current = snapshot;
    },
    [],
  );

  const handleAtomBoxSelectionPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (
        !hasVisibleScene ||
        isBrillouinZoneView ||
        viewState.interactionLocked ||
        event.button !== 0 ||
        !event.ctrlKey
      ) {
        handleScenePointerDownCapture(event);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setAtomBoxSelection({
        currentX: event.clientX,
        currentY: event.clientY,
        isDragging: false,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      });
    },
    [
      handleScenePointerDownCapture,
      hasVisibleScene,
      isBrillouinZoneView,
      viewState.interactionLocked,
    ],
  );

  const handleAtomBoxSelectionPointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const currentSelection = atomBoxSelection;
      if (!currentSelection || currentSelection.pointerId !== event.pointerId) {
        handleScenePointerMoveCapture(event);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const dragDistance = Math.hypot(
        event.clientX - currentSelection.startX,
        event.clientY - currentSelection.startY,
      );
      setAtomBoxSelection({
        ...currentSelection,
        currentX: event.clientX,
        currentY: event.clientY,
        isDragging:
          currentSelection.isDragging ||
          dragDistance >= ATOM_BOX_SELECTION_DRAG_THRESHOLD_PX,
      });
    },
    [atomBoxSelection, handleScenePointerMoveCapture],
  );

  const handleAtomBoxSelectionPointerEndCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const currentSelection = atomBoxSelection;
      if (!currentSelection || currentSelection.pointerId !== event.pointerId) {
        handleScenePointerEndCapture(event);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setAtomBoxSelection(null);
      const selectionSnapshot = atomBoxSelectionSnapshotRef.current;
      if (!selectionSnapshot) {
        return;
      }

      if (currentSelection.isDragging) {
        const endX = event.clientX;
        const endY = event.clientY;
        toggleMeasuredAtomIds(
          selectionSnapshot.atomIdsInClientRect({
            bottom: Math.max(currentSelection.startY, endY),
            left: Math.min(currentSelection.startX, endX),
            right: Math.max(currentSelection.startX, endX),
            top: Math.min(currentSelection.startY, endY),
          }),
        );
        return;
      }

      const atomId = selectionSnapshot.atomIdAtClientPoint({
        x: event.clientX,
        y: event.clientY,
      });
      if (atomId) {
        toggleMeasuredAtomIds([atomId]);
      }
    },
    [
      atomBoxSelection,
      handleScenePointerEndCapture,
      toggleMeasuredAtomIds,
    ],
  );

  const handleAtomBoxSelectionPointerCancelCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const currentSelection = atomBoxSelection;
      if (!currentSelection || currentSelection.pointerId !== event.pointerId) {
        handleScenePointerEndCapture(event);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setAtomBoxSelection(null);
    },
    [atomBoxSelection, handleScenePointerEndCapture],
  );

  const elementColorOverrides = useMemo(
    () =>
      scene
        ? elementColorOverridesForStyle(scene.atoms, style)
        : undefined,
    [scene, style],
  );
  const legendColorScheme = baseColorSchemeForStyle(style);
  const legendEntries = useMemo(
    () =>
      isBrillouinZoneView
        ? []
        : deriveElementLegendEntries(scene, legendColorScheme, elementColorOverrides),
    [elementColorOverrides, isBrillouinZoneView, legendColorScheme, scene],
  );
  const handleLegendElementColorChange = useCallback((element: string, color: string) => {
    setStyle((currentStyle) => {
      const draft =
        currentStyle.colorSchemeMode === "custom" && currentStyle.customColormap
          ? currentStyle.customColormap
          : createCustomColormapFromScheme(currentStyle.colorScheme);

      return {
        ...currentStyle,
        colorSchemeMode: "custom",
        colorScheme: draft.baseColorScheme,
        customColormap: {
          baseColorScheme: draft.baseColorScheme,
          elements: {
            ...draft.elements,
            [element]: color,
          },
        },
      };
    });
  }, []);

  const handleExportProject = useCallback(async () => {
    if (!scene) {
      return;
    }

    const project = createPrettyLatticeProject({
      atomVectors,
      bondAlgorithm,
      componentOpacity,
      componentVisibility,
      exportSettings,
      previewMeshQuality,
      scene,
      selectedFileName,
      showCrystalAxisLabels,
      style,
      unitCellLineStyle,
      viewState: {
        ...viewState,
        viewScale: cameraInteractionStore.getViewScaleSnapshot(),
      },
    });

    const projectJson = prettyLatticeProjectJson(project);
    const suggestedFileName = prettyLatticeProjectFileName(selectedFileName);
    const downloadProject = (fileName = suggestedFileName) => {
      downloadBlob(
        new Blob([projectJson], {
          type: "application/json",
        }),
        fileName,
      );
      setPendingFileSaveConflict(null);
      setSaveProjectMessage("Project download started.");
    };
    const showSavedProject = (path: string) => {
      setPendingFileSaveConflict(null);
      setSaveProjectMessage(`Saved project: ${path}`);
      setErrorMessage(null);
      setExportError(null);
    };

    if (canSaveProjectToStartupPath) {
      try {
        const savedProject = await saveStartupProjectFile(projectJson);
        showSavedProject(savedProject.path);
        return;
      } catch (error) {
        if (error instanceof StartupProjectExistsError) {
          const targetPath = error.path ?? error.fileName ?? "the existing .prl file";
          setSaveProjectMessage(null);
          setPendingFileSaveConflict({
            fileName: suggestedFileName,
            kind: "project",
            path: targetPath,
            text: projectJson,
            suggestedFileName,
          });
          return;
        }
        // Fall back to browser download when the local API cannot write the startup path.
      }
    }

    downloadProject();
  }, [
    atomVectors,
    bondAlgorithm,
    cameraInteractionStore,
    canSaveProjectToStartupPath,
    componentOpacity,
    componentVisibility,
    exportSettings,
    previewMeshQuality,
    scene,
    selectedFileName,
    setErrorMessage,
    setExportError,
    showCrystalAxisLabels,
    style,
    unitCellLineStyle,
    viewState,
  ]);

  const handleExportStructureText = useCallback(async (format: StructureTextExportFormat) => {
    if (!scene) {
      return;
    }

    const exportFile = createStructureTextExportFile({
      componentVisibility,
      format,
      scene,
      selectedFileName,
    });
    const optionLabel =
      STRUCTURE_TEXT_EXPORT_FORMATS.find((option) => option.format === format)?.label ??
      "structure";

    const downloadStructure = () => {
      downloadBlob(exportFile.blob, exportFile.fileName);
      setPendingFileSaveConflict(null);
      setSaveProjectMessage(`${optionLabel} download started.`);
    };
    const showSavedStructure = (path: string) => {
      setPendingFileSaveConflict(null);
      setSaveProjectMessage(`Saved ${optionLabel}: ${path}`);
      setErrorMessage(null);
      setExportError(null);
    };

    if (canSaveProjectToStartupPath) {
      try {
        const savedFile = await saveStartupTextFile(exportFile.fileName, exportFile.text);
        showSavedStructure(savedFile.path);
        return;
      } catch (error) {
        if (error instanceof StartupFileExistsError) {
          const targetPath = error.path ?? error.fileName ?? exportFile.fileName;
          setSaveProjectMessage(null);
          setPendingFileSaveConflict({
            fileName: exportFile.fileName,
            kind: "structure",
            path: targetPath,
            text: exportFile.text,
            suggestedFileName: exportFile.fileName,
          });
          return;
        }
        // Fall back to browser download when the local API cannot write the startup path.
      }
    }

    downloadStructure();
  }, [
    canSaveProjectToStartupPath,
    componentVisibility,
    scene,
    selectedFileName,
    setErrorMessage,
    setExportError,
  ]);

  const handleReplaceSavedFile = useCallback(async () => {
    if (!pendingFileSaveConflict) {
      return;
    }

    try {
      const savedFile =
        pendingFileSaveConflict.kind === "project"
          ? await saveStartupProjectFile(pendingFileSaveConflict.text, { overwrite: true })
          : await saveStartupTextFile(
              pendingFileSaveConflict.fileName,
              pendingFileSaveConflict.text,
              { overwrite: true },
            );
      setPendingFileSaveConflict(null);
      setSaveProjectMessage(`Saved file: ${savedFile.path}`);
      setErrorMessage(null);
      setExportError(null);
    } catch {
      setErrorMessage("File could not be saved.");
    }
  }, [pendingFileSaveConflict, setErrorMessage, setExportError]);

  const handleDownloadFileConflict = useCallback(() => {
    if (!pendingFileSaveConflict) {
      return;
    }

    downloadBlob(
      new Blob([pendingFileSaveConflict.text], {
        type:
          pendingFileSaveConflict.kind === "project"
            ? "application/json"
            : "text/plain;charset=utf-8",
      }),
      pendingFileSaveConflict.suggestedFileName,
    );
    setPendingFileSaveConflict(null);
    setSaveProjectMessage("File download started.");
  }, [pendingFileSaveConflict]);

  const handleCancelFileConflict = useCallback(() => {
    setPendingFileSaveConflict(null);
  }, []);

  useEffect(() => {
    if (!saveProjectMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSaveProjectMessage(null);
    }, SAVE_PROJECT_MESSAGE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [saveProjectMessage]);

  useEffect(() => {
    if (!viewSettingsMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setViewSettingsMessage(null);
    }, VIEW_SETTINGS_MESSAGE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [viewSettingsMessage]);

  const handleProjectLoaded = useCallback(
    (
      projectText: string,
      fileName: string,
      options: { source?: "project" | "startup-project" } = {},
    ) => {
      try {
        const project = parsePrettyLatticeProjectFile(projectText);
        const projectScene = project.structure.scene;

        loadProjectPreview(project, fileName, { source: options.source });
        setComponentVisibility(project.display.visibility);
        setComponentOpacity(project.display.opacity);
        setStyle(project.display.style);
        setPreviewMeshQuality(project.display.previewMeshQuality);
        setUnitCellLineStyle(project.display.unitCellLineStyle);
        setShowCrystalAxisLabels(project.display.showCrystalAxisLabels);
        setAtomVectors(normalizeAtomVectorSettings(project.overlays.atomVectors, projectScene));
        handleExportSettingsChange(project.export.settings);
        restoreViewStateForScene(project.view, projectScene);
        setActiveCommonPanelTab("display");
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "This is not a Pretty Lattice project file.",
        );
      }
    },
    [
      handleExportSettingsChange,
      loadProjectPreview,
      restoreViewStateForScene,
      setErrorMessage,
    ],
  );

  const handleOpenFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      if (!file) {
        return;
      }

      if (!isPrettyLatticeProjectFileName(file.name)) {
        await handleFileChange(event);
        return;
      }

      event.target.value = "";
      try {
        handleProjectLoaded(await file.text(), file.name);
      } catch {
        setErrorMessage("Pretty Lattice project file could not be read.");
      }
    },
    [handleFileChange, handleProjectLoaded, setErrorMessage],
  );

  useEffect(() => {
    if (!shouldLoadStartupProjectFile()) {
      return;
    }

    let isCurrent = true;

    async function loadStartupProject() {
      try {
        const project = await loadStartupProjectFile();
        if (isCurrent) {
          handleProjectLoaded(project.text, project.fileName, {
            source: "startup-project",
          });
        }
      } catch {
        if (isCurrent) {
          setErrorMessage("Pretty Lattice project file could not be loaded.");
        }
      }
    }

    void loadStartupProject();

    return () => {
      isCurrent = false;
    };
  }, [handleProjectLoaded, setErrorMessage]);

  const previewSafeArea = previewSafeAreaForInspector();
  const sceneOffsetX = sceneOffsetXForInspector(isInspectorOpen, viewportSize.width);
  const effectivePreviewSafeArea = useMemo(
    () => previewSafeAreaForViewport(previewSafeArea, viewportSize.width),
    [previewSafeArea, viewportSize.width],
  );
  const orientationGizmoSize = useMemo(
    () => orientationGizmoSizeForViewport(viewportSize, effectivePreviewSafeArea),
    [effectivePreviewSafeArea, viewportSize],
  );
  const renderPreviewContextMenuContent = () => (
    <ContextMenuContent className="w-40">
      <ContextMenuGroup>
        <ContextMenuItem
          disabled={!scene || previewStatus === "loading"}
          onSelect={handleResetView}
        >
          <RotateCcw aria-hidden="true" />
          Reset view
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem onSelect={() => fileInputRef.current?.click()}>
          <FolderOpen aria-hidden="true" />
          Open file
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!scene || previewStatus === "loading"}
          onSelect={handleExportProject}
        >
          <FileDown aria-hidden="true" />
          Save project
        </ContextMenuItem>
        {STRUCTURE_TEXT_EXPORT_FORMATS.map((option) => (
          <ContextMenuItem
            key={option.format}
            disabled={!scene || previewStatus === "loading"}
            onSelect={() => {
              void handleExportStructureText(option.format);
            }}
          >
            <FileDown aria-hidden="true" />
            Save {option.label}
          </ContextMenuItem>
        ))}
        <ContextMenuItem
          disabled={!scene || isExporting || previewStatus === "loading"}
          onSelect={() => {
            void handleExportFigure();
          }}
        >
          <ImageDown aria-hidden="true" />
          Export figure
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem
          disabled={!scene || previewStatus === "loading"}
          onSelect={() => {
            void handleResetAllSettings();
          }}
        >
          <RefreshCw aria-hidden="true" />
          Reset all
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );

  useEffect(() => {
    if (!inspectedAtomId) {
      return;
    }

    if (
      isBrillouinZoneView ||
      !visibleScene ||
      !componentVisibility.atoms ||
      !inspectedAtomInfo
    ) {
      setInspectedAtomId(null);
    }
  }, [
    componentVisibility.atoms,
    inspectedAtomId,
    inspectedAtomInfo,
    isBrillouinZoneView,
    visibleScene,
  ]);

  useEffect(() => {
    if (inspectedKPointIds.length === 0) {
      return;
    }

    if (
      !isBrillouinZoneView ||
      !displayScene?.brillouinZone
    ) {
      setInspectedKPointIds([]);
      return;
    }

    const visibleKPointIds = new Set(
      selectablePointsForBrillouinZone(displayScene.brillouinZone).map((point) => point.id),
    );
    const nextKPointIds = inspectedKPointIds.filter((kpointId) =>
      visibleKPointIds.has(kpointId),
    );
    if (nextKPointIds.length !== inspectedKPointIds.length) {
      setInspectedKPointIds(nextKPointIds);
    }
  }, [
    displayScene,
    inspectedKPointIds,
    isBrillouinZoneView,
  ]);

  useEffect(() => {
    if (measuredAtomIds.length === 0) {
      return;
    }

    const visibleAtomIds = new Set(visibleScene?.atoms.map((atom) => atom.id) ?? []);
    if (
      !visibleScene ||
      isBrillouinZoneView ||
      !componentVisibility.atoms ||
      measuredAtomIds.some((atomId) => !visibleAtomIds.has(atomId))
    ) {
      setMeasuredAtomIds([]);
    }
  }, [
    componentVisibility.atoms,
    isBrillouinZoneView,
    measuredAtomIds,
    visibleScene,
  ]);

  useEffect(() => {
    if (activeCommonPanelTab !== "export") {
      return;
    }

    syncProjectedSizeForExportTab();
  }, [activeCommonPanelTab, cameraOrientationVersion, syncProjectedSizeForExportTab]);

  return (
    <main className="relative h-dvh min-w-80 overflow-hidden bg-background text-foreground">
      <input
        ref={fileInputRef}
        type="file"
        aria-label="Structure file"
        className="hidden"
        tabIndex={-1}
        onChange={(event) => void handleOpenFileChange(event)}
      />

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <section
            className="scene-stage absolute inset-0 transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(${sceneOffsetX}px)` }}
            aria-label="Crystal structure preview"
            onPointerCancelCapture={handleAtomBoxSelectionPointerCancelCapture}
            onContextMenuCapture={handleSceneContextMenuCapture}
            onPointerDownCapture={handleAtomBoxSelectionPointerDownCapture}
            onPointerMoveCapture={handleAtomBoxSelectionPointerMoveCapture}
            onPointerUpCapture={handleAtomBoxSelectionPointerEndCapture}
            onWheelCapture={handleSceneWheelCapture}
          >
            {displayScene ? (
              <LatticeScene
                cameraAnimatedCommandVersion={cameraAnimatedCommandVersion}
                cameraCommandVersion={cameraCommandVersion}
                cameraState={viewState.camera}
                cameraOrientationRef={cameraOrientationRef}
                onCameraOrientationFrame={requestOrientationGizmoFrame}
                onCameraOrientationChange={handleCameraOrientationChange}
                onCameraCommandAnimationActiveChange={handleCameraCommandAnimationActiveChange}
                onCameraControlsInteractionActiveChange={
                  handleCameraControlsInteractionActiveChange
                }
                onAtomInspect={handleAtomInspect}
                onKPointInspect={handleKPointInspect}
                onAtomBoxSelectionSnapshotChange={handleAtomBoxSelectionSnapshotChange}
                onAtomMeasure={handleAtomMeasure}
                onAtomPulse={handleAtomPulse}
                onLockedInteractionAttempt={triggerLockedInteractionFeedback}
                cameraInteractionStore={cameraInteractionStore}
                suspendCameraOrientationUpdates={
                  isCameraCommandAnimationActive ||
                  isCameraControlsInteractionActive ||
                  isCameraRollInteractionActive
                }
                interactionLocked={viewState.interactionLocked}
                interactionMode={viewState.interactionMode}
                layoutScene={displayScene}
                resetCounter={viewState.resetCounter}
                safeArea={previewSafeArea}
                scene={displayScene}
                inspectedAtomId={isBrillouinZoneView ? null : inspectedAtomId}
                inspectedKPointIds={inspectedKPointIds}
                measuredAtomIds={isBrillouinZoneView ? [] : measuredAtomIds}
                pulseAtomId={isBrillouinZoneView ? null : pulseAtom?.atomId ?? null}
                pulseToken={isBrillouinZoneView ? 0 : pulseAtom?.token ?? 0}
                previewMeshQuality={previewMeshQuality}
                componentOpacity={componentOpacity}
                dragSensitivity={viewState.dragSensitivity}
                lightStrength={viewState.lightStrength}
                previewFpsStore={previewFpsStore}
                style={style}
                atomLabelSettings={
                  !isBrillouinZoneView && componentVisibility.atomLabels.enabled
                    ? componentVisibility.atomLabels
                    : null
                }
                atomVectors={isBrillouinZoneView ? null : atomVectors}
                showAtoms={!isBrillouinZoneView && componentVisibility.atoms}
                showBrillouinZone={isBrillouinZoneView}
                showFpsOverlay={viewState.showFpsOverlay}
                showUnitCell={!isBrillouinZoneView && componentVisibility.unitCell}
                unitCellLineStyle={unitCellLineStyle}
              />
            ) : (
              <div
                className="grid h-full w-full place-items-center bg-background text-sm text-muted-foreground"
                data-state={previewStatus}
              >
                {previewStatus === "loading" ? (
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      data-testid="loading-structure-spinner"
                      className="inline-flex size-3 shrink-0 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-safe:animate-spin motion-safe:[animation-duration:450ms]"
                    />
                    Loading structure
                  </span>
                ) : (
                  "No structure loaded"
                )}
              </div>
            )}
          </section>
        </ContextMenuTrigger>
        {renderPreviewContextMenuContent()}
      </ContextMenu>

      {atomBoxSelection?.isDragging ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-40 rounded-[3px] border border-primary bg-primary/10 shadow-sm"
          style={{
            height: Math.abs(atomBoxSelection.currentY - atomBoxSelection.startY),
            left: Math.min(atomBoxSelection.startX, atomBoxSelection.currentX),
            top: Math.min(atomBoxSelection.startY, atomBoxSelection.currentY),
            width: Math.abs(atomBoxSelection.currentX - atomBoxSelection.startX),
          }}
        />
      ) : null}

      {displayScene ? (
        <OrientationGizmo
          axisLabels={isBrillouinZoneView ? RECIPROCAL_AXIS_LABELS : undefined}
          cameraOrientationRef={cameraOrientationRef}
          cellVectors={displayScene.cell.vectors}
          className="absolute"
          frameRequestRef={orientationGizmoFrameRequestRef}
          onAxisClick={handleGizmoAxisClick}
          orientationVersion={cameraOrientationVersion}
          showLabels={showCrystalAxisLabels}
          style={orientationGizmoContainerStyle(effectivePreviewSafeArea, orientationGizmoSize)}
        />
      ) : null}

      {legendEntries.length > 0 ? (
        <ElementLegend
          entries={legendEntries}
          offsetX={sceneOffsetX}
          onElementColorChange={handleLegendElementColorChange}
          safeArea={previewSafeArea}
        />
      ) : null}

      {atomMeasurementInfo ? (
        <AtomDistanceCard
          atomVectors={atomVectors}
          info={atomMeasurementInfo}
          isInspectorOpen={isInspectorOpen}
          onClose={() => setMeasuredAtomIds([])}
        />
      ) : inspectedAtomInfo ? (
        <AtomInspectorCard
          atomVectors={atomVectors}
          colorScheme={legendColorScheme}
          colorOverrides={elementColorOverrides}
          info={inspectedAtomInfo}
          isInspectorOpen={isInspectorOpen}
          onClose={() => setInspectedAtomId(null)}
        />
      ) : inspectedKPointInfos.length > 0 ? (
        <KPointInspectorCard
          infos={inspectedKPointInfos}
          isInspectorOpen={isInspectorOpen}
          onClose={() => setInspectedKPointIds([])}
        />
      ) : null}

      <div
        className={cn(
          "absolute left-4 top-4 flex w-[296px] max-w-[calc(100vw-2rem)] flex-col gap-4",
          isInspectorOpen ? "max-[760px]:hidden" : null,
        )}
      >
        <StructureSummaryCard
          isCollapsed={isStructureSummaryCollapsed}
          onCollapsedChange={setIsStructureSummaryCollapsed}
          onOpenStructure={() => fileInputRef.current?.click()}
          onSaveProject={handleExportProject}
          onSaveStructure={(format) => void handleExportStructureText(format)}
          previewStatus={previewStatus}
          scene={scene}
          selectedFileName={selectedFileName}
        />

        {scene ? (
          <div>
            <CommonControlsPanel
              activeTab={activeCommonPanelTab}
              cameraState={cameraControlsPanelState}
              cellVectors={scene.cell.vectors}
              componentOpacity={componentOpacity}
              style={style}
              exportProjectedSize={exportProjectedSize ?? undefined}
              componentVisibility={componentVisibility}
              exportError={exportError}
              exportSettings={exportSettings}
              hasPolyhedra={hasPolyhedra(scene)}
              isExporting={isExporting}
              sceneAtoms={scene.atoms}
              atomVectors={atomVectors}
              onActiveTabChange={setActiveCommonPanelTab}
              onAtomRadiusModelChange={(atomRadiusModel) => {
                setStyle((currentStyle) => ({ ...currentStyle, atomRadiusModel }));
              }}
              onCameraPrimaryChange={handleCameraPrimaryChange}
              onCameraRollPreviewChange={handleCameraRollPreviewChange}
              onCameraRollPreviewStart={handleCameraRollPreviewStart}
              onCameraRollChange={handleCameraRollChange}
              onCameraSecondaryChange={handleCameraSecondaryChange}
              onCameraStateChange={handleCameraStateChange}
              onAtomVectorsChange={setAtomVectors}
              onComponentOpacityChange={setComponentOpacity}
              onExport={handleExportFigure}
              onExportSettingsChange={handleExportSettingsChange}
              onStyleChange={setStyle}
              onComponentVisibilityChange={setComponentVisibility}
            />
          </div>
        ) : null}
      </div>

      {errorMessage ? (
        <Alert
          className={cn(
            "absolute top-4 z-20 w-[320px] rounded-xl shadow-sm shadow-foreground/5",
            scene ? "left-[386px]" : "left-[328px]",
            "max-[760px]:left-4 max-[760px]:right-4 max-[760px]:top-[10rem] max-[760px]:w-auto",
          )}
          onDismiss={() => setErrorMessage(null)}
        >
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle className="font-semibold">{errorTitle}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {saveProjectMessage ? (
        <Alert
          className={cn(
            "absolute top-4 z-20 min-w-[320px] max-w-[min(720px,calc(100vw-2rem))] rounded-xl shadow-sm shadow-foreground/5",
            scene ? "left-[386px]" : "left-[328px]",
            "max-[760px]:left-4 max-[760px]:right-4 max-[760px]:top-[10rem] max-[760px]:w-auto",
          )}
          onDismiss={() => setSaveProjectMessage(null)}
        >
          <FileDown aria-hidden="true" />
          <AlertTitle className="font-semibold">File saved</AlertTitle>
          <AlertDescription className="break-all">{saveProjectMessage}</AlertDescription>
        </Alert>
      ) : null}

      {pendingFileSaveConflict ? (
        <Alert
          className={cn(
            "absolute top-4 z-30 min-w-[320px] max-w-[min(760px,calc(100vw-2rem))] rounded-xl shadow-sm shadow-foreground/5",
            scene ? "left-[386px]" : "left-[328px]",
            "max-[760px]:left-4 max-[760px]:right-4 max-[760px]:top-[10rem] max-[760px]:w-auto",
          )}
          onDismiss={handleCancelFileConflict}
        >
          <FileDown aria-hidden="true" />
          <AlertTitle className="font-semibold">File already exists</AlertTitle>
          <AlertDescription className="gap-2">
            <p className="break-all">
              {pendingFileSaveConflict.path}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                className="h-7 rounded-full px-3 text-xs"
                onClick={() => void handleReplaceSavedFile()}
              >
                Replace
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 rounded-full px-3 text-xs"
                onClick={handleDownloadFileConflict}
              >
                Save as
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-full px-3 text-xs"
                onClick={handleCancelFileConflict}
              >
                Cancel
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {scene ? (
        <>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Brillouin zone"
                  aria-pressed={isBrillouinZoneView}
                  disabled={!brillouinZoneScene}
                  className={cn(
                    TOOL_ICON_BUTTON_CLASS,
                    "absolute right-32 top-4 z-30 size-8 rounded-[10px] [&_svg]:size-4",
                    isBrillouinZoneView
                      ? TOOL_ICON_BUTTON_ACTIVE_CLASS
                      : "border-foreground/10 bg-card/80 backdrop-blur-xl backdrop-saturate-150",
                  )}
                  onClick={() => {
                    setComponentVisibility((currentVisibility) => ({
                      ...currentVisibility,
                      brillouinZone: !isBrillouinZoneView,
                    }));
                  }}
                >
                  <Orbit aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Brillouin zone</TooltipContent>
            </Tooltip>
            <div className="absolute right-14 top-4 z-30 flex h-8 overflow-hidden rounded-[10px] border border-foreground/10 bg-card/80 shadow-sm shadow-foreground/5 backdrop-blur-xl backdrop-saturate-150">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Copy view settings"
                    className={cn(
                      TOOL_ICON_BUTTON_CLASS,
                      "h-8 w-8 rounded-none border-0 bg-transparent [&_svg]:size-4",
                    )}
                    onClick={() => void handleCopyViewSettings()}
                  >
                    <Copy aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Copy view settings</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Paste view settings"
                    className={cn(
                      TOOL_ICON_BUTTON_CLASS,
                      "h-8 w-8 rounded-none border-0 border-l border-foreground/10 bg-transparent [&_svg]:size-4",
                    )}
                    onClick={() => void handlePasteViewSettings()}
                  >
                    <ClipboardPaste aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Paste view settings</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          {viewSettingsMessage ? (
            <div className="pointer-events-none absolute right-14 top-14 z-30 max-w-[min(20rem,calc(100vw-6rem))] rounded-lg border border-foreground/10 bg-card/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm shadow-foreground/5 backdrop-blur-xl backdrop-saturate-150">
              {viewSettingsMessage}
            </div>
          ) : null}

          {isInspectorOpen ? null : (
            <ViewAxisRotationControl onRotate={handleCameraScreenAxisRotation} />
          )}

          <ViewControlRail
            className={cn(isInspectorOpen ? "max-[760px]:hidden" : null)}
            interactionLocked={viewState.interactionLocked}
            lockedInteractionFeedbackCount={lockedInteractionFeedbackCount}
            onInteractionLockedChange={handleInteractionLockedChange}
            onResetView={handleResetView}
            cameraInteractionStore={cameraInteractionStore}
            previewFpsStore={previewFpsStore}
            showFps={viewState.showFpsOverlay}
          />

          <InspectorToggle
            isOpen={isInspectorOpen}
            onOpenChange={setIsInspectorOpen}
          />

          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="contents">
                <InspectorSidebar
                  bondAlgorithm={bondAlgorithm}
                  dragSensitivity={viewState.dragSensitivity}
                  interactionMode={viewState.interactionMode}
                  lightStrength={viewState.lightStrength}
                  isCustomColorScheme={style.colorSchemeMode === "custom"}
                  isOpen={isInspectorOpen}
                  isSceneLoading={previewStatus === "loading"}
                  previewMeshQuality={previewMeshQuality}
                  fogAffectsUnitCell={style.fogAffectsUnitCell}
                  distinguishSimilarColors={style.distinguishSimilarColors}
                  showFpsOverlay={viewState.showFpsOverlay}
                  showCrystalAxisLabels={showCrystalAxisLabels}
                  unitCellLineStyle={unitCellLineStyle}
                  onBondAlgorithmChange={(nextBondAlgorithm) => {
                    void handleBondAlgorithmChange(nextBondAlgorithm);
                  }}
                  onDragSensitivityChange={handleDragSensitivityChange}
                  onInteractionModeChange={handleInteractionModeChange}
                  onLightStrengthChange={handleLightStrengthChange}
                  onPreviewMeshQualityChange={handlePreviewMeshQualityChange}
                  onFogAffectsUnitCellChange={handleFogAffectsUnitCellChange}
                  onDistinguishSimilarColorsChange={handleDistinguishSimilarColorsChange}
                  onShowFpsOverlayChange={handleShowFpsOverlayChange}
                  onShowCrystalAxisLabelsChange={setShowCrystalAxisLabels}
                  onUnitCellLineStyleChange={setUnitCellLineStyle}
                />
              </div>
            </ContextMenuTrigger>
            {renderPreviewContextMenuContent()}
          </ContextMenu>
        </>
      ) : null}
    </main>
  );
}
