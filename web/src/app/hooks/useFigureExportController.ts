import {
  type RefObject,
  useCallback,
  useState,
} from "react";
import type { Quaternion } from "three";

import type { SceneSpec } from "../../api/scene";
import { createCameraPoseSnapshot } from "../../scene/cameraPose";
import { computeStructureExportProjectedSize } from "../../scene/exportFrame";
import {
  createFigureExportFiles,
  type FigureExportFile,
} from "../exportFigure";
import {
  type AtomVectorSettings,
  type ChargeDensityDisplayState,
  createDefaultExportSettings,
  setExportFormat,
  syncExportSettingsProjectedSize,
  type ComponentOpacityState,
  type ComponentVisibilityState,
  type ExportProjectedSize,
  type ExportSettingsState,
  type ProjectionMode,
  type StyleState,
  type UnitCellLineStyle,
} from "../../model";

type CopyImageFormat = "jpg" | "png";

interface UseFigureExportControllerOptions {
  atomVectors: AtomVectorSettings;
  cameraOrientationRef: RefObject<Quaternion>;
  chargeDensityDisplay: ChargeDensityDisplayState;
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  lightStrength: number;
  scene: SceneSpec | null;
  onCopyImageFiles: (files: FigureExportFile[], format: CopyImageFormat) => Promise<boolean>;
  onExportFiles: (files: FigureExportFile[]) => Promise<void>;
  projectionMode: ProjectionMode;
  selectedFileName: string | null;
  showCrystalAxisLabels: boolean;
  style: StyleState;
  unitCellLineStyle: UnitCellLineStyle;
  visibleScene: SceneSpec | null;
}

export function useFigureExportController({
  atomVectors,
  cameraOrientationRef,
  chargeDensityDisplay,
  componentOpacity,
  componentVisibility,
  lightStrength,
  onCopyImageFiles,
  onExportFiles,
  projectionMode,
  scene,
  selectedFileName,
  showCrystalAxisLabels,
  style,
  unitCellLineStyle,
  visibleScene,
}: UseFigureExportControllerOptions) {
  const [isExporting, setIsExporting] = useState(false);
  const [copyingImageFormat, setCopyingImageFormat] = useState<CopyImageFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProjectedSize, setExportProjectedSize] =
    useState<ExportProjectedSize | null>(null);
  const [exportSettings, setExportSettings] = useState(createDefaultExportSettings);

  const resetExportState = useCallback(() => {
    setExportError(null);
    setExportProjectedSize(null);
    setExportSettings(createDefaultExportSettings());
  }, []);

  const computeCurrentExportProjectedSize = useCallback(() => {
    if (!visibleScene) {
      return null;
    }

    return computeStructureExportProjectedSize({
      atomLabelSettings: componentVisibility.atomLabels.enabled
        ? componentVisibility.atomLabels
        : null,
      atomVectors,
      cameraPose: createCameraPoseSnapshot(
        cameraOrientationRef.current,
        [0, 0, 0],
        projectionMode,
      ),
      componentOpacity,
      scene: visibleScene,
      showAtoms: componentVisibility.atoms,
      showUnitCell: componentVisibility.unitCell,
      style,
    });
  }, [
    cameraOrientationRef,
    atomVectors,
    componentOpacity,
    componentVisibility.atomLabels,
    componentVisibility.atoms,
    componentVisibility.unitCell,
    projectionMode,
    style,
    visibleScene,
  ]);

  const refreshExportProjectedSize = useCallback(() => {
    const projectedSize = computeCurrentExportProjectedSize();
    setExportProjectedSize(projectedSize);
    return projectedSize;
  }, [computeCurrentExportProjectedSize]);

  const prepareExportSettings = useCallback(() => {
    const projectedSize = refreshExportProjectedSize();
    if (projectedSize === null) {
      return exportSettings;
    }

    const nextExportSettings = syncExportSettingsProjectedSize(
      exportSettings,
      projectedSize,
    );
    if (nextExportSettings !== exportSettings) {
      setExportSettings(nextExportSettings);
    }
    return nextExportSettings;
  }, [exportSettings, refreshExportProjectedSize]);

  const visibleExportProjectedSize = visibleScene ? exportProjectedSize : null;

  const syncProjectedSizeForExportTab = useCallback(() => {
    const projectedSize = refreshExportProjectedSize();
    if (projectedSize === null) {
      return;
    }

    setExportSettings((currentSettings) =>
      syncExportSettingsProjectedSize(currentSettings, projectedSize),
    );
  }, [refreshExportProjectedSize]);

  const handleExportSettingsChange = useCallback(
    (nextExportSettings: ExportSettingsState) => {
      setExportSettings(nextExportSettings);
      setExportError(null);
    },
    [],
  );

  const handleExportFigure = useCallback(async () => {
    if (!scene || isExporting || copyingImageFormat) {
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      const settingsForExport = prepareExportSettings();
      const exportFiles = await createFigureExportFiles({
        atomVectors,
        cameraOrientationRef,
        chargeDensityDisplay,
        componentOpacity,
        componentVisibility,
        fileName: selectedFileName,
        lightStrength,
        projectionMode,
        scene,
        settings: settingsForExport,
        showCrystalAxisLabels,
        style,
        unitCellLineStyle,
      });
      await onExportFiles(exportFiles);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Could not export this structure figure.",
      );
    } finally {
      setIsExporting(false);
    }
  }, [
    cameraOrientationRef,
    atomVectors,
    chargeDensityDisplay,
    componentOpacity,
    componentVisibility,
    copyingImageFormat,
    isExporting,
    lightStrength,
    onExportFiles,
    prepareExportSettings,
    projectionMode,
    scene,
    selectedFileName,
    showCrystalAxisLabels,
    style,
    unitCellLineStyle,
  ]);

  const handleCopyImageFigure = useCallback(async (format: CopyImageFormat) => {
    if (!scene || isExporting || copyingImageFormat) {
      return;
    }

    setCopyingImageFormat(format);
    setExportError(null);
    const formatLabel = format.toUpperCase();

    try {
      const settingsForExport: ExportSettingsState = setExportFormat(
        prepareExportSettings(),
        format,
      );
      const exportFiles = await createFigureExportFiles({
        atomVectors,
        cameraOrientationRef,
        chargeDensityDisplay,
        componentOpacity,
        componentVisibility,
        fileName: selectedFileName,
        lightStrength,
        projectionMode,
        scene,
        settings: settingsForExport,
        showCrystalAxisLabels,
        style,
        unitCellLineStyle,
      });
      const copied = await onCopyImageFiles(exportFiles, format);
      if (!copied) {
        throw new Error(`Could not copy ${formatLabel} image to clipboard.`);
      }
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : `Could not copy ${formatLabel} image to clipboard.`,
      );
    } finally {
      setCopyingImageFormat(null);
    }
  }, [
    cameraOrientationRef,
    atomVectors,
    chargeDensityDisplay,
    componentOpacity,
    componentVisibility,
    copyingImageFormat,
    isExporting,
    lightStrength,
    onCopyImageFiles,
    prepareExportSettings,
    projectionMode,
    scene,
    selectedFileName,
    showCrystalAxisLabels,
    style,
    unitCellLineStyle,
  ]);

  return {
    exportError,
    exportProjectedSize: visibleExportProjectedSize,
    exportSettings,
    copyingImageFormat,
    handleCopyImageFigure,
    handleExportFigure,
    handleExportSettingsChange,
    isExporting,
    resetExportState,
    setExportError,
    setExportSettings,
    syncProjectedSizeForExportTab,
  };
}
