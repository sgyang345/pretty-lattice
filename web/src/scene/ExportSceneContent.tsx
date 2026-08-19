import { useLayoutEffect } from "react";
import { OrthographicCamera, PerspectiveCamera } from "three";
import { useThree } from "@react-three/fiber";

import type { SceneSpec } from "../api/scene";
import type {
  AtomLabelSettings,
  AtomVectorSettings,
  ChargeDensityDisplayState,
  ComponentOpacityState,
  StyleState,
  UnitCellLineStyle,
} from "../model";
import type { CameraPoseSnapshot } from "./cameraPose";
import { applyCameraPoseSnapshot } from "./cameraPose";
import type { ResolvedStructureMaterialFamilies } from "./materialPresetResolver";
import type { SceneLayout } from "./sceneLayout";
import type { SceneMeshDetail } from "./StructureSceneObjects";
import { MemoizedStructureSceneObjects, SceneFog } from "./StructureSceneObjects";
import {
  applyOrthographicExportFrame,
  applyPerspectiveExportFrame,
  type StructureExportFramePlan,
} from "./exportFrame";

export function ExportSceneContent({
  atomLabelSettings,
  atomVectors,
  chargeDensityDisplay,
  cameraPose,
  componentOpacity,
  exportFramePlan,
  layout,
  materialFamilies,
  meshDetail,
  polyhedronEdgeLineWidthScale = 1,
  scene,
  showAtoms,
  showUnitCell,
  style,
  unitCellLineColor,
  unitCellLineStyle = "solid",
  unitCellLineWidthScale = 1,
}: {
  atomLabelSettings: AtomLabelSettings | null;
  atomVectors: AtomVectorSettings | null;
  chargeDensityDisplay: ChargeDensityDisplayState;
  cameraPose: CameraPoseSnapshot;
  componentOpacity: ComponentOpacityState;
  exportFramePlan: StructureExportFramePlan;
  layout: SceneLayout;
  materialFamilies: ResolvedStructureMaterialFamilies;
  meshDetail: SceneMeshDetail;
  polyhedronEdgeLineWidthScale?: number;
  scene: SceneSpec;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
  unitCellLineColor?: string;
  unitCellLineStyle?: UnitCellLineStyle;
  unitCellLineWidthScale?: number;
}) {
  const { camera } = useThree();

  useLayoutEffect(() => {
    applyCameraPoseSnapshot(camera, cameraPose, layout.standardPose.distance, layout.span);
  }, [camera, cameraPose, layout.span, layout.standardPose.distance]);

  useLayoutEffect(() => {
    if (camera instanceof OrthographicCamera) {
      applyOrthographicExportFrame(camera, exportFramePlan);
    }
    if (camera instanceof PerspectiveCamera) {
      applyPerspectiveExportFrame(
        camera,
        exportFramePlan,
        layout.standardPose.distance,
        layout.span,
      );
    }
  }, [camera, exportFramePlan, layout.span, layout.standardPose.distance]);

  return (
    <>
      <SceneFog layout={layout} style={style} />
      <MemoizedStructureSceneObjects
        atomVectors={atomVectors}
        chargeDensityDisplay={chargeDensityDisplay}
        componentOpacity={componentOpacity}
        groupPosition={layout.groupPosition}
        layoutSpan={layout.span}
        materialFamilies={materialFamilies}
        meshDetail={meshDetail}
        polyhedronEdgeLineWidthScale={polyhedronEdgeLineWidthScale}
        scene={scene}
        atomLabelSettings={atomLabelSettings}
        showAtoms={showAtoms}
        showBrillouinZone={false}
        showUnitCell={showUnitCell}
        style={style}
        unitCellLineColor={unitCellLineColor}
        unitCellLineStyle={unitCellLineStyle}
        unitCellLineWidthScale={unitCellLineWidthScale}
      />
    </>
  );
}
