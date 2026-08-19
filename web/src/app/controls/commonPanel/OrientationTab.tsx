import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type { AtomSpec } from "../../../api/scene";
import type {
  CrystalCameraPrimaryDirection,
  CrystalCameraScreenDirection,
  CrystalCameraState,
  ProjectionMode,
  VectorTuple,
} from "../../../model";
import { PROJECTION_MODE_OPTIONS } from "../../../model";
import { AtomPositionSection } from "./AtomPositionSection";
import {
  COMMON_PANEL_ROW_STACK_CLASS,
  COMMON_PANEL_SECTION_TITLE_TEXT_CLASS,
} from "./styles";
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
  onProjectionModeChange,
  projectionMode,
}: {
  cameraState: CrystalCameraState;
  cellVectors: VectorTuple[];
  projectionMode: ProjectionMode;
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
  onProjectionModeChange: (projectionMode: ProjectionMode) => void;
}) {
  return (
    <div className="flex flex-col" data-camera-tab-keepalive="">
      <section aria-labelledby="camera-view-label" className="grid gap-2 px-1.5 py-2">
        <div className={COMMON_PANEL_ROW_STACK_CLASS}>
          <label
            id="camera-view-label"
            className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "text-muted-foreground")}
          >
            View
          </label>
          <Select
            value={projectionMode}
            onValueChange={(value) => onProjectionModeChange(value as ProjectionMode)}
          >
            <SelectTrigger
              aria-labelledby="camera-view-label"
              className="h-8 rounded-lg text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROJECTION_MODE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <Separator />

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
