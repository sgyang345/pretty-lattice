#!/usr/bin/env python3
"""
Build a Pretty Lattice .prl project with displacement arrows from two structures.

The first structure is shown in Pretty Lattice. Arrows show how much each atom
in the first structure moves to reach the second structure. Displacements are
computed with the minimum-image convention in fractional coordinates, converted
to Cartesian coordinates, normalized by the maximum displacement length, and
written to overlays.atomVectors.values.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import warnings
from pathlib import Path
from typing import Any

import numpy as np


REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = REPO_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from pretty_lattice.structures.readers import StructureReadError, read_structure
from pretty_lattice.structures.scene_builder import build_scene_response
from pretty_lattice.structures.schema import (
    default_bond_algorithm_for_atom_count,
    normalize_bond_algorithm,
)
from pretty_lattice.structures.summary import build_structure_summary


PROJECT_FORMAT = "pretty-lattice-project"
PROJECT_VERSION = 1
ATOM_COUNT_THRESHOLD = 1000
SUMMARY_LABEL_WIDTH = 19
SUMMARY_FLOAT_WIDTH = 18
DATA_INDEX_WIDTH = 8
DATA_KEY_WIDTH = 18
DATA_FLOAT_WIDTH = 18


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compare two structures and write a Pretty Lattice .prl file with displacement "
            "arrows. Displacement direction is structure2 - structure1."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Definition:
  displacement = structure2 - structure1
  The .prl project shows structure1 with arrows pointing toward structure2.

Examples:
  %(prog)s POSCAR_1.vasp POSCAR_2.vasp
  %(prog)s STRU_1 STRU_2 -o displacement.prl
  %(prog)s structure1.cif structure2.cif --bond-algorithm cut-off-dict --displacement-data displacement.dat
        """,
    )
    parser.add_argument(
        "structure1",
        help="Structure shown in the .prl project; subtracted from structure2.",
    )
    parser.add_argument(
        "structure2",
        help="Target structure used to compute arrows; displacement = structure2 - structure1.",
    )
    parser.add_argument(
        "-o",
        "--output",
        help=(
            "Output .prl path. Default: <structure1 stem>_displacement.prl, "
            "or <structure1 stem>_displacement_<components>.prl when --components is used."
        ),
    )
    parser.add_argument(
        "--displacement-data",
        default="displacement.dat",
        help="Write displacement table to this path. Use 'none' to disable. Default: displacement.dat",
    )
    parser.add_argument(
        "--bond-algorithm",
        choices=("crystal-nn", "minimum-distance", "cut-off-dict"),
        default=None,
        help="Pretty Lattice bond algorithm: crystal-nn, minimum-distance, or cut-off-dict.",
    )
    parser.add_argument(
        "--max-abs-value",
        type=float,
        default=None,
        help="Actual value represented by normalized arrow length 1. Default: maximum displacement length.",
    )
    parser.add_argument(
        "--head-size",
        type=int,
        default=100,
        help="Atom vector arrow head size percent saved to .prl. Default: 100.",
    )
    parser.add_argument(
        "--length-scale",
        type=int,
        default=100,
        help=(
            "Atom vector display length scale percent saved to .prl. "
            "This changes arrow display length only, not displacement values. Default: 100."
        ),
    )
    parser.add_argument(
        "--line-thickness",
        type=int,
        default=100,
        help="Atom vector line thickness percent saved to .prl. Default: 100.",
    )
    parser.add_argument(
        "--opacity",
        type=int,
        default=100,
        help="Atom vector opacity percent saved to .prl. Default: 100.",
    )
    parser.add_argument(
        "--color",
        default="#ff0000",
        help="Atom vector arrow color saved to .prl as a hex code. Default: #ff0000.",
    )
    parser.add_argument(
        "--fast-scene",
        action="store_true",
        help=(
            "Skip expensive bond, polyhedra, boundary-image, and Brillouin-zone analysis. "
            "Large structures use this automatically unless --full-scene is set."
        ),
    )
    parser.add_argument(
        "--full-scene",
        action="store_true",
        help="Build the full Pretty Lattice scene even for large structures.",
    )
    parser.add_argument(
        "--pretty-json",
        action="store_true",
        help="Write indented JSON. Large structures use compact JSON by default.",
    )
    parser.add_argument(
        "--max-only",
        action="store_true",
        help=(
            "Only print the maximum minimum-image displacement and exit. "
            "For POSCAR/VASP files this uses a lightweight NumPy reader."
        ),
    )
    parser.add_argument(
        "--display-top",
        type=int,
        default=None,
        metavar="N",
        help=(
            "Write only the N atoms with the largest displacement to the .prl scene. "
            "Displacement statistics are still computed from all atoms."
        ),
    )
    parser.add_argument(
        "--display-sample",
        type=int,
        default=None,
        metavar="N",
        help=(
            "Write a spatially uniform density sample of N atoms to the .prl scene. "
            "This is recommended for visualizing global changes in large structures."
        ),
    )
    parser.add_argument(
        "--display-density",
        type=float,
        default=None,
        metavar="D",
        help=(
            "Write a spatially uniform density sample to the .prl scene, where D is "
            "the fraction of atoms to display and must satisfy 0 < D <= 1. "
            "For example, 0.01 displays about 1%% of atoms."
        ),
    )
    parser.add_argument(
        "--components",
        default="xyz",
        metavar="AXES",
        help=(
            "Displacement components to display as arrows. Use any combination of x, y, z, "
            "for example x, xy, xz, or xyz. Default: xyz."
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    component_mask, component_label = parse_components(args.components)
    component_suffix = component_label if components_option_was_used() else None
    structure1_path = Path(args.structure1).expanduser().resolve()
    structure2_path = Path(args.structure2).expanduser().resolve()
    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else default_output_path(structure1_path, component_suffix=component_suffix)
    )
    displacement_data_path = (
        None
        if str(args.displacement_data).lower() in {"", "none", "no", "false"}
        else Path(args.displacement_data).expanduser().resolve()
    )

    for path in (structure1_path, structure2_path):
        if not path.is_file():
            raise SystemExit(f"Error: file does not exist: {path}")

    if args.max_only:
        print_max_only_displacement(structure1_path, structure2_path)
        return

    try:
        structure1 = read_structure(structure1_path)
        structure2 = read_structure(structure2_path)
    except StructureReadError as exc:
        raise SystemExit(f"Error: {exc}") from exc

    validate_structures(structure1, structure2)

    bond_algorithm = normalize_bond_algorithm(args.bond_algorithm)
    selected_bond_algorithm = bond_algorithm or default_bond_algorithm_for_atom_count(
        len(structure1)
    )
    use_fast_scene = args.fast_scene or (
        len(structure1) >= ATOM_COUNT_THRESHOLD and not args.full_scene
    )
    cart_displacements, frac_displacements, lengths = displacement_vectors(
        structure1,
        structure2,
    )
    display_cart_displacements, display_lengths = masked_displacement_vectors(
        cart_displacements,
        component_mask,
    )
    computed_max = max(lengths, default=0.0)
    computed_display_max = max(display_lengths, default=0.0)
    max_abs_value = (
        args.max_abs_value if args.max_abs_value is not None else computed_display_max
    )
    if max_abs_value <= 0:
        max_abs_value = 1.0
    if computed_display_max > max_abs_value * (1.0 + 1e-10):
        raise SystemExit(
            "Error: --max-abs-value is smaller than the maximum displayed displacement length "
            f"({max_abs_value:.10g} < {computed_display_max:.10g})."
        )

    display_indices, display_selection = selected_display_indices(
        structure1=structure1,
        lengths=lengths,
        display_top=args.display_top,
        display_sample=args.display_sample,
        display_density=args.display_density,
    )
    if display_indices is not None:
        use_fast_scene = True
    scene = build_scene_quietly(
        structure1,
        bond_algorithm=selected_bond_algorithm,
        fast_scene=use_fast_scene,
        display_indices=display_indices,
    )
    display_atom_count = len(
        [atom for atom in scene["atoms"] if not atom.get("isPeriodicImage", False)]
    )

    atom_vectors = atom_vector_settings(
        scene=scene,
        cart_displacements=display_cart_displacements,
        max_abs_value=max_abs_value,
        head_size=args.head_size,
        length_scale=args.length_scale,
        line_thickness=args.line_thickness,
        opacity=args.opacity,
        color=args.color,
    )
    project = pretty_lattice_project(
        scene=scene,
        source_name=structure1_path.name,
        bond_algorithm=selected_bond_algorithm,
        atom_vectors=atom_vectors,
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        project_json(project, pretty=args.pretty_json or len(structure1) < ATOM_COUNT_THRESHOLD),
        encoding="utf-8",
    )

    if displacement_data_path is not None:
        write_displacement_data(
            displacement_data_path,
            scene=scene,
            frac_displacements=frac_displacements,
            cart_displacements=cart_displacements,
            vector_displacements=display_cart_displacements,
            lengths=lengths,
            max_abs_value=max_abs_value,
            display_components=component_label,
        )

    print_summary(
        output_path=output_path,
        displacement_data_path=displacement_data_path,
        structure1_path=structure1_path,
        structure2_path=structure2_path,
        atom_count=len(structure1),
        display_atom_count=display_atom_count,
        display_selection=display_selection,
        display_components=component_label,
        computed_max=computed_max,
        computed_display_max=computed_display_max,
        max_abs_value=max_abs_value,
        fast_scene=use_fast_scene,
    )


def default_output_path(structure_path: Path, *, component_suffix: str | None) -> Path:
    suffix = f"_{component_suffix}" if component_suffix else ""
    return structure_path.with_name(f"{structure_path.stem}_displacement{suffix}.prl")


def components_option_was_used() -> bool:
    return any(
        argument == "--components" or argument.startswith("--components=")
        for argument in sys.argv[1:]
    )


def build_scene_quietly(
    structure: Any,
    *,
    bond_algorithm: str,
    fast_scene: bool,
    display_indices: list[int] | None,
) -> dict[str, Any]:
    if fast_scene:
        return build_fast_scene_response(structure, display_indices=display_indices)

    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=r"No oxidation states specified on sites!.*",
            category=UserWarning,
        )
        warnings.filterwarnings(
            "ignore",
            message=r"CrystalNN: cannot locate an appropriate radius.*",
            category=UserWarning,
        )
        return build_scene_response(structure, bond_algorithm=bond_algorithm)


