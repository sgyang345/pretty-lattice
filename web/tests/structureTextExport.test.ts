import { describe, expect, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import { createDefaultComponentVisibility } from "../src/model";
import {
  createStructureTextExportFile,
  structureSceneForExport,
} from "../src/export/structureTextExport";

describe("structure text export", () => {
  test("exports the current repeat supercell without boundary helper atoms", () => {
    const scene = minimalScene();
    const visibility = {
      ...createDefaultComponentVisibility(scene),
      supercell: {
        ...createDefaultComponentVisibility(scene).supercell,
        a: 2,
        b: 1,
        c: 1,
        mode: "repeat" as const,
      },
    };

    const exportScene = structureSceneForExport(scene, visibility);
    expect(exportScene.atoms.map((atom) => atom.element)).toEqual([
      "Na",
      "Cl",
      "Na",
      "Cl",
    ]);
    expect(exportScene.cell.vectors[0]).toEqual([2, 0, 0]);

    const poscar = createStructureTextExportFile({
      componentVisibility: visibility,
      format: "vasp",
      scene,
      selectedFileName: "NaCl.vasp",
    });

    expect(poscar.fileName).toBe("NaCl.vasp");
    expect(poscar.text).toContain("Na  Cl");
    expect(poscar.text).toContain("2  2");
    expect(poscar.text).not.toContain("Na-image");
  });

  test("exports CIF and ABACUS STRU text", () => {
    const scene = minimalScene();
    const visibility = createDefaultComponentVisibility(scene);

    const cif = createStructureTextExportFile({
      componentVisibility: visibility,
      format: "cif",
      scene,
      selectedFileName: "NaCl.cif",
    });
    expect(cif.fileName).toBe("NaCl.cif");
    expect(cif.text).toContain("_cell_length_a                   1");
    expect(cif.text).toContain("Na1  Na  0  0  0");
    expect(cif.text).toContain("Cl1  Cl  0.5  0.5  0.5");

    const stru = createStructureTextExportFile({
      componentVisibility: visibility,
      format: "abacus-stru",
      scene,
      selectedFileName: "NaCl.vasp",
    });
    expect(stru.fileName).toBe("NaCl.stru");
    expect(stru.text).toContain("ATOMIC_SPECIES");
    expect(stru.text).toContain("ATOMIC_POSITIONS\nDirect");
    expect(stru.text).toContain("0.5  0.5  0.5  1  1  1");
  });

  test("preserves sixteen decimal places in structure text", () => {
    const scene = minimalScene();
    scene.cell.vectors[0] = [1.1234567890123456, 0, 0];
    scene.atoms[1]!.fractionalPosition = [
      0.1234567890123456,
      0.9999999999999999,
      0.5,
    ];

    const poscar = createStructureTextExportFile({
      componentVisibility: createDefaultComponentVisibility(scene),
      format: "vasp",
      scene,
      selectedFileName: "precise.vasp",
    });

    expect(poscar.text).toContain("1.1234567890123457  0  0");
    expect(poscar.text).toContain(
      "0.1234567890123456  0.9999999999999999  0.5  Cl",
    );
  });
});

function minimalScene(): SceneSpec {
  return {
    atoms: [
      atom("Na-0", "Na", [0, 0, 0], [0, 0, 0], false, []),
      atom("Cl-1", "Cl", [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], false, []),
      atom("Na-image", "Na", [1, 0, 0], [1, 0, 0], true, ["boundaryAtoms"]),
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

function atom(
  id: string,
  element: string,
  position: [number, number, number],
  fractionalPosition: [number, number, number],
  isPeriodicImage: boolean,
  visibilityDependencies: AtomSpec["visibilityDependencies"],
): AtomSpec {
  return {
    element,
    fractionalPosition,
    id,
    imageOffset: [0, 0, 0],
    imageReasons: [],
    isPeriodicImage,
    position,
    siteId: id,
    siteIndex: 0,
    visibilityDependencies,
    visibilityDependencyGroups:
      visibilityDependencies.length > 0 ? [visibilityDependencies] : [],
  };
}
