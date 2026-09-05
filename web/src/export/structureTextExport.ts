import type { AtomSpec, SceneSpec } from "../api/scene";
import type { ComponentVisibilityState } from "../model";
import {
  formatStructureNumber,
  STRUCTURE_ZERO_TOLERANCE,
  supercellSceneForDisplay,
} from "../model";
import { exportFileStem } from "./fileNames";

export type StructureTextExportFormat = "vasp" | "cif" | "abacus-stru";

export interface StructureTextExportFile {
  blob: Blob;
  fileName: string;
  format: StructureTextExportFormat;
  text: string;
}

export const STRUCTURE_TEXT_EXPORT_FORMATS: {
  extension: string;
  format: StructureTextExportFormat;
  label: string;
}[] = [
  { extension: "vasp", format: "vasp", label: "VASP POSCAR" },
  { extension: "cif", format: "cif", label: "CIF" },
  { extension: "stru", format: "abacus-stru", label: "ABACUS STRU" },
];

export function createStructureTextExportFile({
  componentVisibility,
  format,
  scene,
  selectedFileName,
}: {
  componentVisibility: ComponentVisibilityState;
  format: StructureTextExportFormat;
  scene: SceneSpec;
  selectedFileName: string | null;
}): StructureTextExportFile {
  const exportScene = structureSceneForExport(scene, componentVisibility);
  const text = encodeStructureText(exportScene, format, selectedFileName);
  const extension =
    STRUCTURE_TEXT_EXPORT_FORMATS.find((option) => option.format === format)?.extension ??
    "txt";
  const fileName = `${exportFileStem(selectedFileName)}.${extension}`;

  return {
    blob: new Blob([text], { type: "text/plain;charset=utf-8" }),
    fileName,
    format,
    text,
  };
}

export function structureSceneForExport(
  scene: SceneSpec,
  componentVisibility: ComponentVisibilityState,
): SceneSpec {
  const canonicalAtoms = scene.atoms.filter(isCanonicalAtom);
  return supercellSceneForDisplay(
    {
      ...scene,
      atoms: canonicalAtoms,
      bonds: [],
      polyhedra: [],
    },
    componentVisibility.supercell,
  );
}

function encodeStructureText(
  scene: SceneSpec,
  format: StructureTextExportFormat,
  selectedFileName: string | null,
): string {
  switch (format) {
    case "vasp":
      return encodeVaspPoscar(scene, selectedFileName);
    case "cif":
      return encodeCif(scene, selectedFileName);
    case "abacus-stru":
      return encodeAbacusStru(scene);
  }
}

function encodeVaspPoscar(scene: SceneSpec, selectedFileName: string | null): string {
  const groups = atomGroupsByElement(scene.atoms);
  return [
    `Pretty Lattice export${selectedFileName ? ` from ${selectedFileName}` : ""}`,
    "1.0",
    ...scene.cell.vectors.map((vector) => vector.map(formatFloat).join("  ")),
    groups.map((group) => group.element).join("  "),
    groups.map((group) => String(group.atoms.length)).join("  "),
    "Direct",
    ...groups.flatMap((group) =>
      group.atoms.map((atom) =>
        `${wrapFractionalTuple(atom.fractionalPosition).map(formatFloat).join("  ")}  ${atom.element}`,
      ),
    ),
    "",
  ].join("\n");
}

function encodeCif(scene: SceneSpec, selectedFileName: string | null): string {
  const cell = cellParameters(scene.cell.vectors);
  const labels = atomLabels(scene.atoms);
  const dataName = exportFileStem(selectedFileName).replace(/[^a-zA-Z0-9_]+/g, "_");
  return [
    `data_${dataName || "pretty_lattice"}`,
    "_symmetry_space_group_name_H-M   'P 1'",
    "_symmetry_Int_Tables_number      1",
    `_cell_length_a                   ${formatFloat(cell.a)}`,
    `_cell_length_b                   ${formatFloat(cell.b)}`,
    `_cell_length_c                   ${formatFloat(cell.c)}`,
    `_cell_angle_alpha                ${formatFloat(cell.alpha)}`,
    `_cell_angle_beta                 ${formatFloat(cell.beta)}`,
    `_cell_angle_gamma                ${formatFloat(cell.gamma)}`,
    "loop_",
    "_symmetry_equiv_pos_as_xyz",
    "  'x, y, z'",
    "loop_",
    "_atom_site_label",
    "_atom_site_type_symbol",
    "_atom_site_fract_x",
    "_atom_site_fract_y",
    "_atom_site_fract_z",
    ...scene.atoms.map((atom, index) => {
      const fractional = wrapFractionalTuple(atom.fractionalPosition).map(formatFloat);
      return `${labels[index]}  ${atom.element}  ${fractional.join("  ")}`;
    }),
    "",
  ].join("\n");
}