def selected_display_indices(
    *,
    structure1: Any,
    lengths: list[float],
    display_top: int | None,
    display_sample: int | None,
    display_density: float | None,
) -> tuple[list[int] | None, str]:
    selection_count = sum(
        option is not None for option in (display_top, display_sample, display_density)
    )
    if selection_count > 1:
        raise SystemExit(
            "Error: use only one of --display-top, --display-sample, or --display-density."
        )
    if display_density is not None:
        if not 0.0 < display_density <= 1.0:
            raise SystemExit("Error: --display-density must satisfy 0 < D <= 1.")
        atom_count = len(structure1)
        sample_count = max(1, int(round(atom_count * display_density)))
        return (
            selected_spatial_sample_indices(structure1, sample_count),
            f"density {display_density:.6g}",
        )
    if display_sample is not None:
        return selected_spatial_sample_indices(structure1, display_sample), f"sample {display_sample}"
    if display_top is None:
        return None, "all"
    if display_top <= 0:
        raise SystemExit("Error: --display-top must be a positive integer.")
    atom_count = len(lengths)
    if display_top >= atom_count:
        return None, "all"

    length_array = np.asarray(lengths, dtype=float)
    top_indices = np.argpartition(length_array, -display_top)[-display_top:]
    return sorted(int(index) for index in top_indices.tolist()), f"top {display_top}"


