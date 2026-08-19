import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import { AtomDistanceCard } from "../src/app/AtomDistanceCard";
import { AtomInspectorCard } from "../src/app/AtomInspectorCard";
import {
  atomMeasurementCopyText,
  atomMeasurementInfoForIds,
  atomInspectorCopyText,
  inspectedAtomInfoForId,
} from "../src/app/atomInspector";
import { createDefaultStyle } from "../src/model";

beforeEach(() => {
  void navigator.clipboard?.writeText("");
});

describe("AtomInspectorCard", () => {
  test("copies all selected atom text information from the top-right button", async () => {
    const user = userEvent.setup();
    const scene = sceneWithImageAtom();
    const info = inspectedAtomInfoForId(scene, "Al-1-image-1-0--1");
    if (!info) {
      throw new Error("Expected inspected atom info.");
    }

    render(
      <AtomInspectorCard
        atomVectors={null}
        colorScheme={createDefaultStyle().colorScheme}
        info={info}
        isInspectorOpen={false}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy all atom info" }));

    await waitFor(async () => {
      await expect(navigator.clipboard.readText()).resolves.toBe(atomInspectorCopyText(info));
    });
    expect(screen.getByRole("status").textContent).toBe("Copied");
  });

  test("copies all selected atom measurement text information from the top-right button", async () => {
    const user = userEvent.setup();
    const scene = sceneWithMeasurementAtoms();
    const info = atomMeasurementInfoForIds(scene, ["Al-1", "Al-2"]);
    if (!info) {
      throw new Error("Expected atom measurement info.");
    }

    render(
      <AtomDistanceCard
        atomVectors={null}
        info={info}
        isInspectorOpen={false}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy all atom measurement info" }));

    await waitFor(async () => {
      await expect(navigator.clipboard.readText()).resolves.toBe(atomMeasurementCopyText(info));
    });
    expect(screen.getByRole("status").textContent).toBe("Copied");
  });
});

function sceneWithImageAtom(): SceneSpec {
  return {
    atoms: [
      atom("Al-1", "Al", 1, [1.2, 2.3, 1.939946], [0.25, 0.5, 0.1479044], [0, 0, 0]),
      atom(
        "Al-1-image-1-0--1",
        "Al",
        1,
        [2.2, 2.3, 0.939946],
        [1.25, 0.5, -0.8520956],
        [1, 0, -1],
      ),
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
        a: "1.00",
        alpha: "90.00",
        b: "1.00",
        beta: "90.00",
        c: "1.00",
        gamma: "90.00",
      },
      formula: "Al",
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

function sceneWithMeasurementAtoms(): SceneSpec {
  return {
    ...sceneWithImageAtom(),
    atoms: [
      atom("Al-1", "Al", 1, [1, 2, 3], [0.1, 0.2, 0.3], [0, 0, 0]),
      atom("Al-2", "Al", 2, [4, 2, 3], [0.4, 0.2, 0.3], [0, 0, 0]),
    ],
    summary: {
      ...sceneWithImageAtom().summary,
      atomCount: 2,
    },
  };
}

function atom(
  id: string,
  element: string,
  siteIndex: number,
  position: [number, number, number],
  fractionalPosition: [number, number, number],
  imageOffset: [number, number, number],
): AtomSpec {
  const isPeriodicImage = imageOffset.some((value) => value !== 0);
  return {
    element,
    fractionalPosition,
    id,
    imageOffset,
    imageReasons: isPeriodicImage ? ["boundary"] : [],
    isPeriodicImage,
    position,
    siteId: `${element}-${siteIndex}`,
    siteIndex,
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}
