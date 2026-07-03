import type { BondAlgorithm, SceneSpec } from "../api/scene";
import type {
  ComponentOpacityState,
  ComponentVisibilityState,
} from "./displayState";
import { normalizeComponentVisibilityState } from "./displayState";
import type { ExportSettingsState, MeshQuality } from "./exportSettings";
import type { StyleState } from "./appearance";
import type { UnitCellLineStyle } from "./rendering";
import type { PreviewViewState } from "./viewState";
import {
  createDefaultAtomVectorSettings,
  normalizeAtomVectorSettings,
  type AtomVectorSettings,
} from "./atomVectors";

export const PRETTY_LATTICE_PROJECT_FORMAT = "pretty-lattice-project";
export const PRETTY_LATTICE_PROJECT_VERSION = 1;

export interface PrettyLatticeProjectFile {
  display: {
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
      visibility: normalizeComponentVisibilityState(project.display.visibility),
    },
    overlays: {
      ...overlays,
      atomVectors: normalizeAtomVectorSettings(
        overlays.atomVectors as Partial<AtomVectorSettings> | null | undefined,
        project.structure.scene,
      ),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
