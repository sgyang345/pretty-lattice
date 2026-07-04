import type { BrillouinZoneKPointSpec, BrillouinZoneSpec } from "../api/scene";
import type { VectorTuple } from "./viewMath";

export type BrillouinSelectablePoint = BrillouinZoneKPointSpec;

export function selectablePointsForBrillouinZone(
  brillouinZone: BrillouinZoneSpec,
): BrillouinSelectablePoint[] {
  const reciprocalBasisInverse = invertRowBasisMatrix(brillouinZone.basis);
  const edgeEndpoints = edgeEndpointPoints(
    brillouinZone,
    reciprocalBasisInverse,
  );
  const edgeMidpoints = brillouinZone.edges.map((edge, index) => {
    const cartesian = midpoint(edge.start, edge.end);
    const label = `M${index + 1}`;
    return {
      id: `edge-midpoint-${index}`,
      label,
      fractional: reciprocalBasisInverse
        ? rowVectorMultiplyMatrix(cartesian, reciprocalBasisInverse)
        : ([0, 0, 0] as VectorTuple),
      cartesian,
    };
  });

  return [...brillouinZone.kpoints, ...edgeEndpoints, ...edgeMidpoints];
}

function edgeEndpointPoints(
  brillouinZone: BrillouinZoneSpec,
  reciprocalBasisInverse: VectorTuple[] | null,
): BrillouinSelectablePoint[] {
  const verticesByKey = new Map<string, VectorTuple>();
  for (const edge of brillouinZone.edges) {
    verticesByKey.set(vertexKey(edge.start), edge.start);
    verticesByKey.set(vertexKey(edge.end), edge.end);
  }

  return [...verticesByKey.values()].map((cartesian, index) => {
    const label = `V${index + 1}`;
    return {
      id: `edge-endpoint-${index}`,
      label,
      fractional: reciprocalBasisInverse
        ? rowVectorMultiplyMatrix(cartesian, reciprocalBasisInverse)
        : ([0, 0, 0] as VectorTuple),
      cartesian,
    };
  });
}

function midpoint(start: VectorTuple, end: VectorTuple): VectorTuple {
  return [
    (start[0] + end[0]) / 2,
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ];
}

function vertexKey(vertex: VectorTuple): string {
  return vertex.map((coordinate) => coordinate.toFixed(10)).join(",");
}

function rowVectorMultiplyMatrix(vector: VectorTuple, matrix: VectorTuple[]): VectorTuple {
  return [
    vector[0] * matrix[0]![0] + vector[1] * matrix[1]![0] + vector[2] * matrix[2]![0],
    vector[0] * matrix[0]![1] + vector[1] * matrix[1]![1] + vector[2] * matrix[2]![1],
    vector[0] * matrix[0]![2] + vector[1] * matrix[1]![2] + vector[2] * matrix[2]![2],
  ];
}

function invertRowBasisMatrix(matrix: VectorTuple[]): VectorTuple[] | null {
  const a = matrix[0];
  const b = matrix[1];
  const c = matrix[2];
  if (!a || !b || !c) {
    return null;
  }

  const determinant =
    a[0] * (b[1] * c[2] - b[2] * c[1]) -
    a[1] * (b[0] * c[2] - b[2] * c[0]) +
    a[2] * (b[0] * c[1] - b[1] * c[0]);
  if (Math.abs(determinant) < 1e-12) {
    return null;
  }

  const inverseDeterminant = 1 / determinant;
  return [
    [
      (b[1] * c[2] - b[2] * c[1]) * inverseDeterminant,
      (a[2] * c[1] - a[1] * c[2]) * inverseDeterminant,
      (a[1] * b[2] - a[2] * b[1]) * inverseDeterminant,
    ],
    [
      (b[2] * c[0] - b[0] * c[2]) * inverseDeterminant,
      (a[0] * c[2] - a[2] * c[0]) * inverseDeterminant,
      (a[2] * b[0] - a[0] * b[2]) * inverseDeterminant,
    ],
    [
      (b[0] * c[1] - b[1] * c[0]) * inverseDeterminant,
      (a[1] * c[0] - a[0] * c[1]) * inverseDeterminant,
      (a[0] * b[1] - a[1] * b[0]) * inverseDeterminant,
    ],
  ];
}
