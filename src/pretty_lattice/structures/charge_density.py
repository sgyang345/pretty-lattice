from __future__ import annotations

import math
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import numpy as np
from pymatgen.core import Structure
from pymatgen.io.vasp.outputs import Chgcar

from pretty_lattice.structures.schema import ChargeDensitySpec

MAX_CHARGE_DENSITY_SAMPLES = 12000
MAX_CHARGE_DENSITY_GRID_VALUES = 500_000
MAX_CHARGE_DENSITY_AXIS_POINTS = 256
CHARGE_DENSITY_PERCENTILE = 80.0
BOHR_RADIUS_ANGSTROM = 0.529177210903
ANGSTROM3_PER_BOHR3 = BOHR_RADIUS_ANGSTROM**3


class ChargeDensityReadError(ValueError):
    """Raised when a charge-density file cannot be parsed."""


def is_charge_density_filename(filename: str | Path | None) -> bool:
    if filename is None:
        return False

    name = Path(str(filename)).name.lower()
    return name == "chgcar" or name.startswith(
        ("chgcar.", "chgcar_", "chgcar-", "parchg", "aeccar")
    )


def looks_like_charge_density_file(path: str | Path) -> bool:
    try:
        payload = Path(path).read_bytes()
    except OSError:
        return False

    return looks_like_charge_density_bytes(payload)


def looks_like_charge_density_bytes(payload: bytes) -> bool:
    if not payload:
        return False

    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        return False

    return _looks_like_vasp_volumetric_text(text)


def read_charge_density_file(path: str | Path) -> tuple[Structure, ChargeDensitySpec]:
    density_path = Path(path)
    try:
        volumetric = Chgcar.from_file(density_path)
    except Exception as exc:
        raise ChargeDensityReadError(
            f"Could not parse charge density file {density_path.name}: {exc}"
        ) from exc

    return volumetric.structure, charge_density_spec_from_volumetric(
        volumetric,
        source=density_path.name,
    )


def read_charge_density_bytes(
    payload: bytes,
    *,
    filename: str | None = None,
) -> tuple[Structure, ChargeDensitySpec]:
    if not payload:
        raise ChargeDensityReadError("Uploaded charge density file is empty.")

    safe_name = _safe_upload_name(filename or "CHGCAR")
    try:
        with TemporaryDirectory(prefix="pretty-lattice-density-") as temp_dir:
            density_path = Path(temp_dir) / safe_name
            density_path.write_bytes(payload)
            return read_charge_density_file(density_path)
    except ChargeDensityReadError:
        raise
    except Exception as exc:
        display_name = filename or "uploaded charge density"
        raise ChargeDensityReadError(f"Could not parse {display_name}: {exc}") from exc


def charge_density_spec_from_volumetric(
    volumetric: Any,
    *,
    source: str,
) -> ChargeDensitySpec:
    mode, raw_values = _preferred_density_values(volumetric.data)
    cell_volume = max(float(volumetric.structure.lattice.volume), 1e-12)
    values = raw_values * ANGSTROM3_PER_BOHR3 / cell_volume
    grid_shape = [int(axis) for axis in values.shape]
    sampled_values, offset, stride = _sample_grid(values)
    sample_positions, sample_values, threshold, total_candidate_count = _density_samples(
        sampled_values,
        offset=offset,
        original_shape=values.shape,
        stride=stride,
        lattice_matrix=np.asarray(volumetric.structure.lattice.matrix, dtype=float),
    )
    min_value = float(np.nanmin(values))
    max_value = float(np.nanmax(values))

    return {
        "source": source,
        "grid": grid_shape,
        "dataGrid": [int(axis) for axis in sampled_values.shape],
        "dataOrigin": [int(axis_offset) for axis_offset in offset],
        "dataStride": [int(axis_stride) for axis_stride in stride],
        "mode": mode,
        "unit": "e/a0^3",
        "isoValue": _clean_float(threshold),
        "min": _clean_float(min_value),
        "max": _clean_float(max_value),
        "sampleCount": len(sample_values),
        "scalarValues": [
            _clean_float(value) for value in sampled_values.ravel(order="C").tolist()
        ],
        "totalCandidateCount": total_candidate_count,
        "positions": sample_positions,
        "values": sample_values,
        "voxelSize": _clean_float(_voxel_size(volumetric.structure, values.shape, stride)),
    }


def _preferred_density_values(data: dict[str, Any]) -> tuple[str, np.ndarray]:
    if "total" in data:
        return "total", _finite_array(data["total"])

    if not data:
        raise ChargeDensityReadError("Charge density file contains no volumetric data.")

    mode, values = next(iter(data.items()))
    return str(mode), _finite_array(values)


def _finite_array(values: Any) -> np.ndarray:
    array = np.asarray(values, dtype=float)
    if array.ndim != 3:
        raise ChargeDensityReadError("Charge density data must be a three-dimensional grid.")
    if array.size == 0:
        raise ChargeDensityReadError("Charge density grid is empty.")
    if not np.isfinite(array).any():
        raise ChargeDensityReadError("Charge density grid contains no finite values.")

    return np.nan_to_num(array, nan=0.0, posinf=0.0, neginf=0.0)