def selected_spatial_sample_indices(structure: Any, sample_count: int) -> list[int] | None:
    if sample_count <= 0:
        raise SystemExit("Error: --display-sample must be a positive integer.")
    atom_count = len(structure)
    if sample_count >= atom_count:
        return None

    frac_coords = np.mod(np.asarray(structure.frac_coords, dtype=float), 1.0)
    morton_codes = morton_codes_from_fractional_coords(frac_coords)
    spatial_order = np.argsort(morton_codes, kind="stable")
    sample_positions = np.linspace(0, atom_count - 1, sample_count, dtype=int)
    sampled_indices = spatial_order[sample_positions]
    return sorted(int(index) for index in sampled_indices.tolist())


def morton_codes_from_fractional_coords(frac_coords: np.ndarray) -> np.ndarray:
    quantized = np.floor(np.clip(frac_coords, 0.0, np.nextafter(1.0, 0.0)) * (2**21)).astype(
        np.uint64
    )
    return (
        spread_morton_bits(quantized[:, 0])
        | (spread_morton_bits(quantized[:, 1]) << np.uint64(1))
        | (spread_morton_bits(quantized[:, 2]) << np.uint64(2))
    )


def spread_morton_bits(values: np.ndarray) -> np.ndarray:
    spread = values & np.uint64(0x1FFFFF)
    spread = (spread | (spread << np.uint64(32))) & np.uint64(0x1F00000000FFFF)
    spread = (spread | (spread << np.uint64(16))) & np.uint64(0x1F0000FF0000FF)
    spread = (spread | (spread << np.uint64(8))) & np.uint64(0x100F00F00F00F00F)
    spread = (spread | (spread << np.uint64(4))) & np.uint64(0x10C30C30C30C30C3)
    spread = (spread | (spread << np.uint64(2))) & np.uint64(0x1249249249249249)
    return spread


def parse_components(value: str) -> tuple[tuple[bool, bool, bool], str]:
    normalized = "".join(str(value).lower().replace(",", "").split())
    if not normalized:
        raise SystemExit("Error: --components cannot be empty.")
    if any(axis not in "xyz" for axis in normalized):
        raise SystemExit("Error: --components must contain only x, y, and z.")

    ordered_axes = "".join(axis for axis in "xyz" if axis in normalized)
    if not ordered_axes:
        raise SystemExit("Error: --components must contain at least one of x, y, z.")
    return tuple(axis in ordered_axes for axis in "xyz"), ordered_axes  # type: ignore[return-value]


def masked_displacement_vectors(
    cart_displacements: list[list[float]],
    component_mask: tuple[bool, bool, bool],
) -> tuple[list[list[float]], list[float]]:
    mask = np.array(component_mask, dtype=float)
    values = np.asarray(cart_displacements, dtype=float) * mask
    lengths = np.linalg.norm(values, axis=1)
    return clean_nested_float_list(values), [clean_float(value) for value in lengths.tolist()]


