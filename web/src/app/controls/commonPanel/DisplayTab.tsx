import { RotateCcw } from "lucide-react";
import {
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
  type WheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { ChargeDensitySpec } from "../../../api/scene";
import {
  ATOM_LABEL_SIZE_MAX,
  ATOM_LABEL_SIZE_MIN,
  ATOM_VECTOR_MAX,
  ATOM_VECTOR_HEAD_SIZE_MAX,
  ATOM_VECTOR_HEAD_SIZE_MIN,
  ATOM_VECTOR_LENGTH_SCALE_DEFAULT,
  ATOM_VECTOR_LENGTH_SCALE_MAX,
  ATOM_VECTOR_LENGTH_SCALE_MIN,
  ATOM_VECTOR_LINE_THICKNESS_MAX,
  ATOM_VECTOR_LINE_THICKNESS_MIN,
  ATOM_VECTOR_MIN,
  ATOM_VECTOR_OPACITY_MAX,
  ATOM_VECTOR_OPACITY_MIN,
  atomVectorKeyForAtom,
  atomNumberForAtom,
  atomLabelElementsForAtoms,
  atomLabelOptionsForAtoms,
  CHARGE_DENSITY_BOUNDARY_FILL_OPACITY_MAX,
  CHARGE_DENSITY_BOUNDARY_FILL_OPACITY_MIN,
  CHARGE_DENSITY_INTERPOLATION_FACTORS,
  CHARGE_DENSITY_SECTION_OPACITY_MAX,
  CHARGE_DENSITY_SECTION_OPACITY_MIN,
  CHARGE_DENSITY_SECTION_POSITION_MAX,
  CHARGE_DENSITY_SECTION_POSITION_MIN,
  COMPONENT_OPACITY_MAX,
  DEFAULT_CHARGE_DENSITY_NEGATIVE_COLOR,
  DEFAULT_CHARGE_DENSITY_POSITIVE_COLOR,
  chargeDensityValueFromAngstromUnit,
  chargeDensityValueFromVestaUnit,
  chargeDensityValueToAngstromUnit,
  chargeDensityValueToVestaUnit,
  createDefaultComponentOpacity,
  DEFAULT_SUPERCELL_MATRIX,
  normalizeChargeDensityBoundaryFillOpacity,
  normalizeChargeDensityInterpolationFactor,
  normalizeChargeDensitySectionAxis,
  normalizeChargeDensitySectionOpacity,
  normalizeChargeDensitySectionPosition,
  normalizeChargeDensitySurfaceMode,
  normalizeChargeDensityColor,
  normalizeAtomVectorColor,
  normalizeSupercellMatrixValue,
  normalizeSupercellValue,
  selectedAtomLabelSettingsForScene,
  setAtomVectorValue,
  SUPERCELL_MATRIX_MAX,
  SUPERCELL_MATRIX_MIN,
  SUPERCELL_MAX,
  SUPERCELL_MIN,
  type AtomLabelMode,
  type AtomLabelSettings,
  type AtomVectorSettings,
  type ChargeDensityDisplayState,
  type ChargeDensitySectionAxis,
  type ChargeDensitySurfaceMode,
  type ComponentOpacityState,
  type ComponentVisibilityState,
  type SupercellMatrix,
  type SupercellMode,
  type SupercellSettings,
} from "../../../model";
import {
  TOOL_ICON_BUTTON_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS,
} from "../../surface";
import { TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS } from "./controlFeedback";
import {
  clampOpacityValue,
  formatOpacityValue,
  PercentSliderRow,
  parseOpacityInput,
  snapSliderOpacityValue,
  useAutoBlurSlider,
  wheelStepDirection,
} from "./sharedControls";
import {
  COMMON_PANEL_BODY_TEXT_CLASS,
  COMMON_PANEL_FIELD_LABEL_TEXT_CLASS,
  COMMON_PANEL_ROW_STACK_CLASS,
  COMMON_PANEL_SECTION_TITLE_TEXT_CLASS,
} from "./styles";

export function DisplayTabContent({
  atomVectors,
  chargeDensityDisplay,
  chargeDensity,
  hasChargeDensity,
  hasPolyhedra,
  onAtomVectorsChange,
  onChargeDensityDisplayChange,
  onOpacityChange,
  onVisibilityChange,
  opacity,
  sceneAtoms,
  visibility,
}: {
  atomVectors: AtomVectorSettings;
  chargeDensityDisplay: ChargeDensityDisplayState;
  chargeDensity: ChargeDensitySpec | undefined;
  hasChargeDensity: boolean;
  hasPolyhedra: boolean;
  onAtomVectorsChange: Dispatch<SetStateAction<AtomVectorSettings>>;
  onChargeDensityDisplayChange: Dispatch<SetStateAction<ChargeDensityDisplayState>>;
  onOpacityChange: Dispatch<SetStateAction<ComponentOpacityState>>;
  onVisibilityChange: Dispatch<SetStateAction<ComponentVisibilityState>>;
  opacity: ComponentOpacityState;
  sceneAtoms: ComponentVisibilitySceneAtom[];
  visibility: ComponentVisibilityState;
}) {
  function setVisibility(
    key:
      | "atoms"
      | "unitCell"
      | "bonds"
      | "polyhedra"
      | "chargeDensity"
      | "boundaryAtoms"
      | "oneHopBondedAtoms",
    value: boolean,
  ) {
    onVisibilityChange((currentVisibility) => ({
      ...currentVisibility,
      [key]: value,
      supercell:
        key === "chargeDensity" && value && currentVisibility.supercell.mode === "matrix"
          ? {
              ...currentVisibility.supercell,
              mode: "repeat",
            }
          : currentVisibility.supercell,
    }));
  }

  function setOpacity(key: keyof ComponentOpacityState, value: number) {
    onOpacityChange((currentOpacity) => ({
      ...currentOpacity,
      [key]: clampOpacityValue(value, COMPONENT_OPACITY_MAX[key]),
    }));
  }

  function setChargeDensityIsoValue(value: number) {
    onChargeDensityDisplayChange((currentSettings) => ({
      ...currentSettings,
      isoValue: clampChargeDensityIsoValue(value, chargeDensity),
    }));
  }

  function setChargeDensityInterpolationFactor(value: number) {
    onChargeDensityDisplayChange((currentSettings) => ({
      ...currentSettings,
      interpolationFactor: normalizeChargeDensityInterpolationFactor(value),
    }));
  }

  function setChargeDensitySurfaceMode(value: ChargeDensitySurfaceMode) {
    onChargeDensityDisplayChange((currentSettings) => ({
      ...currentSettings,
      surfaceMode: normalizeChargeDensitySurfaceMode(value),
    }));
  }

  function setChargeDensitySectionEnabled(value: boolean) {
    onChargeDensityDisplayChange((currentSettings) => ({
      ...currentSettings,
      sectionEnabled: value,
    }));
  }

  function setChargeDensitySectionAxis(value: ChargeDensitySectionAxis) {
    onChargeDensityDisplayChange((currentSettings) => ({
      ...currentSettings,
      sectionAxis: normalizeChargeDensitySectionAxis(value),
    }));
  }

  function setChargeDensitySectionOpacity(value: number) {
    onChargeDensityDisplayChange((currentSettings) => ({
      ...currentSettings,
      sectionOpacity: normalizeChargeDensitySectionOpacity(value),
    }));
  }

  function setChargeDensitySectionPosition(value: number) {
    onChargeDensityDisplayChange((currentSettings) => ({
      ...currentSettings,
      sectionPosition: normalizeChargeDensitySectionPosition(value),
    }));
  }

  function setChargeDensityBoundaryFillOpacity(value: number) {
    onChargeDensityDisplayChange((currentSettings) => ({
      ...currentSettings,
      boundaryFillOpacity: normalizeChargeDensityBoundaryFillOpacity(value),
    }));
  }

  function setChargeDensityColor(
    key: "boundaryColor" | "negativeColor" | "positiveColor",
    value: string,
    fallback: string,
  ) {
    onChargeDensityDisplayChange((currentSettings) => ({
      ...currentSettings,
      [key]: normalizeChargeDensityColor(value, fallback),
    }));
  }

  function setAtomLabels(nextSettings: AtomLabelSettings) {
    onVisibilityChange((currentVisibility) => ({
      ...currentVisibility,
      atomLabels: selectedAtomLabelSettingsForScene(nextSettings, sceneAtoms),
    }));
  }

  function updateAtomLabels(update: (settings: AtomLabelSettings) => AtomLabelSettings) {
    onVisibilityChange((currentVisibility) => ({
      ...currentVisibility,
      atomLabels: selectedAtomLabelSettingsForScene(
        update(currentVisibility.atomLabels),
        sceneAtoms,
      ),
    }));
  }

  function setSupercell(nextSupercell: SupercellSettings) {
    onVisibilityChange((currentVisibility) => ({
      ...currentVisibility,
      supercell:
        currentVisibility.chargeDensity && nextSupercell.mode === "matrix"
          ? {
              ...nextSupercell,
              mode: "repeat",
            }
          : nextSupercell,
    }));
  }

  function setAtomVectorsEnabled(enabled: boolean) {
    onAtomVectorsChange((currentSettings) => ({
      ...currentSettings,
      enabled,
    }));
  }

  const [resetFeedbackPhase, setResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const resetFeedbackTickRef = useRef(0);
  const resetFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (hasChargeDensity && visibility.chargeDensity && visibility.supercell.mode === "matrix") {
      onVisibilityChange((currentVisibility) =>
        currentVisibility.chargeDensity && currentVisibility.supercell.mode === "matrix"
          ? {
              ...currentVisibility,
              supercell: {
                ...currentVisibility.supercell,
                mode: "repeat",
              },
            }
          : currentVisibility,
      );
    }
  }, [
    hasChargeDensity,
    onVisibilityChange,
    visibility.chargeDensity,
    visibility.supercell.mode,
  ]);

  function handleResetOpacityClick() {
    onOpacityChange(createDefaultComponentOpacity());

    if (resetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(resetFeedbackTimeoutRef.current);
    }

    resetFeedbackTickRef.current += 1;
    setResetFeedbackPhase(resetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    resetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setResetFeedbackPhase(null);
      resetFeedbackTimeoutRef.current = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <section aria-labelledby="display-components-label">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <h2
            id="display-components-label"
            className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
          >
            Objects
          </h2>
          <span className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "text-right leading-tight text-muted-foreground")}>
            Opacity
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset opacity"
                  className={cn(
                    TOOL_ICON_BUTTON_CLASS,
                    resetFeedbackPhase === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
                    resetFeedbackPhase === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
                  )}
                  onClick={handleResetOpacityClick}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Reset opacity</TooltipContent>
          </Tooltip>
        </div>

        <div className={cn("mt-1", COMMON_PANEL_ROW_STACK_CLASS)}>
          <ComponentOpacityRow
            checked={visibility.atoms}
            label="Atoms"
            max={COMPONENT_OPACITY_MAX.atoms}
            value={opacity.atoms}
            onCheckedChange={(checked) => setVisibility("atoms", checked)}
            onOpacityChange={(value) => setOpacity("atoms", value)}
          />
          <ImageSwitchRow
            checked={visibility.atomLabels.enabled && visibility.atomLabels.kind === "element"}
            label="Atom labels"
            onCheckedChange={(checked) =>
              updateAtomLabels((settings) => ({
                ...settings,
                enabled: checked,
                kind: "element",
              }))
            }
          />
          <ImageSwitchRow
            checked={visibility.atomLabels.enabled && visibility.atomLabels.kind === "number"}
            label="Atom number"
            onCheckedChange={(checked) =>
              updateAtomLabels((settings) => ({
                ...settings,
                enabled: checked,
                kind: "number",
              }))
            }
          />
          {visibility.atomLabels.enabled ? (
            <AtomLabelControls
              atoms={sceneAtoms}
              settings={selectedAtomLabelSettingsForScene(visibility.atomLabels, sceneAtoms)}
              onSettingsChange={setAtomLabels}
            />
          ) : null}
          <ImageSwitchRow
            checked={atomVectors.enabled}
            label="Atom vectors"
            onCheckedChange={setAtomVectorsEnabled}
          />
          {atomVectors.enabled ? (
            <AtomVectorControls
              atoms={sceneAtoms}
              settings={atomVectors}
              onSettingsChange={onAtomVectorsChange}
            />
          ) : null}
          <ComponentOpacityRow
            checked={visibility.bonds}
            label="Bonds"
            max={COMPONENT_OPACITY_MAX.bonds}
            value={opacity.bonds}
            onCheckedChange={(checked) => setVisibility("bonds", checked)}
            onOpacityChange={(value) => setOpacity("bonds", value)}
          />
          <ComponentOpacityRow
            checked={visibility.unitCell}
            label="Unit cell"
            max={COMPONENT_OPACITY_MAX.unitCell}
            value={opacity.unitCell}
            onCheckedChange={(checked) => setVisibility("unitCell", checked)}
            onOpacityChange={(value) => setOpacity("unitCell", value)}
          />
          <ComponentOpacityRow
            checked={hasPolyhedra && visibility.polyhedra}
            checkboxDisabled={!hasPolyhedra}
            label="Polyhedra"
            max={COMPONENT_OPACITY_MAX.polyhedra}
            value={opacity.polyhedra}
            onCheckedChange={(checked) => setVisibility("polyhedra", checked)}
            onOpacityChange={(value) => setOpacity("polyhedra", value)}
          />
          <ComponentOpacityRow
            checked={hasChargeDensity && visibility.chargeDensity}
            checkboxDisabled={!hasChargeDensity}
            label="Charge density"
            max={COMPONENT_OPACITY_MAX.chargeDensity}
            value={opacity.chargeDensity}
            onCheckedChange={(checked) => setVisibility("chargeDensity", checked)}
            onOpacityChange={(value) => setOpacity("chargeDensity", value)}
          />
          {hasChargeDensity ? (
            <ChargeDensityControls
              chargeDensity={chargeDensity}
              disabled={!visibility.chargeDensity}
              settings={chargeDensityDisplay}
              onInterpolationFactorChange={setChargeDensityInterpolationFactor}
              onIsoValueChange={setChargeDensityIsoValue}
              onNegativeColorChange={(value) =>
                setChargeDensityColor(
                  "negativeColor",
                  value,
                  DEFAULT_CHARGE_DENSITY_NEGATIVE_COLOR,
                )
              }
              onPositiveColorChange={(value) =>
                setChargeDensityColor(
                  "positiveColor",
                  value,
                  DEFAULT_CHARGE_DENSITY_POSITIVE_COLOR,
                )
              }
              onBoundaryColorChange={(value) =>
                setChargeDensityColor(
                  "boundaryColor",
                  value,
                  chargeDensityDisplay.boundaryColor,
                )
              }
              onBoundaryFillOpacityChange={setChargeDensityBoundaryFillOpacity}
              onSectionAxisChange={setChargeDensitySectionAxis}
              onSectionEnabledChange={setChargeDensitySectionEnabled}
              onSectionOpacityChange={setChargeDensitySectionOpacity}
              onSectionPositionChange={setChargeDensitySectionPosition}
              onSurfaceModeChange={setChargeDensitySurfaceMode}
            />
          ) : null}
        </div>
      </section>

      <Separator className="my-1" />

      <section aria-labelledby="image-components-label">
        <h2
          id="image-components-label"
          className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
        >
          Periodic images
        </h2>
        <div className="mt-1.5 flex flex-col gap-1">
          <ImageSwitchRow
            checked={visibility.boundaryAtoms}
            label="Cell-boundary atoms"
            onCheckedChange={(checked) => setVisibility("boundaryAtoms", checked)}
          />
          <ImageSwitchRow
            checked={visibility.oneHopBondedAtoms}
            label="One-hop bonded atoms"
            onCheckedChange={(checked) => setVisibility("oneHopBondedAtoms", checked)}
          />
          <SupercellControls
            matrixDisabled={hasChargeDensity && visibility.chargeDensity}
            settings={visibility.supercell}
            onSettingsChange={setSupercell}
          />
        </div>
      </section>
    </div>
  );
}