def _sample_grid(
    values: np.ndarray,
) -> tuple[np.ndarray, tuple[int, int, int], tuple[int, int, int]]:
    scale = max(
        1.0,
        (values.size / MAX_CHARGE_DENSITY_GRID_VALUES) ** (1.0 / 3.0),
        max(values.shape) / MAX_CHARGE_DENSITY_AXIS_POINTS,
    )
    uniform_stride = max(1, int(math.ceil(scale)))
    stride = tuple(uniform_stride for _ in values.shape)
    offset = tuple(axis_stride // 2 for axis_stride in stride)
    sampled = values[
        offset[0] :: stride[0],
        offset[1] :: stride[1],
        offset[2] :: stride[2],
    ]
    return sampled, offset, stride


def _density_samples(
    values: np.ndarray,
    *,
    offset: tuple[int, int, int],
    original_shape: tuple[int, int, int],
    stride: tuple[int, int, int],
    lattice_matrix: np.ndarray,
) -> tuple[list[list[float]], list[float], float, int]:
    absolute_values = np.abs(values)
    threshold = float(np.percentile(absolute_values, CHARGE_DENSITY_PERCENTILE))
    if threshold <= 0:
        threshold = float(np.max(absolute_values))
    if threshold <= 0:
        return [], [], 0.0, 0

    candidate_indices = np.argwhere(absolute_values >= threshold)
    total_candidate_count = int(len(candidate_indices))
    if total_candidate_count == 0:
        return [], [], threshold, 0

    candidate_strength = absolute_values[tuple(candidate_indices.T)]
    if total_candidate_count > MAX_CHARGE_DENSITY_SAMPLES:
        selected_order = np.argpartition(
            candidate_strength,
            -MAX_CHARGE_DENSITY_SAMPLES,
        )[-MAX_CHARGE_DENSITY_SAMPLES:]
        candidate_indices = candidate_indices[selected_order]
        candidate_strength = candidate_strength[selected_order]

    sort_order = np.argsort(candidate_strength)[::-1]
    candidate_indices = candidate_indices[sort_order]
    grid_indices = candidate_indices * np.asarray(stride, dtype=float) + np.asarray(
        offset,
        dtype=float,
    )
    fractional = grid_indices / np.asarray(original_shape, dtype=float)
    cartesian = fractional @ lattice_matrix
    sample_values = values[tuple(candidate_indices.T)]

    return (
        [[_clean_float(component) for component in position] for position in cartesian.tolist()],
        [_clean_float(value) for value in sample_values.tolist()],
        threshold,
        total_candidate_count,
    )


def _voxel_size(
    structure: Structure,
    grid_shape: tuple[int, int, int],
    stride: tuple[int, int, int],
) -> float:
    volume = max(float(structure.lattice.volume), 1e-12)
    grid_points = max(1, int(np.prod(np.asarray(grid_shape, dtype=float))))
    stride_scale = float(np.cbrt(max(1, int(np.prod(np.asarray(stride, dtype=float))))))
    return (volume / grid_points) ** (1.0 / 3.0) * stride_scale * 1.8


def _safe_upload_name(filename: str) -> str:
    name = Path(filename).name.replace("\\", "_").replace("@", "_")
    if name in {"", ".", ".."}:
        return "CHGCAR"
    return name


def _clean_float(value: float) -> float:
    numeric = float(value)
    if abs(numeric) < 1e-14:
        return 0.0
    return numeric


def _looks_like_vasp_volumetric_text(text: str) -> bool:
    lines = text.splitlines()
    if len(lines) < 10:
        return False

    counts_index = 5
    counts = _parse_int_line(lines[counts_index])
    if not counts:
        counts_index = 6
        counts = _parse_int_line(lines[counts_index]) if len(lines) > counts_index else []
    if not counts:
        return False

    cursor = counts_index + 1
    if cursor < len(lines) and lines[cursor].strip().lower().startswith("s"):
        cursor += 1
    if cursor >= len(lines):
        return False

    cursor += 1 + sum(counts)
    while cursor < len(lines) and not lines[cursor].strip():
        cursor += 1
    if cursor >= len(lines):
        return False

    grid = _parse_int_line(lines[cursor])
    if len(grid) != 3 or any(axis <= 0 for axis in grid):
        return False

    value_count = grid[0] * grid[1] * grid[2]
    seen_values = 0
    for line in lines[cursor + 1 :]:
        for token in line.split():
            try:
                float(token.replace("D", "E").replace("d", "e"))
            except ValueError:
                return seen_values >= value_count
            seen_values += 1
            if seen_values >= value_count:
                return True

    return False


def _parse_int_line(line: str) -> list[int]:
    values: list[int] = []
    for token in line.split():
        try:
            values.append(int(token))
        except ValueError:
            return []
    return values
