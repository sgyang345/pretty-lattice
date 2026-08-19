import type {
  AtomSpec,
  BondSpec,
  PolyhedronSpec,
  SceneSpec,
  VisibilityDependency,
} from "../api/scene";
import {
  createDefaultAtomLabelSettings,
  type AtomLabelSettings,
} from "./atomLabels";

export interface ComponentVisibilityState {
  atoms: boolean;
  atomLabels: AtomLabelSettings;
  unitCell: boolean;
  bonds: boolean;
  polyhedra: boolean;
  chargeDensity: boolean;
  brillouinZone: boolean;
  boundaryAtoms: boolean;
  oneHopBondedAtoms: boolean;
  supercell: SupercellSettings;
}

export interface SupercellSettings {
  a: number;
  b: number;
  c: number;
  matrix: SupercellMatrix;
  mode: SupercellMode;
}

export type SupercellMode = "repeat" | "matrix";
export type SupercellMatrix = [
  [number, number, number],
  [number, number, number],
  [number, number, number],
];

export const SUPERCELL_MIN = 1;
export const SUPERCELL_MAX = 50;
export const SUPERCELL_MATRIX_MIN = -50;
export const SUPERCELL_MATRIX_MAX = 50;
export const DEFAULT_SUPERCELL_MATRIX: SupercellMatrix = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
export const DEFAULT_SUPERCELL_SETTINGS: SupercellSettings = {
  a: 1,
  b: 1,
  c: 1,
  matrix: DEFAULT_SUPERCELL_MATRIX,
  mode: "repeat",
};

export const DEFAULT_COMPONENT_VISIBILITY: ComponentVisibilityState = {
  atoms: true,
  atomLabels: createDefaultAtomLabelSettings(),
  unitCell: true,
  bonds: true,
  polyhedra: false,
  chargeDensity: true,
  brillouinZone: false,
  boundaryAtoms: true,
  oneHopBondedAtoms: true,
  supercell: DEFAULT_SUPERCELL_SETTINGS,
};

export interface ComponentOpacityState {
  atoms: number;
  unitCell: number;
  bonds: number;
  polyhedra: number;
  chargeDensity: number;
}

export interface ChargeDensityDisplayState {
  boundaryColor: string;
  boundaryFillOpacity: number;
  fractionalOffset: [number, number, number];
  interpolationFactor: number;
  isoValue: number;
  negativeColor: string;
  positiveColor: string;
  sectionAxis: ChargeDensitySectionAxis;
  sectionEnabled: boolean;
  sectionOpacity: number;
  sectionPosition: number;
  surfaceMode: ChargeDensitySurfaceMode;
}

export type ChargeDensitySectionAxis = "a" | "b" | "c";
export type ChargeDensitySurfaceMode = "both" | "positive" | "negative";

export const DEFAULT_COMPONENT_OPACITY: ComponentOpacityState = {
  atoms: 100,
  unitCell: 100,
  bonds: 100,
  polyhedra: 50,
  chargeDensity: 70,
};

export const COMPONENT_OPACITY_MAX: ComponentOpacityState = {
  atoms: 100,
  unitCell: 100,
  bonds: 100,
  polyhedra: 100,
  chargeDensity: 100,
};
export const DEFAULT_CHARGE_DENSITY_POSITIVE_COLOR = "#ff5f66";
export const DEFAULT_CHARGE_DENSITY_NEGATIVE_COLOR = "#6673ff";
export const DEFAULT_CHARGE_DENSITY_BOUNDARY_COLOR = "#6f737a";
export const CHARGE_DENSITY_BOHR_RADIUS_ANGSTROM = 0.529177210903;
export const CHARGE_DENSITY_ANGSTROM3_PER_BOHR3 =
  CHARGE_DENSITY_BOHR_RADIUS_ANGSTROM ** 3;
export const CHARGE_DENSITY_INTERPOLATION_FACTORS = [1, 1.5, 2] as const;
export type ChargeDensityInterpolationFactor =
  (typeof CHARGE_DENSITY_INTERPOLATION_FACTORS)[number];
