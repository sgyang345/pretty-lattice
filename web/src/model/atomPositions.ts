import type { AtomSpec, SceneSpec } from "../api/scene";

export type FractionalAxis = 0 | 1 | 2;

export function canonicalAtomsForFractionalCoordinates(
  atoms: readonly AtomSpec[],
): AtomSpec[] {
  return atoms.filter((atom) => !atom.isPeriodicImage);
}

export function translateAtomSitesFractional(
  scene: SceneSpec,
  siteIds: readonly string[],
  delta: [number, number, number],
): SceneSpec {
  const targetSiteIds = new Set(siteIds);
  if (targetSiteIds.size === 0 || tupleNearZero(delta)) {
    return scene;
  }

  return updateAtomSitesFractional(scene, targetSiteIds, (atom) =>
    wrapFractionalTuple([
      atom.fractionalPosition[0] - atom.imageOffset[0] + delta[0],
      atom.fractionalPosition[1] - atom.imageOffset[1] + delta[1],
      atom.fractionalPosition[2] - atom.imageOffset[2] + delta[2],
    ]),
  );
}

export function setAtomSiteFractionalPosition(
  scene: SceneSpec,
  siteId: string,
  fractionalPosition: [number, number, number],
): SceneSpec {
  return updateAtomSitesFractional(scene, new Set([siteId]), () =>
    wrapFractionalTuple(fractionalPosition),
  );
}

export function restoreAtomPositionsFromScene(
  scene: SceneSpec,
  baselineScene: SceneSpec | null,
): SceneSpec {
  if (!baselineScene) {
    return scene;
  }

  return baselineScene;
}

export function allCanonicalAtomSiteIds(atoms: readonly AtomSpec[]): string[] {
  return canonicalAtomsForFractionalCoordinates(atoms).map((atom) => atom.siteId);
}

export function wrapFractionalCoordinate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const wrapped = value - Math.floor(value);
  return wrapped >= 1 - 1e-10 ? 0 : wrapped;
}

function updateAtomSitesFractional(
  scene: SceneSpec,
  targetSiteIds: ReadonlySet<string>,
  nextCanonicalFractional: (atom: AtomSpec) => [number, number, number],
): SceneSpec {
  const canonicalFractionalBySiteId = new Map<string, [number, number, number]>();

  for (const atom of scene.atoms) {
    if (!targetSiteIds.has(atom.siteId) || canonicalFractionalBySiteId.has(atom.siteId)) {
      continue;
    }

    canonicalFractionalBySiteId.set(atom.siteId, nextCanonicalFractional(atom));
  }

  if (canonicalFractionalBySiteId.size === 0) {
    return scene;
  }

  return {
    ...scene,
    atoms: scene.atoms.map((atom) => {
      const canonicalFractional = canonicalFractionalBySiteId.get(atom.siteId);
      if (!canonicalFractional) {
        return atom;
      }

      const fractionalPosition: [number, number, number] = [
        canonicalFractional[0] + atom.imageOffset[0],
        canonicalFractional[1] + atom.imageOffset[1],
        canonicalFractional[2] + atom.imageOffset[2],
      ];

      return {
        ...atom,
        fractionalPosition,
        position: fractionalToCartesian(fractionalPosition, scene.cell.vectors),
      };
    }),
  };
}

function fractionalToCartesian(
  fractional: [number, number, number],
  vectors: [number, number, number][],
): [number, number, number] {
  const [a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0]] = vectors;

  return [
    fractional[0] * a[0] + fractional[1] * b[0] + fractional[2] * c[0],
    fractional[0] * a[1] + fractional[1] * b[1] + fractional[2] * c[1],
    fractional[0] * a[2] + fractional[1] * b[2] + fractional[2] * c[2],
  ];
}

function wrapFractionalTuple(
  fractional: [number, number, number],
): [number, number, number] {
  return [
    wrapFractionalCoordinate(fractional[0]),
    wrapFractionalCoordinate(fractional[1]),
    wrapFractionalCoordinate(fractional[2]),
  ];
}

function tupleNearZero(tuple: [number, number, number]): boolean {
  return tuple.every((value) => Math.abs(value) < 1e-12);
}
