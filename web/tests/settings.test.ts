import { describe, expect, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import {
  STYLE_FOG_AMOUNT_MAX,
  STYLE_FOG_AMOUNT_MIN,
  STYLE_FOG_START_MAX,
  STYLE_FOG_START_MIN,
  STYLE_SCALE_MAX,
  STYLE_SCALE_MIN,
  DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  DEFAULT_UNIT_CELL_LINE_STYLE,
  defaultPreviewMeshQualityForScene,
  createDefaultExportSettings,
  createDefaultStyle,
  createCustomColormapFromScheme,
  createDefaultComponentVisibility,
  elementColorOverridesForStyle,
  hasCustomColormapChanges,
  INSPECTOR_OPEN_SCENE_OFFSET_X_PX,
  INSPECTOR_PREVIEW_SAFE_AREA,
  STRUCTURE_ATOM_COUNT_THRESHOLD,
  CHARGE_DENSITY_ANGSTROM3_PER_BOHR3,
  chargeDensityValueFromAngstromUnit,
  chargeDensityValueFromVestaUnit,
  chargeDensityValueToAngstromUnit,
  chargeDensityValueToVestaUnit,
  parseExportDimensionInput,
  setExportAspectRatioLocked,
  setExportBackground,
  setExportComponentSelected,
  setExportDimension,
  setExportFormat,
  setExportLegendLayout,
  setExportMeshQuality,
  setExportSupersampling,
  countPeriodicImageAtoms,
  hasChargeDensity,
  hasPolyhedra,
  hasPeriodicImageAtoms,
  normalizeChargeDensityDisplayState,
  previewSafeAreaForInspector,
  translateChargeDensityFractionalOffset,
  sceneOffsetXForInspector,
  syncExportSettingsProjectedSize,
  validateExportSettings,
  visibleSceneForComponents,
} from "../src/model";

describe("settings", () => {
  test("keeps the large-scene mesh quality threshold", () => {
    const belowThreshold = STRUCTURE_ATOM_COUNT_THRESHOLD - 1;
    const atThreshold = STRUCTURE_ATOM_COUNT_THRESHOLD;
    const aboveThreshold = STRUCTURE_ATOM_COUNT_THRESHOLD + 1;

    expect(defaultPreviewMeshQualityForScene(null)).toBe("medium");
    expect(defaultPreviewMeshQualityForScene(sceneWithAtomCount(belowThreshold))).toBe("medium");
    expect(defaultPreviewMeshQualityForScene(sceneWithAtomCount(atThreshold))).toBe("low");
    expect(defaultPreviewMeshQualityForScene(sceneWithAtomCount(aboveThreshold))).toBe("low");
    expect(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS).toBe(true);
    expect(DEFAULT_UNIT_CELL_LINE_STYLE).toBe("solid");
  });

  test("defaults style controls to 40 percent atoms, 100 percent bonds, bicolor bonds, and enabled depth cueing", () => {
    expect(createDefaultStyle()).toEqual({
      atomRadius: 40,
      atomRadiusModel: "uniform",
      bondColor: "#d2d2d2",
      bondColorMode: "bicolor",
      bondThickness: 100,
      colorScheme: "vesta",
      colorSchemeMode: "preset",
      customColormap: null,
      distinguishSimilarColors: true,
      fogAffectsUnitCell: false,
      fogAmount: 40,
      fogEnabled: true,
      fogStart: 40,
      materialPreset: "metallic",
    });
    expect(STYLE_FOG_START_MIN).toBe(0);
    expect(STYLE_FOG_START_MAX).toBe(100);
    expect(STYLE_FOG_AMOUNT_MIN).toBe(0);
    expect(STYLE_FOG_AMOUNT_MAX).toBe(100);
    expect(STYLE_SCALE_MIN.atomRadius).toBe(0);
    expect(STYLE_SCALE_MAX.atomRadius).toBe(100);
    expect(STYLE_SCALE_MAX.bondThickness).toBe(200);
  });

  test("uses auto color overrides only for preset color schemes", () => {
    const presetStyle = createDefaultStyle();
    const presetOverrides = elementColorOverridesForStyle(
      atomsWithElements(["O", "V"]),
      presetStyle,
    );

    expect(presetOverrides?.V).toBeDefined();

    const customColormap = createCustomColormapFromScheme("vesta-soft");
    customColormap.elements.V = "#123456";
    const customStyle = {
      ...presetStyle,
      colorSchemeMode: "custom" as const,
      customColormap,
    };

    expect(elementColorOverridesForStyle(atomsWithElements(["O", "V"]), customStyle)).toEqual(
      expect.objectContaining({ V: "#123456" }),
    );
  });

  test("detects whether a custom color map differs from its base preset", () => {
    const customColormap = createCustomColormapFromScheme("vesta-soft");

    expect(hasCustomColormapChanges(customColormap)).toBe(false);

    customColormap.elements.V = "#123456";
    expect(hasCustomColormapChanges(customColormap)).toBe(true);

    const baseVColor = createCustomColormapFromScheme("vesta-soft").elements.V;
    expect(baseVColor).toBeDefined();
    customColormap.elements.V = baseVColor!;
    expect(hasCustomColormapChanges(customColormap)).toBe(false);
  });

  test("defaults figure export settings to PNG with separate 2D and 3D quality controls", () => {
    expect(createDefaultExportSettings()).toEqual({
      aspectRatioLocked: false,
      background: "transparent",
      combineComponents: true,
      components: {
        legend: false,
        crystalAxes: true,
        structure: true,
      },
      format: "png",
      height: 2000,
      legendLayout: "horizontal",
      meshQuality: "high",
      pixelsPerProjectedUnit: null,
      supersampling: 2,
      width: 2000,
    });
  });

  test("creates independent nested export component defaults", () => {
    const firstSettings = createDefaultExportSettings();
    firstSettings.components.legend = true;

    expect(createDefaultExportSettings().components.legend).toBe(false);
  });

  test("edits export dimensions with locked and unlocked projected scale", () => {
    const defaultSettings = createDefaultExportSettings();
    const squareProjectedSize = { height: 1, width: 1 };
    const wideProjectedSize = { height: 1, width: 2 };
    const lockedSettings = setExportAspectRatioLocked(
      defaultSettings,
      true,
      squareProjectedSize,
    );

    expect(lockedSettings).toMatchObject({
      height: 2000,
      pixelsPerProjectedUnit: 2000,
      width: 2000,
    });
    expect(setExportDimension(lockedSettings, "width", 3000, squareProjectedSize)).toMatchObject({
      height: 3000,
      pixelsPerProjectedUnit: 3000,
      width: 3000,
    });
    expect(setExportDimension(lockedSettings, "height", 1200, squareProjectedSize)).toMatchObject({
      height: 1200,
      pixelsPerProjectedUnit: 1200,
      width: 1200,
    });
    expect(setExportDimension(lockedSettings, "width", 3000, wideProjectedSize)).toMatchObject({
      height: 1500,
      pixelsPerProjectedUnit: 1500,
      width: 3000,
    });
    expect(syncExportSettingsProjectedSize(lockedSettings, squareProjectedSize)).toMatchObject({
      height: 2000,
      width: 2000,
    });

    const wideLockedSettings = setExportAspectRatioLocked(
      defaultSettings,
      true,
      wideProjectedSize,
    );
    expect(wideLockedSettings).toMatchObject({
      height: 1000,
      pixelsPerProjectedUnit: 1000,
      width: 2000,
    });
    expect(syncExportSettingsProjectedSize(wideLockedSettings, squareProjectedSize)).toMatchObject({
      height: 1000,
      pixelsPerProjectedUnit: 1000,
      width: 1000,
    });
    expect(
      syncExportSettingsProjectedSize(
        syncExportSettingsProjectedSize(wideLockedSettings, squareProjectedSize),
        wideProjectedSize,
      ),
    ).toMatchObject({
      height: 1000,
      pixelsPerProjectedUnit: 1000,
      width: 2000,
    });

    expect(setExportAspectRatioLocked(defaultSettings, true, wideProjectedSize)).toMatchObject({
      height: 1000,
      width: 2000,
    });
    expect(
      setExportAspectRatioLocked(defaultSettings, true, {
        height: 2,
        width: 1,
      }),
    ).toMatchObject({
      height: 2000,
      width: 1000,
    });

    expect(setExportDimension(defaultSettings, "height", 1200)).toMatchObject({
      height: 1200,
      pixelsPerProjectedUnit: null,
      width: 2000,
    });
    expect(syncExportSettingsProjectedSize(defaultSettings, squareProjectedSize)).toBe(
      defaultSettings,
    );
  });

  test("parses and validates bounded export quality settings", () => {
    const defaultSettings = createDefaultExportSettings();

    expect(parseExportDimensionInput("3200px")).toBe(3200);
    expect(parseExportDimensionInput("0")).toBeNull();
    expect(parseExportDimensionInput("99999")).toBe(6000);
    expect(setExportSupersampling(defaultSettings, 9).supersampling).toBe(4);
    expect(setExportMeshQuality(defaultSettings, "xhigh").meshQuality).toBe("xhigh");
    expect(setExportComponentSelected(defaultSettings, "legend", true).components).toEqual({
      legend: true,
      crystalAxes: true,
      structure: true,
    });
    expect(setExportLegendLayout(defaultSettings, "vertical").legendLayout).toBe("vertical");
    expect(setExportBackground(defaultSettings, "black").background).toBe("black");
    expect(setExportFormat(defaultSettings, "pdf")).toEqual({
      ...defaultSettings,
      format: "pdf",
    });
    expect(setExportFormat(defaultSettings, "jpg")).toEqual({
      ...defaultSettings,
      background: "white",
      format: "jpg",
    });
    expect(
      setExportBackground(
        {
          ...defaultSettings,
          background: "white",
          format: "jpg",
        },
        "transparent",
      ).background,
    ).toBe("white");
    expect(validateExportSettings(defaultSettings).valid).toBe(true);
    expect(validateExportSettings({
      ...defaultSettings,
      supersampling: 4,
    }).valid).toBe(true);
    expect(
      validateExportSettings({
        ...defaultSettings,
        components: {
          legend: false,
          crystalAxes: false,
          structure: false,
        },
      }),
    ).toEqual({
      message: "Select at least one export component.",
      valid: false,
    });
    expect(
      validateExportSettings({
        ...defaultSettings,
        background: "transparent",
        format: "jpg",
      }),
    ).toEqual({
      valid: false,
      message: "JPG exports need a white or black background.",
    });
    expect(
      validateExportSettings({
        ...defaultSettings,
        height: 6000,
        supersampling: 4,
        width: 6000,
      }),
    ).toEqual({
      valid: false,
      message: "Size and supersampling are too large for this browser export.",
    });
  });

  test("detects periodic image atoms", () => {
    const scene = sceneWithPeriodicImages();

    expect(countPeriodicImageAtoms(scene)).toBe(3);
    expect(hasPeriodicImageAtoms(scene)).toBe(true);
    expect(countPeriodicImageAtoms(null)).toBe(0);
    expect(hasPeriodicImageAtoms(null)).toBe(false);
  });

  test("detects polyhedra while default visibility keeps polyhedra hidden", () => {
    const scene = sceneWithPeriodicImages();

    expect(hasPolyhedra(scene)).toBe(true);
    expect(hasPolyhedra({ ...scene, polyhedra: [] })).toBe(false);
    expect(hasPolyhedra(null)).toBe(false);
    expect(createDefaultComponentVisibility(scene).polyhedra).toBe(false);
    expect(createDefaultComponentVisibility(scene).atomLabels.enabled).toBe(false);
    expect(createDefaultComponentVisibility(scene).atomLabels.kind).toBe("element");
    expect(createDefaultComponentVisibility({ ...scene, polyhedra: [] }).polyhedra).toBe(false);
    expect(createDefaultComponentVisibility().polyhedra).toBe(false);
  });

  test("detects and filters charge density overlays independently", () => {
    const scene = {
      ...sceneWithPeriodicImages(),
      chargeDensity: {
        grid: [4, 4, 4],
        isoValue: 0.5,
        max: 2,
        min: -1,
        mode: "total",
        positions: [[0.25, 0.25, 0.25]],
        sampleCount: 1,
        source: "CHGCAR",
        totalCandidateCount: 1,
        values: [2],
        voxelSize: 0.1,
      },
    } satisfies SceneSpec;
    const defaultVisibility = createDefaultComponentVisibility(scene);

    expect(hasChargeDensity(scene)).toBe(true);
    expect(hasChargeDensity({ ...scene, chargeDensity: undefined })).toBe(false);
    expect(hasChargeDensity(null)).toBe(false);
    expect(defaultVisibility.chargeDensity).toBe(true);
    expect(visibleSceneForComponents(scene, defaultVisibility)?.chargeDensity).toBe(
      scene.chargeDensity,
    );
    expect(
      visibleSceneForComponents(scene, {
        ...defaultVisibility,
        chargeDensity: false,
      })?.chargeDensity,
    ).toBeUndefined();
    expect(
      normalizeChargeDensityDisplayState(
        {
          boundaryColor: "#abc",
          boundaryFillOpacity: 36,
          fractionalOffset: [1.2, -0.1, 0.25],
          interpolationFactor: 1.5,
          isoValue: 1,
          sectionAxis: "a",
          sectionEnabled: true,
          sectionOpacity: 42,
          sectionPosition: 25,
          surfaceMode: "positive",
        },
        scene,
      ),
    ).toEqual(
      expect.objectContaining({
        boundaryColor: "#aabbcc",
        boundaryFillOpacity: 36,
        fractionalOffset: [0.19999999999999996, 0.9, 0.25],
        interpolationFactor: 1.5,
        sectionAxis: "a",
        sectionEnabled: true,
        sectionOpacity: 42,
        sectionPosition: 25,
        surfaceMode: "positive",
      }),
    );
    expect(
      normalizeChargeDensityDisplayState(
        {
          boundaryColor: "not-a-color",
          boundaryFillOpacity: 142,
          fractionalOffset: ["bad", 1, Number.POSITIVE_INFINITY] as never,
          interpolationFactor: 1.25,
          sectionAxis: "bad" as never,
          sectionOpacity: 142,
          sectionPosition: -25,
          surfaceMode: "hidden" as never,
        },
        scene,
      ),
    ).toEqual(
      expect.objectContaining({
        boundaryColor: "#6f737a",
        boundaryFillOpacity: 100,
        fractionalOffset: [0, 0, 0],
        interpolationFactor: 1,
        sectionAxis: "c",
        sectionEnabled: false,
        sectionOpacity: 100,
        sectionPosition: 0,
        surfaceMode: "both",
      }),
    );
    expect(
      translateChargeDensityFractionalOffset(
        normalizeChargeDensityDisplayState({ fractionalOffset: [0.95, 0.1, 0] }),
        [0.1, -0.2, 1],
      ).fractionalOffset,
    ).toEqual([0.050000000000000044, 0.9, 0]);
  });

  test("converts charge density iso values between Angstrom and VESTA units", () => {
    expect(chargeDensityValueToVestaUnit(1, "e/A^3")).toBeCloseTo(
      CHARGE_DENSITY_ANGSTROM3_PER_BOHR3,
    );
    expect(chargeDensityValueFromVestaUnit(CHARGE_DENSITY_ANGSTROM3_PER_BOHR3, "e/A^3")).toBeCloseTo(1);
    expect(chargeDensityValueToAngstromUnit(CHARGE_DENSITY_ANGSTROM3_PER_BOHR3, "e/a0^3")).toBeCloseTo(1);
    expect(chargeDensityValueFromAngstromUnit(1, "e/a0^3")).toBeCloseTo(
      CHARGE_DENSITY_ANGSTROM3_PER_BOHR3,
    );
    expect(chargeDensityValueToVestaUnit(0.0023, "e/bohr^3")).toBeCloseTo(0.0023);
  });

  test("filters image atoms, bonds, and polyhedra locally without mutating the loaded scene", () => {
    const scene = sceneWithPeriodicImages();
    const defaultVisibility = createDefaultComponentVisibility(scene);

    const defaultWithoutOneHopVisibility = {
      ...defaultVisibility,
      oneHopBondedAtoms: false,
    };
    const visibleScene = visibleSceneForComponents(scene, defaultWithoutOneHopVisibility);

    expect(defaultVisibility.oneHopBondedAtoms).toBe(true);
    expect(defaultVisibility.atomLabels.enabled).toBe(false);
    expect(visibleScene?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Cl-1",
    ]);
    expect(bondAtomIds(visibleScene)).toEqual([
      "Na-0--Cl-1",
      "Na-0-image-1-0-0--Cl-1",
    ]);
    expect(visibleScene?.polyhedra).toEqual([]);

    const withOneHop = visibleSceneForComponents(scene, {
      ...defaultWithoutOneHopVisibility,
      oneHopBondedAtoms: true,
    });
    expect(withOneHop?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Cl-1",
      "Cl-1-image-0--1-0",
      "Cl-1-image-1-1-0",
    ]);
    expect(bondAtomIds(withOneHop)).toEqual([
      "Na-0--Cl-1",
      "Na-0-image-1-0-0--Cl-1",
      "Na-0--Cl-1-image-0--1-0",
      "Na-0-image-1-0-0--Cl-1-image-1-1-0",
    ]);

    const withPolyhedra = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      polyhedra: true,
      oneHopBondedAtoms: true,
    });
    expect(polyhedronAtomIds(withPolyhedra)).toEqual([
      "Na-0--Cl-1",
      "Na-0--Na-0-image-1-0-0--Cl-1",
      "Na-0--Cl-1-image-0--1-0--Cl-1",
      "Na-0-image-1-0-0--Cl-1-image-1-1-0--Cl-1",
    ]);

    const withoutBoundary = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      polyhedra: true,
      oneHopBondedAtoms: true,
      boundaryAtoms: false,
    });
    expect(withoutBoundary?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Cl-1",
      "Cl-1-image-0--1-0",
    ]);
    expect(bondAtomIds(withoutBoundary)).toEqual([
      "Na-0--Cl-1",
      "Na-0--Cl-1-image-0--1-0",
    ]);
    expect(polyhedronAtomIds(withoutBoundary)).toEqual([
      "Na-0--Cl-1",
      "Na-0--Cl-1-image-0--1-0--Cl-1",
    ]);

    const withoutOneHop = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      polyhedra: true,
      oneHopBondedAtoms: false,
    });
    expect(withoutOneHop?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Cl-1",
    ]);
    expect(bondAtomIds(withoutOneHop)).toEqual([
      "Na-0--Cl-1",
      "Na-0-image-1-0-0--Cl-1",
    ]);
    expect(polyhedronAtomIds(withoutOneHop)).toEqual([
      "Na-0--Cl-1",
      "Na-0--Na-0-image-1-0-0--Cl-1",
    ]);

    const withoutBonds = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      bonds: false,
      polyhedra: true,
      oneHopBondedAtoms: true,
    });
    expect(withoutBonds?.atoms).toHaveLength(5);
    expect(withoutBonds?.bonds).toEqual([]);
    expect(withoutBonds?.polyhedra).toHaveLength(4);

    const withoutPolyhedra = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      polyhedra: false,
    });
    expect(withoutPolyhedra?.atoms).toHaveLength(5);
    expect(withoutPolyhedra?.bonds).toHaveLength(4);
    expect(withoutPolyhedra?.polyhedra).toEqual([]);

    const withAtomLabels = visibleSceneForComponents(scene, {
      ...defaultWithoutOneHopVisibility,
      atomLabels: {
        ...defaultWithoutOneHopVisibility.atomLabels,
        enabled: true,
      },
    });
    expect(withAtomLabels).toEqual(visibleScene);

    const withoutAtomSpheres = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      atoms: false,
      polyhedra: true,
      oneHopBondedAtoms: true,
    });
    expect(withoutAtomSpheres?.atoms).toHaveLength(5);
    expect(withoutAtomSpheres?.polyhedra).toHaveLength(4);
    expect(scene.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Cl-1",
      "Cl-1-image-0--1-0",
      "Cl-1-image-1-1-0",
    ]);
    expect(scene.polyhedra).toHaveLength(4);
  });

  test("expands the visible scene for supercell display", () => {
    const scene = {
      ...sceneWithPeriodicImages(),
      chargeDensity: testChargeDensity(),
    } satisfies SceneSpec;
    const visibleScene = visibleSceneForComponents(scene, {
      ...createDefaultComponentVisibility(scene),
      boundaryAtoms: false,
      oneHopBondedAtoms: false,
      supercell: {
        ...createDefaultComponentVisibility(scene).supercell,
        a: 2,
      },
    });

    expect(visibleScene?.cell.vectors[0]).toEqual([2, 0, 0]);
    expect(visibleScene?.cell.vectors[1]).toEqual([0, 1, 0]);
    expect(visibleScene?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Cl-1",
      "Na-0-supercell-1-0-0",
      "Cl-1-supercell-1-0-0",
    ]);
    expect(visibleScene?.atoms[0]?.fractionalPosition).toEqual([0, 0, 0]);
    expect(visibleScene?.atoms[2]?.fractionalPosition).toEqual([0.5, 0, 0]);
    expect(visibleScene?.atoms[0]?.position).toEqual([0, 0, 0]);
    expect(visibleScene?.atoms[2]?.position).toEqual([1, 0, 0]);
    expect(visibleScene?.chargeDensity?.supercellRepeat).toEqual([2, 1, 1]);
    expect(visibleScene?.chargeDensity?.scalarValues).toBe(scene.chargeDensity.scalarValues);
    expect(bondAtomIds(visibleScene)).toEqual([
      "Na-0--Cl-1",
      "Na-0-supercell-1-0-0--Cl-1-supercell-1-0-0",
    ]);
  });

  test("expands the visible scene with a matrix supercell", () => {
    const scene = sceneForMatrixSupercell();
    const visibleScene = visibleSceneForComponents(scene, {
      ...createDefaultComponentVisibility(scene),
      supercell: {
        ...createDefaultComponentVisibility(scene).supercell,
        matrix: [
          [1, 0, 0],
          [1, 2, 0],
          [0, 0, 1],
        ],
        mode: "matrix",
      },
    });

    expect(visibleScene?.cell.vectors).toEqual([
      [1, 0, 0],
      [1, 2, 0],
      [0, 0, 1],
    ]);
    expect(visibleScene?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Cl-1",
      "Na-0-supercell-1-1-0",
      "Cl-1-supercell-1-1-0",
    ]);
    expect(visibleScene?.atoms[1]?.fractionalPosition).toEqual([0.25, 0.25, 0]);
    expect(visibleScene?.atoms[3]?.position).toEqual([1.5, 1.5, 0]);
    expect(bondAtomIds(visibleScene)).toEqual([
      "Na-0--Cl-1",
      "Na-0-supercell-1-1-0--Cl-1-supercell-1-1-0",
    ]);
  });

  test("disables matrix supercell display while charge density is visible", () => {
    const scene = {
      ...sceneForMatrixSupercell(),
      chargeDensity: testChargeDensity(),
    } satisfies SceneSpec;
    const visibleScene = visibleSceneForComponents(scene, {
      ...createDefaultComponentVisibility(scene),
      supercell: {
        ...createDefaultComponentVisibility(scene).supercell,
        matrix: [
          [1, 0, 0],
          [1, 2, 0],
          [0, 0, 1],
        ],
        mode: "matrix",
      },
    });

    expect(visibleScene?.cell.vectors).toEqual(scene.cell.vectors);
    expect(visibleScene?.atoms.map((atom) => atom.id)).toEqual(["Na-0", "Cl-1"]);
    expect(visibleScene?.chargeDensity).toBe(scene.chargeDensity);
    expect(visibleScene?.chargeDensity?.supercellRepeat).toBeUndefined();
  });

  test("applies unimodular transformation matrix changes without duplicating atoms", () => {
    const scene = sceneForMatrixSupercell();
    const visibleScene = visibleSceneForComponents(scene, {
      ...createDefaultComponentVisibility(scene),
      supercell: {
        ...createDefaultComponentVisibility(scene).supercell,
        matrix: [
          [1, 1, 0],
          [2, 3, 1],
          [0, 0, 1],
        ],
        mode: "matrix",
      },
    });

    expect(visibleScene?.cell.vectors).toEqual([
      [1, 1, 0],
      [2, 3, 1],
      [0, 0, 1],
    ]);
    expect(visibleScene?.atoms.map((atom) => atom.id)).toEqual(["Na-0", "Cl-1"]);
    expect(visibleScene?.atoms[1]?.fractionalPosition).toEqual([0.5, 0, 0]);
    expect(visibleScene?.atoms[1]?.position).toEqual([0.5, 0.5, 0]);
    expect(visibleScene?.atoms[1]?.isPeriodicImage).toBe(false);
  });

  test("uses a stable mirrored safe area and a small inspector scene offset", () => {
    const safeArea = previewSafeAreaForInspector();

    expect(safeArea).toBe(INSPECTOR_PREVIEW_SAFE_AREA);
    expect(safeArea.right).toBe(420);
    expect(safeArea.left).toBe(176);
    expect(safeArea.bottom).toBe(116);
    expect(safeArea.top).toBe(40);
    expect(sceneOffsetXForInspector(false, 1200)).toBe(0);
    expect(sceneOffsetXForInspector(true, 760)).toBe(0);
    expect(sceneOffsetXForInspector(true, 1200)).toBe(INSPECTOR_OPEN_SCENE_OFFSET_X_PX);
  });
});

