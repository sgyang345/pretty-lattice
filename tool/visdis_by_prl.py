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


PROJECT_FORMAT = "pretty-lattice-project"
PROJECT_VERSION = 1
ATOM_COUNT_THRESHOLD = 1000


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
        help="Output .prl path. Default: <structure1 stem>_displacement.prl",
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
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    structure1_path = Path(args.structure1).expanduser().resolve()
    structure2_path = Path(args.structure2).expanduser().resolve()
    output_path = (
        Path(args.output).expanduser().resolve()
        if args.output
        else structure1_path.with_name(f"{structure1_path.stem}_displacement.prl")
    )
    displacement_data_path = (
        None
        if str(args.displacement_data).lower() in {"", "none", "no", "false"}
        else Path(args.displacement_data).expanduser().resolve()
    )

    for path in (structure1_path, structure2_path):
        if not path.is_file():
            raise SystemExit(f"Error: file does not exist: {path}")

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
    scene = build_scene_quietly(
        structure1,
        bond_algorithm=selected_bond_algorithm,
    )

    cart_displacements, frac_displacements, lengths = displacement_vectors(
        structure1,
        structure2,
    )
    computed_max = max(lengths, default=0.0)
    max_abs_value = args.max_abs_value if args.max_abs_value is not None else computed_max
    if max_abs_value <= 0:
        max_abs_value = 1.0
    if computed_max > max_abs_value * (1.0 + 1e-10):
        raise SystemExit(
            "Error: --max-abs-value is smaller than the maximum displacement length "
            f"({max_abs_value:.10g} < {computed_max:.10g})."
        )

    atom_vectors = atom_vector_settings(
        scene=scene,
        cart_displacements=cart_displacements,
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
    output_path.write_text(json.dumps(project, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    if displacement_data_path is not None:
        write_displacement_data(
            displacement_data_path,
            scene=scene,
            frac_displacements=frac_displacements,
            cart_displacements=cart_displacements,
            lengths=lengths,
            max_abs_value=max_abs_value,
        )

    print_summary(
        output_path=output_path,
        displacement_data_path=displacement_data_path,
        structure1_path=structure1_path,
        structure2_path=structure2_path,
        atom_count=len(structure1),
        computed_max=computed_max,
        max_abs_value=max_abs_value,
    )


def build_scene_quietly(structure: Any, *, bond_algorithm: str) -> dict[str, Any]:
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


def print_summary(
    *,
    output_path: Path,
    displacement_data_path: Path | None,
    structure1_path: Path,
    structure2_path: Path,
    atom_count: int,
    computed_max: float,
    max_abs_value: float,
) -> None:
    rows = [
        ("project file", display_path(output_path)),
        ("data file", display_path(displacement_data_path) if displacement_data_path else "disabled"),
        ("structure1", display_path(structure1_path)),
        ("structure2", display_path(structure2_path)),
        ("direction", "structure2 - structure1"),
        ("atoms", str(atom_count)),
        ("max |d|", f"{computed_max:.10g}"),
        ("maxAbsValue", f"{max_abs_value:.10g}"),
    ]
    label_width = max(len(label) for label, _value in rows)

    print("Pretty Lattice displacement")
    for label, value in rows:
        print(f"  {label:<{label_width}} : {value}")


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
    cart_displacements: list[list[float]] = []
    frac_displacements: list[list[float]] = []
    lengths: list[float] = []

    for structure1_site, structure2_site in zip(
        structure1,
        structure2,
        strict=True,
    ):
        frac_delta = np.array(structure2_site.frac_coords - structure1_site.frac_coords, dtype=float)
        frac_delta = frac_delta - np.round(frac_delta)
        cart_delta = frac_delta @ lattice
        length = float(np.linalg.norm(cart_delta))

        frac_displacements.append([clean_float(value) for value in frac_delta.tolist()])
        cart_displacements.append([clean_float(value) for value in cart_delta.tolist()])
        lengths.append(clean_float(length))

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

    for atom in canonical_atoms:
        site_index = int(atom["siteIndex"])
        key = atom_vector_key(atom, canonical_atoms)
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
                "bonds": True,
                "polyhedra": False,
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
    lengths: list[float],
    max_abs_value: float,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    canonical_atoms = sorted(
        [atom for atom in scene["atoms"] if not atom.get("isPeriodicImage", False)],
        key=lambda atom: atom["siteIndex"],
    )
    total = sum(lengths)
    max_length = max(lengths, default=0.0)
    max_atom = lengths.index(max_length) + 1 if lengths else 0

    with path.open("w", encoding="utf-8") as stream:
        stream.write("# Pretty Lattice displacement data\n")
        stream.write(f"# maxAbsValue = {max_abs_value:.12g}\n")
        stream.write(
            "# index key frac_dx frac_dy frac_dz cart_dx cart_dy cart_dz length "
            "norm_dx norm_dy norm_dz\n"
        )
        for atom in canonical_atoms:
            site_index = int(atom["siteIndex"])
            cart = cart_displacements[site_index]
            frac = frac_displacements[site_index]
            normalized = [component / max_abs_value for component in cart]
            key = atom_vector_key(atom, canonical_atoms)
            stream.write(
                f"{site_index + 1:6d} {key:>16s} "
                f"{frac[0]: .10e} {frac[1]: .10e} {frac[2]: .10e} "
                f"{cart[0]: .10e} {cart[1]: .10e} {cart[2]: .10e} "
                f"{lengths[site_index]: .10e} "
                f"{normalized[0]: .10e} {normalized[1]: .10e} {normalized[2]: .10e}\n"
            )
        stream.write("#\n")
        stream.write(f"# atoms = {len(lengths)}\n")
        stream.write(f"# average_length = {total / len(lengths) if lengths else 0.0:.12g}\n")
        stream.write(f"# max_length = {max_length:.12g} atom = {max_atom}\n")
        stream.write(f"# total_length = {total:.12g}\n")


def atom_vector_key(atom: dict[str, Any], canonical_atoms: list[dict[str, Any]]) -> str:
    element_counts: dict[str, int] = {}
    for index, candidate in enumerate(canonical_atoms, start=1):
        element = str(candidate["element"])
        element_counts[element] = element_counts.get(element, 0) + 1
        if candidate["siteId"] == atom["siteId"]:
            return f"{index}-{element}-{element_counts[element]}"
    element = str(atom["element"])
    return f"{int(atom['siteIndex']) + 1}-{element}-1"


def site_element(site: Any) -> str:
    try:
        specie = site.specie
    except AttributeError:
        specie = max(site.species.items(), key=lambda item: float(item[1]))[0]
    symbol = getattr(specie, "symbol", str(specie))
    normalized = str(symbol).strip()
    return normalized[0].upper() + normalized[1:].lower()


def clamp_normalized_component(value: float) -> float:
    return clean_float(min(1.0, max(-1.0, value)))


def clamp_int(value: int, lower: int, upper: int) -> int:
    return min(upper, max(lower, int(round(value))))


def clean_float(value: float) -> float:
    numeric = float(value)
    if math.isclose(numeric, 0.0, abs_tol=1e-14):
        return 0.0
    return numeric


if __name__ == "__main__":
    main()