export const CHARGE_DENSITY_SECTION_POSITION_MIN = 0;
export const CHARGE_DENSITY_SECTION_POSITION_MAX = 100;
export const CHARGE_DENSITY_SECTION_OPACITY_MIN = 0;
export const CHARGE_DENSITY_SECTION_OPACITY_MAX = 100;
export const DEFAULT_CHARGE_DENSITY_SECTION_OPACITY = 28;
export const CHARGE_DENSITY_BOUNDARY_FILL_OPACITY_MIN = 0;
export const CHARGE_DENSITY_BOUNDARY_FILL_OPACITY_MAX = 100;
export const DEFAULT_CHARGE_DENSITY_BOUNDARY_FILL_OPACITY = 0;

export function createDefaultComponentVisibility(
  _scene: SceneSpec | null = null,
): ComponentVisibilityState {
  return {
    ...DEFAULT_COMPONENT_VISIBILITY,
    atomLabels: createDefaultAtomLabelSettings(),
    supercell: createDefaultSupercellSettings(),
  };
}

function createDefaultSupercellSettings(): SupercellSettings {
  return {
    ...DEFAULT_SUPERCELL_SETTINGS,
    matrix: cloneSupercellMatrix(DEFAULT_SUPERCELL_MATRIX),
  };
}

export function normalizeComponentVisibilityState(
  visibility: Partial<ComponentVisibilityState> | null | undefined,
): ComponentVisibilityState {
  return {
    ...createDefaultComponentVisibility(),
    ...visibility,
    atomLabels: visibility?.atomLabels ?? createDefaultAtomLabelSettings(),
    supercell: normalizeSupercellSettings(visibility?.supercell),
  };
}

export function normalizeSupercellSettings(
  value: Partial<SupercellSettings> | null | undefined,
): SupercellSettings {
  return {
    a: normalizeSupercellValue(value?.a),
    b: normalizeSupercellValue(value?.b),
    c: normalizeSupercellValue(value?.c),
    matrix: normalizeSupercellMatrix(value?.matrix),
    mode: value?.mode === "matrix" ? "matrix" : "repeat",
  };
}

export function normalizeSupercellValue(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return SUPERCELL_MIN;
  }

  return Math.min(SUPERCELL_MAX, Math.max(SUPERCELL_MIN, Math.round(numericValue)));
}

export function normalizeSupercellMatrix(value: unknown): SupercellMatrix {
  if (!Array.isArray(value)) {
    return cloneSupercellMatrix(DEFAULT_SUPERCELL_MATRIX);
  }

  return [0, 1, 2].map((rowIndex) =>
    [0, 1, 2].map((columnIndex) =>
      normalizeSupercellMatrixValue(value[rowIndex]?.[columnIndex]),
    ) as [number, number, number],
  ) as SupercellMatrix;
}

export function normalizeSupercellMatrixValue(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(
    SUPERCELL_MATRIX_MAX,
    Math.max(SUPERCELL_MATRIX_MIN, Math.round(numericValue)),
  );
}

export function createDefaultComponentOpacity(): ComponentOpacityState {
  return { ...DEFAULT_COMPONENT_OPACITY };
}

export function createDefaultChargeDensityDisplayState(
  scene: SceneSpec | null = null,
): ChargeDensityDisplayState {
  return {
    boundaryColor: DEFAULT_CHARGE_DENSITY_BOUNDARY_COLOR,
    boundaryFillOpacity: DEFAULT_CHARGE_DENSITY_BOUNDARY_FILL_OPACITY,
    fractionalOffset: [0, 0, 0],
    interpolationFactor: 1,
    isoValue: defaultChargeDensityIsoValue(scene),
    negativeColor: DEFAULT_CHARGE_DENSITY_NEGATIVE_COLOR,
    positiveColor: DEFAULT_CHARGE_DENSITY_POSITIVE_COLOR,
    sectionAxis: "c",
    sectionEnabled: false,
    sectionOpacity: DEFAULT_CHARGE_DENSITY_SECTION_OPACITY,
    sectionPosition: 50,
    surfaceMode: "both",
  };
}