def print_max_only_displacement(structure1_path: Path, structure2_path: Path) -> None:
    try:
        summary = vasp_displacement_summary(structure1_path, structure2_path)
    except ValueError:
        try:
            structure1 = read_structure(structure1_path)
            structure2 = read_structure(structure2_path)
        except StructureReadError as exc:
            raise SystemExit(f"Error: {exc}") from exc
        validate_structures(structure1, structure2)
        summary = structure_displacement_summary(structure1, structure2)

    print("Minimum-image displacement")
    print_summary_row("displacement", "structure2 - structure1")
    print_summary_row("arrow direction", "structure1 -> structure2 (start/reference -> target/result)")
    print_summary_row("atoms", format_int(summary["atom_count"]))
    print_summary_row("max displacement", format_scalar(summary["max_length"], "Angstrom"))
    print_summary_row("atom index", format_int(summary["atom_index"]))
    print_summary_row(
        "element",
        f"{summary['element']:>{SUMMARY_FLOAT_WIDTH}s}  element-index: {summary['element_index']}",
    )
    print_summary_row("frac delta", format_vector(summary["frac_delta"]))
    print_summary_row("cart delta", format_vector(summary["cart_delta"], "Angstrom"))
    print_summary_row(
        "max xy displacement",
        format_scalar(summary["max_xy_length"], "Angstrom"),
    )
    print_summary_row(
        "max xy atom",
        (
            f"{summary['max_xy_atom_index']:>{SUMMARY_FLOAT_WIDTH}d}  {summary['max_xy_element']} "
            f"element-index: {summary['max_xy_element_index']}"
        ),
    )
    print_summary_row(
        "max xy delta",
        format_vector(summary["max_xy_cart_delta"], "Angstrom"),
    )
    print_summary_row(
        "max |cart comp|",
        format_vector(summary["max_abs_cart_delta"], "Angstrom"),
    )
    print_summary_row(
        "max comp atoms",
        format_int_vector(summary["max_abs_cart_delta_atom_indices"]),
    )
    print_summary_row(
        "max |frac delta|",
        format_vector(summary["max_abs_frac_delta"]),
    )
    print_summary_row(
        "cell lengths",
        format_vector(summary["cell_lengths"], "Angstrom"),
    )
    print_summary_row(
        "mean displacement",
        format_scalar(summary["mean_length"], "Angstrom"),
    )
    print_summary_row("p95 displacement", format_scalar(summary["p95_length"], "Angstrom"))


def print_summary_row(label: str, value: str) -> None:
    print(f"  {label:<{SUMMARY_LABEL_WIDTH}} : {value}")


def format_int(value: int) -> str:
    return f"{int(value):>{SUMMARY_FLOAT_WIDTH}d}"


def format_scalar(value: float, unit: str | None = None) -> str:
    formatted = f"{float(value):>{SUMMARY_FLOAT_WIDTH}.12g}"
    return f"{formatted} {unit}" if unit else formatted


def format_vector(values: list[float], unit: str | None = None) -> str:
    formatted = " ".join(f"{float(value):>{SUMMARY_FLOAT_WIDTH}.12g}" for value in values)
    return f"{formatted} {unit}" if unit else formatted


def format_int_vector(values: list[int]) -> str:
    return " ".join(f"{int(value):>{SUMMARY_FLOAT_WIDTH}d}" for value in values)


def vasp_displacement_summary(
    structure1_path: Path,
    structure2_path: Path,
) -> dict[str, Any]:
    lattice1, elements1, counts1, frac_coords1 = read_vasp_fractional_coords(structure1_path)
    lattice2, elements2, counts2, frac_coords2 = read_vasp_fractional_coords(structure2_path)
    if elements1 != elements2 or counts1 != counts2:
        raise SystemExit(
            "Error: atom order or element counts differ: "
            f"{elements1} {counts1} != {elements2} {counts2}"
        )
    if len(frac_coords1) != len(frac_coords2):
        raise SystemExit(
            "Error: the two structures have different atom counts: "
            f"{len(frac_coords1)} != {len(frac_coords2)}"
        )
    if not np.allclose(lattice1, lattice2, rtol=1e-6, atol=1e-8):
        print(
            "Warning: lattice vectors differ; structure1 lattice is used for Cartesian displacements.",
            file=sys.stderr,
        )

    frac_delta_array = minimum_image_frac_delta(frac_coords1, frac_coords2)
    cart_delta_array = frac_delta_array @ lattice1
    lengths = np.linalg.norm(cart_delta_array, axis=1)
    return displacement_summary_from_arrays(
        elements=elements1,
        counts=counts1,
        lattice=lattice1,
        frac_delta_array=frac_delta_array,
        cart_delta_array=cart_delta_array,
        lengths=lengths,
    )


def read_vasp_fractional_coords(path: Path) -> tuple[np.ndarray, list[str], list[int], np.ndarray]:
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    if len(lines) < 8:
        raise ValueError("not enough lines for a VASP structure")

    scale_values = [float(value) for value in lines[1].split()]
    if not scale_values:
        raise ValueError("missing VASP scale")
    scale = scale_values[0]
    lattice = np.array(
        [[float(value) for value in lines[index].split()[:3]] for index in range(2, 5)],
        dtype=float,
    )
    if scale < 0:
        current_volume = abs(float(np.linalg.det(lattice)))
        coordinate_scale = (-scale / current_volume) ** (1.0 / 3.0)
        lattice *= coordinate_scale
    else:
        coordinate_scale = scale
        lattice *= scale

    species_or_counts = lines[5].split()
    if all(is_integer_token(value) for value in species_or_counts):
        elements = [f"X{index + 1}" for index in range(len(species_or_counts))]
        counts = [int(value) for value in species_or_counts]
        mode_index = 6
    else:
        elements = species_or_counts
        counts = [int(value) for value in lines[6].split()]
        mode_index = 7

    mode = lines[mode_index].strip().lower()
    if mode.startswith("s"):
        mode_index += 1
        mode = lines[mode_index].strip().lower()

    atom_count = sum(counts)
    coord_start = mode_index + 1
    coord_lines = lines[coord_start : coord_start + atom_count]
    if len(coord_lines) != atom_count:
        raise ValueError("VASP coordinate block is shorter than atom count")
    coords = np.array(
        [[float(value) for value in line.split()[:3]] for line in coord_lines],
        dtype=float,
    )
    if mode.startswith(("c", "k")):
        coords = (coords * coordinate_scale) @ np.linalg.inv(lattice)
    elif not mode.startswith("d"):
        raise ValueError(f"unsupported VASP coordinate mode: {mode}")

    return lattice, elements, counts, coords


