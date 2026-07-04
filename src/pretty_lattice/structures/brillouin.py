from __future__ import annotations

from collections.abc import Iterable

from pymatgen.core import Structure
from pymatgen.symmetry.bandstructure import HighSymmKpath

from pretty_lattice.structures.periodic_images import vector3
from pretty_lattice.structures.schema import BrillouinZoneSpec


def build_brillouin_zone(structure: Structure) -> BrillouinZoneSpec:
    reciprocal_lattice = structure.lattice.reciprocal_lattice
    faces = [
        [vector3(vertex) for vertex in face]
        for face in structure.lattice.get_brillouin_zone()
    ]
    kpath = HighSymmKpath(structure).kpath
    raw_kpoints = kpath.get("kpoints", {})
    kpoints = []
    for label in sorted(raw_kpoints):
        fractional = vector3(raw_kpoints[label])
        cartesian = vector3(reciprocal_lattice.get_cartesian_coords(fractional))
        display_label = _display_kpoint_label(label)
        kpoints.append(
            {
                "id": display_label,
                "label": display_label,
                "fractional": fractional,
                "cartesian": cartesian,
            }
        )

    return {
        "basis": [vector3(vector) for vector in reciprocal_lattice.matrix],
        "faces": faces,
        "edges": _unique_edges(faces),
        "kpoints": kpoints,
        "path": _path_segments(kpath.get("path", [])),
    }


def _display_kpoint_label(label: str) -> str:
    return label.replace("\\Gamma", "Γ")


def _path_segments(path: object) -> list[dict[str, str]]:
    if not isinstance(path, list):
        return []

    segments = []
    for branch in path:
        if not isinstance(branch, list):
            continue
        labels = [_display_kpoint_label(str(label)) for label in branch]
        for start, end in zip(labels, labels[1:]):
            segments.append({"start": start, "end": end})
    return segments


def _unique_edges(faces: Iterable[list[list[float]]]) -> list[dict[str, list[float]]]:
    edges_by_key: dict[tuple[tuple[float, float, float], tuple[float, float, float]], dict[str, list[float]]] = {}
    for face in faces:
        if len(face) < 2:
            continue
        for start, end in zip(face, [*face[1:], face[0]]):
            start_key = _vertex_key(start)
            end_key = _vertex_key(end)
            key = tuple(sorted((start_key, end_key)))
            edges_by_key[key] = {"start": start, "end": end}
    return list(edges_by_key.values())


def _vertex_key(vertex: list[float]) -> tuple[float, float, float]:
    return tuple(round(coordinate, 10) for coordinate in vertex)  # type: ignore[return-value]
