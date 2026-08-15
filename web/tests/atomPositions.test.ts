import { describe, expect, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import {
  allCanonicalAtomSiteIds,
  canonicalAtomsForFractionalCoordinates,
  setAtomSiteFractionalPosition,
  restoreAtomPositionsFromScene,
  translateAtomSitesFractional,
  wrapFractionalCoordinate,
} from "../src/model/atomPositions";

describe("atom fractional position editing", () => {
  test("translates selected atom sites with periodic wrapping without changing the cell", () => {
    const scene = sceneWithPeriodicImage();

    const nextScene = translateAtomSitesFractional(scene, ["Si-1"], [0.2, -0.4, 0.8]);

    expect(nextScene.cell).toBe(scene.cell);
    expectTupleClose(nextScene.atoms[0]!.fractionalPosition, [0.1, 0.8, 0.1]);
    expectTupleClose(nextScene.atoms[0]!.position, [0.1, 1.6, 0.3]);
    expectTupleClose(nextScene.atoms[1]!.fractionalPosition, [1.1, 0.8, -0.9]);
    expectTupleClose(nextScene.atoms[1]!.position, [1.1, 1.6, -2.7]);
    expect(nextScene.atoms[2]).toBe(scene.atoms[2]);
  });

  test("sets one canonical fractional coordinate and keeps periodic image offsets", () => {
    const scene = sceneWithPeriodicImage();

    const nextScene = setAtomSiteFractionalPosition(scene, "Si-1", [1.25, -0.2, 0.5]);

    expectTupleClose(nextScene.atoms[0]!.fractionalPosition, [0.25, 0.8, 0.5]);
    expectTupleClose(nextScene.atoms[1]!.fractionalPosition, [1.25, 0.8, -0.5]);
  });

  test("restores atom positions from the loaded baseline scene", () => {
    const scene = sceneWithPeriodicImage();
    const movedScene = translateAtomSitesFractional(scene, ["Si-1"], [0.2, -0.4, 0.8]);

    const restoredScene = restoreAtomPositionsFromScene(movedScene, scene);

    expect(restoredScene.cell).toBe(scene.cell);
    expectTupleClose(restoredScene.atoms[0]!.fractionalPosition, [0.9, 0.2, 0.3]);
    expectTupleClose(restoredScene.atoms[0]!.position, [0.9, 0.4, 0.9]);
    expectTupleClose(restoredScene.atoms[1]!.fractionalPosition, [1.9, 0.2, -0.7]);
    expectTupleClose(restoredScene.atoms[1]!.position, [1.9, 0.4, -2.1]);
  });

  test("lists only canonical atoms for the editor", () => {
    const scene = sceneWithPeriodicImage();

    expect(canonicalAtomsForFractionalCoordinates(scene.atoms).map((atom) => atom.id)).toEqual([
      "Si-1",
      "O-1",
    ]);
    expect(allCanonicalAtomSiteIds(scene.atoms)).toEqual(["Si-1", "O-1"]);
    expect(wrapFractionalCoordinate(-0.125)).toBe(0.875);
  });
});

function sceneWithPeriodicImage(): SceneSpec {
  return {
    atoms: [
      atom({
        id: "Si-1",
        siteId: "Si-1",
        element: "Si",
        siteIndex: 0,
        fractionalPosition: [0.9, 0.2, 0.3],
        imageOffset: [0, 0, 0],
      }),
      atom({
        id: "Si-1-image-1-0--1",
        siteId: "Si-1",
        element: "Si",
        siteIndex: 0,
        fractionalPosition: [1.9, 0.2, -0.7],
        imageOffset: [1, 0, -1],
        isPeriodicImage: true,
      }),
      atom({
        id: "O-1",
        siteId: "O-1",
        element: "O",
        siteIndex: 1,
        fractionalPosition: [0.4, 0.5, 0.6],
        imageOffset: [0, 0, 0],
      }),
    ],
    bonds: [],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 2, 0],
        [0, 0, 3],
      ],
    },
    polyhedra: [],
    summary: {
      atomCount: 2,
      cell: {
        a: "1.00",
        alpha: "90.0",
        b: "2.00",
        beta: "90.0",
        c: "3.00",
        gamma: "90.0",
      },
      formula: "O Si",
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

function expectTupleClose(
  received: [number, number, number],
  expected: [number, number, number],
) {
  expected.forEach((value, index) => {
    expect(received[index]).toBeCloseTo(value, 12);
  });
}

function atom({
  element,
  fractionalPosition,
  id,
  imageOffset,
  isPeriodicImage = false,
  siteId,
  siteIndex,
}: {
  element: string;
  fractionalPosition: [number, number, number];
  id: string;
  imageOffset: [number, number, number];
  isPeriodicImage?: boolean;
  siteId: string;
  siteIndex: number;
}): AtomSpec {
  return {
    element,
    fractionalPosition,
    id,
    imageOffset,
    imageReasons: isPeriodicImage ? ["boundary"] : [],
    isPeriodicImage,
    position: [
      fractionalPosition[0],
      fractionalPosition[1] * 2,
      fractionalPosition[2] * 3,
    ],
    siteId,
    siteIndex,
    visibilityDependencies: isPeriodicImage ? ["boundaryAtoms"] : [],
    visibilityDependencyGroups: isPeriodicImage ? [["boundaryAtoms"]] : [],
  };
}
