import type { AtomSpec, SceneSpec } from "../api/scene";

export type AtomVectorTuple = [number, number, number];

export interface AtomVectorSettings {
  color: string;
  enabled: boolean;
  headSize: number;
  lengthScale: number;
  lineThickness: number;
  maxAbsValue: number;
  opacity: number;
  values: Record<string, AtomVectorTuple>;
}

export interface AtomVectorRenderItem {
  atom: AtomSpec;
  vector: AtomVectorTuple;
}

const DEFAULT_ATOM_VECTOR: AtomVectorTuple = [0, 0, 0];
export const ATOM_VECTOR_MIN = -1;
export const ATOM_VECTOR_MAX = 1;
export const ATOM_VECTOR_EPSILON = 1e-8;
export const ATOM_VECTOR_MIN_LENGTH_RATIO = 0.08;
export const ATOM_VECTOR_MAX_LENGTH_RATIO = 0.22;
export const ATOM_VECTOR_HEAD_LENGTH_RATIO = 0.24;
export const ATOM_VECTOR_HEAD_WIDTH_RATIO = 0.13;
export const ATOM_VECTOR_LINE_THICKNESS_MIN = 25;
export const ATOM_VECTOR_LINE_THICKNESS_MAX = 300;
export const ATOM_VECTOR_LINE_THICKNESS_DEFAULT = 100;
export const ATOM_VECTOR_LINE_THICKNESS_NORMALIZATION = 200;
export const ATOM_VECTOR_LENGTH_SCALE_MIN = 25;
export const ATOM_VECTOR_LENGTH_SCALE_MAX = 500;
export const ATOM_VECTOR_LENGTH_SCALE_DEFAULT = 100;
export const ATOM_VECTOR_LENGTH_SCALE_NORMALIZATION = 200;
export const ATOM_VECTOR_HEAD_SIZE_MIN = 25;
export const ATOM_VECTOR_HEAD_SIZE_MAX = 300;
export const ATOM_VECTOR_HEAD_SIZE_DEFAULT = 100;
export const ATOM_VECTOR_HEAD_SIZE_NORMALIZATION = 400 / 3;
export const ATOM_VECTOR_OPACITY_MIN = 0;
export const ATOM_VECTOR_OPACITY_MAX = 100;
export const ATOM_VECTOR_OPACITY_DEFAULT = 100;
export const ATOM_VECTOR_RADIUS_RATIO = 0.008;
export const ATOM_VECTOR_MAX_ABS_VALUE_DEFAULT = 1;
export const ATOM_VECTOR_COLOR_DEFAULT = "#ff0000";

export function createDefaultAtomVectorSettings(
  scene: SceneSpec | null = null,
): AtomVectorSettings {
  return normalizeAtomVectorSettings(
    {
      color: ATOM_VECTOR_COLOR_DEFAULT,
      enabled: false,
      headSize: ATOM_VECTOR_HEAD_SIZE_DEFAULT,
      lengthScale: ATOM_VECTOR_LENGTH_SCALE_DEFAULT,
      lineThickness: ATOM_VECTOR_LINE_THICKNESS_DEFAULT,
      maxAbsValue: ATOM_VECTOR_MAX_ABS_VALUE_DEFAULT,
      opacity: ATOM_VECTOR_OPACITY_DEFAULT,
      values: {},
    },
    scene,
  );
}

export function normalizeAtomVectorSettings(
  settings: Partial<AtomVectorSettings> | null | undefined,
  scene: SceneSpec | null,
): AtomVectorSettings {
  const values = normalizeAtomVectorValues(settings?.values, scene);
  const hasVectors = atomVectorValuesHaveNonZero(values);

  return {
    color: normalizeAtomVectorColor(settings?.color),
    enabled: hasVectors,
    headSize: normalizePercentSetting(
      settings?.headSize,
      ATOM_VECTOR_HEAD_SIZE_MIN,
      ATOM_VECTOR_HEAD_SIZE_MAX,
      ATOM_VECTOR_HEAD_SIZE_DEFAULT,
    ),
    lengthScale: normalizePercentSetting(
      settings?.lengthScale,
      ATOM_VECTOR_LENGTH_SCALE_MIN,
      ATOM_VECTOR_LENGTH_SCALE_MAX,
      ATOM_VECTOR_LENGTH_SCALE_DEFAULT,
    ),
    lineThickness: normalizePercentSetting(
      settings?.lineThickness,
      ATOM_VECTOR_LINE_THICKNESS_MIN,
      ATOM_VECTOR_LINE_THICKNESS_MAX,
      ATOM_VECTOR_LINE_THICKNESS_DEFAULT,
    ),
    maxAbsValue: normalizeMaxAbsValue(settings?.maxAbsValue),
    opacity: normalizePercentSetting(
      settings?.opacity,
      ATOM_VECTOR_OPACITY_MIN,
      ATOM_VECTOR_OPACITY_MAX,
      ATOM_VECTOR_OPACITY_DEFAULT,
    ),
    values,
  };
}