export function normalizeChargeDensityDisplayState(
  settings: Partial<ChargeDensityDisplayState> | null | undefined,
  scene: SceneSpec | null = null,
): ChargeDensityDisplayState {
  const legacyIsoLevel = (settings as { isoLevel?: unknown } | null | undefined)?.isoLevel;
  const isoValue =
    settings?.isoValue ??
    (legacyIsoLevel === undefined
      ? undefined
      : chargeDensityIsoValueFromLevel(legacyIsoLevel, scene));
  return {
    ...createDefaultChargeDensityDisplayState(scene),
    boundaryColor: normalizeChargeDensityColor(
      settings?.boundaryColor,
      DEFAULT_CHARGE_DENSITY_BOUNDARY_COLOR,
    ),
    boundaryFillOpacity: normalizeChargeDensityBoundaryFillOpacity(
      settings?.boundaryFillOpacity,
    ),
    fractionalOffset: normalizeChargeDensityFractionalOffset(
      settings?.fractionalOffset,
    ),
    interpolationFactor: normalizeChargeDensityInterpolationFactor(
      settings?.interpolationFactor,
    ),
    isoValue: normalizeChargeDensityIsoValue(isoValue, scene),
    negativeColor: normalizeChargeDensityColor(
      settings?.negativeColor,
      DEFAULT_CHARGE_DENSITY_NEGATIVE_COLOR,
    ),
    positiveColor: normalizeChargeDensityColor(
      settings?.positiveColor,
      DEFAULT_CHARGE_DENSITY_POSITIVE_COLOR,
    ),
    sectionAxis: normalizeChargeDensitySectionAxis(settings?.sectionAxis),
    sectionEnabled: settings?.sectionEnabled === true,
    sectionOpacity: normalizeChargeDensitySectionOpacity(settings?.sectionOpacity),
    sectionPosition: normalizeChargeDensitySectionPosition(settings?.sectionPosition),
    surfaceMode: normalizeChargeDensitySurfaceMode(settings?.surfaceMode),
  };
}

export function translateChargeDensityFractionalOffset(
  settings: ChargeDensityDisplayState,
  delta: [number, number, number],
): ChargeDensityDisplayState {
  return {
    ...settings,
    fractionalOffset: wrapFractionalTuple([
      settings.fractionalOffset[0] + delta[0],
      settings.fractionalOffset[1] + delta[1],
      settings.fractionalOffset[2] + delta[2],
    ]),
  };
}

export function resetChargeDensityFractionalOffset(
  settings: ChargeDensityDisplayState,
): ChargeDensityDisplayState {
  if (tupleNearZero(settings.fractionalOffset)) {
    return settings;
  }

  return {
    ...settings,
    fractionalOffset: [0, 0, 0],
  };
}

export function normalizeChargeDensityInterpolationFactor(
  value: unknown,
): ChargeDensityInterpolationFactor {
  const numericValue = Number(value);
  return CHARGE_DENSITY_INTERPOLATION_FACTORS.find(
    (factor) => Math.abs(factor - numericValue) < 1e-8,
  ) ?? 1;
}

export function normalizeChargeDensityFractionalOffset(
  value: unknown,
): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    return [0, 0, 0];
  }

  return wrapFractionalTuple([
    Number(value[0]),
    Number(value[1]),
    Number(value[2]),
  ]);
}

export function normalizeChargeDensityIsoValue(
  value: unknown,
  scene: SceneSpec | null = null,
): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return defaultChargeDensityIsoValue(scene);
  }

  const maxAbsValue = maxAbsChargeDensityValue(scene);
  if (maxAbsValue <= 0) {
    return Math.max(0, numericValue);
  }

  return Math.min(maxAbsValue, Math.max(0, numericValue));
}

export function chargeDensityValueToVestaUnit(
  value: number,
  sourceUnit: string | null | undefined,
): number {
  return chargeDensityUnitKind(sourceUnit) === "angstrom"
    ? value * CHARGE_DENSITY_ANGSTROM3_PER_BOHR3
    : value;
}

export function chargeDensityValueFromVestaUnit(
  value: number,
  targetUnit: string | null | undefined,
): number {
  return chargeDensityUnitKind(targetUnit) === "angstrom"
    ? value / CHARGE_DENSITY_ANGSTROM3_PER_BOHR3
    : value;
}

export function chargeDensityValueToAngstromUnit(
  value: number,
  sourceUnit: string | null | undefined,
): number {
  return chargeDensityUnitKind(sourceUnit) === "bohr"
    ? value / CHARGE_DENSITY_ANGSTROM3_PER_BOHR3
    : value;
}

export function chargeDensityValueFromAngstromUnit(
  value: number,
  targetUnit: string | null | undefined,
): number {
  return chargeDensityUnitKind(targetUnit) === "bohr"
    ? value * CHARGE_DENSITY_ANGSTROM3_PER_BOHR3
    : value;
}

