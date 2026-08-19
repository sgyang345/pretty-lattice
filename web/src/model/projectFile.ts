import type { BondAlgorithm, SceneSpec } from "../api/scene";
import type {
  ChargeDensityDisplayState,
  ComponentOpacityState,
  ComponentVisibilityState,
} from "./displayState";
import {
  normalizeChargeDensityDisplayState,
  normalizeComponentOpacityState,
  normalizeComponentVisibilityState,
} from "./displayState";
import type { ExportSettingsState, MeshQuality } from "./exportSettings";
import type { StyleState } from "./appearance";
import type { UnitCellLineStyle } from "./rendering";
import type { PreviewViewState } from "./viewState";
import {
  clampDragSensitivity,
  clampLightStrength,
  clampViewScale,
  normalizeProjectionMode,
} from "./viewState";
import {
  createDefaultAtomVectorSettings,
  normalizeAtomVectorSettings,
  type AtomVectorSettings,
} from "./atomVectors";

export const PRETTY_LATTICE_PROJECT_FORMAT = "pretty-lattice-project";
export const PRETTY_LATTICE_PROJECT_VERSION = 1;

export interface PrettyLatticeProjectFile {
  display: {
    chargeDensity?: ChargeDensityDisplayState;
    opacity: ComponentOpacityState;
    previewMeshQuality: MeshQuality;
    showCrystalAxisLabels: boolean;
    style: StyleState;
    unitCellLineStyle: UnitCellLineStyle;
    visibility: ComponentVisibilityState;
  };
  export: {
    settings: ExportSettingsState;
  };
  format: typeof PRETTY_LATTICE_PROJECT_FORMAT;
  overlays: {
    atomVectors: AtomVectorSettings;
  };
  source: {
    bondAlgorithm: BondAlgorithm;
    name: string | null;
  };
  structure: {
    scene: SceneSpec;
  };
  version: typeof PRETTY_LATTICE_PROJECT_VERSION;
  view: PreviewViewState;
}

export interface CreatePrettyLatticeProjectOptions {
  bondAlgorithm: BondAlgorithm;
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  chargeDensityDisplay?: ChargeDensityDisplayState;
  exportSettings: ExportSettingsState;
  previewMeshQuality: MeshQuality;
  scene: SceneSpec;
  selectedFileName: string | null;
  showCrystalAxisLabels: boolean;
  style: StyleState;
  unitCellLineStyle: UnitCellLineStyle;
  viewState: PreviewViewState;
  atomVectors?: AtomVectorSettings;
}

export function createPrettyLatticeProject({
  bondAlgorithm,
  componentOpacity,
  componentVisibility,
  chargeDensityDisplay,
  exportSettings,
  previewMeshQuality,
  scene,
  selectedFileName,
  showCrystalAxisLabels,
  style,
  unitCellLineStyle,
  viewState,
  atomVectors,
}: CreatePrettyLatticeProjectOptions): PrettyLatticeProjectFile {
  const normalizedAtomVectors =
    atomVectors ?? createDefaultAtomVectorSettings(scene);

  return {
    display: {
      chargeDensity: normalizeChargeDensityDisplayState(chargeDensityDisplay, scene),
      opacity: componentOpacity,
      previewMeshQuality,
      showCrystalAxisLabels,
      style,
      unitCellLineStyle,
      visibility: componentVisibility,
    },
    export: {
      settings: exportSettings,
    },
    format: PRETTY_LATTICE_PROJECT_FORMAT,
    overlays: {
      atomVectors: normalizeAtomVectorSettings(normalizedAtomVectors, scene),
    },
    source: {
      bondAlgorithm,
      name: selectedFileName,
    },
    structure: {
      scene,
    },
    version: PRETTY_LATTICE_PROJECT_VERSION,
    view: viewState,
  };
}

export function isPrettyLatticeProjectFileName(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".prl");
}

export function parsePrettyLatticeProjectFile(text: string): PrettyLatticeProjectFile {
  const value = JSON.parse(text) as unknown;
  if (!isPrettyLatticeProjectFile(value)) {
    throw new Error("This is not a Pretty Lattice project file.");
  }

  return normalizePrettyLatticeProjectFile(value);
}

export function prettyLatticeProjectFileName(sourceName: string | null): string {
  const stem = (sourceName ?? "pretty-lattice-project")
    .replace(/\.[^.]*$/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${stem || "pretty-lattice-project"}.prl`;
}

export function prettyLatticeProjectJson(project: PrettyLatticeProjectFile): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

function isPrettyLatticeProjectFile(value: unknown): value is PrettyLatticeProjectFile {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.format === PRETTY_LATTICE_PROJECT_FORMAT &&
    value.version === PRETTY_LATTICE_PROJECT_VERSION &&
    isRecord(value.structure) &&
    isRecord(value.structure.scene) &&
    Array.isArray(value.structure.scene.atoms) &&
    isRecord(value.display) &&
    isRecord(value.export) &&
    isRecord(value.source) &&
    isRecord(value.view)
  );
}

function normalizePrettyLatticeProjectFile(
  project: PrettyLatticeProjectFile,
): PrettyLatticeProjectFile {
  const overlays: Record<string, unknown> = isRecord(project.overlays)
    ? project.overlays
    : {};
  return {
    ...project,
    display: {
      ...project.display,
      chargeDensity: normalizeChargeDensityDisplayState(
        project.display.chargeDensity,
        project.structure.scene,
      ),
      opacity: normalizeComponentOpacityState(project.display.opacity),
      visibility: normalizeComponentVisibilityState(project.display.visibility),
    },
    overlays: {
      ...overlays,
      atomVectors: normalizeAtomVectorSettings(
        overlays.atomVectors as Partial<AtomVectorSettings> | null | undefined,
        project.structure.scene,
      ),
    },
    view: normalizeProjectViewState(project.view),
  };
}

function normalizeProjectViewState(view: PreviewViewState): PreviewViewState {
  return {
    ...view,
    dragSensitivity: clampDragSensitivity(view.dragSensitivity),
    lightStrength: clampLightStrength(view.lightStrength),
    projectionMode: normalizeProjectionMode(
      (view as Partial<PreviewViewState>).projectionMode,
    ),
    viewScale: clampViewScale(view.viewScale),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
