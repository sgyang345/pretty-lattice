import { describe, expect, test } from "bun:test";

import {
  DEFAULT_DRAG_SENSITIVITY,
  DEFAULT_LIGHT_STRENGTH,
  DEFAULT_VIEW_SCALE,
  clampDragSensitivity,
  clampLightStrength,
  clampViewScale,
  createPreviewViewState,
  dragSensitivityToSliderPosition,
  formatDragSensitivityPercent,
  formatLightStrengthPercent,
  formatZoomPercent,
  lightStrengthToSliderPosition,
  parseDragSensitivityPercentInput,
  parseLightStrengthPercentInput,
  parseZoomPercentInput,
  resetPreviewViewState,
  setPreviewDragSensitivity,
  setPreviewInteractionLocked,
  setPreviewInteractionMode,
  setPreviewLightStrength,
  setPreviewShowFpsOverlay,
  sliderPositionToDragSensitivity,
  sliderPositionToLightStrength,
  sliderPositionToViewScale,
  snapDragSensitivitySliderPosition,
  snapLightStrengthSliderPosition,
  snapZoomSliderPosition,
  viewScaleToSliderPosition,
  ZOOM_SLIDER_SNAP_POSITION,
} from "../src/app/viewState";
import { createDefaultCrystalCameraState } from "../src/scene/crystalCamera";

