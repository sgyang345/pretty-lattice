import {
  ArrowDown,
  ArrowUp,
  RotateCcw,
  Users,
} from "lucide-react";
import {
  type KeyboardEvent,
  type WheelEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { AtomSpec } from "../../../api/scene";
import {
  allCanonicalAtomSiteIds,
  canonicalAtomsForFractionalCoordinates,
  formatStructureNumber,
  wrapFractionalCoordinate,
  type FractionalAxis,
} from "../../../model";
import { atomNumberForAtom } from "../../../model/atomLabels";
import {
  COMMON_PANEL_BODY_TEXT_CLASS,
  COMMON_PANEL_FIELD_LABEL_TEXT_CLASS,
  COMMON_PANEL_SECTION_TITLE_TEXT_CLASS,
} from "./styles";

type AtomPositionTargetMode = "selected" | "all";

const FRACTIONAL_AXIS_LABELS = ["a", "b", "c"] as const;
const DEFAULT_FRACTIONAL_STEP = 0.01;

export function AtomPositionSection({
  atoms,
  selectedSiteIds,
  onAtomSelectionChange,
  onResetPositions,
  onSetAtomFractionalPosition,
  onTranslateFractional,
}: {
  atoms: AtomSpec[];
  selectedSiteIds: string[];
  onAtomSelectionChange: (atomId: string, selected: boolean) => void;
  onResetPositions: () => void;
  onSetAtomFractionalPosition: (
    siteId: string,
    fractionalPosition: [number, number, number],
  ) => void;
  onTranslateFractional: (
    siteIds: string[],
    delta: [number, number, number],
  ) => void;
}) {
  const [targetMode, setTargetMode] = useState<AtomPositionTargetMode>("selected");
  const [stepText, setStepText] = useState(formatFractionalValue(DEFAULT_FRACTIONAL_STEP));
  const [axisStepTexts, setAxisStepTexts] = useState<[string, string, string]>(() => [
    formatFractionalValue(DEFAULT_FRACTIONAL_STEP),
    formatFractionalValue(DEFAULT_FRACTIONAL_STEP),
    formatFractionalValue(DEFAULT_FRACTIONAL_STEP),
  ]);
  const [axisStepsLinked, setAxisStepsLinked] = useState(true);
  const canonicalAtoms = useMemo(
    () => canonicalAtomsForFractionalCoordinates(atoms),
    [atoms],
  );
  const canonicalSiteIds = useMemo(
    () => allCanonicalAtomSiteIds(atoms),
    [atoms],
  );
  const selectedCanonicalSiteIds = useMemo(() => {
    const canonicalSiteIdSet = new Set(canonicalSiteIds);
    return selectedSiteIds.filter((siteId) => canonicalSiteIdSet.has(siteId));
  }, [canonicalSiteIds, selectedSiteIds]);
  const selectedSiteIdSet = useMemo(
    () => new Set(selectedCanonicalSiteIds),
    [selectedCanonicalSiteIds],
  );
  const hasSelectedAtoms = selectedCanonicalSiteIds.length > 0;
  const effectiveTargetMode =
    targetMode === "selected" && !hasSelectedAtoms ? "all" : targetMode;
  const targetSiteIds =
    effectiveTargetMode === "selected" ? selectedCanonicalSiteIds : canonicalSiteIds;
  const targetLabel =
    effectiveTargetMode === "selected"
      ? `${selectedCanonicalSiteIds.length} selected`
      : "All atoms";
  const normalizeStep = (value: number) =>
    Object.is(value, -0) ? 0 : value;

  function syncAxisSteps(value: string) {
    setAxisStepTexts([value, value, value]);
    setAxisStepsLinked(true);
  }

  function handleStepChange(value: string) {
    setStepText(value);
    if (axisStepsLinked) {
      setAxisStepTexts([value, value, value]);
    }
  }

  function commitStepText() {
    const parsedStep = parseFractionalInput(stepText);
    if (parsedStep === null || parsedStep === 0) {
      const fallback = formatFractionalValue(DEFAULT_FRACTIONAL_STEP);
      setStepText(fallback);
      if (axisStepsLinked) {
        syncAxisSteps(fallback);
      }
      return;
    }

    const nextStep = formatFractionalValue(normalizeStep(parsedStep));
    setStepText(nextStep);
    if (axisStepsLinked) {
      syncAxisSteps(nextStep);
    }
  }

  function handleStepKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitStepText();
      return;
    }

    if (event.key === "Escape") {
      const fallback = formatFractionalValue(DEFAULT_FRACTIONAL_STEP);
      setStepText(fallback);
      if (axisStepsLinked) {
        syncAxisSteps(fallback);
      }
      event.currentTarget.blur();
    }
  }

  function handleStepWheel(event: WheelEvent<HTMLInputElement>) {
    if (event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const currentStep = parseFractionalInput(stepText) ?? DEFAULT_FRACTIONAL_STEP;
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextStep = currentStep + direction * 0.001;
    const nextStepText = formatFractionalValue(
      nextStep === 0 ? DEFAULT_FRACTIONAL_STEP : normalizeStep(nextStep),
    );
    setStepText(nextStepText);
    if (axisStepsLinked) {
      syncAxisSteps(nextStepText);
    }
  }

  function axisStep(axis: FractionalAxis): number {
    const axisText = axisStepTexts[axis].trim();
    if (axisStepsLinked) {
      return parseFractionalInput(stepText) ?? DEFAULT_FRACTIONAL_STEP;
    }

    return parseFractionalInput(axisText) ?? 0;
  }

  function translate(axis: FractionalAxis, direction: -1 | 1) {
    const step = axisStep(axis);
    if (targetSiteIds.length === 0 || step === 0) {
      return;
    }

    const delta: [number, number, number] = [0, 0, 0];
    delta[axis] = direction * step;
    onTranslateFractional(targetSiteIds, delta);
  }

  function translateAll(direction: -1 | 1) {
    if (targetSiteIds.length === 0) {
      return;
    }

    const steps = [axisStep(0), axisStep(1), axisStep(2)];
    const delta: [number, number, number] = [
      direction * steps[0]!,
      direction * steps[1]!,
      direction * steps[2]!,
    ];
    if (delta.some((value) => value !== 0)) {
      onTranslateFractional(targetSiteIds, delta);
    }
  }

  function updateAxisStep(axis: FractionalAxis, value: string) {
    setAxisStepsLinked(false);
    setAxisStepTexts((currentSteps) => {
      const nextSteps = [...currentSteps] as [string, string, string];
      nextSteps[axis] = value;
      return nextSteps;
    });
  }

  function commitAxisStep(axis: FractionalAxis) {
    const value = axisStepTexts[axis].trim();
    const parsed = parseFractionalInput(value);
    if (value.length === 0 || parsed === null) {
      updateAxisStep(axis, "");
      return;
    }

    const nextStepText = formatFractionalValue(normalizeStep(parsed));
    const nextAxisStepTexts = [...axisStepTexts] as [string, string, string];
    nextAxisStepTexts[axis] = nextStepText;
    setAxisStepTexts(nextAxisStepTexts);

    const parsedAxisSteps = nextAxisStepTexts.map(parseFractionalInput);
    const firstStep = parsedAxisSteps[0];
    const stepsMatch =
      firstStep !== null &&
      firstStep !== undefined &&
      firstStep !== 0 &&
      parsedAxisSteps.every(
        (step) => step !== null && Math.abs(step - firstStep) < 1e-16,
      );
    setAxisStepsLinked(stepsMatch);
    if (stepsMatch) {
      setStepText(nextStepText);
    }
  }

  function handleTargetModeChange(value: string) {
    if (value === "selected" || value === "all") {
      setTargetMode(value);
    }
  }

  return (
    <TooltipProvider>
      <section className="flex flex-col gap-3 px-1 py-3" aria-label="Atom fractional positions">
        <div className="flex items-center justify-between gap-3">
          <div className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-none")}>
            Fractional positions
          </div>
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Reset atom positions"
                  className="size-7 rounded-md border border-transparent text-muted-foreground hover:border-foreground/10 hover:bg-background/75 hover:text-foreground [&_svg]:size-3.5"
                  onClick={onResetPositions}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Reset atom positions</TooltipContent>
            </Tooltip>
            <div className="flex items-center gap-1.5 text-[0.68rem] font-medium text-muted-foreground">
              <Users aria-hidden="true" className="size-3.5" />
              {targetLabel}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_5.25rem] items-end gap-2">
          <div className="flex flex-col gap-1">
            <div className={cn(COMMON_PANEL_FIELD_LABEL_TEXT_CLASS, "text-muted-foreground")}>
              Target
            </div>
            <ToggleGroup
              type="single"
              value={effectiveTargetMode}
              onValueChange={handleTargetModeChange}
              variant="outline"
              size="sm"
              className="grid w-full grid-cols-2 overflow-hidden rounded-md border border-input"
            >
              <ToggleGroupItem
                value="selected"
                disabled={!hasSelectedAtoms}
                className="h-8 rounded-none border-0 text-xs"
              >
                Selected
              </ToggleGroupItem>
              <ToggleGroupItem
                value="all"
                className="h-8 rounded-none border-0 border-l text-xs"
              >
                All
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <label className="flex flex-col gap-1">
            <span className={cn(COMMON_PANEL_FIELD_LABEL_TEXT_CLASS, "text-muted-foreground")}>
              Step
            </span>
            <Input
              type="text"
              inputMode="decimal"
              value={stepText}
              aria-label="Fractional translation step"
              disabled={!axisStepsLinked}
              className="h-7 px-1.5 text-center font-mono text-[0.68rem] tabular-nums"
              onBlur={commitStepText}
              onChange={(event) => handleStepChange(event.target.value)}
              onKeyDown={handleStepKeyDown}
              onWheel={handleStepWheel}
            />
          </label>
        </div>

        <div className="grid grid-cols-[3.25rem_repeat(3,minmax(0,1fr))] items-end gap-1.5">
          <TotalTranslateStepper
            disabled={targetSiteIds.length === 0}
            onDecrease={() => translateAll(-1)}
            onIncrease={() => translateAll(1)}
          />
          {FRACTIONAL_AXIS_LABELS.map((axisLabel, axisIndex) => (
            <AxisTranslateStepper
              key={axisLabel}
              axisLabel={axisLabel}
              stepText={axisStepTexts[axisIndex] ?? ""}
              disabled={targetSiteIds.length === 0}
              onDecrease={() => translate(axisIndex as FractionalAxis, -1)}
              onIncrease={() => translate(axisIndex as FractionalAxis, 1)}
              onStepBlur={() => commitAxisStep(axisIndex as FractionalAxis)}
              onStepChange={(value) => updateAxisStep(axisIndex as FractionalAxis, value)}
            />
          ))}
        </div>

        <div className="max-h-56 overflow-y-auto overflow-x-hidden rounded-md border border-border/80">
          <div
            className={cn(
              "sticky top-0 z-10 grid grid-cols-[1.25rem_minmax(2.45rem,0.8fr)_repeat(3,minmax(0,1fr))] items-center gap-0.5 border-b bg-card/95 px-1.5 py-1.5 text-[0.58rem] font-semibold uppercase text-muted-foreground backdrop-blur",
            )}
            onWheel={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <span className="sr-only">Selected</span>
            <span>Site</span>
            {FRACTIONAL_AXIS_LABELS.map((axisLabel) => (
              <span key={axisLabel} className="text-center">
                {axisLabel}
              </span>
            ))}
          </div>

          {canonicalAtoms.map((atom) => {
            const selected = selectedSiteIdSet.has(atom.siteId);
            return (
              <div
                key={atom.id}
                className={cn(
                  "grid grid-cols-[1.15rem_minmax(2.25rem,0.75fr)_repeat(3,minmax(0,1fr))] items-center gap-0.5 border-b border-border/60 px-1 py-1.5 text-[0.58rem] last:border-b-0",
                  selected ? "bg-primary/5" : "bg-background/80",
                )}
                onWheel={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <Checkbox
                  aria-label={`Select ${atom.element}${atomNumberForAtom(atom, atoms)}`}
                  checked={selected}
                  className="size-3 rounded-[3px]"
                  iconClassName="size-2.5"
                  onCheckedChange={(checked) =>
                    onAtomSelectionChange(atom.id, checked === true)
                  }
                  onWheel={(event) => {
                    if (event.deltaY === 0) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    onAtomSelectionChange(atom.id, event.deltaY < 0);
                  }}
                />
                <div className="min-w-0 truncate text-[0.58rem] font-medium leading-none">
                  {atom.element}{atomNumberForAtom(atom, atoms)}
                </div>
                {FRACTIONAL_AXIS_LABELS.map((axisLabel, axisIndex) => (
                  <FractionalCoordinateInput
                    key={`${atom.id}-${axisLabel}`}
                    ariaLabel={`${atom.element}${atomNumberForAtom(atom, atoms)} fractional ${axisLabel}`}
                    value={atom.fractionalPosition[axisIndex] ?? 0}
                    onValueChange={(value) => {
                      const nextFractional = [...atom.fractionalPosition] as [
                        number,
                        number,
                        number,
                      ];
                      nextFractional[axisIndex] = value;
                      onSetAtomFractionalPosition(atom.siteId, nextFractional);
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </TooltipProvider>
  );
}

function AxisTranslateStepper({
  axisLabel,
  disabled,
  onDecrease,
  onIncrease,
  onStepBlur,
  onStepChange,
  stepText,
}: {
  axisLabel: string;
  disabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  onStepBlur: () => void;
  onStepChange: (value: string) => void;
  stepText: string;
}) {
  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (disabled) {
      return;
    }

    if (event.deltaY < 0) {
      onIncrease();
    } else {
      onDecrease();
    }
  }

  return (
    <div
      aria-label={`Adjust fractional ${axisLabel}`}
      className={cn(
        "grid min-w-0 grid-rows-[1.5rem_1fr_0.8rem_1fr] items-center overflow-hidden rounded-md border border-input bg-background",
        disabled ? "opacity-50" : null,
      )}
      onWheel={handleWheel}
    >
      <Input
        type="text"
        inputMode="decimal"
        value={stepText}
        placeholder={formatFractionalValue(DEFAULT_FRACTIONAL_STEP)}
        aria-label={`${axisLabel} translation step`}
        className="h-6 min-w-0 rounded-none border-0 border-b px-1 text-center font-mono text-[0.58rem] tabular-nums shadow-none"
        onBlur={onStepBlur}
        onChange={(event) => onStepChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        onWheel={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Increase fractional ${axisLabel}`}
            disabled={disabled}
            className="flex h-full w-full items-center justify-center rounded-none border-0 [&_svg]:size-3"
            onClick={onIncrease}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Increase fractional {axisLabel}</TooltipContent>
      </Tooltip>
      <span className="flex items-center justify-center text-center font-mono text-[0.58rem] font-semibold uppercase leading-none text-muted-foreground">
        {axisLabel}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Decrease fractional ${axisLabel}`}
            disabled={disabled}
            className="flex h-full w-full items-center justify-center rounded-none border-0 [&_svg]:size-3"
            onClick={onDecrease}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Decrease fractional {axisLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function TotalTranslateStepper({
  disabled,
  onDecrease,
  onIncrease,
}: {
  disabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div
      aria-label="Adjust fractional a, b, c"
      className={cn(
        "grid h-full min-w-0 grid-rows-[1fr_0.8rem_1fr] items-center overflow-hidden rounded-md border border-input bg-background",
        disabled ? "opacity-50" : null,
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Increase fractional a, b, c"
            disabled={disabled}
            className="flex h-full w-full items-center justify-center rounded-none border-0 [&_svg]:size-3"
            onClick={onIncrease}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">Increase fractional a, b, c</TooltipContent>
      </Tooltip>
      <span className="flex items-center justify-center text-center font-mono text-[0.55rem] font-semibold uppercase leading-none text-muted-foreground">
        all
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Decrease fractional a, b, c"
            disabled={disabled}
            className="flex h-full w-full items-center justify-center rounded-none border-0 [&_svg]:size-3"
            onClick={onDecrease}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Decrease fractional a, b, c</TooltipContent>
      </Tooltip>
    </div>
  );
}

function FractionalCoordinateInput({
  ariaLabel,
  onValueChange,
  value,
}: {
  ariaLabel: string;
  onValueChange: (value: number) => void;
  value: number;
}) {
  const [valueText, setValueText] = useState(formatFractionalValue(value));

  useEffect(() => {
    setValueText(formatFractionalValue(value));
  }, [value]);

  function commitValueText() {
    const parsedValue = parseFractionalInput(valueText);
    if (parsedValue === null) {
      setValueText(formatFractionalValue(value));
      return;
    }

    const nextValue = wrapFractionalCoordinate(parsedValue);
    setValueText(formatFractionalValue(nextValue));
    onValueChange(nextValue);
  }

  function nudge(direction: -1 | 1) {
    const nextValue = wrapFractionalCoordinate(value + direction * 0.001);
    setValueText(formatFractionalValue(nextValue));
    onValueChange(nextValue);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitValueText();
      return;
    }

    if (event.key === "Escape") {
      setValueText(formatFractionalValue(value));
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      nudge(event.key === "ArrowUp" ? 1 : -1);
    }
  }

  function handleWheel(event: WheelEvent<HTMLInputElement>) {
    if (event.deltaY === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    nudge(event.deltaY < 0 ? 1 : -1);
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={valueText}
      aria-label={ariaLabel}
      className="h-6 min-w-0 px-0.5 text-center font-mono text-[0.58rem] leading-none tabular-nums"
      onBlur={commitValueText}
      onChange={(event) => setValueText(event.target.value)}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
    />
  );
}

function parseFractionalInput(value: string): number | null {
  const normalizedValue = value.trim();
  if (normalizedValue.length === 0) {
    return null;
  }

  const fractionMatch = normalizedValue.match(/^([+-]?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (denominator === 0) {
      return null;
    }

    const fractionValue = numerator / denominator;
    return Number.isFinite(fractionValue) ? fractionValue : null;
  }

  const numericValue = Number(normalizedValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function formatFractionalValue(value: number): string {
  return formatStructureNumber(value);
}