def structure_displacement_summary(structure1: Any, structure2: Any) -> dict[str, Any]:
    frac_delta_array = minimum_image_frac_delta(
        np.asarray(structure1.frac_coords, dtype=float),
        np.asarray(structure2.frac_coords, dtype=float),
    )
    cart_delta_array = frac_delta_array @ np.asarray(structure1.lattice.matrix, dtype=float)
    lengths = np.linalg.norm(cart_delta_array, axis=1)
    elements: list[str] = []
    counts: list[int] = []
    for site in structure1:
        element = site_element(site)
        if elements and elements[-1] == element:
            counts[-1] += 1
        else:
            elements.append(element)
            counts.append(1)
    return displacement_summary_from_arrays(
        elements=elements,
        counts=counts,
        lattice=np.asarray(structure1.lattice.matrix, dtype=float),
        frac_delta_array=frac_delta_array,
        cart_delta_array=cart_delta_array,
        lengths=lengths,
    )


def displacement_summary_from_arrays(
    *,
    elements: list[str],
    counts: list[int],
    lattice: np.ndarray,
    frac_delta_array: np.ndarray,
    cart_delta_array: np.ndarray,
    lengths: np.ndarray,
) -> dict[str, Any]:
    max_index = int(np.argmax(lengths)) if len(lengths) else 0
    xy_lengths = np.linalg.norm(cart_delta_array[:, :2], axis=1) if len(lengths) else lengths
    max_xy_index = int(np.argmax(xy_lengths)) if len(lengths) else 0
    max_component_indices = (
        np.argmax(np.abs(cart_delta_array), axis=0).astype(int).tolist()
        if len(lengths)
        else [0, 0, 0]
    )
    max_element, max_element_index = element_and_index(max_index, elements, counts)
    max_xy_element, max_xy_element_index = element_and_index(max_xy_index, elements, counts)
    return {
        "atom_count": int(len(lengths)),
        "max_length": float(lengths[max_index]) if len(lengths) else 0.0,
        "atom_index": max_index + 1 if len(lengths) else 0,
        "element": max_element,
        "element_index": max_element_index,
        "frac_delta": [clean_float(value) for value in frac_delta_array[max_index].tolist()]
        if len(lengths)
        else [0.0, 0.0, 0.0],
        "cart_delta": [clean_float(value) for value in cart_delta_array[max_index].tolist()]
        if len(lengths)
        else [0.0, 0.0, 0.0],
        "max_xy_length": float(xy_lengths[max_xy_index]) if len(lengths) else 0.0,
        "max_xy_atom_index": max_xy_index + 1 if len(lengths) else 0,
        "max_xy_element": max_xy_element,
        "max_xy_element_index": max_xy_element_index,
        "max_xy_cart_delta": [
            clean_float(value) for value in cart_delta_array[max_xy_index, :2].tolist()
        ]
        if len(lengths)
        else [0.0, 0.0],
        "max_abs_cart_delta": [
            clean_float(cart_delta_array[index, axis])
            for axis, index in enumerate(max_component_indices)
        ]
        if len(lengths)
        else [0.0, 0.0, 0.0],
        "max_abs_cart_delta_atom_indices": [
            index + 1 for index in max_component_indices
        ],
        "max_abs_frac_delta": [
            clean_float(value)
            for value in np.max(np.abs(frac_delta_array), axis=0).tolist()
        ]
        if len(lengths)
        else [0.0, 0.0, 0.0],
        "cell_lengths": [
            clean_float(value)
            for value in np.linalg.norm(np.asarray(lattice, dtype=float), axis=1).tolist()
        ],
        "mean_length": float(np.mean(lengths)) if len(lengths) else 0.0,
        "p95_length": float(np.percentile(lengths, 95)) if len(lengths) else 0.0,
    }


def element_and_index(atom_index_zero_based: int, elements: list[str], counts: list[int]) -> tuple[str, int]:
    if not elements or not counts:
        return "-", 0
    cumulative_counts = np.cumsum(counts)
    element_index = int(np.searchsorted(cumulative_counts, atom_index_zero_based, side="right"))
    previous_count = 0 if element_index == 0 else int(cumulative_counts[element_index - 1])
    return elements[element_index], atom_index_zero_based - previous_count + 1


