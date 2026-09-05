import type { AtomSpec, BondSpec, SceneSpec, VisibilityDependency } from "../api/scene";
import { STRUCTURE_ZERO_TOLERANCE } from "./structurePrecision";

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
  topologyScene: SceneSpec = scene,
): SceneSpec {
  const targetSiteIds = new Set(siteIds);
  if (targetSiteIds.size === 0 || tupleNearZero(delta)) {
    return scene;
  }

  return refreshPeriodicBondedImages(
    updateAtomSitesFractional(scene, targetSiteIds, (atom) =>
      wrapFractionalTuple([
        atom.fractionalPosition[0] - atom.imageOffset[0] + delta[0],
        atom.fractionalPosition[1] - atom.imageOffset[1] + delta[1],
        atom.fractionalPosition[2] - atom.imageOffset[2] + delta[2],
      ]),
    ),
    topologyScene,
  );
}

export function translateAtomSitesFractionalForBackendRebuild(
  scene: SceneSpec,
  siteIds: readonly string[],
  delta: [number, number, number],
): SceneSpec {
  const targetSiteIds = new Set(siteIds);
  if (targetSiteIds.size === 0 || tupleNearZero(delta)) {
    return scene;
  }

  return stripOneHopBondedTopology(
    updateAtomSitesFractional(scene, targetSiteIds, (atom) =>
      wrapFractionalTuple([
        atom.fractionalPosition[0] - atom.imageOffset[0] + delta[0],
        atom.fractionalPosition[1] - atom.imageOffset[1] + delta[1],
        atom.fractionalPosition[2] - atom.imageOffset[2] + delta[2],
      ]),
    ),
  );
}