describe("preview view state", () => {
  test("defaults to Trackball at 100 percent zoom with unlocked interaction", () => {
    expect(createPreviewViewState()).toEqual({
      camera: createDefaultCrystalCameraState(),
      dragSensitivity: DEFAULT_DRAG_SENSITIVITY,
      interactionLocked: false,
      interactionMode: "trackball",
      lightStrength: DEFAULT_LIGHT_STRENGTH,
      resetCounter: 0,
      showFpsOverlay: false,
      viewScale: DEFAULT_VIEW_SCALE,
    });
  });

  test("emits a reset signal without changing persistent view options", () => {
    const state = setPreviewShowFpsOverlay(
      setPreviewDragSensitivity(
        setPreviewInteractionLocked(
          setPreviewInteractionMode(createPreviewViewState(), "orbit"),
          true,
        ),
        2,
      ),
      true,
    );

    expect(resetPreviewViewState(state)).toEqual({
      camera: createDefaultCrystalCameraState(),
      dragSensitivity: 2,
      interactionLocked: true,
      interactionMode: "orbit",
      lightStrength: DEFAULT_LIGHT_STRENGTH,
      resetCounter: 1,
      showFpsOverlay: true,
      viewScale: DEFAULT_VIEW_SCALE,
    });
  });

  test("clamps zoom at the shared 20 to 500 percent bounds", () => {
    expect(clampViewScale(0.1)).toBe(0.2);
    expect(clampViewScale(6)).toBe(5);
    expect(clampViewScale(Number.NaN)).toBe(DEFAULT_VIEW_SCALE);
  });

  test("clamps drag sensitivity at the shared bounds", () => {
    expect(clampDragSensitivity(0.1)).toBe(0.5);
    expect(clampDragSensitivity(4)).toBe(2);
    expect(clampDragSensitivity(Number.NaN)).toBe(DEFAULT_DRAG_SENSITIVITY);
    expect(setPreviewDragSensitivity(createPreviewViewState(), 2).dragSensitivity).toBe(2);
  });

  test("clamps light strength at the shared bounds", () => {
    expect(clampLightStrength(0.1)).toBe(0.5);
    expect(clampLightStrength(4)).toBe(2);
    expect(clampLightStrength(Number.NaN)).toBe(DEFAULT_LIGHT_STRENGTH);
    expect(setPreviewLightStrength(createPreviewViewState(), 1.5).lightStrength).toBe(1.5);
  });

  test("maps the logarithmic drag sensitivity slider with 100 percent at the midpoint", () => {
    expect(dragSensitivityToSliderPosition(0.5)).toBeCloseTo(0);
    expect(dragSensitivityToSliderPosition(1)).toBeCloseTo(0.5);
    expect(dragSensitivityToSliderPosition(2)).toBeCloseTo(1);
    expect(sliderPositionToDragSensitivity(0.5)).toBeCloseTo(1);
  });

  test("maps the logarithmic light strength slider with 100 percent at the midpoint", () => {
    expect(lightStrengthToSliderPosition(0.5)).toBeCloseTo(0);
    expect(lightStrengthToSliderPosition(1)).toBeCloseTo(0.5);
    expect(lightStrengthToSliderPosition(2)).toBeCloseTo(1);
    expect(sliderPositionToLightStrength(0.5)).toBeCloseTo(1);
  });

  test("snaps the drag sensitivity slider to 100 percent near the midpoint", () => {
    expect(snapDragSensitivitySliderPosition(0.465)).toBe(0.5);
    expect(snapDragSensitivitySliderPosition(0.535)).toBe(0.5);
    expect(snapDragSensitivitySliderPosition(0.455)).toBe(0.455);
  });

  test("snaps the light strength slider to 100 percent near the midpoint", () => {
    expect(snapLightStrengthSliderPosition(0.465)).toBe(0.5);
    expect(snapLightStrengthSliderPosition(0.535)).toBe(0.5);
    expect(snapLightStrengthSliderPosition(0.455)).toBe(0.455);
  });

  test("parses and formats editable drag sensitivity percentages", () => {
    expect(formatDragSensitivityPercent(1)).toBe("100");
    expect(parseDragSensitivityPercentInput("150")).toBe(1.5);
    expect(parseDragSensitivityPercentInput("200%")).toBe(2);
    expect(parseDragSensitivityPercentInput("20")).toBe(0.5);
    expect(parseDragSensitivityPercentInput("-10")).toBeNull();
    expect(parseDragSensitivityPercentInput("not a number")).toBeNull();
  });

  test("parses and formats editable light strength percentages", () => {
    expect(formatLightStrengthPercent(1)).toBe("100");
    expect(parseLightStrengthPercentInput("150")).toBe(1.5);
    expect(parseLightStrengthPercentInput("200%")).toBe(2);
    expect(parseLightStrengthPercentInput("20")).toBe(0.5);
    expect(parseLightStrengthPercentInput("-10")).toBeNull();
    expect(parseLightStrengthPercentInput("not a number")).toBeNull();
  });

  test("maps the logarithmic slider with 100 percent at the default view scale", () => {
    expect(viewScaleToSliderPosition(0.2)).toBeCloseTo(0);
    expect(viewScaleToSliderPosition(DEFAULT_VIEW_SCALE)).toBeCloseTo(
      ZOOM_SLIDER_SNAP_POSITION,
    );
    expect(viewScaleToSliderPosition(5)).toBeCloseTo(1);
    expect(sliderPositionToViewScale(ZOOM_SLIDER_SNAP_POSITION)).toBeCloseTo(
      DEFAULT_VIEW_SCALE,
    );
  });

  test("snaps the zoom slider to the displayed 100 percent position", () => {
    const defaultPosition = viewScaleToSliderPosition(DEFAULT_VIEW_SCALE);
    expect(snapZoomSliderPosition(defaultPosition - 0.025)).toBe(defaultPosition);
    expect(snapZoomSliderPosition(defaultPosition + 0.025)).toBe(defaultPosition);
    expect(snapZoomSliderPosition(defaultPosition - 0.045)).toBe(defaultPosition - 0.045);
  });

  test("parses and formats editable zoom percentages with clamping for positive values", () => {
    expect(formatZoomPercent(DEFAULT_VIEW_SCALE)).toBe("100");
    expect(formatZoomPercent(1.5)).toBe("200");
    expect(parseZoomPercentInput("200")).toBe(1.5);
    expect(parseZoomPercentInput("10%")).toBe(0.2);
    expect(parseZoomPercentInput("700")).toBe(5);
    expect(parseZoomPercentInput("-10")).toBeNull();
    expect(parseZoomPercentInput("0")).toBeNull();
    expect(parseZoomPercentInput("not a number")).toBeNull();
  });

});
