import { Fog } from "three";

import type { ExportMeshQuality } from "../model";

export interface SceneMeshDetail {
  bondRadialSegments: number;
  sphereHeightSegments: number;
  sphereWidthSegments: number;
}

export const BOND_TUBE_RADIAL_SEGMENTS = 24;
export const SCENE_FOG_COLOR = "#fafafa";
const FOG_FRONT_PADDING_RATIO = 0.4;

export const PREVIEW_SCENE_MESH_DETAIL: SceneMeshDetail = {
  bondRadialSegments: 16,
  sphereHeightSegments: 24,
  sphereWidthSegments: 32,
};

export const EXPORT_SCENE_MESH_DETAIL_PRESETS: Record<ExportMeshQuality, SceneMeshDetail> = {
  low: {
    bondRadialSegments: 12,
    sphereHeightSegments: 16,
    sphereWidthSegments: 24,
  },
  medium: PREVIEW_SCENE_MESH_DETAIL,
  high: {
    bondRadialSegments: BOND_TUBE_RADIAL_SEGMENTS,
    sphereHeightSegments: 32,
    sphereWidthSegments: 48,
  },
  xhigh: {
    bondRadialSegments: 32,
    sphereHeightSegments: 48,
    sphereWidthSegments: 72,
  },
};

export function createSceneFog(
  cameraDistance: number,
  span: number,
  backOffset: number,
  frontOffset: number,
  amount: number,
  start: number,
): Fog | null {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeStart = Number.isFinite(start) ? start : 0;
  const normalizedAmount = Math.min(1, Math.max(0, safeAmount / 100));
  const normalizedStart = Math.min(1, Math.max(0, safeStart / 100));
  if (normalizedAmount <= 0) {
    return null;
  }

  const safeSpan = Number.isFinite(span) ? Math.max(1, span) : 1;
  const safeBackOffset = Number.isFinite(backOffset)
    ? Math.max(0.01 * safeSpan, backOffset)
    : 0.01 * safeSpan;
  const safeFrontOffset = Number.isFinite(frontOffset)
    ? Math.min(safeBackOffset, frontOffset)
    : 0;
  const safeCameraDistance = Number.isFinite(cameraDistance)
    ? Math.max(0.01, cameraDistance)
    : 0.01;
  const frontPadding = safeSpan * FOG_FRONT_PADDING_RATIO;
  const firstStartOffset = safeFrontOffset - frontPadding;
  const lastStartOffset = Math.max(
    firstStartOffset,
    safeBackOffset - frontPadding,
  );
  const startOffset = lerp(
    firstStartOffset,
    lastStartOffset,
    normalizedStart,
  );
  const near = safeCameraDistance + startOffset;
  const back = safeCameraDistance + safeBackOffset;
  const far = near + (back - near) / normalizedAmount;

  return new Fog(SCENE_FOG_COLOR, near, far);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}