function sceneForMatrixSupercell(): SceneSpec {
  return {
    atoms: [
      matrixAtom("Na-0", "Na", [0, 0, 0]),
      matrixAtom("Cl-1", "Cl", [0.5, 0.5, 0]),
    ],
    bonds: [
      {
        endAtomIndex: 1,
        startAtomIndex: 0,
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
    ],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    polyhedra: [],
    summary: {
      atomCount: 2,
      cell: {
        a: "1",
        alpha: "90",
        b: "1",
        beta: "90",
        c: "1",
        gamma: "90",
      },
      formula: "NaCl",
      symmetry: {
        available: false,
        crystalSystem: null,
        latticeSystem: null,
        pointGroup: null,
        pointGroupSchoenflies: null,
        spaceGroup: null,
        spaceGroupNumber: null,
      },
    },
  };
}

function matrixAtom(
  id: string,
  element: string,
  fractionalPosition: [number, number, number],
): SceneSpec["atoms"][number] {
  return {
    element,
    fractionalPosition,
    id,
    imageOffset: [0, 0, 0],
    imageReasons: [],
    isPeriodicImage: false,
    position: fractionalPosition,
    siteId: id,
    siteIndex: id.endsWith("-0") ? 0 : 1,
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}

function sceneWithPeriodicImages(): SceneSpec {
  return {
    atoms: [
      atom("Na-0", "Na", [0, 0, 0], [], []),
      atom("Na-0-image-1-0-0", "Na", [1, 0, 0], ["boundary"], [["boundaryAtoms"]]),
      atom("Cl-1", "Cl", [0, 0, 0], [], []),
      atom(
        "Cl-1-image-0--1-0",
        "Cl",
        [0, -1, 0],
        ["bonded"],
        [["oneHopBondedAtoms"]],
      ),
      atom(
        "Cl-1-image-1-1-0",
        "Cl",
        [1, 1, 0],
        ["bonded"],
        [["boundaryAtoms", "oneHopBondedAtoms"]],
      ),
    ],
    bonds: [
      {
        startAtomIndex: 0,
        endAtomIndex: 2,
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
      {
        startAtomIndex: 1,
        endAtomIndex: 2,
        visibilityDependencies: ["boundaryAtoms", "oneHopBondedAtoms"],
        visibilityDependencyGroups: [["boundaryAtoms", "oneHopBondedAtoms"]],
      },
      {
        startAtomIndex: 0,
        endAtomIndex: 3,
        visibilityDependencies: ["oneHopBondedAtoms"],
        visibilityDependencyGroups: [["oneHopBondedAtoms"]],
      },
      {
        startAtomIndex: 1,
        endAtomIndex: 4,
        visibilityDependencies: ["boundaryAtoms", "oneHopBondedAtoms"],
        visibilityDependencyGroups: [["boundaryAtoms", "oneHopBondedAtoms"]],
      },
    ],
    polyhedra: [
      polyhedron([0, 2]),
      polyhedron([0, 1, 2]),
      polyhedron([0, 3, 2]),
      polyhedron([1, 4, 2]),
    ],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    summary: {
      atomCount: 2,
      cell: {
        a: "1.00",
        alpha: "90.00",
        b: "1.00",
        beta: "90.00",
        c: "1.00",
        gamma: "90.00",
      },
      formula: "NaCl",
      symmetry: {
        available: false,
        crystalSystem: null,
        latticeSystem: null,
        pointGroup: null,
        pointGroupSchoenflies: null,
        spaceGroup: null,
        spaceGroupNumber: null,
      },
    },
  };
}

function sceneWithAtomCount(atomCount: number): SceneSpec {
  const scene = sceneWithPeriodicImages();
  return {
    ...scene,
    summary: {
      ...scene.summary,
      atomCount,
    },
  };
}

function atomsWithElements(elements: string[]): AtomSpec[] {
  return elements.map((element, index) =>
    atom(`${element}-${index}`, element, [0, 0, 0], [], []),
  );
}

function bondAtomIds(scene: SceneSpec | null): string[] {
  if (!scene) {
    return [];
  }

  return scene.bonds.map(
    (bond) => `${scene.atoms[bond.startAtomIndex]?.id}--${scene.atoms[bond.endAtomIndex]?.id}`,
  );
}

function polyhedronAtomIds(scene: SceneSpec | null): string[] {
  if (!scene) {
    return [];
  }

  return scene.polyhedra.map((polyhedron) =>
    polyhedron.hullAtomIndices.map((atomIndex) => scene.atoms[atomIndex]?.id).join("--"),
  );
}

function polyhedron(hullAtomIndices: number[]): SceneSpec["polyhedra"][number] {
  return {
    centerAtomIndex: hullAtomIndices[0]!,
    hullAtomIndices,
    faces: hullAtomIndices.length >= 3 ? [[0, 1, 2]] : [],
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}

function testChargeDensity(): NonNullable<SceneSpec["chargeDensity"]> {
  return {
    grid: [2, 2, 2],
    isoValue: 0.1,
    max: 0.2,
    min: -0.2,
    mode: "total",
    positions: [[0, 0, 0]],
    sampleCount: 1,
    scalarValues: [0, 0.1, 0.2, 0.1, -0.1, -0.2, -0.1, 0],
    source: "CHGCAR",
    totalCandidateCount: 1,
    values: [0.2],
    voxelSize: 0.1,
  };
}

function atom(
  id: string,
  element: string,
  imageOffset: [number, number, number],
  imageReasons: AtomSpec["imageReasons"],
  visibilityDependencyGroups: AtomSpec["visibilityDependencyGroups"],
): AtomSpec {
  const isPeriodicImage = imageOffset.some((value) => value !== 0);
  const visibilityDependencies = Array.from(new Set(visibilityDependencyGroups.flat()));
  const siteId = id.split("-image-", 1)[0]!;
  const siteIndex = Number(siteId.match(/-(\d+)/)?.[1] ?? 0);
  return {
    element,
    fractionalPosition: imageOffset,
    id,
    imageOffset,
    isPeriodicImage,
    imageReasons,
    visibilityDependencies,
    visibilityDependencyGroups,
    position: imageOffset,
    siteId,
    siteIndex,
  };
}