function ChargeDensityControls({
  chargeDensity,
  disabled,
  onBoundaryColorChange,
  onBoundaryFillOpacityChange,
  onInterpolationFactorChange,
  onIsoValueChange,
  onNegativeColorChange,
  onPositiveColorChange,
  onSectionAxisChange,
  onSectionEnabledChange,
  onSectionOpacityChange,
  onSectionPositionChange,
  onSurfaceModeChange,
  settings,
}: {
  chargeDensity: ChargeDensitySpec | undefined;
  disabled: boolean;
  onBoundaryColorChange: (value: string) => void;
  onBoundaryFillOpacityChange: (value: number) => void;
  onInterpolationFactorChange: (value: number) => void;
  onIsoValueChange: (value: number) => void;
  onNegativeColorChange: (value: string) => void;
  onPositiveColorChange: (value: string) => void;
  onSectionAxisChange: (value: ChargeDensitySectionAxis) => void;
  onSectionEnabledChange: (value: boolean) => void;
  onSectionOpacityChange: (value: number) => void;
  onSectionPositionChange: (value: number) => void;
  onSurfaceModeChange: (value: ChargeDensitySurfaceMode) => void;
  settings: ChargeDensityDisplayState;
}) {
  return (
    <div className="rounded-md bg-muted/35 px-1.5 py-1.5">
      <ChargeDensityIsoValueControl
        chargeDensity={chargeDensity}
        disabled={disabled}
        value={settings.isoValue}
        onValueChange={onIsoValueChange}
      />
      <ChargeDensityInterpolationControl
        disabled={disabled}
        value={settings.interpolationFactor}
        onValueChange={onInterpolationFactorChange}
      />
      <ChargeDensitySurfaceModeControl
        disabled={disabled}
        value={settings.surfaceMode}
        onValueChange={onSurfaceModeChange}
      />
      <ImageSwitchRow
        checked={settings.sectionEnabled}
        label="Section"
        onCheckedChange={onSectionEnabledChange}
      />
      {settings.sectionEnabled ? (
        <ChargeDensitySectionControls
          disabled={disabled}
          settings={settings}
          onAxisChange={onSectionAxisChange}
          onOpacityChange={onSectionOpacityChange}
          onPositionChange={onSectionPositionChange}
        />
      ) : null}
      <ChargeDensityColorInput
        ariaLabel="Positive charge density color"
        label="Positive color"
        value={settings.positiveColor}
        onCommit={onPositiveColorChange}
      />
      <ChargeDensityColorInput
        ariaLabel="Negative charge density color"
        label="Negative color"
        value={settings.negativeColor}
        onCommit={onNegativeColorChange}
      />
      <ChargeDensityColorInput
        ariaLabel="Charge density boundary cut color"
        label="Cut color"
        value={settings.boundaryColor}
        onCommit={onBoundaryColorChange}
      />
      <PercentSliderRow
        accessibleLabel="Charge density boundary cut opacity"
        allowZero
        disabled={disabled}
        label="Cut opacity"
        min={CHARGE_DENSITY_BOUNDARY_FILL_OPACITY_MIN}
        max={CHARGE_DENSITY_BOUNDARY_FILL_OPACITY_MAX}
        value={settings.boundaryFillOpacity}
        valueLabel="opacity"
        onValueChange={onBoundaryFillOpacityChange}
      />
    </div>
  );
}

