import { describe, expect, test } from "bun:test";

import type { SceneSpec } from "../src/api/scene";
import {
  DEFAULT_VIEW_SCALE,
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultExportSettings,
  createDefaultStyle,
  createPrettyLatticeProject,
  createDefaultAtomVectorSettings,
  isPrettyLatticeProjectFileName,
  parsePrettyLatticeProjectFile,
  prettyLatticeProjectFileName,
  prettyLatticeProjectJson,
} from "../src/model";
import { createPreviewViewState } from "../src/app/viewState";

describe("Pretty Lattice project files", () => {
  test("creates a v1 project file with scene, display, export, and view settings", () => {
    const scene = minimalScene();
    const visibility = createDefaultComponentVisibility(scene);
    const opacity = createDefaultComponentOpacity();
    const style = createDefaultStyle();
    const exportSettings = createDefaultExportSettings();
    const viewState = {
      ...createPreviewViewState(scene.cell.vectors),
      viewScale: 1.25,
    };

    const project = createPrettyLatticeProject({
      bondAlgorithm: "crystal-nn",
      componentOpacity: opacity,
      componentVisibility: visibility,
      exportSettings,
      previewMeshQuality: "high",
      scene,
      selectedFileName: "Bi Te.vasp",
      showCrystalAxisLabels: true,
      style,
      unitCellLineStyle: "dashed",
      viewState,
    });

    expect(project).toEqual({
      display: {
        opacity,
        previewMeshQuality: "high",
        showCrystalAxisLabels: true,
        style,
        unitCellLineStyle: "dashed",
        visibility,
      },
      export: {
        settings: exportSettings,
      },
      format: "pretty-lattice-project",
      overlays: {
        atomVectors: {
          color: "#ff0000",
          enabled: false,
          headSize: 100,
          lengthScale: 100,
          lineThickness: 100,
          maxAbsValue: 1,
          opacity: 100,
          values: {
            "1-Bi-1": [0, 0, 0],
          },
        },
      },
      source: {
        bondAlgorithm: "crystal-nn",
        name: "Bi Te.vasp",
      },
      structure: {
        scene,
      },
      version: 1,
      view: viewState,
    });
  });

  test("round-trips project JSON", () => {
    const scene = minimalScene();
    const project = createPrettyLatticeProject({
      bondAlgorithm: "minimum-distance",
      componentOpacity: createDefaultComponentOpacity(),
      componentVisibility: createDefaultComponentVisibility(scene),
      exportSettings: createDefaultExportSettings(),
      previewMeshQuality: "medium",
      scene,
      selectedFileName: "STRU",
      showCrystalAxisLabels: false,
      style: createDefaultStyle(),
      unitCellLineStyle: "solid",
      viewState: createPreviewViewState(scene.cell.vectors),
    });

    expect(parsePrettyLatticeProjectFile(prettyLatticeProjectJson(project))).toEqual(
      project,
    );
    expect(project.view.viewScale).toBe(DEFAULT_VIEW_SCALE);
  });

  test("fills missing supercell display settings from older project files", () => {
    const scene = minimalScene();
    const project = createPrettyLatticeProject({
      bondAlgorithm: "minimum-distance",
      componentOpacity: createDefaultComponentOpacity(),
      componentVisibility: {
        ...createDefaultComponentVisibility(scene),
        supercell: {
          a: 2,
          b: 1,
          c: 3,
          matrix: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          mode: "repeat",
        },
      },
      exportSettings: createDefaultExportSettings(),
      previewMeshQuality: "medium",
      scene,
      selectedFileName: "STRU",
      showCrystalAxisLabels: false,
      style: createDefaultStyle(),
      unitCellLineStyle: "solid",
      viewState: createPreviewViewState(scene.cell.vectors),
    });
    const rawProject = JSON.parse(prettyLatticeProjectJson(project));
    delete rawProject.display.visibility.supercell;

    const parsedProject = parsePrettyLatticeProjectFile(
      `${JSON.stringify(rawProject)}\n`,
    );

    expect(parsedProject.display.visibility.supercell).toEqual({
      a: 1,
      b: 1,
      c: 1,
      matrix: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      mode: "repeat",
    });
  });

  test("normalizes atom vector overlays from project files", () => {
    const scene = minimalScene();
    const project = createPrettyLatticeProject({
      atomVectors: {
        color: "#ABC",
        enabled: false,
        headSize: 350,
        lengthScale: 700,
        lineThickness: 10,
        maxAbsValue: 2.5,
        opacity: 50,
        values: {
          "1-Bi-1": [2, -2, 0.5],
        },
      },
      bondAlgorithm: "minimum-distance",
      componentOpacity: createDefaultComponentOpacity(),
      componentVisibility: createDefaultComponentVisibility(scene),
      exportSettings: createDefaultExportSettings(),
      previewMeshQuality: "medium",
      scene,
      selectedFileName: "STRU",
      showCrystalAxisLabels: false,
      style: createDefaultStyle(),
      unitCellLineStyle: "solid",
      viewState: createPreviewViewState(scene.cell.vectors),
    });

    const parsedProject = parsePrettyLatticeProjectFile(prettyLatticeProjectJson(project));

    expect(parsedProject.overlays.atomVectors).toEqual({
      color: "#aabbcc",
      enabled: true,
      headSize: 300,
      lengthScale: 500,
      lineThickness: 25,
      maxAbsValue: 2.5,
      opacity: 50,
      values: {
        "1-Bi-1": [1, -1, 0.5],
      },
    });
  });

  test("fills missing atom vector parameters with defaults", () => {
    const scene = minimalScene();
    const project = createPrettyLatticeProject({
      atomVectors: createDefaultAtomVectorSettings(scene),
      bondAlgorithm: "minimum-distance",
      componentOpacity: createDefaultComponentOpacity(),
      componentVisibility: createDefaultComponentVisibility(scene),
      exportSettings: createDefaultExportSettings(),
      previewMeshQuality: "medium",
      scene,
      selectedFileName: "STRU",
      showCrystalAxisLabels: false,
      style: createDefaultStyle(),
      unitCellLineStyle: "solid",
      viewState: createPreviewViewState(scene.cell.vectors),
    });
    const json = JSON.parse(prettyLatticeProjectJson(project));
    delete json.overlays.atomVectors.values["1-Bi-1"];

    const parsedProject = parsePrettyLatticeProjectFile(JSON.stringify(json));

    expect(parsedProject.overlays.atomVectors).toEqual({
      color: "#ff0000",
      enabled: false,
      headSize: 100,
      lengthScale: 100,
      lineThickness: 100,
      maxAbsValue: 1,
      opacity: 100,
      values: {
        "1-Bi-1": [0, 0, 0],
      },
    });
  });

  test("names atom vector values by structure order, element, and element order", () => {
    const scene = {
      ...minimalScene(),
      atoms: [
        minimalAtom("Al", 0),
        minimalAtom("Ge", 1),
        minimalAtom("Sb", 2),
        minimalAtom("Sb", 3),
      ],
    };
    const project = createPrettyLatticeProject({
      atomVectors: createDefaultAtomVectorSettings(scene),
      bondAlgorithm: "minimum-distance",
      componentOpacity: createDefaultComponentOpacity(),
      componentVisibility: createDefaultComponentVisibility(scene),
      exportSettings: createDefaultExportSettings(),
      previewMeshQuality: "medium",
      scene,
      selectedFileName: "STRU",
      showCrystalAxisLabels: false,
      style: createDefaultStyle(),
      unitCellLineStyle: "solid",
      viewState: createPreviewViewState(scene.cell.vectors),
    });

    expect(Object.keys(project.overlays.atomVectors.values)).toEqual([
      "1-Al-1",
      "2-Ge-1",
      "3-Sb-1",
      "4-Sb-2",
    ]);
  });

  test("recognizes project filenames and derives a safe project name", () => {
    expect(isPrettyLatticeProjectFileName("scene.prl")).toBe(true);
    expect(isPrettyLatticeProjectFileName("scene.PRL")).toBe(true);
    expect(isPrettyLatticeProjectFileName("scene.vasp")).toBe(false);
    expect(prettyLatticeProjectFileName("Bi Te.vasp")).toBe("Bi-Te.prl");
    expect(prettyLatticeProjectFileName(null)).toBe("pretty-lattice-project.prl");
  });

  test("rejects non-project JSON", () => {
    expect(() => parsePrettyLatticeProjectFile("{}")).toThrow(
      "This is not a Pretty Lattice project file.",
    );
  });
});

function minimalScene(): SceneSpec {
  return {
    atoms: [
      {
        element: "Bi",
        fractionalPosition: [0, 0, 0],
        id: "Bi-1",
        imageOffset: [0, 0, 0],
        imageReasons: [],
        isPeriodicImage: false,
        position: [0, 0, 0],
        siteId: "Bi-1",
        siteIndex: 0,
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
    ],
    bonds: [],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    polyhedra: [],
    summary: {
      atomCount: 1,
      cell: {
        a: "1.000",
        alpha: "90.000",
        b: "1.000",
        beta: "90.000",
        c: "1.000",
        gamma: "90.000",
      },
      formula: "Bi",
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

function minimalAtom(element: string, index: number): SceneSpec["atoms"][number] {
  return {
    element,
    fractionalPosition: [0, 0, 0],
    id: `${element}-${index}`,
    imageOffset: [0, 0, 0],
    imageReasons: [],
    isPeriodicImage: false,
    position: [index, 0, 0],
    siteId: `${element}-${index}`,
    siteIndex: index,
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}
