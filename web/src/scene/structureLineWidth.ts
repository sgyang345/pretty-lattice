import type { StructureExportFramePlan } from "./exportFrame";

export interface RasterExportBounds {
  height: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  width: number;
}

export const STRUCTURE_LINE_WIDTH_REFERENCE_RATIO = 0.001;
export const STRUCTURE_LINE_WIDTH_MIN_PIXELS = 1;

export function structureLineWidthScale(
  framePlan: StructureExportFramePlan,
  supersampling: number,
): number {
  const referenceSize = structureFrameReferenceSize(framePlan, supersampling);
  const finalLineWidth = referenceSize
    ? Math.max(
        STRUCTURE_LINE_WIDTH_MIN_PIXELS,
        referenceSize * STRUCTURE_LINE_WIDTH_REFERENCE_RATIO,
      )
    : 2;

  return finalLineWidth * Math.max(1, supersampling);
}

export function structureFrameContentBounds(
  framePlan: StructureExportFramePlan,
  supersampling: number,
): RasterExportBounds | undefined {
  const bounds = framePlan.bounds;
  if (!bounds) {
    return undefined;
  }

  const minX =
    ((bounds.minX - framePlan.centerX) * framePlan.zoom + framePlan.width / 2) / supersampling;
  const maxX =
    ((bounds.maxX - framePlan.centerX) * framePlan.zoom + framePlan.width / 2) / supersampling;
  const minY =
    (framePlan.height / 2 - (bounds.maxY - framePlan.centerY) * framePlan.zoom) /
    supersampling;
  const maxY =
    (framePlan.height / 2 - (bounds.minY - framePlan.centerY) * framePlan.zoom) /
    supersampling;

  return {
    height: Math.max(0, maxY - minY),
    maxX,
    maxY,
    minX,
    minY,
    width: Math.max(0, maxX - minX),
  };
}

function structureFrameReferenceSize(
  framePlan: StructureExportFramePlan,
  supersampling: number,
): number | null {
  const bounds = structureFrameContentBounds(framePlan, supersampling);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  return Math.sqrt(bounds.width * bounds.height);
}
