import { useThree } from "@react-three/fiber";
import { memo, useCallback, useLayoutEffect, useMemo } from "react";

import type { SceneSpec } from "../api/scene";
import type {
  AtomLabelSettings,
  AtomVectorSettings,
  ComponentOpacityState,
  StyleState,
  UnitCellLineStyle,
} from "../model";
import {
  baseColorSchemeForStyle,
  DEFAULT_BOND_COLOR,
  elementColorOverridesForStyle,
} from "../model";
import type { ResolvedStructureMaterialFamilies } from "./materialPresetResolver";
import type { SceneLayout } from "./sceneLayout";
import type { VectorTuple } from "./viewMath";
import { InstancedAtoms } from "./InstancedAtoms";
import { BatchedBonds } from "./BatchedBonds";
import { createBondRenderItems } from "./BondRenderItems";
import { CellFrame } from "./CellFrame";
import { cellCenter } from "./sceneGeometry";
import { MemoizedBatchedPolyhedra } from "./BatchedPolyhedra";
import { AtomLabels } from "./AtomLabels";
import { AtomVectors } from "./AtomVectors";
import { BrillouinZone } from "./BrillouinZone";
import {
  BOND_TUBE_RADIAL_SEGMENTS,
  createSceneFog,
  type SceneMeshDetail,
} from "./sceneRenderSettings";
export {
  POLYHEDRON_EDGE_COLOR,
  POLYHEDRON_EDGE_OPACITY,
  POLYHEDRON_SURFACE_OPACITY,
} from "./BatchedPolyhedra";
export {
  BOND_TUBE_RADIAL_SEGMENTS,
  EXPORT_SCENE_MESH_DETAIL_PRESETS,
  PREVIEW_SCENE_MESH_DETAIL,
  SCENE_FOG_COLOR,
  createSceneFog,
  type SceneMeshDetail,
} from "./sceneRenderSettings";

export const BOND_COLOR = DEFAULT_BOND_COLOR;

export function PreviewSceneContent({
  atomLabelSettings,
  atomVectors,
  componentOpacity,
  layout,
  materialFamilies,
  meshDetail,
  scene,
  inspectedAtomId,
  inspectedKPointIds,
  measuredAtomIds,
  interactionLocked,
  onAtomInspect,
  onKPointInspect,
  onAtomMeasure,
  onAtomPulse,
  onLockedInteractionAttempt,
  polyhedronEdgeLineWidthScale = 1,
  pulseAtomId,
  pulseToken,
  showAtoms,
  showBrillouinZone,
  showUnitCell,
  style,
  unitCellLineStyle = "solid",
  unitCellLineWidthScale = 1,
}: {
  atomLabelSettings: AtomLabelSettings | null;
  atomVectors: AtomVectorSettings | null;
  componentOpacity: ComponentOpacityState;
  layout: SceneLayout;
  materialFamilies: ResolvedStructureMaterialFamilies;
  meshDetail: SceneMeshDetail;
  scene: SceneSpec;
  inspectedAtomId: string | null;
  inspectedKPointIds: string[];
  measuredAtomIds: string[];
  interactionLocked: boolean;
  onAtomInspect?: (atomId: string | null) => void;
  onKPointInspect?: (kpointId: string | null) => void;
  onAtomMeasure?: (atomId: string) => void;
  onAtomPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  polyhedronEdgeLineWidthScale?: number;
  pulseAtomId: string | null;
  pulseToken: number;
  showAtoms: boolean;
  showBrillouinZone: boolean;
  showUnitCell: boolean;
  style: StyleState;
  unitCellLineStyle?: UnitCellLineStyle;
  unitCellLineWidthScale?: number;
}) {
  return (
    <>
      <SceneFog layout={layout} style={style} />
      <MemoizedStructureSceneObjects
        atomLabelSettings={atomLabelSettings}
        atomVectors={atomVectors}
        componentOpacity={componentOpacity}
        groupPosition={layout.groupPosition}
        layoutSpan={layout.span}
        materialFamilies={materialFamilies}
        meshDetail={meshDetail}
        scene={scene}
        inspectedAtomId={inspectedAtomId}
        inspectedKPointIds={inspectedKPointIds}
        measuredAtomIds={measuredAtomIds}
        interactionLocked={interactionLocked}
        onAtomInspect={onAtomInspect}
        onKPointInspect={onKPointInspect}
        onAtomMeasure={onAtomMeasure}
        onAtomPulse={onAtomPulse}
        onLockedInteractionAttempt={onLockedInteractionAttempt}
        polyhedronEdgeLineWidthScale={polyhedronEdgeLineWidthScale}
        pulseAtomId={pulseAtomId}
        pulseToken={pulseToken}
        showAtoms={showAtoms}
        showBrillouinZone={showBrillouinZone}
        showUnitCell={showUnitCell}
        style={style}
        unitCellLineStyle={unitCellLineStyle}
        unitCellLineWidthScale={unitCellLineWidthScale}
      />
    </>
  );
}