function chargeDensityUnitKind(
  unit: string | null | undefined,
): "angstrom" | "bohr" {
  const normalizedUnit = unit?.trim().toLowerCase().replace(/\s+/g, "") ?? "";
  if (
    normalizedUnit.includes("\u00e5") ||
    normalizedUnit.includes("angstrom") ||
    normalizedUnit === "e/a^3" ||
    normalizedUnit === "e/a**3"
  ) {
    return "angstrom";
  }

  return "bohr";
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

function wrapFractionalCoordinate(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const wrapped = value - Math.floor(value);
  return wrapped >= 1 - 1e-10 ? 0 : wrapped;
}

export function normalizeChargeDensitySectionAxis(value: unknown): ChargeDensitySectionAxis {
  return value === "a" || value === "b" || value === "c" ? value : "c";
}

export function normalizeChargeDensitySectionOpacity(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_CHARGE_DENSITY_SECTION_OPACITY;
  }

  return Math.min(
    CHARGE_DENSITY_SECTION_OPACITY_MAX,
    Math.max(CHARGE_DENSITY_SECTION_OPACITY_MIN, Math.round(numericValue)),
  );
}

export function normalizeChargeDensitySectionPosition(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return 50;
  }

  return Math.min(
    CHARGE_DENSITY_SECTION_POSITION_MAX,
    Math.max(CHARGE_DENSITY_SECTION_POSITION_MIN, Math.round(numericValue)),
  );
}

export function normalizeChargeDensityBoundaryFillOpacity(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return DEFAULT_CHARGE_DENSITY_BOUNDARY_FILL_OPACITY;
  }

  return Math.min(
    CHARGE_DENSITY_BOUNDARY_FILL_OPACITY_MAX,
    Math.max(CHARGE_DENSITY_BOUNDARY_FILL_OPACITY_MIN, Math.round(numericValue)),
  );
}

export function normalizeChargeDensitySurfaceMode(value: unknown): ChargeDensitySurfaceMode {
  return value === "positive" || value === "negative" || value === "both"
    ? value
    : "both";
}

export function normalizeChargeDensityColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmedValue = value.trim();
  const shortMatch = /^#?([0-9a-fA-F]{3})$/.exec(trimmedValue);
  const shortHex = shortMatch?.[1];
  if (shortHex) {
    return `#${shortHex
      .split("")
      .map((component) => `${component}${component}`)
      .join("")
      .toLowerCase()}`;
  }

  const longMatch = /^#?([0-9a-fA-F]{6})$/.exec(trimmedValue);
  const longHex = longMatch?.[1];
  if (longHex) {
    return `#${longHex.toLowerCase()}`;
  }

  return fallback;
}

export function normalizeComponentOpacityState(
  opacity: Partial<ComponentOpacityState> | null | undefined,
): ComponentOpacityState {
  return {
    ...createDefaultComponentOpacity(),
    ...opacity,
  };
}

export function componentOpacityEquals(
  firstOpacity: ComponentOpacityState,
  secondOpacity: ComponentOpacityState,
): boolean {
  return (
    firstOpacity.atoms === secondOpacity.atoms &&
    firstOpacity.unitCell === secondOpacity.unitCell &&
    firstOpacity.bonds === secondOpacity.bonds &&
    firstOpacity.polyhedra === secondOpacity.polyhedra &&
    firstOpacity.chargeDensity === secondOpacity.chargeDensity
  );
}

export function countPeriodicImageAtoms(scene: SceneSpec | null): number {
  if (!scene) {
    return 0;
  }

  return scene.atoms.filter((atom) => atom.isPeriodicImage).length;
}

export function hasPeriodicImageAtoms(scene: SceneSpec | null): boolean {
  return countPeriodicImageAtoms(scene) > 0;
}

export function hasPolyhedra(scene: SceneSpec | null): boolean {
  return (scene?.polyhedra.length ?? 0) > 0;
}

export function hasChargeDensity(scene: SceneSpec | null): boolean {
  return scene?.chargeDensity !== undefined;
}

export function maxAbsChargeDensityValue(scene: SceneSpec | null): number {
  const chargeDensity = scene?.chargeDensity;
  if (!chargeDensity) {
    return 0;
  }

  return Math.max(
    Math.abs(chargeDensity.min),
    Math.abs(chargeDensity.max),
  );
}

