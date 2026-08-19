#!/usr/bin/env python3
"""
Combine two VASP CHGCAR/PARCHG-style volumetric data files.

Default operation:
  output = CHGCAR1 - CHGCAR2

The output keeps the structure/header and grid line from the first file, then
writes the processed first volumetric data block. This mirrors the common VESTA
"Subtract from current data" workflow for charge-density difference maps.
"""

from __future__ import annotations

import argparse
import math
import sys
from dataclasses import dataclass
from pathlib import Path

ANGSTROM3_PER_BOHR3 = 0.529177210903**3
DEFAULT_FLOATS_PER_LINE = 5


@dataclass(frozen=True)
class VolumetricData:
    path: Path
    header_lines: list[str]
    structure_signature: tuple[str, ...]
    grid: tuple[int, int, int]
    values: list[float]

    @property
    def value_count(self) -> int:
        return self.grid[0] * self.grid[1] * self.grid[2]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Compute charge-density differences or VESTA-like operations for two "
            "VASP CHGCAR/PARCHG volumetric files."
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Default:
  %(prog)s CHGCAR1 CHGCAR2
  writes CHGCAR_subtract with data = CHGCAR1 - CHGCAR2

Examples:
  %(prog)s CHGCAR.total CHGCAR.atoms
  %(prog)s PARCHG_1 PARCHG_2 --operation add -o PARCHG_sum
  %(prog)s CHGCAR_A CHGCAR_B --convert-new angstrom-to-bohr

