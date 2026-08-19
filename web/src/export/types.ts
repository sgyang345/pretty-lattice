import type { SceneSpec } from "../api/scene";
import type { CameraOrientationRef } from "../scene/LatticeScene";
import type {
  AtomVectorSettings,
  ChargeDensityDisplayState,
  ComponentOpacityState,
  ComponentVisibilityState,
  ExportFormat,
  ExportSettingsState,
  ProjectionMode,
  StyleState,
  UnitCellLineStyle,
} from "../model";

export interface CreateFigureExportOptions {
  atomVectors: AtomVectorSettings;
  cameraOrientationRef: CameraOrientationRef;
  chargeDensityDisplay: ChargeDensityDisplayState;
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  fileName: string | null;
  lightStrength: number;
  projectionMode: ProjectionMode;
  scene: SceneSpec;
  settings: ExportSettingsState;
  showCrystalAxisLabels: boolean;
  style: StyleState;
  unitCellLineStyle: UnitCellLineStyle;
}

export interface FigureExportFile {
  blob: Blob;
  fileName: string;
  format: ExportFormat;
}

export type RasterExportFileFormat = Exclude<ExportFormat, "pdf">;