function defaultChargeDensityIsoValue(scene: SceneSpec | null): number {
  const chargeDensity = scene?.chargeDensity;
  if (!chargeDensity) {
    return 0;
  }

  const maxAbsValue = maxAbsChargeDensityValue(scene);
  if (maxAbsValue <= 0) {
    return 0;
  }

  return normalizeChargeDensityIsoValue(Math.abs(chargeDensity.isoValue), scene);
}

function chargeDensityIsoValueFromLevel(
  value: unknown,
  scene: SceneSpec | null,
): number | undefined {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return undefined;
  }

  const maxAbsValue = maxAbsChargeDensityValue(scene);
  if (maxAbsValue <= 0) {
    return undefined;
  }

  return maxAbsValue * Math.min(100, Math.max(0, numericValue)) / 100;
}

export function visibleSceneForComponents(
  scene: SceneSpec | null,
  visibility: ComponentVisibilityState,
): SceneSpec | null {
  if (!scene) {
    return scene;
  }

  const atomIndexMap = new Map<number, number>();
  const atoms: AtomSpec[] = [];
  scene.atoms.forEach((atom, atomIndex) => {
    if (isAtomAvailable(atom, visibility)) {
      atomIndexMap.set(atomIndex, atoms.length);
      atoms.push(atom);
    }
  });
  const bonds = visibility.bonds
    ? scene.bonds.flatMap((bond) => remapBond(bond, atomIndexMap))
    : [];
  const polyhedra = visibility.polyhedra
    ? scene.polyhedra.flatMap((polyhedron) => remapPolyhedron(polyhedron, atomIndexMap))
    : [];

  return supercellSceneForDisplay({
    ...scene,
    atoms,
    bonds,
    polyhedra,
    chargeDensity: visibility.chargeDensity ? scene.chargeDensity : undefined,
  }, visibility.supercell);
}

export function supercellSceneForDisplay(
  scene: SceneSpec,
  settings: SupercellSettings,
): SceneSpec {
  const supercell = normalizeSupercellSettings(settings);
  if (supercell.mode === "repeat" || scene.chargeDensity) {
    return repeatSupercellSceneForDisplay(scene, supercell);
  }

  const matrix = supercell.matrix;
  const determinant = supercellMatrixDeterminant(matrix);
  if (Math.abs(determinant) < 1e-8) {
    return scene;
  }
  if (isIdentityMatrix(matrix)) {
    return scene;
  }

  const rowBasisMatrix = transformationMatrixToRowBasisMatrix(matrix);
  const inverseMatrix = invertMatrix(rowBasisMatrix);
  if (inverseMatrix === null) {
    return scene;
  }

  const sourceAtomCount = scene.atoms.length;
  const atoms: AtomSpec[] = [];
  const bonds: BondSpec[] = [];
  const polyhedra: PolyhedronSpec[] = [];
  const vectors = cellVectorTuple(scene.cell.vectors);
  const scaledVectors: [number, number, number][] = [
    combineCellVectors(rowBasisMatrix[0], vectors),
    combineCellVectors(rowBasisMatrix[1], vectors),
    combineCellVectors(rowBasisMatrix[2], vectors),
  ];
  const representatives = translationRepresentatives(rowBasisMatrix, inverseMatrix);
  const hasMultipleRepresentatives = representatives.length > 1;

  for (const [representativeIndex, representative] of representatives.entries()) {
    const atomIndexOffset = representativeIndex * sourceAtomCount;
    const isFirstRepresentative = representativeIndex === 0;

    scene.atoms.forEach((atom) => {
      const wrapped = wrapAtomFractionalPosition(
        atom.fractionalPosition,
        representative,
        inverseMatrix,
      );
      const isRepeatedCell =
        hasMultipleRepresentatives &&
        (!isFirstRepresentative || !tupleNearZero(representative));
      atoms.push({
        ...atom,
        id: isRepeatedCell
          ? `${atom.id}-supercell-${representative.join("-")}`
          : atom.id,
        fractionalPosition: wrapped.fractionalPosition,
        imageOffset: [
          atom.imageOffset[0] + wrapped.imageOffset[0],
          atom.imageOffset[1] + wrapped.imageOffset[1],
          atom.imageOffset[2] + wrapped.imageOffset[2],
        ],
        isPeriodicImage: atom.isPeriodicImage || isRepeatedCell,
        position: translatedPosition(atom.position, vectors, representative),
      });
    });

    scene.bonds.forEach((bond) => {
      bonds.push({
        ...bond,
        startAtomIndex: atomIndexOffset + bond.startAtomIndex,
        endAtomIndex: atomIndexOffset + bond.endAtomIndex,
      });
    });

    scene.polyhedra.forEach((polyhedron) => {
      polyhedra.push({
        ...polyhedron,
        centerAtomIndex: atomIndexOffset + polyhedron.centerAtomIndex,
        hullAtomIndices: polyhedron.hullAtomIndices.map(
          (atomIndex) => atomIndexOffset + atomIndex,
        ),
      });
    });
  }

  return {
    ...scene,
    atoms,
    bonds,
    cell: {
      ...scene.cell,
      vectors: scaledVectors,
    },
    polyhedra,
  };
}