def build_fast_scene_response(
    structure: Any,
    *,
    display_indices: list[int] | None,
) -> dict[str, Any]:
    cell_vectors = [
        [clean_float(value) for value in vector]
        for vector in np.asarray(structure.lattice.matrix, dtype=float).tolist()
    ]
    frac_coords = np.asarray(structure.frac_coords, dtype=float)
    cart_coords = np.asarray(structure.cart_coords, dtype=float)
    atom_indices = display_indices if display_indices is not None else range(len(structure))

    atoms = []
    for index in atom_indices:
        site = structure[index]
        frac = frac_coords[index]
        cart = cart_coords[index]
        element = site_element(site)
        site_id = f"{element}-{index}"
        atoms.append(
            {
                "id": site_id,
                "siteId": site_id,
                "siteIndex": index,
                "element": element,
                "position": [clean_float(value) for value in cart.tolist()],
                "fractionalPosition": [clean_float(value) for value in frac.tolist()],
                "imageOffset": [0, 0, 0],
                "isPeriodicImage": False,
                "imageReasons": [],
                "visibilityDependencies": [],
                "visibilityDependencyGroups": [],
            }
        )

    summary = build_structure_summary(structure)
    summary["atomCount"] = len(atoms)
    warnings = [
        {
            "code": "fast-scene",
            "message": (
                "Fast scene skipped bond, polyhedra, boundary-image, "
                "and Brillouin-zone analysis."
            ),
        }
    ]
    if display_indices is not None:
        warnings.append(
            {
                "code": "display-subset",
                "message": (
                    f"Scene contains {len(atoms)} atoms selected from "
                    f"{len(structure)} total atoms."
                ),
            }
        )

    return {
        "cell": {"vectors": cell_vectors},
        "atoms": atoms,
        "bonds": [],
        "polyhedra": [],
        "summary": summary,
        "warnings": warnings,
    }


def project_json(project: dict[str, Any], *, pretty: bool) -> str:
    if pretty:
        return json.dumps(project, indent=2, ensure_ascii=False) + "\n"
    return json.dumps(project, ensure_ascii=False, separators=(",", ":")) + "\n"


def print_summary(
    *,
    output_path: Path,
    displacement_data_path: Path | None,
    structure1_path: Path,
    structure2_path: Path,
    atom_count: int,
    display_atom_count: int,
    display_selection: str,
    display_components: str,
    computed_max: float,
    computed_display_max: float,
    max_abs_value: float,
    fast_scene: bool,
) -> None:
    rows = [
        ("project file", display_path(output_path)),
        ("data file", display_path(displacement_data_path) if displacement_data_path else "disabled"),
        ("structure1", display_path(structure1_path)),
        ("structure2", display_path(structure2_path)),
        ("displacement", "structure2 - structure1"),
        ("arrow direction", "structure1 -> structure2 (start/reference -> target/result)"),
        ("atoms", format_int(atom_count)),
        ("display atoms", format_int(display_atom_count)),
        ("display mode", display_selection),
        ("components", display_components),
        ("scene", "fast" if fast_scene else "full"),
        ("max |d| all", format_scalar(computed_max, "Angstrom")),
        ("max |d| shown", format_scalar(computed_display_max, "Angstrom")),
        ("maxAbsValue", format_scalar(max_abs_value, "Angstrom")),
    ]

    print("Pretty Lattice displacement")
    for label, value in rows:
        print_summary_row(label, value)


def display_path(path: Path) -> str:
    try:
        relative = path.relative_to(Path.cwd())
    except ValueError:
        try:
            relative = path.relative_to(Path.cwd().resolve())
        except ValueError:
            return str(path)
    return str(relative) if str(relative) else path.name


def validate_structures(structure1: Any, structure2: Any) -> None:
    if len(structure1) != len(structure2):
        raise SystemExit(
            "Error: the two structures have different atom counts: "
            f"{len(structure1)} != {len(structure2)}"
        )

    for index, (structure1_site, structure2_site) in enumerate(
        zip(structure1, structure2, strict=True),
        start=1,
    ):
        structure1_element = site_element(structure1_site)
        structure2_element = site_element(structure2_site)
        if structure1_element != structure2_element:
            raise SystemExit(
                "Error: atom order or element differs at atom "
                f"{index}: {structure1_element} != {structure2_element}"
            )

    if not np.allclose(
        structure1.lattice.matrix,
        structure2.lattice.matrix,
        rtol=1e-6,
        atol=1e-8,
    ):
        print(
            "Warning: lattice vectors differ; structure1 lattice is used for Cartesian displacements.",
            file=sys.stderr,
        )


def displacement_vectors(
    structure1: Any,
    structure2: Any,
) -> tuple[list[list[float]], list[list[float]], list[float]]:
    lattice = np.array(structure1.lattice.matrix, dtype=float)
    frac_delta_array = minimum_image_frac_delta(
        np.asarray(structure1.frac_coords, dtype=float),
        np.asarray(structure2.frac_coords, dtype=float),
    )
    cart_delta_array = frac_delta_array @ lattice
    length_array = np.linalg.norm(cart_delta_array, axis=1)

    frac_displacements = clean_nested_float_list(frac_delta_array)
    cart_displacements = clean_nested_float_list(cart_delta_array)
    lengths = [clean_float(value) for value in length_array.tolist()]

    return cart_displacements, frac_displacements, lengths


def atom_vector_settings(
    *,
    scene: dict[str, Any],
    cart_displacements: list[list[float]],
    max_abs_value: float,
    head_size: int,
    length_scale: int,
    line_thickness: int,
    opacity: int,
    color: str,
) -> dict[str, Any]:
    values: dict[str, list[float]] = {}
    canonical_atoms = sorted(
        [atom for atom in scene["atoms"] if not atom.get("isPeriodicImage", False)],
        key=lambda atom: atom["siteIndex"],
    )
    keys_by_site_index = atom_vector_keys_by_site_index(canonical_atoms)

    for atom in canonical_atoms:
        site_index = int(atom["siteIndex"])
        key = keys_by_site_index[site_index]
        displacement = cart_displacements[site_index]
        values[key] = [
            clamp_normalized_component(value / max_abs_value)
            for value in displacement
        ]

    return {
        "color": normalize_hex_color(color),
        "enabled": any(any(abs(component) > 1e-12 for component in vector) for vector in values.values()),
        "headSize": clamp_int(head_size, 25, 300),
        "lengthScale": clamp_int(length_scale, 25, 500),
        "lineThickness": clamp_int(line_thickness, 25, 300),
        "maxAbsValue": clean_float(max_abs_value),
        "opacity": clamp_int(opacity, 0, 100),
        "values": values,
    }