Operations:
  add       output = data1 + factor * data2
  subtract  output = data1 - factor * data2
  replace   output = factor * data2
  multiply  output = data1 * (factor * data2)
  divide    output = data1 / (factor * data2)
        """,
    )
    parser.add_argument("chgcar1", type=Path, help="Current/base CHGCAR or PARCHG file.")
    parser.add_argument("chgcar2", type=Path, help="New CHGCAR or PARCHG file.")
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Output path. Default: CHGCAR_<operation>.",
    )
    parser.add_argument(
        "--operation",
        choices=("add", "subtract", "replace", "multiply", "divide"),
        default="subtract",
        help="VESTA-like operation to apply. Default: subtract.",
    )
    parser.add_argument(
        "--factor",
        type=float,
        default=1.0,
        help="Extra multiplier applied to the second file before the operation. Default: 1.",
    )
    parser.add_argument(
        "--convert-new",
        choices=("raw", "angstrom-to-bohr", "bohr-to-angstrom"),
        default="raw",
        help=(
            "Unit conversion applied to the second file before the operation. "
            "Matches VESTA's imported/new-data conversion. Default: raw."
        ),
    )
    parser.add_argument(
        "--allow-structure-mismatch",
        action="store_true",
        help=(
            "Only require matching grid dimensions. By default the script also requires "
            "matching structure/header lines after the comment line."
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite the output file if it already exists.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        first = read_first_volumetric_data(args.chgcar1)
        second = read_first_volumetric_data(args.chgcar2)
        validate_compatible_inputs(
            first,
            second,
            allow_structure_mismatch=args.allow_structure_mismatch,
        )
        output_values = combine_values(
            first.values,
            second.values,
            operation=args.operation,
            factor=args.factor * conversion_factor(args.convert_new),
        )
        output_path = args.output or default_output_path(args.operation)
        write_volumetric_data(output_path, first.header_lines, output_values, force=args.force)
    except ChgcarOperationError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    print(f"Wrote {output_path}")
    print(f"Operation: {operation_summary(args.operation, args.factor, args.convert_new)}")
    print(f"Grid: {first.grid[0]} x {first.grid[1]} x {first.grid[2]}")
    print(
        "Range: "
        f"min={min(output_values):.12g}, max={max(output_values):.12g}, "
        f"sum={sum(output_values):.12g}"
    )
    return 0


class ChgcarOperationError(ValueError):
    pass


def read_first_volumetric_data(path: Path) -> VolumetricData:
    if not path.is_file():
        raise ChgcarOperationError(f"input file does not exist: {path}")

    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    if len(lines) < 9:
        raise ChgcarOperationError(f"{path} is too short to be a CHGCAR/PARCHG file")

    grid_line_index = find_first_grid_line(lines, structure_end_index(lines, path), path)
    grid = parse_grid_line(lines[grid_line_index], path, grid_line_index)
    value_count = grid[0] * grid[1] * grid[2]
    values = read_float_values(lines, grid_line_index + 1, value_count, path)

    return VolumetricData(
        path=path,
        header_lines=lines[: grid_line_index + 1],
        structure_signature=normalized_structure_signature(lines[:grid_line_index]),
        grid=grid,
        values=values,
    )


def structure_end_index(lines: list[str], path: Path) -> int:
    if len(lines) < 8:
        raise ChgcarOperationError(f"{path} does not contain a complete POSCAR header")

    counts_index = 5
    counts = parse_ints(lines[counts_index])
    if not counts:
        counts_index = 6
        counts = parse_ints(lines[counts_index]) if len(lines) > counts_index else []
    if not counts:
        raise ChgcarOperationError(f"could not read atom counts from {path}")

    cursor = counts_index + 1
    if cursor < len(lines) and lines[cursor].strip().lower().startswith("s"):
        cursor += 1
    if cursor >= len(lines):
        raise ChgcarOperationError(f"{path} does not contain a coordinate mode line")

    cursor += 1
    cursor += sum(counts)
    if cursor >= len(lines):
        raise ChgcarOperationError(f"{path} does not contain volumetric data")
    return cursor


def find_first_grid_line(lines: list[str], start_index: int, path: Path) -> int:
    for index in range(start_index, len(lines)):
        ints = parse_ints(lines[index])
        if len(ints) == 3 and all(value > 0 for value in ints):
            return index
    raise ChgcarOperationError(f"could not find a volumetric grid line in {path}")


def parse_grid_line(line: str, path: Path, index: int) -> tuple[int, int, int]:
    ints = parse_ints(line)
    if len(ints) != 3 or any(value <= 0 for value in ints):
        raise ChgcarOperationError(f"invalid grid line in {path} at line {index + 1}")
    return ints[0], ints[1], ints[2]


def parse_ints(line: str) -> list[int]:
    tokens = line.split()
    if not tokens:
        return []
    values: list[int] = []
    for token in tokens:
        try:
            value = int(token)
        except ValueError:
            return []
        values.append(value)
    return values


def read_float_values(
    lines: list[str],
    start_index: int,
    value_count: int,
    path: Path,
) -> list[float]:
    values: list[float] = []
    for line_index in range(start_index, len(lines)):
        for token in lines[line_index].split():
            if len(values) >= value_count:
                return values
            try:
                values.append(float(token.replace("D", "E").replace("d", "e")))
            except ValueError as exc:
                raise ChgcarOperationError(
                    f"non-numeric volumetric value in {path} at line {line_index + 1}: {token}"
                ) from exc

        if len(values) >= value_count:
            return values

    raise ChgcarOperationError(
        f"{path} contains {len(values)} volumetric values, expected {value_count}"
    )


def normalized_structure_signature(header_lines_before_grid: list[str]) -> tuple[str, ...]:
    return tuple(" ".join(line.split()) for line in header_lines_before_grid[1:])


def validate_compatible_inputs(
    first: VolumetricData,
    second: VolumetricData,
    *,
    allow_structure_mismatch: bool,
) -> None:
    if first.grid != second.grid:
        raise ChgcarOperationError(
            f"grid mismatch: {first.path} has {first.grid}, {second.path} has {second.grid}"
        )
    if len(first.values) != len(second.values):
        raise ChgcarOperationError(
            f"value-count mismatch: {first.path} has {len(first.values)}, "
            f"{second.path} has {len(second.values)}"
        )
    if not allow_structure_mismatch and first.structure_signature != second.structure_signature:
        raise ChgcarOperationError(
            "structure/header lines differ. Use --allow-structure-mismatch if the files "
            "are already known to be on the same real-space grid."
        )


def conversion_factor(mode: str) -> float:
    if mode == "raw":
        return 1.0
    if mode == "angstrom-to-bohr":
        return ANGSTROM3_PER_BOHR3
    if mode == "bohr-to-angstrom":
        return 1.0 / ANGSTROM3_PER_BOHR3
    raise ChgcarOperationError(f"unsupported conversion mode: {mode}")


def combine_values(
    first_values: list[float],
    second_values: list[float],
    *,
    operation: str,
    factor: float,
) -> list[float]:
    if not math.isfinite(factor):
        raise ChgcarOperationError("factor must be finite")

    if operation == "add":
        return [
            first + factor * second
            for first, second in zip(first_values, second_values, strict=True)
        ]
    if operation == "subtract":
        return [
            first - factor * second
            for first, second in zip(first_values, second_values, strict=True)
        ]
    if operation == "replace":
        return [factor * second for second in second_values]
    if operation == "multiply":
        return [
            first * factor * second
            for first, second in zip(first_values, second_values, strict=True)
        ]
    if operation == "divide":
        output: list[float] = []
        for index, (first, second) in enumerate(zip(first_values, second_values, strict=True)):
            denominator = factor * second
            if abs(denominator) < 1e-300:
                raise ChgcarOperationError(f"division by zero at volumetric value {index}")
            output.append(first / denominator)
        return output

    raise ChgcarOperationError(f"unsupported operation: {operation}")


def write_volumetric_data(
    output_path: Path,
    header_lines: list[str],
    values: list[float],
    *,
    force: bool,
) -> None:
    if output_path.exists() and not force:
        raise ChgcarOperationError(f"output file already exists: {output_path} (use --force)")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        for line in header_lines:
            handle.write(f"{line}\n")
        for start in range(0, len(values), DEFAULT_FLOATS_PER_LINE):
            chunk = values[start : start + DEFAULT_FLOATS_PER_LINE]
            handle.write("".join(f" {value:.11E}" for value in chunk))
            handle.write("\n")


def default_output_path(operation: str) -> Path:
    return Path(f"CHGCAR_{operation}")


def operation_summary(operation: str, factor: float, convert_new: str) -> str:
    if convert_new == "raw":
        return operation if factor == 1 else f"{operation}, factor={factor:g}"
    conversion = conversion_factor(convert_new)
    total = factor * conversion
    return f"{operation}, convert-new={convert_new}, factor={factor:g}, total-new-factor={total:g}"


if __name__ == "__main__":
    raise SystemExit(main())