export function normalizeAtomVectorColor(value: unknown): string {
  if (typeof value !== "string") {
    return ATOM_VECTOR_COLOR_DEFAULT;
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

  return ATOM_VECTOR_COLOR_DEFAULT;
}

export function normalizeAtomVectorValues(
  values: Record<string, unknown> | null | undefined,
  scene: SceneSpec | null,
): Record<string, AtomVectorTuple> {
  const nextValues: Record<string, AtomVectorTuple> = {};
  const atoms = scene?.atoms ?? [];

  for (const atom of canonicalAtoms(scene)) {
    const key = atomVectorKeyForAtom(atom, atoms);
    nextValues[key] = normalizeAtomVector(values?.[key]);
  }

  return nextValues;
}

export function setAtomVectorValue(
  settings: AtomVectorSettings,
  siteId: string,
  axisIndex: 0 | 1 | 2,
  value: number,
): AtomVectorSettings {
  const currentVector = settings.values[siteId] ?? DEFAULT_ATOM_VECTOR;
  const nextVector: AtomVectorTuple = [...currentVector] as AtomVectorTuple;
  nextVector[axisIndex] = clampAtomVectorValue(value);

  return {
    ...settings,
    values: {
      ...settings.values,
      [siteId]: nextVector,
    },
  };
}

export function atomVectorRenderItems(
  settings: AtomVectorSettings,
  atoms: readonly AtomSpec[],
): AtomVectorRenderItem[] {
  if (!settings.enabled) {
    return [];
  }

  return atoms.flatMap((atom) => {
    const vector = settings.values[atomVectorKeyForAtom(atom, atoms)];
    if (!vector || !atomVectorHasNonZero(vector)) {
      return [];
    }

    return [{ atom, vector }];
  });
}

export function atomVectorValuesHaveNonZero(
  values: Record<string, AtomVectorTuple>,
): boolean {
  return Object.values(values).some(atomVectorHasNonZero);
}

export function atomVectorHasNonZero(vector: AtomVectorTuple): boolean {
  return vector.some((value) => Math.abs(value) > ATOM_VECTOR_EPSILON);
}

export function atomVectorAtoms(scene: SceneSpec | null): AtomSpec[] {
  return canonicalAtoms(scene);
}

export function atomVectorKeyForAtom(
  atom: AtomSpec,
  atoms: readonly AtomSpec[],
): string {
  const keyBySiteId = atomVectorKeysBySiteId(atoms);
  return keyBySiteId.get(atom.siteId) ?? fallbackAtomVectorKey(atom);
}

export function clampAtomVectorValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(ATOM_VECTOR_MAX, Math.max(ATOM_VECTOR_MIN, value));
}

function normalizeAtomVector(value: unknown): AtomVectorTuple {
  if (!Array.isArray(value)) {
    return [...DEFAULT_ATOM_VECTOR];
  }

  return [
    clampAtomVectorValue(Number(value[0] ?? 0)),
    clampAtomVectorValue(Number(value[1] ?? 0)),
    clampAtomVectorValue(Number(value[2] ?? 0)),
  ];
}

function normalizePercentSetting(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function normalizeMaxAbsValue(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return ATOM_VECTOR_MAX_ABS_VALUE_DEFAULT;
  }

  return numericValue;
}

function atomVectorKeysBySiteId(atoms: readonly AtomSpec[]): Map<string, string> {
  const elementCounts = new Map<string, number>();
  const keyBySiteId = new Map<string, string>();

  canonicalAtomsFromList(atoms).forEach((atom, index) => {
    const elementIndex = (elementCounts.get(atom.element) ?? 0) + 1;
    elementCounts.set(atom.element, elementIndex);
    keyBySiteId.set(atom.siteId, `${index + 1}-${atom.element}-${elementIndex}`);
  });

  return keyBySiteId;
}

function fallbackAtomVectorKey(atom: AtomSpec): string {
  return `${atom.siteIndex + 1}-${atom.element}-1`;
}

function canonicalAtoms(scene: SceneSpec | null): AtomSpec[] {
  return canonicalAtomsFromList(scene?.atoms ?? []);
}

function canonicalAtomsFromList(atoms: readonly AtomSpec[]): AtomSpec[] {
  return atoms
    .filter((atom) => !atom.isPeriodicImage)
    .slice()
    .sort((firstAtom, secondAtom) => firstAtom.siteIndex - secondAtom.siteIndex);
}