def normalize_hex_color(value: str) -> str:
    stripped_value = str(value).strip()
    color_value = stripped_value[1:] if stripped_value.startswith("#") else stripped_value
    if len(color_value) == 3 and all(character in "0123456789abcdefABCDEF" for character in color_value):
        return "#" + "".join(character * 2 for character in color_value).lower()
    if len(color_value) == 6 and all(character in "0123456789abcdefABCDEF" for character in color_value):
        return f"#{color_value.lower()}"
    return "#ff0000"


def pretty_lattice_project(
    *,
    scene: dict[str, Any],
    source_name: str,
    bond_algorithm: str,
    atom_vectors: dict[str, Any],
) -> dict[str, Any]:
    return {
        "display": {
            "opacity": {
                "atoms": 100,
                "unitCell": 100,
                "bonds": 100,
                "polyhedra": 75,
            },
            "previewMeshQuality": "low"
            if scene["summary"]["atomCount"] >= ATOM_COUNT_THRESHOLD
            else "medium",
            "showCrystalAxisLabels": True,
            "style": default_style(),
            "unitCellLineStyle": "solid",
            "visibility": {
                "atoms": True,
                "atomLabels": {
                    "atomIds": [],
                    "elements": {},
                    "enabled": False,
                    "kind": "element",
                    "mode": "all",
                    "size": 75,
                },
                "unitCell": True,
                "bonds": bool(scene.get("bonds")),
                "polyhedra": bool(scene.get("polyhedra")),
                "boundaryAtoms": True,
                "oneHopBondedAtoms": True,
            },
        },
        "export": {
            "settings": default_export_settings(),
        },
        "format": PROJECT_FORMAT,
        "overlays": {
            "atomVectors": atom_vectors,
        },
        "source": {
            "bondAlgorithm": bond_algorithm,
            "name": source_name,
        },
        "structure": {
            "scene": scene,
        },
        "version": PROJECT_VERSION,
        "view": default_view_state(),
    }


def default_style() -> dict[str, Any]:
    return {
        "atomRadius": 40,
        "atomRadiusModel": "uniform",
        "bondColor": "#d2d2d2",
        "bondColorMode": "bicolor",
        "bondThickness": 100,
        "colorScheme": "vesta-soft",
        "colorSchemeMode": "preset",
        "customColormap": None,
        "distinguishSimilarColors": True,
        "fogAffectsUnitCell": False,
        "fogAmount": 40,
        "fogEnabled": True,
        "fogStart": 40,
        "materialPreset": "modern-matte",
    }


def default_export_settings() -> dict[str, Any]:
    return {
        "aspectRatioLocked": False,
        "background": "transparent",
        "combineComponents": True,
        "components": {
            "legend": False,
            "crystalAxes": False,
            "structure": True,
        },
        "format": "png",
        "height": 2000,
        "legendLayout": "horizontal",
        "meshQuality": "high",
        "pixelsPerProjectedUnit": None,
        "supersampling": 2,
        "width": 2000,
    }


def default_view_state() -> dict[str, Any]:
    return {
        "camera": {
            "direct": [0, 0, 1],
            "primary": "outward",
            "reciprocal": [0, 0, 1],
            "secondary": "upward",
            "rollDegrees": 0,
        },
        "dragSensitivity": 1,
        "interactionLocked": False,
        "interactionMode": "trackball",
        "lightStrength": 1,
        "resetCounter": 0,
        "showFpsOverlay": False,
        "viewScale": 0.75,
    }