function repeatSupercellSceneForDisplay(
  scene: SceneSpec,
  settings: SupercellSettings,
): SceneSpec {
  const aRepeat = normalizeSupercellValue(settings.a);
  const bRepeat = normalizeSupercellValue(settings.b);
  const cRepeat = normalizeSupercellValue(settings.c);
  if (aRepeat === 1 && bRepeat === 1 && cRepeat === 1) {
    return scene;
  }

  const sourceAtomCount = scene.atoms.length;
  const atoms: AtomSpec[] = [];
  const bonds: BondSpec[] = [];
  const polyhedra: PolyhedronSpec[] = [];
  const vectors = cellVectorTuple(scene.cell.vectors);
  const scaledVectors: [number, number, number][] = [
    scaleTuple(vectors[0], aRepeat),
    scaleTuple(vectors[1], bRepeat),
    scaleTuple(vectors[2], cRepeat),
  ];

  for (let aIndex = 0; aIndex < aRepeat; aIndex += 1) {
    for (let bIndex = 0; bIndex < bRepeat; bIndex += 1) {
      for (let cIndex = 0; cIndex < cRepeat; cIndex += 1) {
        const representative: [number, number, number] = [aIndex, bIndex, cIndex];
        const representativeIndex =
          (aIndex * bRepeat + bIndex) * cRepeat + cIndex;
        const atomIndexOffset = representativeIndex * sourceAtomCount;
        const isFirstRepresentative = representativeIndex === 0;

        scene.atoms.forEach((atom) => {
          const isRepeatedCell = !isFirstRepresentative;
          atoms.push({
            ...atom,
            id: isRepeatedCell
              ? `${atom.id}-supercell-${representative.join("-")}`
              : atom.id,
            fractionalPosition: [
              (atom.fractionalPosition[0] + aIndex) / aRepeat,
              (atom.fractionalPosition[1] + bIndex) / bRepeat,
              (atom.fractionalPosition[2] + cIndex) / cRepeat,
            ],
            imageOffset: [
              atom.imageOffset[0] + aIndex,
              atom.imageOffset[1] + bIndex,
              atom.imageOffset[2] + cIndex,
            ],
            isPeriodicImage: atom.isPeriodicImage,
            position: translatedPosition(atom.position, vectors, representative),
          });
        });

        scene.bonds.forEach((bond) => {
          bonds.push({
            ...bond,
            startAtomIndex: atomIndexOffset + bond.startAtomIndex,
            endAtomIndex: atomIndexOffset + bond.endAtomIndex,
          });
        });

        scene.polyhedra.forEach((polyhedron) => {
          polyhedra.push({
            ...polyhedron,
            centerAtomIndex: atomIndexOffset + polyhedron.centerAtomIndex,
            hullAtomIndices: polyhedron.hullAtomIndices.map(
              (atomIndex) => atomIndexOffset + atomIndex,
            ),
          });
        });
      }
    }
  }

  return {
    ...scene,
    atoms,
    bonds,
    cell: {
      ...scene.cell,
      vectors: scaledVectors,
    },
    chargeDensity: scene.chargeDensity
      ? {
          ...scene.chargeDensity,
          supercellRepeat: [aRepeat, bRepeat, cRepeat],
        }
      : scene.chargeDensity,
    polyhedra,
  };
}

