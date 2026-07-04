import { type ThreeEvent, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import {
  BufferGeometry,
  BackSide,
  DoubleSide,
  Float32BufferAttribute,
  Quaternion,
  Vector3,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import type { BrillouinZoneKPointSpec, BrillouinZoneSpec } from "../api/scene";
import {
  selectablePointsForBrillouinZone,
  type BrillouinSelectablePoint,
} from "./brillouinSelection";
import type { VectorTuple } from "./viewMath";

const BZ_EDGE_COLOR = "#2563eb";
const BZ_FACE_COLOR = "#60a5fa";
const BZ_PATH_COLOR = "#111827";
const BZ_BASIS_COLORS = ["#dc2626", "#16a34a", "#2563eb"] as const;
const BZ_POINT_COLOR = "#050505";
const BZ_POINT_SELECTED_RIM_COLOR = "#ffffff";
const BZ_POINT_RADIUS_RATIO = 0.015;
const BZ_POINT_MIN_RADIUS = 0.0125;
const BZ_POINT_MAX_RADIUS = 0.0265;
const BZ_POINT_SELECTED_RADIUS_RATIO = 2;
const BZ_POINT_SELECTED_RIM_RADIUS_RATIO = 1.55;
const BZ_POINT_HIT_RADIUS_RATIO = 3.2;
const BZ_BASIS_SHAFT_RADIUS_RATIO = 0.0025;
const BZ_BASIS_MIN_SHAFT_RADIUS = 0.004;
const BZ_BASIS_MAX_SHAFT_RADIUS = 0.0117;
const BZ_BASIS_HEAD_LENGTH_RATIO = 0.04;
const BZ_BASIS_HEAD_RADIUS_RATIO = 3.975;
const Y_AXIS = new Vector3(0, 1, 0);

export function BrillouinZone({
  brillouinZone,
  fitToSpan = true,
  inspectedKPointIds,
  onKPointInspect,
  span,
}: {
  brillouinZone: BrillouinZoneSpec;
  fitToSpan?: boolean;
  inspectedKPointIds: string[];
  onKPointInspect?: (kpointId: string | null) => void;
  span: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const scale = useMemo(
    () => (fitToSpan ? displayScaleForBrillouinZone(brillouinZone, span) : 1),
    [brillouinZone, fitToSpan, span],
  );
  const kpointsById = useMemo(() => new Map(brillouinZone.kpoints.map((point) => [point.id, point])), [brillouinZone.kpoints]);
  const selectablePoints = useMemo(
    () => selectablePointsForBrillouinZone(brillouinZone),
    [brillouinZone],
  );

  useLayoutEffect(() => {
    invalidate();
  }, [brillouinZone, invalidate, scale]);

  return (
    <group renderOrder={20}>
      <BrillouinZoneFaces brillouinZone={brillouinZone} scale={scale} />
      <BrillouinZoneLines
        brillouinZone={brillouinZone}
        kpointsById={kpointsById}
        scale={scale}
      />
      <BrillouinZoneSelectablePoints
        inspectedKPointIds={inspectedKPointIds}
        onKPointInspect={onKPointInspect}
        points={selectablePoints}
        scale={scale}
      />
    </group>
  );
}

function BrillouinZoneFaces({
  brillouinZone,
  scale,
}: {
  brillouinZone: BrillouinZoneSpec;
  scale: number;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const face of brillouinZone.faces) {
      if (face.length < 3) {
        continue;
      }
      const origin = face[0]!;
      for (let index = 1; index < face.length - 1; index += 1) {
        positions.push(
          ...scaledVector(origin, scale),
          ...scaledVector(face[index]!, scale),
          ...scaledVector(face[index + 1]!, scale),
        );
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }, [brillouinZone.faces, scale]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} renderOrder={18}>
      <meshStandardMaterial
        color={BZ_FACE_COLOR}
        depthTest={false}
        depthWrite={false}
        opacity={0.22}
        side={DoubleSide}
        transparent
      />
    </mesh>
  );
}

function BrillouinZoneLines({
  brillouinZone,
  kpointsById,
  scale,
}: {
  brillouinZone: BrillouinZoneSpec;
  kpointsById: Map<string, BrillouinZoneKPointSpec>;
  scale: number;
}) {
  const edgePositions = useMemo(
    () => brillouinZone.edges.flatMap((edge) => [...scaledVector(edge.start, scale), ...scaledVector(edge.end, scale)]),
    [brillouinZone.edges, scale],
  );
  const pathPositions = useMemo(
    () => brillouinZone.path.flatMap((segment) => {
      const start = kpointsById.get(segment.start);
      const end = kpointsById.get(segment.end);
      if (!start || !end) {
        return [];
      }
      return [...scaledVector(start.cartesian, scale), ...scaledVector(end.cartesian, scale)];
    }),
    [brillouinZone.path, kpointsById, scale],
  );

  return (
    <>
      <BrillouinLineSegments color={BZ_EDGE_COLOR} lineWidth={1.6} positions={edgePositions} />
      <BrillouinLineSegments color={BZ_PATH_COLOR} lineWidth={2.3} positions={pathPositions} />
      <BrillouinBasisAxes basis={brillouinZone.basis} scale={scale} />
    </>
  );
}

function BrillouinBasisAxes({
  basis,
  scale,
}: {
  basis: VectorTuple[];
  scale: number;
}) {
  const arrows = useMemo(
    () => basis.slice(0, 3).map((basisVector) => scaledVector(basisVector, scale)),
    [basis, scale],
  );
  const metrics = useMemo(() => basisArrowMetrics(arrows), [arrows]);

  return (
    <group renderOrder={23}>
      {arrows.map((vector, index) => (
        <BrillouinBasisArrow
          key={`basis-${index}`}
          color={BZ_BASIS_COLORS[index] ?? BZ_PATH_COLOR}
          metrics={metrics}
          vector={vector}
        />
      ))}
    </group>
  );
}

interface BrillouinBasisArrowMetrics {
  headLength: number;
  headRadius: number;
  shaftRadius: number;
}

function BrillouinBasisArrow({
  color,
  metrics,
  vector,
}: {
  color: string;
  metrics: BrillouinBasisArrowMetrics;
  vector: VectorTuple;
}) {
  const spec = useMemo(() => {
    const end = new Vector3(...vector);
    const length = end.length();
    if (length < 1e-8) {
      return null;
    }

    const direction = end.clone().normalize();
    const headLength = metrics.headLength;
    const shaftLength = Math.max(length - headLength, 0);

    return {
      headLength,
      headRadius: metrics.headRadius,
      rotation: new Quaternion().setFromUnitVectors(Y_AXIS, direction),
      shaftLength,
      shaftRadius: metrics.shaftRadius,
    };
  }, [metrics, vector]);

  if (!spec) {
    return null;
  }

  return (
    <group quaternion={spec.rotation}>
      <mesh position={[0, spec.shaftLength / 2, 0]} renderOrder={23}>
        <cylinderGeometry args={[spec.shaftRadius, spec.shaftRadius, spec.shaftLength, 24]} />
        <meshStandardMaterial
          color={color}
          depthTest
          depthWrite={false}
          transparent
          opacity={0.98}
        />
      </mesh>
      <mesh position={[0, spec.shaftLength + spec.headLength / 2, 0]} renderOrder={24}>
        <coneGeometry args={[spec.headRadius, spec.headLength, 28]} />
        <meshStandardMaterial
          color={color}
          depthTest
          depthWrite={false}
          transparent
          opacity={0.98}
        />
      </mesh>
    </group>
  );
}

function basisArrowMetrics(vectors: VectorTuple[]): BrillouinBasisArrowMetrics {
  const lengths = vectors
    .map((vector) => Math.hypot(...vector))
    .filter((length) => length >= 1e-8);
  const referenceLength = Math.max(...lengths, 1);
  const shortestLength = Math.min(...lengths, referenceLength);
  const shaftRadius = Math.min(
    BZ_BASIS_MAX_SHAFT_RADIUS,
    Math.max(BZ_BASIS_MIN_SHAFT_RADIUS, referenceLength * BZ_BASIS_SHAFT_RADIUS_RATIO),
  );
  const requestedHeadLength = Math.max(
    referenceLength * BZ_BASIS_HEAD_LENGTH_RATIO,
    shaftRadius * 4.8,
  );
  const headLength = Math.min(shortestLength * 0.36, requestedHeadLength);

  return {
    headLength,
    headRadius: shaftRadius * BZ_BASIS_HEAD_RADIUS_RATIO,
    shaftRadius,
  };
}

function BrillouinLineSegments({
  color,
  lineWidth,
  positions,
}: {
  color: string;
  lineWidth: number;
  positions: number[];
}) {
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const line = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const material = new LineMaterial({
      alphaToCoverage: true,
      color,
      depthTest: true,
      depthWrite: false,
      linewidth: lineWidth,
      opacity: 0.96,
      transparent: true,
      worldUnits: false,
    });
    return new LineSegments2(geometry, material);
  }, [color, lineWidth, positions]);

  useLayoutEffect(() => {
    line.material.resolution.set(size.width, size.height);
    line.material.needsUpdate = true;
    invalidate();
  }, [invalidate, line, size.height, size.width]);

  useEffect(() => {
    return () => {
      line.geometry.dispose();
      line.material.dispose();
    };
  }, [line]);

  if (positions.length === 0) {
    return null;
  }

  line.renderOrder = 22;
  return <primitive object={line} />;
}