def write_displacement_data(
    path: Path,
    *,
    scene: dict[str, Any],
    frac_displacements: list[list[float]],
    cart_displacements: list[list[float]],
    vector_displacements: list[list[float]],
    lengths: list[float],
    max_abs_value: float,
    display_components: str,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    canonical_atoms = sorted(
        [atom for atom in scene["atoms"] if not atom.get("isPeriodicImage", False)],
        key=lambda atom: atom["siteIndex"],
    )
    keys_by_site_index = atom_vector_keys_by_site_index(canonical_atoms)
    total = sum(lengths)
    max_length = max(lengths, default=0.0)
    max_atom = lengths.index(max_length) + 1 if lengths else 0

    with path.open("w", encoding="utf-8") as stream:
        stream.write("# Pretty Lattice displacement data\n")
        stream.write("# displacement     = structure2 - structure1\n")
        stream.write("# arrow_direction  = structure1 -> structure2 (start/reference -> target/result)\n")
        stream.write(f"# {'components':<16s} = {display_components:>{DATA_FLOAT_WIDTH}s}\n")
        stream.write(f"# {'maxAbsValue':<16s} = {max_abs_value:>{DATA_FLOAT_WIDTH}.12g}\n")
        stream.write(displacement_data_header())
        for atom in canonical_atoms:
            site_index = int(atom["siteIndex"])
            cart = cart_displacements[site_index]
            frac = frac_displacements[site_index]
            vector = vector_displacements[site_index]
            normalized = [component / max_abs_value for component in vector]
            key = keys_by_site_index[site_index]
            stream.write(displacement_data_row(site_index + 1, key, frac, cart, lengths[site_index], normalized))
        stream.write("#\n")
        stream.write(f"# {'atoms':<16s} = {len(lengths):>{DATA_FLOAT_WIDTH}d}\n")
        stream.write(
            f"# {'average_length':<16s} = "
            f"{total / len(lengths) if lengths else 0.0:>{DATA_FLOAT_WIDTH}.12g}\n"
        )
        stream.write(
            f"# {'max_length':<16s} = {max_length:>{DATA_FLOAT_WIDTH}.12g} "
            f"atom = {max_atom:>{DATA_INDEX_WIDTH}d}\n"
        )
        stream.write(f"# {'total_length':<16s} = {total:>{DATA_FLOAT_WIDTH}.12g}\n")


def displacement_data_header() -> str:
    columns = [
        f"{'index':>{DATA_INDEX_WIDTH}s}",
        f"{'key':>{DATA_KEY_WIDTH}s}",
        f"{'frac_dx':>{DATA_FLOAT_WIDTH}s}",
        f"{'frac_dy':>{DATA_FLOAT_WIDTH}s}",
        f"{'frac_dz':>{DATA_FLOAT_WIDTH}s}",
        f"{'cart_dx':>{DATA_FLOAT_WIDTH}s}",
        f"{'cart_dy':>{DATA_FLOAT_WIDTH}s}",
        f"{'cart_dz':>{DATA_FLOAT_WIDTH}s}",
        f"{'length':>{DATA_FLOAT_WIDTH}s}",
        f"{'norm_dx':>{DATA_FLOAT_WIDTH}s}",
        f"{'norm_dy':>{DATA_FLOAT_WIDTH}s}",
        f"{'norm_dz':>{DATA_FLOAT_WIDTH}s}",
    ]
    return "# " + " ".join(columns) + "\n"


def displacement_data_row(
    index: int,
    key: str,
    frac: list[float],
    cart: list[float],
    length: float,
    normalized: list[float],
) -> str:
    values = [
        f"{index:{DATA_INDEX_WIDTH}d}",
        f"{key:>{DATA_KEY_WIDTH}s}",
        *(f"{value:>{DATA_FLOAT_WIDTH}.10e}" for value in frac),
        *(f"{value:>{DATA_FLOAT_WIDTH}.10e}" for value in cart),
        f"{length:>{DATA_FLOAT_WIDTH}.10e}",
        *(f"{value:>{DATA_FLOAT_WIDTH}.10e}" for value in normalized),
    ]
    return "  " + " ".join(values) + "\n"


def atom_vector_keys_by_site_index(canonical_atoms: list[dict[str, Any]]) -> dict[int, str]:
    element_counts: dict[str, int] = {}
    keys_by_site_index: dict[int, str] = {}
    for index, candidate in enumerate(canonical_atoms, start=1):
        element = str(candidate["element"])
        element_counts[element] = element_counts.get(element, 0) + 1
        keys_by_site_index[int(candidate["siteIndex"])] = (
            f"{index}-{element}-{element_counts[element]}"
        )
    return keys_by_site_index


def atom_vector_key(atom: dict[str, Any], canonical_atoms: list[dict[str, Any]]) -> str:
    keys_by_site_index = atom_vector_keys_by_site_index(canonical_atoms)
    site_index = int(atom["siteIndex"])
    if site_index in keys_by_site_index:
        return keys_by_site_index[site_index]
    element = str(atom["element"])
    return f"{site_index + 1}-{element}-1"


def site_element(site: Any) -> str:
    try:
        specie = site.specie
    except AttributeError:
        specie = max(site.species.items(), key=lambda item: float(item[1]))[0]
    symbol = getattr(specie, "symbol", str(specie))
    normalized = str(symbol).strip()
    return normalized[0].upper() + normalized[1:].lower()


def is_integer_token(value: str) -> bool:
    try:
        int(value)
    except ValueError:
        return False
    return True


def minimum_image_frac_delta(frac_coords1: np.ndarray, frac_coords2: np.ndarray) -> np.ndarray:
    frac_delta = np.asarray(frac_coords2, dtype=float) - np.asarray(frac_coords1, dtype=float)
    return frac_delta - np.round(frac_delta)


def clamp_normalized_component(value: float) -> float:
    return clean_float(min(1.0, max(-1.0, value)))


def clamp_int(value: int, lower: int, upper: int) -> int:
    return min(upper, max(lower, int(round(value))))


def clean_float(value: float) -> float:
    numeric = float(value)
    if math.isclose(numeric, 0.0, abs_tol=1e-14):
        return 0.0
    return numeric


def clean_nested_float_list(values: np.ndarray) -> list[list[float]]:
    cleaned = np.asarray(values, dtype=float).copy()
    cleaned[np.isclose(cleaned, 0.0, atol=1e-14, rtol=0.0)] = 0.0
    return cleaned.tolist()


if __name__ == "__main__":
    main()