function encodeAbacusStru(scene: SceneSpec): string {
  const groups = atomGroupsByElement(scene.atoms);
  return [
    "ATOMIC_SPECIES",
    ...groups.map((group) => `${group.element}  1.000  ${group.element}.upf`),
    "",
    "LATTICE_CONSTANT",
    "1.8897261254578281",
    "",
    "LATTICE_VECTORS",
    ...scene.cell.vectors.map((vector) => vector.map(formatFloat).join("  ")),
    "",
    "ATOMIC_POSITIONS",
    "Direct",
    "",
    ...groups.flatMap((group) => [
      group.element,
      "0.000",
      String(group.atoms.length),
      ...group.atoms.map((atom) =>
        `${wrapFractionalTuple(atom.fractionalPosition).map(formatFloat).join("  ")}  1  1  1`,
      ),
      "",
    ]),
  ].join("\n");
}

function atomGroupsByElement(atoms: AtomSpec[]): { atoms: AtomSpec[]; element: string }[] {
  const groups: { atoms: AtomSpec[]; element: string }[] = [];
  const groupByElement = new Map<string, { atoms: AtomSpec[]; element: string }>();
  atoms.forEach((atom) => {
    let group = groupByElement.get(atom.element);
    if (!group) {
      group = { atoms: [], element: atom.element };
      groupByElement.set(atom.element, group);
      groups.push(group);
    }
    group.atoms.push(atom);
  });
  return groups;
}

function atomLabels(atoms: AtomSpec[]): string[] {
  const elementCounts = new Map<string, number>();
  return atoms.map((atom) => {
    const nextCount = (elementCounts.get(atom.element) ?? 0) + 1;
    elementCounts.set(atom.element, nextCount);
    return `${atom.element}${nextCount}`;
  });
}

function isCanonicalAtom(atom: AtomSpec): boolean {
  return !atom.isPeriodicImage && atom.visibilityDependencies.length === 0;
}

function cellParameters(vectors: [number, number, number][]): {
  a: number;
  alpha: number;
  b: number;
  beta: number;
  c: number;
  gamma: number;
} {
  const aVector = vectors[0] ?? [1, 0, 0];
  const bVector = vectors[1] ?? [0, 1, 0];
  const cVector = vectors[2] ?? [0, 0, 1];
  const a = vectorLength(aVector);
  const b = vectorLength(bVector);
  const c = vectorLength(cVector);
  return {
    a,
    alpha: vectorAngle(bVector, cVector),
    b,
    beta: vectorAngle(aVector, cVector),
    c,
    gamma: vectorAngle(aVector, bVector),
  };
}

function vectorLength(vector: [number, number, number]): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function vectorAngle(
  first: [number, number, number],
  second: [number, number, number],
): number {
  const denominator = vectorLength(first) * vectorLength(second);
  if (denominator <= 0) {
    return 90;
  }
  const cosine = (first[0] * second[0] + first[1] * second[1] + first[2] * second[2]) / denominator;
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * 180 / Math.PI;
}

function wrapFractionalTuple(tuple: [number, number, number]): [number, number, number] {
  return tuple.map((value) => {
    const wrapped = value - Math.floor(value);
    return Math.abs(wrapped - 1) < STRUCTURE_ZERO_TOLERANCE ||
      Math.abs(wrapped) < STRUCTURE_ZERO_TOLERANCE
      ? 0
      : wrapped;
  }) as [number, number, number];
}

function formatFloat(value: number): string {
  return formatStructureNumber(value);
}