export function setAtomSiteFractionalPosition(
  scene: SceneSpec,
  siteId: string,
  fractionalPosition: [number, number, number],
  topologyScene: SceneSpec = scene,
): SceneSpec {
  return refreshPeriodicBondedImages(
    updateAtomSitesFractional(scene, new Set([siteId]), () =>
      wrapFractionalTuple(fractionalPosition),
    ),
    topologyScene,
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
  return 1 - wrapped < STRUCTURE_ZERO_TOLERANCE ? 0 : wrapped;
}

function updateAtomSitesFractional(
  scene: SceneSpec,
  targetSiteIds: ReadonlySet<string>,
  nextCanonicalFractional: (atom: AtomSpec) => [number, number, number],
): SceneSpec {
  const canonicalFractionalBySiteId = new Map<string, [number, number, number]>();

  for (const siteId of targetSiteIds) {
    const representativeAtom = representativeAtomForSiteId(scene, siteId);
    if (!representativeAtom) {
      continue;
    }

    canonicalFractionalBySiteId.set(siteId, nextCanonicalFractional(representativeAtom));
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

function stripOneHopBondedTopology(scene: SceneSpec): SceneSpec {
  const atoms: AtomSpec[] = [];
  const oldAtomIndexToNewAtomIndex = new Map<number, number>();

  scene.atoms.forEach((atom, atomIndex) => {
    const nextAtom = baseAtomForPeriodicBondRefresh(atom);
    if (!nextAtom) {
      return;
    }

    oldAtomIndexToNewAtomIndex.set(atomIndex, atoms.length);
    atoms.push(nextAtom);
  });

  const bonds = scene.bonds.flatMap((bond) => {
    if (hasVisibilityDependency(bond, "oneHopBondedAtoms")) {
      return [];
    }

    const startAtomIndex = oldAtomIndexToNewAtomIndex.get(bond.startAtomIndex);
    const endAtomIndex = oldAtomIndexToNewAtomIndex.get(bond.endAtomIndex);
    if (startAtomIndex === undefined || endAtomIndex === undefined) {
      return [];
    }

    return [{ ...bond, startAtomIndex, endAtomIndex }];
  });

  const polyhedra = scene.polyhedra.flatMap((polyhedron) => {
    if (hasVisibilityDependency(polyhedron, "oneHopBondedAtoms")) {
      return [];
    }

    const centerAtomIndex = oldAtomIndexToNewAtomIndex.get(polyhedron.centerAtomIndex);
    if (centerAtomIndex === undefined) {
      return [];
    }

    const hullAtomIndices: number[] = [];
    for (const atomIndex of polyhedron.hullAtomIndices) {
      const remappedAtomIndex = oldAtomIndexToNewAtomIndex.get(atomIndex);
      if (remappedAtomIndex === undefined) {
        return [];
      }
      hullAtomIndices.push(remappedAtomIndex);
    }

    return [{ ...polyhedron, centerAtomIndex, hullAtomIndices }];
  });

  return {
    ...scene,
    atoms,
    bonds,
    polyhedra,
  };
}

function hasVisibilityDependency(
  item: {
    visibilityDependencies: readonly VisibilityDependency[];
    visibilityDependencyGroups: readonly VisibilityDependency[][];
  },
  dependency: VisibilityDependency,
): boolean {
  return (
    item.visibilityDependencies.includes(dependency) ||
    item.visibilityDependencyGroups.some((group) => group.includes(dependency))
  );
}

const PERIODIC_BOND_IMAGE_SEARCH_RADIUS = 3;

interface BondTemplate {
  firstSiteId: string;
  secondSiteId: string;
}

interface BondDraft {
  startAtomIndex: number;
  endAtomIndex: number;
  visibilityDependencyGroups: VisibilityDependency[][];
}

function refreshPeriodicBondedImages(
  scene: SceneSpec,
  topologyScene: SceneSpec,
): SceneSpec {
  if (topologyScene.bonds.length === 0) {
    return scene;
  }

  const bondTemplates = bondTemplatesForScene(topologyScene);
  if (bondTemplates.length === 0) {
    return scene;
  }

  const atoms: AtomSpec[] = [];
  const atomIndexByKey = new Map<string, number>();
  const oldAtomIndexToNewAtomIndex = new Map<number, number>();
  const canonicalAtomBySiteId = new Map<string, AtomSpec>();
  const sourceAtomIndicesBySiteId = new Map<string, number[]>();

  scene.atoms.forEach((atom, atomIndex) => {
    const baseAtom = baseAtomForPeriodicBondRefresh(atom);
    if (!baseAtom) {
      return;
    }

    const nextIndex = atoms.length;
    atoms.push(baseAtom);
    oldAtomIndexToNewAtomIndex.set(atomIndex, nextIndex);
    atomIndexByKey.set(atomKey(baseAtom.siteId, baseAtom.imageOffset), nextIndex);
    appendConnectedAtomIndex(sourceAtomIndicesBySiteId, baseAtom.siteId, nextIndex);
    if (!baseAtom.isPeriodicImage) {
      canonicalAtomBySiteId.set(baseAtom.siteId, baseAtom);
    }
  });

  const bondDrafts = new Map<string, BondDraft>();

  for (const template of bondTemplates) {
    generatePeriodicBondDrafts({
      atomIndexByKey,
      atoms,
      bondDrafts,
      canonicalAtomBySiteId,
      cellVectors: scene.cell.vectors,
      firstSiteId: template.firstSiteId,
      secondSiteId: template.secondSiteId,
      sourceAtomIndicesBySiteId,
    });
  }

  return {
    ...scene,
    atoms,
    bonds: bondSpecsFromDrafts(bondDrafts),
    polyhedra: remapPolyhedra(scene, oldAtomIndexToNewAtomIndex),
  };
}

function bondTemplatesForScene(scene: SceneSpec): BondTemplate[] {
  const templates = new Map<string, BondTemplate>();

  for (const bond of scene.bonds) {
    const startAtom = scene.atoms[bond.startAtomIndex];
    const endAtom = scene.atoms[bond.endAtomIndex];
    if (!startAtom || !endAtom) {
      continue;
    }

    const [firstSiteId, secondSiteId] =
      startAtom.siteId <= endAtom.siteId
        ? [startAtom.siteId, endAtom.siteId]
        : [endAtom.siteId, startAtom.siteId];
    const key = `${firstSiteId}\u0000${secondSiteId}`;
    if (!templates.has(key)) {
      templates.set(key, { firstSiteId, secondSiteId });
    }
  }

  return Array.from(templates.values());
}

function baseAtomForPeriodicBondRefresh(atom: AtomSpec): AtomSpec | null {
  if (!atom.isPeriodicImage) {
    return atom;
  }

  if (!atom.imageReasons.includes("boundary")) {
    return null;
  }

  const visibilityDependencyGroups = minimalDependencyGroups(
    atom.visibilityDependencyGroups
      .map((group) => group.filter((dependency) => dependency !== "oneHopBondedAtoms"))
      .filter((group) => group.length > 0),
  );

  return {
    ...atom,
    imageReasons: ["boundary"],
    visibilityDependencies: visibilityDependenciesFromGroups(visibilityDependencyGroups),
    visibilityDependencyGroups,
  };
}

function generatePeriodicBondDrafts({
  atomIndexByKey,
  atoms,
  bondDrafts,
  canonicalAtomBySiteId,
  cellVectors,
  firstSiteId,
  secondSiteId,
  sourceAtomIndicesBySiteId,
}: {
  atomIndexByKey: Map<string, number>;
  atoms: AtomSpec[];
  bondDrafts: Map<string, BondDraft>;
  canonicalAtomBySiteId: Map<string, AtomSpec>;
  cellVectors: [number, number, number][],
  firstSiteId: string;
  secondSiteId: string;
  sourceAtomIndicesBySiteId: Map<string, number[]>;
}): void {
  generatePeriodicBondDraftsForDirection({
    atomIndexByKey,
    atoms,
    bondDrafts,
    canonicalAtomBySiteId,
    cellVectors,
    sourceAtomIndices: sourceAtomIndicesBySiteId.get(firstSiteId) ?? [],
    targetSiteId: secondSiteId,
  });

  if (firstSiteId === secondSiteId) {
    return;
  }

  generatePeriodicBondDraftsForDirection({
    atomIndexByKey,
    atoms,
    bondDrafts,
    canonicalAtomBySiteId,
    cellVectors,
    sourceAtomIndices: sourceAtomIndicesBySiteId.get(secondSiteId) ?? [],
    targetSiteId: firstSiteId,
  });
}

function generatePeriodicBondDraftsForDirection({
  atomIndexByKey,
  atoms,
  bondDrafts,
  canonicalAtomBySiteId,
  cellVectors,
  sourceAtomIndices,
  targetSiteId,
}: {
  atomIndexByKey: Map<string, number>;
  atoms: AtomSpec[];
  bondDrafts: Map<string, BondDraft>;
  canonicalAtomBySiteId: Map<string, AtomSpec>;
  cellVectors: [number, number, number][];
  sourceAtomIndices: readonly number[];
  targetSiteId: string;
}): void {
  const targetCanonicalAtom = canonicalAtomBySiteId.get(targetSiteId);
  if (!targetCanonicalAtom) {
    return;
  }

  for (const sourceAtomIndex of sourceAtomIndices) {
    const sourceAtom = atoms[sourceAtomIndex];
    if (!sourceAtom) {
      continue;
    }

    const targetOffset = bestPeriodicImageOffsetForSource(
      sourceAtom,
      targetCanonicalAtom,
      cellVectors,
    );
    if (
      sourceAtom.siteId === targetCanonicalAtom.siteId &&
      offsetsEqual(sourceAtom.imageOffset, targetOffset)
    ) {
      continue;
    }

    const targetAtomIndex = ensurePeriodicBondTargetAtom({
      atomIndexByKey,
      atoms,
      cellVectors,
      sourceAtom,
      targetCanonicalAtom,
      targetOffset,
    });
    if (targetAtomIndex === sourceAtomIndex) {
      continue;
    }

    mergeBondDraft(bondDrafts, {
      startAtomIndex: sourceAtomIndex,
      endAtomIndex: targetAtomIndex,
      visibilityDependencyGroups: combinedDependencyGroups(
        sourceAtom.visibilityDependencyGroups,
        atoms[targetAtomIndex]?.visibilityDependencyGroups ?? [],
      ),
    });
  }
}

function bestPeriodicImageOffsetForSource(
  sourceAtom: AtomSpec,
  targetCanonicalAtom: AtomSpec,
  cellVectors: [number, number, number][],
): [number, number, number] {
  const targetBaseFractional = canonicalFractionalPosition(targetCanonicalAtom);
  const sourceOffset = sourceAtom.imageOffset;
  let bestOffset: [number, number, number] = sourceOffset;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestOffsetDistance = Number.POSITIVE_INFINITY;

  for (
    let x = sourceOffset[0] - PERIODIC_BOND_IMAGE_SEARCH_RADIUS;
    x <= sourceOffset[0] + PERIODIC_BOND_IMAGE_SEARCH_RADIUS;
    x += 1
  ) {
    for (
      let y = sourceOffset[1] - PERIODIC_BOND_IMAGE_SEARCH_RADIUS;
      y <= sourceOffset[1] + PERIODIC_BOND_IMAGE_SEARCH_RADIUS;
      y += 1
    ) {
      for (
        let z = sourceOffset[2] - PERIODIC_BOND_IMAGE_SEARCH_RADIUS;
        z <= sourceOffset[2] + PERIODIC_BOND_IMAGE_SEARCH_RADIUS;
        z += 1
      ) {
        const candidateOffset: [number, number, number] = [x, y, z];
        const candidatePosition = fractionalToCartesian(
          [
            targetBaseFractional[0] + x,
            targetBaseFractional[1] + y,
            targetBaseFractional[2] + z,
          ],
          cellVectors,
        );
        const score = squaredDistance(candidatePosition, sourceAtom.position);

        const offsetDistance =
          Math.abs(x - sourceOffset[0]) +
          Math.abs(y - sourceOffset[1]) +
          Math.abs(z - sourceOffset[2]);

        if (
          score < bestScore - 1e-12 ||
          (Math.abs(score - bestScore) <= 1e-12 && offsetDistance < bestOffsetDistance) ||
          (
            Math.abs(score - bestScore) <= 1e-12 &&
            offsetDistance === bestOffsetDistance &&
            compareOffsets(candidateOffset, bestOffset) < 0
          )
        ) {
          bestScore = score;
          bestOffsetDistance = offsetDistance;
          bestOffset = candidateOffset;
        }
      }
    }
  }

  return bestOffset;
}

function ensurePeriodicBondTargetAtom({
  atomIndexByKey,
  atoms,
  cellVectors,
  sourceAtom,
  targetCanonicalAtom,
  targetOffset,
}: {
  atomIndexByKey: Map<string, number>;
  atoms: AtomSpec[];
  cellVectors: [number, number, number][];
  sourceAtom: AtomSpec;
  targetCanonicalAtom: AtomSpec;
  targetOffset: [number, number, number];
}): number {
  const key = atomKey(targetCanonicalAtom.siteId, targetOffset);
  const existingAtomIndex = atomIndexByKey.get(key);
  if (existingAtomIndex !== undefined) {
    mergeBondTargetAtomVisibility(atoms, existingAtomIndex, sourceAtom);
    return existingAtomIndex;
  }

  const baseFractional = canonicalFractionalPosition(targetCanonicalAtom);
  const fractionalPosition: [number, number, number] = [
    baseFractional[0] + targetOffset[0],
    baseFractional[1] + targetOffset[1],
    baseFractional[2] + targetOffset[2],
  ];
  const visibilityDependencyGroups = [
    bondTargetVisibilityDependencyGroup(sourceAtom),
  ];
  const atom: AtomSpec = {
    ...targetCanonicalAtom,
    id: atomInstanceId(targetCanonicalAtom.siteId, targetOffset),
    fractionalPosition,
    imageOffset: targetOffset,
    imageReasons: ["bonded"],
    isPeriodicImage: true,
    position: fractionalToCartesian(fractionalPosition, cellVectors),
    visibilityDependencies: visibilityDependenciesFromGroups(visibilityDependencyGroups),
    visibilityDependencyGroups,
  };

  const atomIndex = atoms.length;
  atoms.push(atom);
  atomIndexByKey.set(key, atomIndex);
  return atomIndex;
}

function mergeBondTargetAtomVisibility(
  atoms: AtomSpec[],
  atomIndex: number,
  sourceAtom: AtomSpec,
): void {
  const atom = atoms[atomIndex];
  if (!atom || !atom.isPeriodicImage) {
    return;
  }

  const imageReasons = orderedImageReasons([...atom.imageReasons, "bonded"]);
  const visibilityDependencyGroups = minimalDependencyGroups([
    ...atom.visibilityDependencyGroups,
    bondTargetVisibilityDependencyGroup(sourceAtom),
  ]);
  atoms[atomIndex] = {
    ...atom,
    imageReasons,
    visibilityDependencies: visibilityDependenciesFromGroups(visibilityDependencyGroups),
    visibilityDependencyGroups,
  };
}

function bondTargetVisibilityDependencyGroup(
  sourceAtom: AtomSpec,
): VisibilityDependency[] {
  return sourceAtom.isPeriodicImage
    ? ["boundaryAtoms", "oneHopBondedAtoms"]
    : ["oneHopBondedAtoms"];
}

function mergeBondDraft(
  bondDrafts: Map<string, BondDraft>,
  bondDraft: BondDraft,
): void {
  const key = bondDraftKey(bondDraft.startAtomIndex, bondDraft.endAtomIndex);
  const existingDraft = bondDrafts.get(key);
  if (!existingDraft) {
    bondDrafts.set(key, {
      ...bondDraft,
      visibilityDependencyGroups: minimalDependencyGroups(
        bondDraft.visibilityDependencyGroups,
      ),
    });
    return;
  }

  existingDraft.visibilityDependencyGroups = minimalDependencyGroups([
    ...existingDraft.visibilityDependencyGroups,
    ...bondDraft.visibilityDependencyGroups,
  ]);
}

function bondSpecsFromDrafts(bondDrafts: Map<string, BondDraft>): BondSpec[] {
  return Array.from(bondDrafts.values()).map((bondDraft) => ({
    startAtomIndex: bondDraft.startAtomIndex,
    endAtomIndex: bondDraft.endAtomIndex,
    visibilityDependencies: visibilityDependenciesFromGroups(
      bondDraft.visibilityDependencyGroups,
    ),
    visibilityDependencyGroups: bondDraft.visibilityDependencyGroups,
  }));
}

function remapPolyhedra(
  scene: SceneSpec,
  oldAtomIndexToNewAtomIndex: Map<number, number>,
): SceneSpec["polyhedra"] {
  return scene.polyhedra.flatMap((polyhedron) => {
    const centerAtomIndex = oldAtomIndexToNewAtomIndex.get(polyhedron.centerAtomIndex);
    if (centerAtomIndex === undefined) {
      return [];
    }

    const hullAtomIndices: number[] = [];
    for (const atomIndex of polyhedron.hullAtomIndices) {
      const remappedAtomIndex = oldAtomIndexToNewAtomIndex.get(atomIndex);
      if (remappedAtomIndex === undefined) {
        return [];
      }
      hullAtomIndices.push(remappedAtomIndex);
    }

    return [{ ...polyhedron, centerAtomIndex, hullAtomIndices }];
  });
}

function canonicalFractionalPosition(atom: AtomSpec): [number, number, number] {
  return [
    atom.fractionalPosition[0] - atom.imageOffset[0],
    atom.fractionalPosition[1] - atom.imageOffset[1],
    atom.fractionalPosition[2] - atom.imageOffset[2],
  ];
}

function squaredDistance(
  first: [number, number, number],
  second: [number, number, number],
): number {
  const dx = first[0] - second[0];
  const dy = first[1] - second[1];
  const dz = first[2] - second[2];
  return dx * dx + dy * dy + dz * dz;
}

function combinedDependencyGroups(
  leftGroups: VisibilityDependency[][],
  rightGroups: VisibilityDependency[][],
): VisibilityDependency[][] {
  const normalizedLeftGroups = leftGroups.length > 0 ? leftGroups : [[]];
  const normalizedRightGroups = rightGroups.length > 0 ? rightGroups : [[]];
  const dependencyGroups: VisibilityDependency[][] = [];

  for (const leftGroup of normalizedLeftGroups) {
    for (const rightGroup of normalizedRightGroups) {
      dependencyGroups.push([...new Set([...leftGroup, ...rightGroup])]);
    }
  }

  return minimalDependencyGroups(dependencyGroups);
}

function minimalDependencyGroups(
  dependencyGroups: readonly VisibilityDependency[][],
): VisibilityDependency[][] {
  const minimalGroups: VisibilityDependency[][] = [];

  for (const dependencyGroup of dependencyGroups) {
    const orderedGroup = orderedVisibilityDependencies(dependencyGroup);
    if (orderedGroup.length === 0) {
      return [];
    }

    if (minimalGroups.some((group) => groupIsSubset(group, orderedGroup))) {
      continue;
    }

    for (let index = minimalGroups.length - 1; index >= 0; index -= 1) {
      if (groupIsSubset(orderedGroup, minimalGroups[index] ?? [])) {
        minimalGroups.splice(index, 1);
      }
    }
    minimalGroups.push(orderedGroup);
  }

  return minimalGroups;
}

function visibilityDependenciesFromGroups(
  dependencyGroups: readonly VisibilityDependency[][],
): VisibilityDependency[] {
  return orderedVisibilityDependencies(dependencyGroups.flat());
}

function orderedVisibilityDependencies(
  dependencies: readonly VisibilityDependency[],
): VisibilityDependency[] {
  const dependencySet = new Set(dependencies);
  return (["boundaryAtoms", "oneHopBondedAtoms"] as const).filter((dependency) =>
    dependencySet.has(dependency),
  );
}

function orderedImageReasons(
  imageReasons: readonly AtomSpec["imageReasons"][number][],
): AtomSpec["imageReasons"] {
  const imageReasonSet = new Set(imageReasons);
  return (["boundary", "bonded"] as const).filter((reason) =>
    imageReasonSet.has(reason),
  );
}

function groupIsSubset(
  first: readonly VisibilityDependency[],
  second: readonly VisibilityDependency[],
): boolean {
  return first.every((dependency) => second.includes(dependency));
}

function atomKey(siteId: string, imageOffset: [number, number, number]): string {
  return `${siteId}\u0000${imageOffset.join(",")}`;
}

function atomInstanceId(
  siteId: string,
  imageOffset: [number, number, number],
): string {
  return offsetsEqual(imageOffset, [0, 0, 0])
    ? siteId
    : `${siteId}-image-${imageOffset[0]}-${imageOffset[1]}-${imageOffset[2]}`;
}

function bondDraftKey(startAtomIndex: number, endAtomIndex: number): string {
  return startAtomIndex < endAtomIndex
    ? `${startAtomIndex}:${endAtomIndex}`
    : `${endAtomIndex}:${startAtomIndex}`;
}

function appendConnectedAtomIndex(
  connectedAtomIndicesByAtomIndex: Map<string, number[]>,
  sourceSiteId: string,
  connectedAtomIndex: number,
): void {
  const connectedAtomIndices = connectedAtomIndicesByAtomIndex.get(sourceSiteId);
  if (connectedAtomIndices) {
    connectedAtomIndices.push(connectedAtomIndex);
    return;
  }

  connectedAtomIndicesByAtomIndex.set(sourceSiteId, [connectedAtomIndex]);
}

function offsetsEqual(
  first: [number, number, number],
  second: [number, number, number],
): boolean {
  return first[0] === second[0] && first[1] === second[1] && first[2] === second[2];
}

function compareOffsets(
  first: [number, number, number],
  second: [number, number, number],
): number {
  return (
    first[0] - second[0] ||
    first[1] - second[1] ||
    first[2] - second[2]
  );
}

function representativeAtomForSiteId(
  scene: SceneSpec,
  siteId: string,
): AtomSpec | null {
  return (
    scene.atoms.find(
      (atom) => atom.siteId === siteId && tupleNearZero(atom.imageOffset),
    ) ??
    scene.atoms.find((atom) => atom.siteId === siteId && !atom.isPeriodicImage) ??
    scene.atoms.find((atom) => atom.siteId === siteId) ??
    null
  );
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
  return tuple.every((value) => Math.abs(value) < STRUCTURE_ZERO_TOLERANCE);
}