function translatedPosition(
  position: [number, number, number],
  vectors: readonly [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ],
  offsets: [number, number, number],
): [number, number, number] {
  return [
    position[0] + vectors[0][0] * offsets[0] + vectors[1][0] * offsets[1] + vectors[2][0] * offsets[2],
    position[1] + vectors[0][1] * offsets[0] + vectors[1][1] * offsets[1] + vectors[2][1] * offsets[2],
    position[2] + vectors[0][2] * offsets[0] + vectors[1][2] * offsets[1] + vectors[2][2] * offsets[2],
  ];
}

function wrapAtomFractionalPosition(
  fractionalPosition: [number, number, number],
  representative: [number, number, number],
  inverseMatrix: SupercellMatrix,
): {
  fractionalPosition: [number, number, number];
  imageOffset: [number, number, number];
} {
  const oldFractionalCandidate = addTuples(fractionalPosition, representative);
  const rawNewFractional = rowVectorMultiplyMatrix(
    oldFractionalCandidate,
    inverseMatrix,
  );
  const fractional = wrapUnitTuple(rawNewFractional);

  return {
    fractionalPosition: fractional,
    imageOffset: representative,
  };
}

function translationRepresentatives(
  matrix: SupercellMatrix,
  inverseMatrix: SupercellMatrix,
): [number, number, number][] {
  const bounds = supercellOldFractionalBounds(matrix);
  const representatives: [number, number, number][] = [];
  const determinant = Math.max(1, Math.round(Math.abs(supercellMatrixDeterminant(matrix))));
  const minA = Math.floor(bounds.min[0] - 1);
  const maxA = Math.ceil(bounds.max[0] + 1);
  const minB = Math.floor(bounds.min[1] - 1);
  const maxB = Math.ceil(bounds.max[1] + 1);
  const minC = Math.floor(bounds.min[2] - 1);
  const maxC = Math.ceil(bounds.max[2] + 1);

  for (let aIndex = minA; aIndex <= maxA; aIndex += 1) {
    for (let bIndex = minB; bIndex <= maxB; bIndex += 1) {
      for (let cIndex = minC; cIndex <= maxC; cIndex += 1) {
        const candidate: [number, number, number] = [aIndex, bIndex, cIndex];
        const newFractional = rowVectorMultiplyMatrix(candidate, inverseMatrix);
        if (unitTupleContains(newFractional)) {
          representatives.push(candidate);
        }
      }
    }
  }

  representatives.sort(compareTuples);
  return representatives.slice(0, determinant);
}

function supercellOldFractionalBounds(matrix: SupercellMatrix): {
  max: [number, number, number];
  min: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const a of [0, 1] as const) {
    for (const b of [0, 1] as const) {
      for (const c of [0, 1] as const) {
        const point = rowVectorMultiplyMatrix([a, b, c], matrix);
        for (const axis of [0, 1, 2] as const) {
          min[axis] = Math.min(min[axis], point[axis]);
          max[axis] = Math.max(max[axis], point[axis]);
        }
      }
    }
  }

  return { max, min };
}

function combineCellVectors(
  coefficients: [number, number, number],
  vectors: readonly [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ],
): [number, number, number] {
  return translatedPosition([0, 0, 0], vectors, coefficients);
}

function transformationMatrixToRowBasisMatrix(
  matrix: SupercellMatrix,
): SupercellMatrix {
  return cloneSupercellMatrix(matrix);
}

function scaleTuple(
  tuple: [number, number, number],
  scale: number,
): [number, number, number] {
  return [
    tuple[0] * scale,
    tuple[1] * scale,
    tuple[2] * scale,
  ];
}