function BrillouinZoneSelectablePoints({
  inspectedKPointIds,
  onKPointInspect,
  points,
  scale,
}: {
  inspectedKPointIds: string[];
  onKPointInspect?: (kpointId: string | null) => void;
  points: BrillouinSelectablePoint[];
  scale: number;
}) {
  const pointRadius = Math.max(
    BZ_POINT_MIN_RADIUS,
    Math.min(BZ_POINT_MAX_RADIUS, scale * BZ_POINT_RADIUS_RATIO),
  );
  const handleClick = useCallback(
    (point: BrillouinSelectablePoint) => (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onKPointInspect?.(point.id);
    },
    [onKPointInspect],
  );

  return (
    <group>
      {points.map((point) => {
        const position = scaledVector(point.cartesian, scale);
        const selected = inspectedKPointIds.includes(point.id);
        const selectedPointRadius = pointRadius * BZ_POINT_SELECTED_RADIUS_RATIO;
        return (
          <group key={point.id} position={position} renderOrder={24}>
            {selected ? (
              <mesh renderOrder={24}>
                <sphereGeometry args={[selectedPointRadius * BZ_POINT_SELECTED_RIM_RADIUS_RATIO, 24, 16]} />
                <meshStandardMaterial
                  color={BZ_POINT_SELECTED_RIM_COLOR}
                  depthTest
                  depthWrite={false}
                  emissive={BZ_POINT_SELECTED_RIM_COLOR}
                  emissiveIntensity={0.18}
                  roughness={0.25}
                  side={BackSide}
                />
              </mesh>
            ) : null}
            <mesh onClick={handleClick(point)}>
              <sphereGeometry args={[pointRadius * BZ_POINT_HIT_RADIUS_RATIO, 12, 8]} />
              <meshBasicMaterial
                depthTest={false}
                depthWrite={false}
                opacity={0}
                transparent
              />
            </mesh>
            <mesh onClick={handleClick(point)}>
              <sphereGeometry args={[selectedPointRadius, 20, 14]} />
              <meshStandardMaterial
                color={BZ_POINT_COLOR}
                depthTest
                depthWrite
                roughness={0.42}
                visible={selected}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function displayScaleForBrillouinZone(
  brillouinZone: BrillouinZoneSpec,
  span: number,
): number {
  const maximumRadius = Math.max(
    ...brillouinZone.faces.flatMap((face) => face.map((vertex) => Math.hypot(...vertex))),
    ...brillouinZone.kpoints.map((point) => Math.hypot(...point.cartesian)),
    1,
  );
  return Math.max(1, span) * 0.9 / maximumRadius;
}

function scaledVector(vector: VectorTuple, scale: number): VectorTuple {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}