export function SceneFog({
  layout,
  style,
}: {
  layout: SceneLayout;
  style: StyleState;
}) {
  const { invalidate, scene } = useThree();
  const fog = useMemo(
    () =>
      style.fogEnabled
        ? createSceneFog(
            layout.standardPose.distance,
            layout.span,
            layout.depthCueingBackOffset,
            layout.depthCueingFrontOffset,
            style.fogAmount,
            style.fogStart,
          )
        : null,
    [
      layout.span,
      layout.depthCueingBackOffset,
      layout.depthCueingFrontOffset,
      layout.standardPose.distance,
      style.fogAmount,
      style.fogEnabled,
      style.fogStart,
    ],
  );

  useLayoutEffect(() => {
    const previousFog = scene.fog;
    scene.fog = fog;
    invalidate();

    return () => {
      if (scene.fog === fog) {
        scene.fog = previousFog;
        invalidate();
      }
    };
  }, [fog, invalidate, scene]);

  return null;
}

export function StructureSceneObjects({
  atomLabelSettings,
  atomVectors,
  componentOpacity,
  groupPosition,
  layoutSpan,
  interactionLocked = false,
  materialFamilies,
  meshDetail,
  scene,
  inspectedAtomId = null,
  inspectedKPointIds = [],
  measuredAtomIds = [],
  onAtomInspect,
  onKPointInspect,
  onAtomMeasure,
  onAtomPulse,
  onLockedInteractionAttempt,
  polyhedronEdgeLineWidthScale = 1,
  pulseAtomId = null,
  pulseToken = 0,
  showAtoms,
  showBrillouinZone,
  showUnitCell,
  style,
  unitCellLineColor,
  unitCellLineStyle = "solid",
  unitCellLineWidthScale = 1,
}: {
  atomLabelSettings: AtomLabelSettings | null;
  atomVectors: AtomVectorSettings | null;
  componentOpacity: ComponentOpacityState;
  groupPosition: VectorTuple;
  layoutSpan: number;
  interactionLocked?: boolean;
  materialFamilies: ResolvedStructureMaterialFamilies;
  meshDetail: SceneMeshDetail;
  scene: SceneSpec;
  inspectedAtomId?: string | null;
  inspectedKPointIds?: string[];
  measuredAtomIds?: string[];
  onAtomInspect?: (atomId: string | null) => void;
  onKPointInspect?: (kpointId: string | null) => void;
  onAtomMeasure?: (atomId: string) => void;
  onAtomPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  polyhedronEdgeLineWidthScale?: number;
  pulseAtomId?: string | null;
  pulseToken?: number;
  showAtoms: boolean;
  showBrillouinZone: boolean;
  showUnitCell: boolean;
  style: StyleState;
  unitCellLineColor?: string;
  unitCellLineStyle?: UnitCellLineStyle;
  unitCellLineWidthScale?: number;
}) {
  const colorOverrides = useMemo(
    () => elementColorOverridesForStyle(scene.atoms, style),
    [scene.atoms, style],
  );
  const colorScheme = baseColorSchemeForStyle(style);
  const bondRenderItems = useMemo(
    () =>
      createBondRenderItems({
        atoms: scene.atoms,
        bondColor: style.bondColor,
        bonds: scene.bonds,
        colorMode: style.bondColorMode,
        colorScheme,
        colorOverrides,
      }),
    [
      colorScheme,
      colorOverrides,
      scene.atoms,
      scene.bonds,
      style.bondColor,
      style.bondColorMode,
    ],
  );
  const brillouinZonePosition = useMemo(() => {
    const center = cellCenter(scene.cell.vectors);
    return [center.x, center.y, center.z] as VectorTuple;
  }, [scene.cell.vectors]);
  const isBrillouinZoneView = showBrillouinZone && !showAtoms && scene.atoms.length === 0;
  const handlePointerMissed = useCallback(() => {
    if (interactionLocked) {
      return;
    }

    onAtomInspect?.(null);
    onKPointInspect?.(null);
  }, [interactionLocked, onAtomInspect, onKPointInspect]);

  return (
    <group onPointerMissed={handlePointerMissed}>
      <group position={groupPosition}>
        {showUnitCell && !isBrillouinZoneView ? (
          <CellFrame
            color={unitCellLineColor}
            fog={style.fogEnabled && style.fogAffectsUnitCell}
            lineWidthScale={unitCellLineWidthScale}
            opacity={componentOpacity.unitCell / 100}
            lineStyle={unitCellLineStyle}
            vectors={scene.cell.vectors}
          />
        ) : null}
        <MemoizedBatchedPolyhedra
          atoms={scene.atoms}
          colorScheme={colorScheme}
          colorOverrides={colorOverrides}
          materialFamily={materialFamilies.polyhedron}
          opacity={componentOpacity.polyhedra / 100}
          polyhedra={scene.polyhedra}
          lineWidthScale={polyhedronEdgeLineWidthScale}
        />
        <BatchedBonds
          bondRenderItems={bondRenderItems}
          colorMode={style.bondColorMode}
          materialFamily={materialFamilies.bond}
          meshDetail={meshDetail}
          thicknessScale={style.bondThickness / 100}
          opacity={componentOpacity.bonds / 100}
        />
        {showAtoms ? (
          <InstancedAtoms
            atoms={scene.atoms}
            colorScheme={colorScheme}
            colorOverrides={colorOverrides}
            inspectedAtomId={inspectedAtomId}
            interactionLocked={interactionLocked}
            materialFamily={materialFamilies.atom}
            measuredAtomIds={measuredAtomIds}
            meshDetail={meshDetail}
            onInspect={onAtomInspect}
            onMeasure={onAtomMeasure}
            onPulse={onAtomPulse}
            onLockedInteractionAttempt={onLockedInteractionAttempt}
            pulseAtomId={pulseAtomId}
            pulseToken={pulseToken}
            radiusModel={style.atomRadiusModel}
            radiusScale={style.atomRadius / 100}
            opacity={componentOpacity.atoms / 100}
          />
        ) : null}
        {showBrillouinZone && scene.brillouinZone ? (
          <group position={brillouinZonePosition}>
            <BrillouinZone
              brillouinZone={scene.brillouinZone}
              fitToSpan={!isBrillouinZoneView}
              inspectedKPointIds={inspectedKPointIds}
              onKPointInspect={onKPointInspect}
              span={layoutSpan}
            />
          </group>
        ) : null}
        {atomVectors?.enabled ? (
          <AtomVectors
            scene={scene}
            settings={atomVectors}
            span={layoutSpan}
          />
        ) : null}
        {atomLabelSettings ? (
          <AtomLabels
            atoms={scene.atoms}
            settings={atomLabelSettings}
            radiusModel={style.atomRadiusModel}
            radiusScale={style.atomRadius / 100}
          />
        ) : null}
      </group>
    </group>
  );
}

export const MemoizedStructureSceneObjects = memo(StructureSceneObjects);