function ChargeDensityIsoValueControl({
  chargeDensity,
  disabled,
  onValueChange,
  value,
}: {
  chargeDensity: ChargeDensitySpec | undefined;
  disabled: boolean;
  onValueChange: (value: number) => void;
  value: number;
}) {
  const maxValue = maxAbsChargeDensitySpecValue(chargeDensity);
  const sliderMax = Math.max(maxValue, value, 1e-12);
  const sliderStep = chargeDensityIsoStep(sliderMax);
  const clampedValue = clampChargeDensityIsoValue(value, chargeDensity);
  const sliderPosition = sliderMax <= 0 ? 0 : clampedValue / sliderMax;
  const unit = chargeDensity?.unit;
  const vestaValue = chargeDensityValueToVestaUnit(clampedValue, unit);
  const angstromValue = chargeDensityValueToAngstromUnit(clampedValue, unit);
  const sliderStyle = {
    "--opacity-slider-position": `${Math.min(100, Math.max(0, sliderPosition * 100))}%`,
  } as CSSProperties;

  return (
    <div className={cn("grid min-w-0 grid-cols-[4.85rem_minmax(0,1fr)] items-center gap-x-1.5 gap-y-1 px-1.5 py-0.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
      <div className="min-w-0 overflow-visible leading-tight">Iso value</div>
      <div
        className="opacity-slider-shell relative mr-2 h-5 min-w-0"
        data-disabled={disabled ? "true" : "false"}
        style={sliderStyle}
      >
        <input
          type="range"
          min={0}
          max={sliderMax}
          step={sliderStep}
          value={clampedValue}
          aria-label="Charge density iso value"
          aria-valuetext={`${formatChargeDensityIsoValue(vestaValue)} ${CHARGE_DENSITY_VESTA_UNIT_LABEL}; ${formatChargeDensityIsoValue(angstromValue)} ${CHARGE_DENSITY_ANGSTROM_UNIT_LABEL}`}
          className="opacity-slider absolute inset-0 z-10 h-full w-full"
          disabled={disabled}
          onChange={(event) => onValueChange(Number(event.target.value))}
        />
        <span aria-hidden="true" className="opacity-slider-track pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-fill pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-thumb pointer-events-none" />
      </div>
      <span className="min-w-0 truncate leading-tight text-muted-foreground">VESTA</span>
      <ChargeDensityIsoValueInput
        ariaLabel="Charge density iso value in electrons per bohr cubed"
        disabled={disabled}
        unitLabel={CHARGE_DENSITY_VESTA_UNIT_LABEL}
        value={vestaValue}
        onCommit={(nextValue) =>
          onValueChange(
            clampChargeDensityIsoValue(
              chargeDensityValueFromVestaUnit(nextValue, unit),
              chargeDensity,
            ),
          )
        }
      />
      <span className="min-w-0 truncate leading-tight text-muted-foreground">Angstrom</span>
      <ChargeDensityIsoValueInput
        ariaLabel="Charge density iso value in electrons per angstrom cubed"
        disabled={disabled}
        unitLabel={CHARGE_DENSITY_ANGSTROM_UNIT_LABEL}
        value={angstromValue}
        onCommit={(nextValue) =>
          onValueChange(
            clampChargeDensityIsoValue(
              chargeDensityValueFromAngstromUnit(nextValue, unit),
              chargeDensity,
            ),
          )
        }
      />
    </div>
  );
}

function ChargeDensityIsoValueInput({
  ariaLabel,
  disabled,
  onCommit,
  unitLabel,
  value,
}: {
  ariaLabel: string;
  disabled: boolean;
  onCommit: (value: number) => void;
  unitLabel: string;
  value: number;
}) {
  const formattedValue = useMemo(() => formatChargeDensityIsoValue(value), [value]);
  const [text, setText] = useState(formattedValue);

  useEffect(() => {
    setText(formattedValue);
  }, [formattedValue]);

  function commitText() {
    const nextValue = Number(text.trim());
    if (!Number.isFinite(nextValue)) {
      setText(formattedValue);
      return;
    }

    onCommit(nextValue);
  }

  return (
    <label className="opacity-value-control group grid h-[22px] min-w-0 grid-cols-[4.9rem_minmax(4.35rem,1fr)] items-baseline gap-1 rounded-md border px-1 transition-[background-color,border-color,box-shadow] duration-150" data-disabled={disabled ? "true" : "false"}>
      <span className="sr-only">{ariaLabel}</span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        aria-label={ariaLabel}
        className="h-full w-[4.9rem] min-w-0 overflow-hidden border-0 bg-transparent px-0 text-left font-mono text-[0.62rem] leading-none tabular-nums outline-none"
        disabled={disabled}
        onBlur={commitText}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            commitText();
          }
          if (event.key === "Escape") {
            setText(formattedValue);
            event.currentTarget.blur();
          }
        }}
      />
      <span aria-hidden="true" className="pointer-events-none min-w-[4.35rem] shrink-0 overflow-hidden text-left font-mono text-[0.52rem] font-normal leading-none text-muted-foreground">
        {unitLabel}
      </span>
    </label>
  );
}