export function supercellMatrixDeterminant(matrix: SupercellMatrix): number {
  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

function invertMatrix(matrix: SupercellMatrix): SupercellMatrix | null {
  const determinant = supercellMatrixDeterminant(matrix);
  if (Math.abs(determinant) < 1e-8) {
    return null;
  }

  const [[a, b, c], [d, e, f], [g, h, i]] = matrix;
  return [
    [
      (e * i - f * h) / determinant,
      (c * h - b * i) / determinant,
      (b * f - c * e) / determinant,
    ],
    [
      (f * g - d * i) / determinant,
      (a * i - c * g) / determinant,
      (c * d - a * f) / determinant,
    ],
    [
      (d * h - e * g) / determinant,
      (b * g - a * h) / determinant,
      (a * e - b * d) / determinant,
    ],
  ];
}

function rowVectorMultiplyMatrix(
  vector: [number, number, number],
  matrix: SupercellMatrix,
): [number, number, number] {
  return [
    vector[0] * matrix[0][0] + vector[1] * matrix[1][0] + vector[2] * matrix[2][0],
    vector[0] * matrix[0][1] + vector[1] * matrix[1][1] + vector[2] * matrix[2][1],
    vector[0] * matrix[0][2] + vector[1] * matrix[1][2] + vector[2] * matrix[2][2],
  ];
}

function addTuples(
  first: [number, number, number],
  second: [number, number, number],
): [number, number, number] {
  return [
    first[0] + second[0],
    first[1] + second[1],
    first[2] + second[2],
  ];
}

function wrapUnitTuple(tuple: [number, number, number]): [number, number, number] {
  return tuple.map((value) => {
    const wrapped = value - Math.floor(value);
    return wrapped >= 1 - 1e-8 ? 0 : wrapped;
  }) as [number, number, number];
}

function unitTupleContains(tuple: [number, number, number]): boolean {
  return tuple.every((value) => value >= -1e-8 && value < 1 - 1e-8);
}

function tupleNearZero(tuple: [number, number, number]): boolean {
  return tuple.every((value) => Math.abs(value) < 1e-8);
}

function compareTuples(
  first: [number, number, number],
  second: [number, number, number],
): number {
  return (
    first[0] - second[0] ||
    first[1] - second[1] ||
    first[2] - second[2]
  );
}

function isIdentityMatrix(matrix: SupercellMatrix): boolean {
  return matrix.every((row, rowIndex) =>
    row.every((value, columnIndex) => value === (rowIndex === columnIndex ? 1 : 0)),
  );
}

function cloneSupercellMatrix(matrix: SupercellMatrix): SupercellMatrix {
  return matrix.map((row) => [...row] as [number, number, number]) as SupercellMatrix;
}

function cellVectorTuple(
  vectors: [number, number, number][],
): [
  [number, number, number],
  [number, number, number],
  [number, number, number],
] {
  return [
    vectors[0] ?? [0, 0, 0],
    vectors[1] ?? [0, 0, 0],
    vectors[2] ?? [0, 0, 0],
  ];
}

function isAtomAvailable(atom: AtomSpec, visibility: ComponentVisibilityState): boolean {
  if (!atom.isPeriodicImage) {
    return true;
  }

  return dependencyGroupsAllow(atom.visibilityDependencyGroups, visibility);
}

function remapBond(
  bond: BondSpec,
  atomIndexMap: Map<number, number>,
): BondSpec[] {
  const startAtomIndex = atomIndexMap.get(bond.startAtomIndex);
  const endAtomIndex = atomIndexMap.get(bond.endAtomIndex);
  if (startAtomIndex === undefined || endAtomIndex === undefined) {
    return [];
  }

  return [{ ...bond, startAtomIndex, endAtomIndex }];
}

function remapPolyhedron(
  polyhedron: PolyhedronSpec,
  atomIndexMap: Map<number, number>,
): PolyhedronSpec[] {
  const hullAtomIndices: number[] = [];
  for (const atomIndex of polyhedron.hullAtomIndices) {
    const visibleAtomIndex = atomIndexMap.get(atomIndex);
    if (visibleAtomIndex === undefined) {
      return [];
    }
    hullAtomIndices.push(visibleAtomIndex);
  }

  const centerAtomIndex = atomIndexMap.get(polyhedron.centerAtomIndex);
  if (centerAtomIndex === undefined) {
    return [];
  }

  return [{ ...polyhedron, centerAtomIndex, hullAtomIndices }];
}

function dependencyGroupsAllow(
  dependencyGroups: VisibilityDependency[][],
  visibility: ComponentVisibilityState,
): boolean {
  if (dependencyGroups.length === 0) {
    return true;
  }

  return dependencyGroups.some((dependencyGroup) =>
    dependencyGroup.every((dependency) => dependencyEnabled(dependency, visibility)),
  );
}

function dependencyEnabled(
  dependency: VisibilityDependency,
  visibility: ComponentVisibilityState,
): boolean {
  if (dependency === "boundaryAtoms") {
    return visibility.boundaryAtoms;
  }

  return visibility.oneHopBondedAtoms;
}
