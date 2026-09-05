import { describe, expect, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import {
  allCanonicalAtomSiteIds,
  canonicalAtomsForFractionalCoordinates,
  setAtomSiteFractionalPosition,
  restoreAtomPositionsFromScene,
  translateAtomSitesFractional,
  translateAtomSitesFractionalForBackendRebuild,
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

  test("preserves movement at the sixteenth fractional decimal place", () => {
    const scene = sceneWithPeriodicImage();

    const nextScene = translateAtomSitesFractional(
      scene,
      ["Si-1"],
      [0.0000000000000001, 0, 0],
    );

    expect(nextScene).not.toBe(scene);
    expect(nextScene.atoms[0]!.fractionalPosition[0]).toBe(0.9000000000000001);
  });

  test("translates multiple selected sites while leaving unselected sites unchanged", () => {
    const scene = {
      ...sceneWithPeriodicImage(),
      atoms: [
        ...sceneWithPeriodicImage().atoms,
        atom({
          id: "C-2",
          siteId: "C-2",
          element: "C",
          siteIndex: 2,
          fractionalPosition: [0.2, 0.2, 0.2],
          imageOffset: [0, 0, 0],
        }),
      ],
    };
    const untouched = scene.atoms[3]!;

    const nextScene = translateAtomSitesFractional(
      scene,
      ["Si-1", "O-1"],
      [0.1, 0.2, -0.1],
    );

    expectTupleClose(nextScene.atoms[0]!.fractionalPosition, [0, 0.4, 0.2]);
    expectTupleClose(nextScene.atoms[1]!.fractionalPosition, [1, 0.4, -0.8]);
    expectTupleClose(nextScene.atoms[2]!.fractionalPosition, [0.5, 0.7, 0.5]);
    expect(nextScene.atoms[3]).toBe(untouched);
  });

  test("sets one canonical fractional coordinate and keeps periodic image offsets", () => {
    const scene = sceneWithPeriodicImage();

    const nextScene = setAtomSiteFractionalPosition(scene, "Si-1", [1.25, -0.2, 0.5]);

    expectTupleClose(nextScene.atoms[0]!.fractionalPosition, [0.25, 0.8, 0.5]);
    expectTupleClose(nextScene.atoms[1]!.fractionalPosition, [1.25, 0.8, -0.5]);
  });

  test("translates site repeats from the unit-cell representative", () => {
    const scene = sceneWithRepeatedSiteCopies();

    const nextScene = translateAtomSitesFractional(scene, ["Si-1"], [0.1, 0, 0]);

    expectTupleClose(nextScene.atoms[0]!.fractionalPosition, [1.55, 0.2, 0.3]);
    expectTupleClose(nextScene.atoms[1]!.fractionalPosition, [0.55, 0.2, 0.3]);
    expectTupleClose(nextScene.atoms[0]!.position, [1.55, 0.4, 0.9]);
    expectTupleClose(nextScene.atoms[1]!.position, [0.55, 0.4, 0.9]);
  });

  test("rebuilds one-hop bonded images after atoms wrap through a periodic boundary", () => {
    const scene = sceneWithOneHopBondedImageAcrossZBoundary();

    const nextScene = translateAtomSitesFractional(
      scene,
      ["Te-5", "Sb-3"],
      [0, 0, -0.1],
    );

    expectTupleClose(nextScene.atoms[0]!.fractionalPosition, [0.5, 0.5, 0.95]);
    expectTupleClose(nextScene.atoms[1]!.fractionalPosition, [0.5, 0.5, 0.85]);
    expect(nextScene.atoms.map((atom) => atom.id)).toEqual(["Te-5", "Sb-3"]);
    expect(nextScene.bonds).toHaveLength(1);
    expect(bondEndpointIds(nextScene, nextScene.bonds[0]!)).toEqual(["Sb-3", "Te-5"]);
    expect(nextScene.bonds[0]!.visibilityDependencies).toEqual([]);
    expect(nextScene.bonds[0]!.visibilityDependencyGroups).toEqual([]);
  });

  test("generates one-hop bonded images around all periodic directions from current atom positions", () => {
    const scene = sceneWithLocalBondAcrossAllAxesAfterMovingOneAtom();

    const nextScene = setAtomSiteFractionalPosition(scene, "Te-5", [0.95, 0.95, 0.95]);

    const generatedImageOffsets = nextScene.atoms
      .filter((atom) => atom.imageReasons.includes("bonded"))
      .map((atom) => `${atom.siteId}:${atom.imageOffset.join(",")}`)
      .sort();

    expect(generatedImageOffsets).toEqual([
      "Sb-3:1,1,1",
      "Te-5:-1,-1,-1",
    ]);
    expectTupleClose(
      atomById(nextScene, "Sb-3-image-1-1-1").fractionalPosition,
      [1.1, 1.1, 1.1],
    );
    expectTupleClose(
      atomById(nextScene, "Te-5-image--1--1--1").fractionalPosition,
      [-0.05, -0.05, -0.05],
    );
    expect(
      nextScene.bonds.map((bond) => [
        bondEndpointIds(nextScene, bond),
        bond.visibilityDependencyGroups,
      ]),
    ).toEqual([
      [["Sb-3", "Te-5-image--1--1--1"], [["oneHopBondedAtoms"]]],
      [["Sb-3-image-1-1-1", "Te-5"], [["oneHopBondedAtoms"]]],
    ]);
  });

  test("recreates one-hop bonded images from the topology scene even when the current scene lost its bonds", () => {
    const currentScene = {
      ...sceneWithLocalBondAcrossAllAxesAfterMovingOneAtom(),
      bonds: [],
    };
    const topologyScene = sceneWithLocalBondAcrossAllAxesAfterMovingOneAtom();

    const nextScene = translateAtomSitesFractional(
      currentScene,
      ["Te-5"],
      [0.75, 0.75, 0.75],
      topologyScene,
    );

    expect(
      nextScene.atoms
        .filter((atom) => atom.imageReasons.includes("bonded"))
        .map((atom) => atom.id)
        .sort(),
    ).toEqual(["Sb-3-image-1-1-1", "Te-5-image--1--1--1"]);
    expect(nextScene.bonds).toHaveLength(2);
  });

  test("prepares whole-structure translations for backend rebuild without frontend one-hop topology", () => {
    const scene = sceneWithOneHopBondedImageAcrossZBoundary();

    const nextScene = translateAtomSitesFractionalForBackendRebuild(
      scene,
      ["Te-5", "Sb-3"],
      [0, 0, -0.1],
    );

    expectTupleClose(nextScene.atoms[0]!.fractionalPosition, [0.5, 0.5, 0.95]);
    expectTupleClose(nextScene.atoms[1]!.fractionalPosition, [0.5, 0.5, 0.85]);
    expect(nextScene.atoms.map((atom) => atom.id)).toEqual(["Te-5", "Sb-3"]);
    expect(nextScene.bonds).toEqual([]);
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

function sceneWithRepeatedSiteCopies(): SceneSpec {
  return {
    ...sceneWithPeriodicImage(),
    atoms: [
      atom({
        id: "Si-1-supercell-1-0-0",
        siteId: "Si-1",
        element: "Si",
        siteIndex: 0,
        fractionalPosition: [0.95, 0.2, 0.3],
        imageOffset: [1, 0, 0],
      }),
      atom({
        id: "Si-1",
        siteId: "Si-1",
        element: "Si",
        siteIndex: 0,
        fractionalPosition: [0.45, 0.2, 0.3],
        imageOffset: [0, 0, 0],
      }),
    ],
  };
}

function sceneWithOneHopBondedImageAcrossZBoundary(): SceneSpec {
  return {
    ...sceneWithPeriodicImage(),
    atoms: [
      atom({
        id: "Te-5",
        siteId: "Te-5",
        element: "Te",
        siteIndex: 0,
        fractionalPosition: [0.5, 0.5, 0.05],
        imageOffset: [0, 0, 0],
      }),
      atom({
        id: "Sb-3",
        siteId: "Sb-3",
        element: "Sb",
        siteIndex: 1,
        fractionalPosition: [0.5, 0.5, 0.95],
        imageOffset: [0, 0, 0],
      }),
      atom({
        id: "Sb-3-one-hop-0-0--1",
        siteId: "Sb-3",
        element: "Sb",
        siteIndex: 1,
        fractionalPosition: [0.5, 0.5, -0.05],
        imageOffset: [0, 0, -1],
        imageReasons: ["bonded"],
        isPeriodicImage: true,
        visibilityDependencies: ["oneHopBondedAtoms"],
        visibilityDependencyGroups: [["oneHopBondedAtoms"]],
      }),
    ],
    bonds: [
      {
        startAtomIndex: 0,
        endAtomIndex: 2,
        visibilityDependencies: ["oneHopBondedAtoms"],
        visibilityDependencyGroups: [["oneHopBondedAtoms"]],
      },
    ],
  };
}

function sceneWithLocalBondAcrossAllAxesAfterMovingOneAtom(): SceneSpec {
  return {
    ...sceneWithPeriodicImage(),
    atoms: [
      atom({
        id: "Te-5",
        siteId: "Te-5",
        element: "Te",
        siteIndex: 0,
        fractionalPosition: [0.2, 0.2, 0.2],
        imageOffset: [0, 0, 0],
      }),
      atom({
        id: "Sb-3",
        siteId: "Sb-3",
        element: "Sb",
        siteIndex: 1,
        fractionalPosition: [0.1, 0.1, 0.1],
        imageOffset: [0, 0, 0],
      }),
    ],
    bonds: [
      {
        startAtomIndex: 0,
        endAtomIndex: 1,
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
    ],
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

function atomById(scene: SceneSpec, id: string): AtomSpec {
  const atom = scene.atoms.find((candidate) => candidate.id === id);
  expect(atom).toBeDefined();
  return atom!;
}

function bondEndpointIds(scene: SceneSpec, bond: SceneSpec["bonds"][number]): string[] {
  return [
    scene.atoms[bond.startAtomIndex]?.id ?? "",
    scene.atoms[bond.endAtomIndex]?.id ?? "",
  ].sort();
}

function atom({
  element,
  fractionalPosition,
  id,
  imageOffset,
  imageReasons,
  isPeriodicImage = false,
  siteId,
  siteIndex,
  visibilityDependencies,
  visibilityDependencyGroups,
}: {
  element: string;
  fractionalPosition: [number, number, number];
  id: string;
  imageOffset: [number, number, number];
  imageReasons?: AtomSpec["imageReasons"];
  isPeriodicImage?: boolean;
  siteId: string;
  siteIndex: number;
  visibilityDependencies?: AtomSpec["visibilityDependencies"];
  visibilityDependencyGroups?: AtomSpec["visibilityDependencyGroups"];
}): AtomSpec {
  const resolvedVisibilityDependencies =
    visibilityDependencies ?? (isPeriodicImage ? ["boundaryAtoms"] : []);

  return {
    element,
    fractionalPosition,
    id,
    imageOffset,
    imageReasons: imageReasons ?? (isPeriodicImage ? ["boundary"] : []),
    isPeriodicImage,
    position: [
      fractionalPosition[0],
      fractionalPosition[1] * 2,
      fractionalPosition[2] * 3,
    ],
    siteId,
    siteIndex,
    visibilityDependencies: resolvedVisibilityDependencies,
    visibilityDependencyGroups:
      visibilityDependencyGroups ??
      (resolvedVisibilityDependencies.length > 0
        ? [resolvedVisibilityDependencies]
        : []),
  };
}