function ChargeDensityInterpolationControl({
  disabled,
  onValueChange,
  value,
}: {
  disabled: boolean;
  onValueChange: (value: number) => void;
  value: number;
}) {
  const normalizedValue = normalizeChargeDensityInterpolationFactor(value);

  return (
    <div className={cn("grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.1rem] items-center gap-2 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
      <span className="min-w-0 truncate leading-tight">Interpolation</span>
      <Select
        disabled={disabled}
        value={String(normalizedValue)}
        onValueChange={(nextValue) => onValueChange(Number(nextValue))}
      >
        <SelectTrigger
          size="sm"
          aria-label="Charge density interpolation"
          className="h-[24px] w-full bg-background px-2 py-0 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="!bg-background !text-foreground">
          <SelectGroup>
            {CHARGE_DENSITY_INTERPOLATION_FACTORS.map((factor) => (
              <SelectItem key={factor} value={String(factor)} className="text-xs">
                {factor}x linear
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function ChargeDensitySurfaceModeControl({
  disabled,
  onValueChange,
  value,
}: {
  disabled: boolean;
  onValueChange: (value: ChargeDensitySurfaceMode) => void;
  value: ChargeDensitySurfaceMode;
}) {
  const normalizedValue = normalizeChargeDensitySurfaceMode(value);

  return (
    <div className={cn("grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.1rem] items-center gap-2 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
      <span className="min-w-0 truncate leading-tight">Sign</span>
      <Select
        disabled={disabled}
        value={normalizedValue}
        onValueChange={(nextValue) =>
          onValueChange(normalizeChargeDensitySurfaceMode(nextValue))
        }
      >
        <SelectTrigger
          size="sm"
          aria-label="Charge density sign"
          className="h-[24px] w-full bg-background px-2 py-0 text-xs"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className="!bg-background !text-foreground">
          <SelectGroup>
            <SelectItem value="both" className="text-xs">Both signs</SelectItem>
            <SelectItem value="positive" className="text-xs">Positive only</SelectItem>
            <SelectItem value="negative" className="text-xs">Negative only</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function ChargeDensitySectionControls({
  disabled,
  onAxisChange,
  onOpacityChange,
  onPositionChange,
  settings,
}: {
  disabled: boolean;
  onAxisChange: (value: ChargeDensitySectionAxis) => void;
  onOpacityChange: (value: number) => void;
  onPositionChange: (value: number) => void;
  settings: ChargeDensityDisplayState;
}) {
  return (
    <>
      <div className={cn("grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.1rem] items-center gap-2 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
        <span className="min-w-0 truncate leading-tight">Section axis</span>
        <Select
          disabled={disabled}
          value={settings.sectionAxis}
          onValueChange={(value) =>
            onAxisChange(normalizeChargeDensitySectionAxis(value))
          }
        >
          <SelectTrigger
            size="sm"
            aria-label="Charge density section axis"
            className="h-[24px] w-full bg-background px-2 py-0 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="!bg-background !text-foreground">
            <SelectGroup>
              <SelectItem value="a" className="text-xs">a section</SelectItem>
              <SelectItem value="b" className="text-xs">b section</SelectItem>
              <SelectItem value="c" className="text-xs">c section</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <PercentSliderRow
        accessibleLabel="Charge density section position"
        allowZero
        disabled={disabled}
        label="Section pos"
        min={CHARGE_DENSITY_SECTION_POSITION_MIN}
        max={CHARGE_DENSITY_SECTION_POSITION_MAX}
        value={settings.sectionPosition}
        valueLabel="position"
        onValueChange={onPositionChange}
      />
      <PercentSliderRow
        accessibleLabel="Charge density section opacity"
        allowZero
        disabled={disabled}
        label="Section opacity"
        min={CHARGE_DENSITY_SECTION_OPACITY_MIN}
        max={CHARGE_DENSITY_SECTION_OPACITY_MAX}
        value={settings.sectionOpacity}
        valueLabel="opacity"
        onValueChange={onOpacityChange}
      />
    </>
  );
}

function ChargeDensityColorInput({
  ariaLabel,
  label,
  onCommit,
  value,
}: {
  ariaLabel: string;
  label: string;
  onCommit: (value: string) => void;
  value: string;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  function commitText() {
    const normalizedValue = normalizeChargeDensityColor(value, value);
    const nextValue = normalizeChargeDensityColor(text, normalizedValue);
    setText(nextValue);
    onCommit(nextValue);
  }

  return (
    <div className={cn("grid h-7 grid-cols-[minmax(5.5rem,1fr)_2rem_minmax(0,7rem)] items-center gap-2 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
      <span className="min-w-0 truncate leading-tight">{label}</span>
      <Input
        type="color"
        value={value}
        aria-label={ariaLabel}
        className="h-[22px] w-8 cursor-pointer rounded-md border p-0.5"
        onChange={(event) => onCommit(event.target.value)}
      />
      <Input
        type="text"
        inputMode="text"
        value={text}
        aria-label={`${ariaLabel} code`}
        className="h-[22px] rounded-md px-1.5 text-center font-mono text-[0.68rem] tabular-nums"
        onBlur={commitText}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            commitText();
          }
          if (event.key === "Escape") {
            setText(value);
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

function maxAbsChargeDensitySpecValue(chargeDensity: ChargeDensitySpec | undefined): number {
  if (!chargeDensity) {
    return 0;
  }

  return Math.max(Math.abs(chargeDensity.min), Math.abs(chargeDensity.max));
}

function clampChargeDensityIsoValue(
  value: number,
  chargeDensity: ChargeDensitySpec | undefined,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const maxValue = maxAbsChargeDensitySpecValue(chargeDensity);
  if (maxValue <= 0) {
    return Math.max(0, value);
  }

  return Math.min(maxValue, Math.max(0, value));
}

function chargeDensityIsoStep(maxValue: number): number {
  if (maxValue <= 0) {
    return 0.001;
  }

  return Math.max(10 ** Math.floor(Math.log10(maxValue)) / 100, maxValue / 500);
}

function formatChargeDensityIsoValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.0000";
  }

  return value.toFixed(CHARGE_DENSITY_ISO_DECIMALS);
}

const CHARGE_DENSITY_ISO_DECIMALS = 6;
const CHARGE_DENSITY_VESTA_UNIT_LABEL = "e/bohr^3";
const CHARGE_DENSITY_ANGSTROM_UNIT_LABEL = "e/\u00c5^3";

type ComponentVisibilitySceneAtom = Parameters<typeof atomLabelElementsForAtoms>[0][number];
const ATOM_VECTOR_LENGTH_PRESETS = [50, 100, 200] as const;
type SupercellRepeatAxis = "a" | "b" | "c";

function SupercellControls({
  matrixDisabled,
  onSettingsChange,
  settings,
}: {
  matrixDisabled: boolean;
  onSettingsChange: (settings: SupercellSettings) => void;
  settings: SupercellSettings;
}) {
  function updateMode(mode: SupercellMode) {
    if (matrixDisabled && mode === "matrix") {
      return;
    }

    onSettingsChange({
      ...settings,
      mode,
    });
  }

  function updateAxis(axis: SupercellRepeatAxis, value: number) {
    onSettingsChange({
      ...settings,
      [axis]: normalizeSupercellValue(value),
    });
  }

  function updateMatrix(rowIndex: 0 | 1 | 2, columnIndex: 0 | 1 | 2, value: number) {
    onSettingsChange({
      ...settings,
      matrix: settings.matrix.map((row, currentRowIndex) =>
        row.map((entry, currentColumnIndex) =>
          currentRowIndex === rowIndex && currentColumnIndex === columnIndex
            ? normalizeSupercellMatrixValue(value)
            : entry,
        ) as [number, number, number],
      ) as SupercellMatrix,
    });
  }

  function resetRepeat() {
    onSettingsChange({
      ...settings,
      a: 1,
      b: 1,
      c: 1,
    });
  }

  function resetMatrix() {
    onSettingsChange({
      ...settings,
      matrix: DEFAULT_SUPERCELL_MATRIX.map((row) => [...row]) as SupercellMatrix,
    });
  }

  return (
    <div className="rounded-md bg-muted/35 px-1.5 py-1.5">
      <div className={cn("grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.1rem] items-center gap-2 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
        <span className="min-w-0 truncate leading-tight">Supercell</span>
        <Select value={matrixDisabled && settings.mode === "matrix" ? "repeat" : settings.mode} onValueChange={(value) => updateMode(value as SupercellMode)}>
          <SelectTrigger
            size="sm"
            aria-label="Supercell mode"
            className="h-[24px] w-full bg-background px-2 py-0 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="!bg-background !text-foreground">
            <SelectGroup>
              <SelectItem value="repeat" className="text-xs">Repeat</SelectItem>
              <SelectItem value="matrix" disabled={matrixDisabled} className="text-xs">Matrix</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {settings.mode === "repeat" ? (
        <div className={cn("mt-1 grid grid-cols-[minmax(5.5rem,1fr)_9.1rem] items-center gap-x-2 gap-y-1 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
          <SupercellResetButton
            ariaLabel="Reset repeat supercell counts"
            tooltip="Reset repeat counts"
            onClick={resetRepeat}
          />
          <div className="grid grid-cols-3 gap-1">
            {(["a", "b", "c"] as const).map((axis) => (
              <span key={axis} className="text-center text-muted-foreground">
                {axis}
              </span>
            ))}
          </div>
          <span className="min-w-0 truncate leading-tight text-muted-foreground">Count</span>
          <div className="grid grid-cols-3 gap-1">
            {(["a", "b", "c"] as const).map((axis) => (
              <SupercellAxisInput
                key={axis}
                axis={axis}
                value={settings[axis]}
                onCommit={(value) => updateAxis(axis, value)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className={cn("mt-1 grid grid-cols-[minmax(5.5rem,1fr)_9.1rem] items-center gap-x-2 gap-y-1 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
          <SupercellResetButton
            ariaLabel="Reset transformation matrix"
            tooltip="Reset transformation"
            onClick={resetMatrix}
          />
          <div className="grid grid-cols-3 gap-1">
            {(["a", "b", "c"] as const).map((axis) => (
              <span key={axis} className="text-center text-muted-foreground">
                {axis}
              </span>
            ))}
          </div>
          {settings.matrix.map((row, rowIndex) => (
            <MatrixRowInputs
              key={rowIndex}
              label={["A", "B", "C"][rowIndex] ?? ""}
              row={row}
              onCommit={(columnIndex, value) =>
                updateMatrix(rowIndex as 0 | 1 | 2, columnIndex, value)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SupercellResetButton({
  ariaLabel,
  onClick,
  tooltip,
}: {
  ariaLabel: string;
  onClick: () => void;
  tooltip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 justify-start">
          <Button
            variant="ghost"
            size="icon"
            aria-label={ariaLabel}
            className={cn(TOOL_ICON_BUTTON_CLASS, "size-6 rounded-[9px] [&_svg]:size-3.25")}
            onClick={onClick}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function MatrixRowInputs({
  label,
  onCommit,
  row,
}: {
  label: string;
  onCommit: (columnIndex: 0 | 1 | 2, value: number) => void;
  row: [number, number, number];
}) {
  return (
    <>
      <span className="min-w-0 truncate leading-tight text-muted-foreground">{label}</span>
      <div className="grid grid-cols-3 gap-1">
        {([0, 1, 2] as const).map((columnIndex) => (
          <SupercellMatrixInput
            key={columnIndex}
            value={row[columnIndex]}
            ariaLabel={`${label} supercell matrix ${columnIndex + 1}`}
            onCommit={(value) => onCommit(columnIndex, value)}
          />
        ))}
      </div>
    </>
  );
}

function SupercellMatrixInput({
  ariaLabel,
  onCommit,
  value,
}: {
  ariaLabel: string;
  onCommit: (value: number) => void;
  value: number;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commitText() {
    const normalizedValue = normalizeSupercellMatrixValue(text);
    setText(String(normalizedValue));
    onCommit(normalizedValue);
  }

  function handleWheel(event: WheelEvent<HTMLInputElement>) {
    if (event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const nextValue = normalizeSupercellMatrixValue(
      value + wheelStepDirection(event) * step,
    );
    setText(String(nextValue));
    onCommit(nextValue);
  }

  return (
    <Input
      type="number"
      inputMode="numeric"
      min={SUPERCELL_MATRIX_MIN}
      max={SUPERCELL_MATRIX_MAX}
      step={1}
      value={text}
      aria-label={ariaLabel}
      className="h-6 rounded-md px-1 text-center font-mono text-[0.68rem] tabular-nums"
      onBlur={commitText}
      onChange={(event) => setText(event.target.value)}
      onWheel={handleWheel}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
          commitText();
        }
        if (event.key === "Escape") {
          setText(String(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function SupercellAxisInput({
  axis,
  onCommit,
  value,
}: {
  axis: SupercellRepeatAxis;
  onCommit: (value: number) => void;
  value: number;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commitText() {
    const normalizedValue = normalizeSupercellValue(text);
    setText(String(normalizedValue));
    onCommit(normalizedValue);
  }

  function handleWheel(event: WheelEvent<HTMLInputElement>) {
    if (event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    const nextValue = normalizeSupercellValue(
      value + wheelStepDirection(event) * step,
    );
    setText(String(nextValue));
    onCommit(nextValue);
  }

  return (
    <Input
      type="number"
      inputMode="numeric"
      min={SUPERCELL_MIN}
      max={SUPERCELL_MAX}
      step={1}
      value={text}
      aria-label={`Supercell ${axis} repeat count`}
      className="h-6 rounded-md px-1 text-center font-mono text-[0.68rem] tabular-nums"
      onBlur={commitText}
      onChange={(event) => setText(event.target.value)}
      onWheel={handleWheel}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
          commitText();
        }
        if (event.key === "Escape") {
          setText(String(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function AtomVectorControls({
  atoms,
  onSettingsChange,
  settings,
}: {
  atoms: ComponentVisibilitySceneAtom[];
  onSettingsChange: Dispatch<SetStateAction<AtomVectorSettings>>;
  settings: AtomVectorSettings;
}) {
  const vectorAtoms = atoms
    .filter((atom) => !atom.isPeriodicImage)
    .slice()
    .sort((firstAtom, secondAtom) => firstAtom.siteIndex - secondAtom.siteIndex);

  function updatePercentSetting(
    key: "headSize" | "lengthScale" | "lineThickness" | "opacity",
    value: number,
  ) {
    onSettingsChange((currentSettings) => ({
      ...currentSettings,
      [key]: value,
    }));
  }

  function updateMaxAbsValue(value: number) {
    onSettingsChange((currentSettings) => ({
      ...currentSettings,
      maxAbsValue: value,
    }));
  }

  function updateColor(color: string) {
    onSettingsChange((currentSettings) => ({
      ...currentSettings,
      color: normalizeAtomVectorColor(color),
    }));
  }

  return (
    <div className="rounded-md bg-muted/35 px-1.5 py-1.5">
      <AtomVectorMaxAbsValueInput
        value={settings.maxAbsValue}
        onCommit={updateMaxAbsValue}
      />
      <AtomVectorLengthPresetButtons
        value={settings.lengthScale}
        onValueChange={(value) => updatePercentSetting("lengthScale", value)}
      />
      <PercentSliderRow
        accessibleLabel="Atom vector display length"
        allowZero={false}
        label="Length scale"
        min={ATOM_VECTOR_LENGTH_SCALE_MIN}
        max={ATOM_VECTOR_LENGTH_SCALE_MAX}
        value={settings.lengthScale}
        valueLabel="scale"
        onValueChange={(value) => updatePercentSetting("lengthScale", value)}
      />
      <PercentSliderRow
        accessibleLabel="Atom vector line thickness"
        allowZero={false}
        label="Line thickness"
        min={ATOM_VECTOR_LINE_THICKNESS_MIN}
        max={ATOM_VECTOR_LINE_THICKNESS_MAX}
        value={settings.lineThickness}
        valueLabel="scale"
        onValueChange={(value) => updatePercentSetting("lineThickness", value)}
      />
      <PercentSliderRow
        accessibleLabel="Atom vector head size"
        allowZero={false}
        label="Arrow size"
        min={ATOM_VECTOR_HEAD_SIZE_MIN}
        max={ATOM_VECTOR_HEAD_SIZE_MAX}
        value={settings.headSize}
        valueLabel="scale"
        onValueChange={(value) => updatePercentSetting("headSize", value)}
      />
      <PercentSliderRow
        accessibleLabel="Atom vector opacity"
        allowZero
        label="Opacity"
        min={ATOM_VECTOR_OPACITY_MIN}
        max={ATOM_VECTOR_OPACITY_MAX}
        value={settings.opacity}
        valueLabel="opacity"
        onValueChange={(value) => updatePercentSetting("opacity", value)}
      />
      <AtomVectorColorInput
        value={settings.color}
        onCommit={updateColor}
      />
      <div className={cn("grid grid-cols-[minmax(4.5rem,1fr)_repeat(3,3.25rem)] gap-1 px-1.5 text-muted-foreground", COMMON_PANEL_FIELD_LABEL_TEXT_CLASS)}>
        <span>Atom</span>
        <span className="text-center">X</span>
        <span className="text-center">Y</span>
        <span className="text-center">Z</span>
      </div>
      <div className="mt-1 grid max-h-32 gap-1 overflow-y-auto px-1.5">
        {vectorAtoms.map((atom) => {
          const vectorKey = atomVectorKeyForAtom(atom, atoms);
          const vector = settings.values[vectorKey] ?? [0, 0, 0];
          return (
            <div
              key={atom.siteId}
              className={cn("grid grid-cols-[minmax(4.5rem,1fr)_repeat(3,3.25rem)] items-center gap-1", COMMON_PANEL_BODY_TEXT_CLASS)}
            >
              <span className="min-w-0 truncate leading-tight">
                {atom.element}{atomNumberForAtom(atom, atoms)}
              </span>
              {[0, 1, 2].map((axisIndex) => (
                <AtomVectorInput
                  key={axisIndex}
                  value={vector[axisIndex as 0 | 1 | 2]}
                  ariaLabel={`${atom.element}${atomNumberForAtom(atom, atoms)} ${["X", "Y", "Z"][axisIndex]} vector`}
                  onCommit={(value) =>
                    onSettingsChange((currentSettings) =>
                      setAtomVectorValue(
                        currentSettings,
                        vectorKey,
                        axisIndex as 0 | 1 | 2,
                        value,
                      ),
                    )
                  }
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AtomVectorColorInput({
  onCommit,
  value,
}: {
  onCommit: (value: string) => void;
  value: string;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  function commitText() {
    const normalizedValue = normalizeAtomVectorColor(text);
    setText(normalizedValue);
    onCommit(normalizedValue);
  }

  return (
    <div className={cn("grid h-7 grid-cols-[minmax(5.5rem,1fr)_2rem_minmax(0,7rem)] items-center gap-2 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
      <span className="min-w-0 truncate leading-tight">Arrow color</span>
      <Input
        type="color"
        value={value}
        aria-label="Atom vector arrow color"
        className="h-[22px] w-8 cursor-pointer rounded-md border p-0.5"
        onChange={(event) => onCommit(normalizeAtomVectorColor(event.target.value))}
      />
      <Input
        type="text"
        inputMode="text"
        value={text}
        aria-label="Atom vector arrow color code"
        className="h-[22px] rounded-md px-1.5 text-center font-mono text-[0.68rem] tabular-nums"
        onBlur={commitText}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            commitText();
          }
          if (event.key === "Escape") {
            setText(value);
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

function AtomVectorLengthPresetButtons({
  onValueChange,
  value,
}: {
  onValueChange: (value: number) => void;
  value: number;
}) {
  return (
    <div className={cn("grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.1rem] items-center gap-2 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
      <span className="min-w-0 truncate leading-tight">Quick length</span>
      <div className="grid grid-cols-3 gap-1">
        {ATOM_VECTOR_LENGTH_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            variant={Math.round(value) === preset ? "default" : "outline"}
            size="sm"
            aria-label={`Set atom vector display length to ${preset}%`}
            className="h-[22px] min-w-0 rounded-md px-1 text-[0.68rem] leading-none"
            onClick={() => onValueChange(preset)}
          >
            {preset === ATOM_VECTOR_LENGTH_SCALE_DEFAULT ? "1x" : `${preset / 100}x`}
          </Button>
        ))}
      </div>
    </div>
  );
}

function AtomVectorMaxAbsValueInput({
  onCommit,
  value,
}: {
  onCommit: (value: number) => void;
  value: number;
}) {
  const [text, setText] = useState(formatAtomVectorScaleValue(value));

  useEffect(() => {
    setText(formatAtomVectorScaleValue(value));
  }, [value]);

  function commitText() {
    const parsedValue = Number(text);
    if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
      setText(formatAtomVectorScaleValue(value));
      return;
    }

    setText(formatAtomVectorScaleValue(parsedValue));
    onCommit(parsedValue);
  }

  return (
    <div className={cn("grid h-7 grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
      <span className="min-w-0 truncate leading-tight">Max abs value</span>
      <Input
        type="text"
        inputMode="decimal"
        value={text}
        aria-label="Atom vector maximum absolute physical value"
        className="col-span-2 h-[22px] rounded-md px-1.5 text-center font-mono text-[0.68rem] tabular-nums"
        onBlur={commitText}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
            commitText();
          }
          if (event.key === "Escape") {
            setText(formatAtomVectorScaleValue(value));
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}

function AtomVectorInput({
  ariaLabel,
  onCommit,
  value,
}: {
  ariaLabel: string;
  onCommit: (value: number) => void;
  value: number;
}) {
  const [text, setText] = useState(formatAtomVectorValue(value));

  useEffect(() => {
    setText(formatAtomVectorValue(value));
  }, [value]);

  function commitText() {
    const parsedValue = Number(text);
    if (!Number.isFinite(parsedValue)) {
      setText(formatAtomVectorValue(value));
      return;
    }

    const clampedValue = Math.min(ATOM_VECTOR_MAX, Math.max(ATOM_VECTOR_MIN, parsedValue));
    setText(formatAtomVectorValue(clampedValue));
    onCommit(clampedValue);
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={text}
      aria-label={ariaLabel}
      className="h-6 rounded-md px-1.5 text-center font-mono text-[0.68rem] tabular-nums"
      onBlur={commitText}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
          commitText();
        }
        if (event.key === "Escape") {
          setText(formatAtomVectorValue(value));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function formatAtomVectorValue(value: number): string {
  const roundedValue = Math.abs(value) < 0.005 ? 0 : value;
  return roundedValue.toFixed(2);
}

function formatAtomVectorScaleValue(value: number): string {
  if (Math.abs(value) < 1e-8) {
    return "0";
  }

  return Number(value.toPrecision(6)).toString();
}

function AtomLabelControls({
  atoms,
  onSettingsChange,
  settings,
}: {
  atoms: ComponentVisibilitySceneAtom[];
  onSettingsChange: (settings: AtomLabelSettings) => void;
  settings: AtomLabelSettings;
}) {
  const elements = atomLabelElementsForAtoms(atoms);
  const atomOptions = atomLabelOptionsForAtoms(atoms);

  function updateSettings(nextSettings: AtomLabelSettings) {
    onSettingsChange(selectedAtomLabelSettingsForScene(nextSettings, atoms));
  }

  function setMode(mode: AtomLabelMode) {
    updateSettings({ ...settings, mode });
  }

  return (
    <div className="rounded-md bg-muted/35 px-1.5 py-1.5">
      <PercentSliderRow
        accessibleLabel={settings.kind === "number" ? "Atom number" : "Element label"}
        allowZero={false}
        label={settings.kind === "number" ? "Number size" : "Label size"}
        min={ATOM_LABEL_SIZE_MIN}
        max={ATOM_LABEL_SIZE_MAX}
        value={settings.size}
        valueLabel="size"
        onValueChange={(size) => updateSettings({ ...settings, size })}
      />

      <div className={cn("grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.1rem] items-center gap-2 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
        <span className="min-w-0 truncate leading-tight">
          {settings.kind === "number" ? "Show numbers" : "Show labels"}
        </span>
        <Select value={settings.mode} onValueChange={(value) => setMode(value as AtomLabelMode)}>
          <SelectTrigger
            size="sm"
            aria-label={settings.kind === "number" ? "Atom number visibility mode" : "Element label visibility mode"}
            className="h-[24px] w-full bg-background px-2 py-0 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="!bg-background !text-foreground">
            <SelectGroup>
              <SelectItem value="all" className="text-xs">All atoms</SelectItem>
              <SelectItem value="elements" className="text-xs">By element</SelectItem>
              <SelectItem value="atoms" className="text-xs">By atom</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {settings.mode === "elements" ? (
        <div className="mt-1 grid grid-cols-3 gap-1 px-1.5">
          {elements.map((element) => (
            <label
              key={element}
              className={cn(
                "flex h-6 min-w-0 items-center gap-1.5 rounded-md px-1 transition-colors hover:bg-accent/60",
                COMMON_PANEL_BODY_TEXT_CLASS,
              )}
            >
              <Checkbox
                checked={settings.elements[element] !== false}
                aria-label={`Show ${element} labels`}
                className="size-3.5 rounded-[3px]"
                iconClassName="size-3"
                onCheckedChange={(checked) =>
                  updateSettings({
                    ...settings,
                    elements: {
                      ...settings.elements,
                      [element]: checked === true,
                    },
                  })
                }
              />
              <span className="min-w-0 truncate leading-tight">{element}</span>
            </label>
          ))}
        </div>
      ) : null}

      {settings.mode === "atoms" ? (
        <div className="mt-1 grid max-h-28 grid-cols-3 gap-1 overflow-y-auto px-1.5">
          {atomOptions.map((option) => (
            <label
              key={option.atomId}
              className={cn(
                "flex h-6 min-w-0 items-center gap-1.5 rounded-md px-1 transition-colors hover:bg-accent/60",
                COMMON_PANEL_BODY_TEXT_CLASS,
              )}
            >
              <Checkbox
                checked={settings.atomIds.includes(option.atomId)}
                aria-label={`Show ${option.label} label`}
                className="size-3.5 rounded-[3px]"
                iconClassName="size-3"
                onCheckedChange={(checked) => {
                  const nextAtomIds = checked === true
                    ? Array.from(new Set([...settings.atomIds, option.atomId]))
                    : settings.atomIds.filter((atomId) => atomId !== option.atomId);
                  updateSettings({
                    ...settings,
                    atomIds: nextAtomIds,
                  });
                }}
              />
              <span className="min-w-0 truncate leading-tight">{option.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ComponentOpacityRow({
  checked,
  checkboxDisabled = false,
  label,
  max,
  onCheckedChange,
  onOpacityChange,
  value,
}: {
  checked: boolean;
  checkboxDisabled?: boolean;
  label: string;
  max: number;
  onCheckedChange: (checked: boolean) => void;
  onOpacityChange: (opacity: number) => void;
  value: number;
}) {
  const [opacityText, setOpacityText] = useState(formatOpacityValue(value));
  const sliderBlur = useAutoBlurSlider();
  const sliderPosition = max > 0 ? value / max : 0;
  const sliderStyle = {
    "--opacity-slider-position": `${Math.min(100, Math.max(0, sliderPosition * 100))}%`,
  } as CSSProperties;
  const inputDisabled = checkboxDisabled || !checked;

  useEffect(() => {
    setOpacityText(formatOpacityValue(value));
  }, [value]);

  function commitOpacityText() {
    const nextOpacity = parseOpacityInput(opacityText);
    if (nextOpacity === null) {
      setOpacityText(formatOpacityValue(value));
      return;
    }

    const clampedOpacity = clampOpacityValue(nextOpacity, max);
    setOpacityText(formatOpacityValue(clampedOpacity));
    onOpacityChange(clampedOpacity);
  }

  function handleOpacityKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitOpacityText();
      return;
    }

    if (event.key === "Escape") {
      setOpacityText(formatOpacityValue(value));
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      onOpacityChange(clampOpacityValue(value + direction, max));
    }
  }

  function handleOpacityWheel(event: WheelEvent<HTMLElement>) {
    if (inputDisabled || event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 10 : 1;
    onOpacityChange(clampOpacityValue(value + wheelStepDirection(event) * step, max));
  }

  return (
    <div
      className={cn(
        "grid h-7 min-w-0 grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 rounded-md px-1.5 transition-colors",
        COMMON_PANEL_BODY_TEXT_CLASS,
        checkboxDisabled ? "text-muted-foreground/55" : "hover:bg-accent/60",
      )}
    >
      <label
        className={cn(
          "flex min-w-0 items-center gap-2",
          checkboxDisabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <Checkbox
          checked={checked}
          disabled={checkboxDisabled}
          aria-label={label}
          className="size-3.5 rounded-[3px]"
          iconClassName="size-3"
          onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
        />
        <span
          className={cn(
            "min-w-0 truncate leading-tight",
            checkboxDisabled ? "text-muted-foreground/60" : null,
          )}
        >
          {label}
        </span>
      </label>

      <div
        className="opacity-slider-shell relative mr-3 h-5"
        data-disabled={inputDisabled ? "true" : "false"}
        style={sliderStyle}
      >
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          disabled={inputDisabled}
          aria-label={`${label} opacity`}
          aria-valuetext={`${formatOpacityValue(value)}%`}
          className="opacity-slider absolute inset-0 z-10 h-full w-full"
          ref={sliderBlur.ref}
          onChange={(event) =>
            onOpacityChange(snapSliderOpacityValue(Number(event.target.value), max))
          }
          onMouseDown={sliderBlur.handlePointerDown}
          onMouseUp={sliderBlur.handlePointerEnd}
          onPointerCancel={sliderBlur.handlePointerEnd}
          onPointerDown={sliderBlur.handlePointerDown}
          onPointerUp={sliderBlur.handlePointerEnd}
          onWheel={handleOpacityWheel}
        />
        <span aria-hidden="true" className="opacity-slider-track pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-fill pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-thumb pointer-events-none" />
      </div>

      <label
        className="opacity-value-control group flex h-[22px] items-baseline justify-center gap-0 rounded-md border px-0.5 transition-[background-color,border-color,box-shadow] duration-150"
        data-disabled={inputDisabled ? "true" : "false"}
      >
        <span className="sr-only">{label} opacity value</span>
        <input
          type="text"
          inputMode="numeric"
          value={opacityText}
          disabled={inputDisabled}
          aria-label={`${label} opacity value`}
          className="opacity-value-input h-full w-[1.35rem] border-0 bg-transparent px-0 text-center font-mono text-[0.68rem] leading-none tabular-nums outline-none"
          onBlur={commitOpacityText}
          onChange={(event) => setOpacityText(event.target.value)}
          onKeyDown={handleOpacityKeyDown}
          onWheel={handleOpacityWheel}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none font-mono text-[0.68rem] font-normal leading-none text-muted-foreground",
            inputDisabled ? "text-muted-foreground/60" : null,
          )}
        >
          %
        </span>
      </label>
    </div>
  );
}

function ImageSwitchRow({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex h-6 items-center justify-between gap-1.5 rounded-md px-1.5 transition-colors hover:bg-accent/60",
        COMMON_PANEL_BODY_TEXT_CLASS,
      )}
    >
      <span className="min-w-0 truncate leading-tight">{label}</span>
      <Switch
        checked={checked}
        aria-label={label}
        className="h-4 w-7 p-0.5"
        thumbClassName="size-3 data-[state=checked]:translate-x-3"
        onCheckedChange={onCheckedChange}
      />
    </label>
  );
}
