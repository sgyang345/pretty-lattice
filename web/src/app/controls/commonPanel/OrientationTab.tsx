import { Separator } from "@/components/ui/separator";

import type { AtomSpec } from "../../../api/scene";
import type {
  CrystalCameraPrimaryDirection,
  CrystalCameraScreenDirection,
  CrystalCameraState,
  VectorTuple,
} from "../../../model";
import { AtomPositionSection } from "./AtomPositionSection";
import { PrimaryAxisRollSection } from "./orientation/PrimaryAxisRollSection";
import { VectorEditor } from "./orientation/VectorEditor";

export function OrientationTabContent({
  cameraState,
  cellVectors,
  sceneAtoms,
  selectedAtomSiteIds,
  onAtomPositionSelectionChange,
  onAtomPositionReset,
  onAtomPositionSetFractional,
  onAtomPositionTranslateFractional,
  onCameraPrimaryChange,
  onCameraRollPreviewChange,
  onCameraRollPreviewStart,
  onCameraRollChange,
  onCameraSecondaryChange,
  onCameraStateChange,
}: {
  cameraState: CrystalCameraState;
  cellVectors: VectorTuple[];
  sceneAtoms: AtomSpec[];
  selectedAtomSiteIds: string[];
  onAtomPositionSelectionChange: (atomId: string, selected: boolean) => void;
  onAtomPositionReset: () => void;
  onAtomPositionSetFractional: (
    siteId: string,
    fractionalPosition: [number, number, number],
  ) => void;
  onAtomPositionTranslateFractional: (
    siteIds: string[],
    delta: [number, number, number],
  ) => void;
  onCameraPrimaryChange: (primary: CrystalCameraPrimaryDirection) => void;
  onCameraRollPreviewChange: (rollDegrees: number) => void;
  onCameraRollPreviewStart: () => void;
  onCameraRollChange: (rollDegrees: number) => void;
  onCameraSecondaryChange: (secondary: CrystalCameraScreenDirection) => void;
  onCameraStateChange: (cameraState: CrystalCameraState) => void;
}) {
  return (
    <div className="flex flex-col" data-camera-tab-keepalive="">
      <PrimaryAxisRollSection
        primary={cameraState.primary}
        rollDegrees={cameraState.rollDegrees}
        onCameraPrimaryChange={onCameraPrimaryChange}
        onCameraRollChange={onCameraRollChange}
        onCameraRollPreviewChange={onCameraRollPreviewChange}
        onCameraRollPreviewStart={onCameraRollPreviewStart}
      />

      <Separator />

      <VectorEditor
        cameraState={cameraState}
        cellVectors={cellVectors}
        onCameraSecondaryChange={onCameraSecondaryChange}
        onCameraStateChange={onCameraStateChange}
      />

      <Separator />

      <AtomPositionSection
        atoms={sceneAtoms}
        selectedSiteIds={selectedAtomSiteIds}
        onAtomSelectionChange={onAtomPositionSelectionChange}
        onResetPositions={onAtomPositionReset}
        onSetAtomFractionalPosition={onAtomPositionSetFractional}
        onTranslateFractional={onAtomPositionTranslateFractional}
      />
    </div>
  );
}
