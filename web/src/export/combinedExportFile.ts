import { createCameraPoseSnapshot } from "../scene/cameraPose";
import { visibleSceneForComponents } from "../model";
import { encodeRasterTextPdf } from "./pdfTextExport";
import { renderCombinedExportRaster } from "./combinedExportRaster";
import type {
  CreateFigureExportOptions,
  FigureExportFile,
} from "./types";
import { exportFileStem } from "./fileNames";

export async function createCombinedExportFile({
  atomVectors,
  cameraOrientationRef,
  chargeDensityDisplay,
  componentOpacity,
  componentVisibility,
  fileName,
  lightStrength,
  projectionMode,
  scene,
  settings,
  showCrystalAxisLabels,
  style,
  unitCellLineStyle,
}: CreateFigureExportOptions): Promise<FigureExportFile> {
  const visibleScene = visibleSceneForComponents(scene, componentVisibility);
  const cameraPose = createCameraPoseSnapshot(
    cameraOrientationRef.current,
    [0, 0, 0],
    projectionMode,
  );
  const rasterImage = await renderCombinedExportRaster({
    atomVectors,
    cameraPose,
    chargeDensityDisplay,
    componentOpacity,
    componentVisibility,
    lightStrength,
    scene,
    settings,
    showCrystalAxisLabels,
    style,
    unitCellLineStyle,
    visibleScene,
  });

  if (settings.format === "pdf") {
    return {
      blob: await encodeRasterTextPdf(rasterImage, {
        background: settings.background,
        halo: false,
      }),
      fileName: `${exportFileStem(fileName)}.pdf`,
      format: "pdf",
    };
  }

  return {
    blob: rasterImage.blob,
    fileName: `${exportFileStem(fileName)}.${settings.format}`,
    format: settings.format,
  };
}
