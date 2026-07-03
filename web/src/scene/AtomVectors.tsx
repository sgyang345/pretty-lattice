import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";

import type { SceneSpec } from "../api/scene";
import {
  ATOM_VECTOR_HEAD_LENGTH_RATIO,
  ATOM_VECTOR_HEAD_SIZE_NORMALIZATION,
  ATOM_VECTOR_HEAD_WIDTH_RATIO,
  ATOM_VECTOR_LENGTH_SCALE_NORMALIZATION,
  ATOM_VECTOR_LINE_THICKNESS_NORMALIZATION,
  ATOM_VECTOR_MAX_LENGTH_RATIO,
  ATOM_VECTOR_MIN_LENGTH_RATIO,
  ATOM_VECTOR_RADIUS_RATIO,
  atomVectorRenderItems,
  type AtomVectorSettings,
} from "../model";

const ATOM_VECTOR_RADIAL_SEGMENTS = 24;
const Y_AXIS = new Vector3(0, 1, 0);

export function AtomVectors({
  scene,
  settings,
  span,
}: {
  scene: SceneSpec;
  settings: AtomVectorSettings;
  span: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const items = useMemo(
    () => atomVectorRenderItems(settings, scene.atoms),
    [scene.atoms, settings],
  );
  const displayLengthScale =
    settings.lengthScale / ATOM_VECTOR_LENGTH_SCALE_NORMALIZATION;
  const lengthScale =
    Math.max(0.4, span) * ATOM_VECTOR_MAX_LENGTH_RATIO * displayLengthScale;
  const minLength =
    Math.max(0.4, span) * ATOM_VECTOR_MIN_LENGTH_RATIO * displayLengthScale;
  const lineRadius =
    Math.max(0.4, span) *
    ATOM_VECTOR_RADIUS_RATIO *
    (settings.lineThickness / ATOM_VECTOR_LINE_THICKNESS_NORMALIZATION);
  const opacity = Math.min(1, Math.max(0, settings.opacity / 100));
  const headSizeScale = settings.headSize / ATOM_VECTOR_HEAD_SIZE_NORMALIZATION;

  useLayoutEffect(() => {
    invalidate();
  }, [invalidate, items]);

  return (
    <group>
      {items.map(({ atom, vector }) => (
        <AtomVectorArrow
          key={`${atom.id}-vector`}
          atomPosition={atom.position}
          color={settings.color}
          headSizeScale={headSizeScale}
          lengthScale={lengthScale}
          lineRadius={lineRadius}
          minLength={minLength}
          opacity={opacity}
          vector={vector}
        />
      ))}
    </group>
  );
}

function AtomVectorArrow({
  atomPosition,
  color,
  headSizeScale,
  lengthScale,
  lineRadius,
  minLength,
  opacity,
  vector,
}: {
  atomPosition: [number, number, number];
  color: string;
  headSizeScale: number;
  lengthScale: number;
  lineRadius: number;
  minLength: number;
  opacity: number;
  vector: [number, number, number];
}) {
  const invalidate = useThree((state) => state.invalidate);
  const group = useMemo(() => {
    const direction = new Vector3(...vector);
    const magnitude = direction.length();
    if (magnitude <= 0 || lineRadius <= 0 || opacity <= 0) {
      return null;
    }

    direction.normalize();
    const length = Math.max(minLength, magnitude * lengthScale);
    const headLength = Math.min(
      length * 0.45,
      length * ATOM_VECTOR_HEAD_LENGTH_RATIO * headSizeScale,
    );
    const headRadius = Math.max(
      lineRadius * 1.8,
      length * ATOM_VECTOR_HEAD_WIDTH_RATIO * headSizeScale,
    );
    const shaftLength = Math.max(lineRadius, length - headLength);
    const center = new Vector3(...atomPosition);
    const start = center.clone().addScaledVector(direction, -length / 2);
    const shaftCenter = start.clone().addScaledVector(direction, shaftLength / 2);
    const headCenter = start.clone().addScaledVector(
      direction,
      shaftLength + headLength / 2,
    );
    const quaternion = new Quaternion().setFromUnitVectors(Y_AXIS, direction);
    const material = new MeshStandardMaterial({
      color,
      depthWrite: opacity >= 1,
      opacity,
      roughness: 0.45,
      transparent: opacity < 1,
    });
    const shaftGeometry = new CylinderGeometry(
      lineRadius,
      lineRadius,
      shaftLength,
      ATOM_VECTOR_RADIAL_SEGMENTS,
    );
    const headGeometry = new ConeGeometry(
      headRadius,
      headLength,
      ATOM_VECTOR_RADIAL_SEGMENTS,
    );
    const arrowGroup = new Group();
    const shaftMesh = new Mesh(shaftGeometry, material);
    const headMesh = new Mesh(headGeometry, material);

    shaftMesh.quaternion.copy(quaternion);
    shaftMesh.position.copy(shaftCenter);
    headMesh.quaternion.copy(quaternion);
    headMesh.position.copy(headCenter);
    arrowGroup.add(shaftMesh, headMesh);

    return arrowGroup;
  }, [atomPosition, color, headSizeScale, lengthScale, lineRadius, minLength, opacity, vector]);

  useLayoutEffect(() => {
    invalidate();
    return () => {
      disposeObject(group);
      invalidate();
    };
  }, [group, invalidate]);

  return group ? <primitive object={group} /> : null;
}

function disposeObject(group: Group | null) {
  if (!group) {
    return;
  }

  group.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }

    disposeGeometry(object.geometry);
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of materials) {
      material.dispose();
    }
  });
}

function disposeGeometry(geometry: BufferGeometry) {
  geometry.dispose();
}
