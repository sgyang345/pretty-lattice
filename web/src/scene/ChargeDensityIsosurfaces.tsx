import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  ShaderMaterial,
} from "three";
import {
  edgeTable as edgeTableSource,
  triTable as triTableSource,
} from "three/examples/jsm/objects/MarchingCubes.js";

import type { ChargeDensitySpec } from "../api/scene";
import type { VectorTuple } from "./viewMath";

const CHARGE_DENSITY_FIXED_SURFACE_ENHANCEMENT = 0.68;
const CHARGE_DENSITY_SURFACE_RENDER_ORDER = -3;
const CHARGE_DENSITY_SECTION_RENDER_ORDER = -2;
const CHARGE_DENSITY_BOUNDARY_FILL_RENDER_ORDER = CHARGE_DENSITY_SECTION_RENDER_ORDER;
const CHARGE_DENSITY_BOUNDARY_LINE_RENDER_ORDER = -1;
const MARCHING_CUBES_EDGE_TABLE = edgeTableSource as unknown as Int32Array;
const MARCHING_CUBES_TRI_TABLE = triTableSource as unknown as Int32Array;
const CHARGE_DENSITY_UNIFORM_COLOR_VERTEX_SHADER = `
  uniform vec3 uColor;
  varying vec3 vChargeColor;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  void main() {
    vec4 modelViewPosition = modelViewMatrix * vec4(position, 1.0);
    vChargeColor = uColor;
    vViewPosition = -modelViewPosition.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewPosition;
  }
`;
const CHARGE_DENSITY_FRAGMENT_SHADER = `
  uniform float uOpacity;
  uniform float uEnhancement;
  uniform float uMaxChannel;
  uniform float uSpecularStrength;
  uniform float uWhiteMix;
  varying vec3 vChargeColor;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 normal = normalize(vViewNormal);
    if (!gl_FrontFacing) {
      normal = -normal;
    }
    vec3 viewDirection = normalize(vViewPosition);
    normal = faceforward(normal, -viewDirection, normal);
    vec3 keyLight = normalize(vec3(-0.42, 0.58, 0.70));
    vec3 fillLight = normalize(vec3(0.62, -0.20, 0.46));
    float frontLight = abs(dot(normal, keyLight));
    float fill = abs(dot(normal, fillLight));
    float backGlow = frontLight * 0.36;
    float facing = abs(dot(normal, viewDirection));
    float rim = pow(1.0 - facing, 1.55);
    float center = pow(facing, 0.65);
    vec3 halfVector = normalize(keyLight + viewDirection);
    float specular = pow(abs(dot(normal, halfVector)), mix(22.0, 74.0, uEnhancement));

    vec3 baseColor = clamp(vChargeColor, vec3(0.0), vec3(1.0));
    vec3 orbitalColor = mix(baseColor, vec3(1.0), uWhiteMix);
    vec3 edgeColor = mix(baseColor * 0.46, vec3(0.03, 0.04, 0.12), 0.18);
    vec3 shadedColor = orbitalColor * (
      0.52 +
      center * 0.30 +
      frontLight * (0.52 + uEnhancement * 0.22) +
      fill * 0.10 +
      backGlow * 0.10
    );
    shadedColor = mix(shadedColor, edgeColor, rim * (0.42 + uEnhancement * 0.28));
    shadedColor += vec3(1.0, 0.94, 0.90) * specular * center * (0.34 + uEnhancement * 0.36) * uSpecularStrength;
    shadedColor = clamp(shadedColor, vec3(0.0), vec3(uMaxChannel));

    float alpha = uOpacity * (0.72 + center * 0.10 + rim * 0.20);
    gl_FragColor = vec4(shadedColor, alpha);
  }
`;
type GridTuple = [number, number, number];
type ChargeDensityRenderable = Mesh | LineSegments;
type ChargeDensitySectionAxis = "a" | "b" | "c";
type ChargeDensitySurfaceMode = "both" | "positive" | "negative";
type BoundarySideMask = [[boolean, boolean], [boolean, boolean], [boolean, boolean]];
type BoundaryFillVertex = {
  point: GridTuple;
  value: number;
};

export function ChargeDensityIsosurfaces({
  boundaryColor,
  boundaryFillOpacity,
  cellVectors,
  chargeDensity,
  fractionalOffset,
  interpolationFactor,
  isoValue,
  negativeColor,
  opacity,
  positiveColor,
  sectionAxis,
  sectionEnabled,
  sectionOpacity,
  sectionPosition,
  surfaceMode,
}: {
  boundaryColor: string;
  boundaryFillOpacity: number;
  cellVectors: VectorTuple[];
  chargeDensity: ChargeDensitySpec | undefined;
  fractionalOffset: [number, number, number];
  interpolationFactor: number;
  isoValue: number;
  negativeColor: string;
  opacity: number;
  positiveColor: string;
  sectionAxis: ChargeDensitySectionAxis;
  sectionEnabled: boolean;
  sectionOpacity: number;
  sectionPosition: number;
  surfaceMode: ChargeDensitySurfaceMode;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const surfaces = useMemo(() => {
    if (!chargeDensity) {
      return [];
    }

    if (isoValue <= 0) {
      return [];
    }

    const repeat = normalizeChargeDensityRepeat(chargeDensity.supercellRepeat);
    const tileCellVectors = repeatCellVectors(cellVectors, repeat);
    const surfacesForTiles: (ChargeDensityRenderable | null)[] = [];

    for (let aIndex = 0; aIndex < repeat[0]; aIndex += 1) {
      for (let bIndex = 0; bIndex < repeat[1]; bIndex += 1) {
        for (let cIndex = 0; cIndex < repeat[2]; cIndex += 1) {
          const tileOffset: GridTuple = [aIndex, bIndex, cIndex];
          const boundarySides: BoundarySideMask = [
            [aIndex === 0, aIndex === repeat[0] - 1],
            [bIndex === 0, bIndex === repeat[1] - 1],
            [cIndex === 0, cIndex === repeat[2] - 1],
          ];

          const tileSectionPosition = sectionPositionForRepeatTile({
            repeat,
            sectionAxis,
            sectionPosition,
            tileOffset,
          });
          const sectionMaterialOpacity = opacity * sectionOpacity / 100;
          const boundaryFillMaterialOpacity = opacity * boundaryFillOpacity / 100;

          if (shouldShowPositiveSurface(surfaceMode) && chargeDensity.max >= isoValue) {
            surfacesForTiles.push(
              translateRenderable(
                sectionEnabled && sectionMaterialOpacity > 0 && tileSectionPosition !== null
                  ? buildSectionMesh({
                      cellVectors: tileCellVectors,
                      chargeDensity,
                      color: boundaryColor,
                      fractionalOffset,
                      interpolationFactor,
                      isoValue,
                      opacity: sectionMaterialOpacity,
                      sectionAxis,
                      sectionPosition: tileSectionPosition,
                      surfaceMode: "positive",
                    })
                  : null,
                tileCellVectors,
                tileOffset,
              ),
              translateRenderable(
                opacity > 0
                  ? buildSurfaceMesh({
                      cellVectors: tileCellVectors,
                      chargeDensity,
                      color: positiveColor,
                      fractionalOffset,
                      interpolationFactor,
                      isoValue,
                      opacity,
                    })
                  : null,
                tileCellVectors,
                tileOffset,
              ),
              translateRenderable(
                boundaryFillMaterialOpacity > 0
                  ? buildBoundaryFillMesh({
                      boundarySides,
                      cellVectors: tileCellVectors,
                      chargeDensity,
                      color: boundaryColor,
                      fractionalOffset,
                      interpolationFactor,
                      isoValue,
                      opacity: boundaryFillMaterialOpacity,
                    })
                  : null,
                tileCellVectors,
                tileOffset,
              ),
              translateRenderable(
                buildBoundaryLineSegments({
                  boundarySides,
                  cellVectors: tileCellVectors,
                  chargeDensity,
                  color: boundaryColor,
                  fractionalOffset,
                  interpolationFactor,
                  isoValue,
                  opacity,
                }),
                tileCellVectors,
                tileOffset,
              ),
            );
          }

          if (shouldShowNegativeSurface(surfaceMode) && chargeDensity.min <= -isoValue) {
            surfacesForTiles.push(
              translateRenderable(
                sectionEnabled && sectionMaterialOpacity > 0 && tileSectionPosition !== null
                  ? buildSectionMesh({
                      cellVectors: tileCellVectors,
                      chargeDensity,
                      color: boundaryColor,
                      fractionalOffset,
                      interpolationFactor,
                      isoValue: -isoValue,
                      opacity: sectionMaterialOpacity,
                      sectionAxis,
                      sectionPosition: tileSectionPosition,
                      surfaceMode: "negative",
                    })
                  : null,
                tileCellVectors,
                tileOffset,
              ),
              translateRenderable(
                opacity > 0
                  ? buildSurfaceMesh({
                      cellVectors: tileCellVectors,
                      chargeDensity,
                      color: negativeColor,
                      fractionalOffset,
                      interpolationFactor,
                      isoValue: -isoValue,
                      opacity,
                    })
                  : null,
                tileCellVectors,
                tileOffset,
              ),
              translateRenderable(
                boundaryFillMaterialOpacity > 0
                  ? buildBoundaryFillMesh({
                      boundarySides,
                      cellVectors: tileCellVectors,
                      chargeDensity,
                      color: boundaryColor,
                      fractionalOffset,
                      interpolationFactor,
                      isoValue: -isoValue,
                      opacity: boundaryFillMaterialOpacity,
                    })
                  : null,
                tileCellVectors,
                tileOffset,
              ),
              translateRenderable(
                buildBoundaryLineSegments({
                  boundarySides,
                  cellVectors: tileCellVectors,
                  chargeDensity,
                  color: boundaryColor,
                  fractionalOffset,
                  interpolationFactor,
                  isoValue: -isoValue,
                  opacity,
                }),
                tileCellVectors,
                tileOffset,
              ),
            );
          }
        }
      }
    }

    return surfacesForTiles.filter((surface): surface is ChargeDensityRenderable => surface !== null);
  }, [
    boundaryColor,
    boundaryFillOpacity,
    cellVectors,
    chargeDensity,
    interpolationFactor,
    fractionalOffset,
    isoValue,
    negativeColor,
    opacity,
    positiveColor,
    sectionAxis,
    sectionEnabled,
    sectionOpacity,
    sectionPosition,
    surfaceMode,
  ]);

  useLayoutEffect(() => {
    invalidate();
    return () => {
      surfaces.forEach((surface) => {
        surface.geometry.dispose();
        if (Array.isArray(surface.material)) {
          surface.material.forEach((material) => material.dispose());
        } else {
          surface.material.dispose();
        }
      });
      invalidate();
    };
  }, [invalidate, surfaces]);

  return surfaces.length > 0 ? (
    <group>
      {surfaces.map((surface) => (
        <primitive key={surface.uuid} object={surface} />
      ))}
    </group>
  ) : null;
}

function buildSurfaceMesh({
  cellVectors,
  chargeDensity,
  color,
  fractionalOffset,
  interpolationFactor,
  isoValue,
  opacity,
}: {
  cellVectors: VectorTuple[];
  chargeDensity: ChargeDensitySpec;
  color: string;
  fractionalOffset: [number, number, number];
  interpolationFactor: number;
  isoValue: number;
  opacity: number;
}): Mesh | null {
  const geometry = marchingCubesGeometry(
    chargeDensity,
    cellVectors,
    isoValue,
    interpolationFactor,
    fractionalOffset,
  );
  if (!geometry) {
    return null;
  }
  const material = buildChargeDensityMaterial({ color, opacity });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = CHARGE_DENSITY_SURFACE_RENDER_ORDER;
  return mesh;
}

function buildBoundaryLineSegments({
  boundarySides,
  cellVectors,
  chargeDensity,
  color,
  fractionalOffset,
  interpolationFactor,
  isoValue,
  opacity,
}: {
  boundarySides?: BoundarySideMask;
  cellVectors: VectorTuple[];
  chargeDensity: ChargeDensitySpec;
  color: string;
  fractionalOffset: [number, number, number];
  interpolationFactor: number;
  isoValue: number;
  opacity: number;
}): LineSegments | null {
  const geometry = chargeDensityBoundaryLineGeometry({
    boundarySides,
    cellVectors,
    chargeDensity,
    fractionalOffset,
    interpolationFactor,
    isoValue,
  });
  if (!geometry) {
    return null;
  }

  const material = new LineBasicMaterial({
    blending: AdditiveBlending,
    color: new Color(color),
    depthTest: true,
    depthWrite: false,
    opacity: Math.min(1, Math.max(0, opacity) * 1.22),
    toneMapped: false,
    transparent: true,
  });
  const line = new LineSegments(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = CHARGE_DENSITY_BOUNDARY_LINE_RENDER_ORDER;
  return line;
}

function buildBoundaryFillMesh({
  boundarySides,
  cellVectors,
  chargeDensity,
  color,
  fractionalOffset,
  interpolationFactor,
  isoValue,
  opacity,
}: {
  boundarySides?: BoundarySideMask;
  cellVectors: VectorTuple[];
  chargeDensity: ChargeDensitySpec;
  color: string;
  fractionalOffset: [number, number, number];
  interpolationFactor: number;
  isoValue: number;
  opacity: number;
}): Mesh | null {
  const geometry = chargeDensityBoundaryFillGeometry({
    boundarySides,
    cellVectors,
    chargeDensity,
    fractionalOffset,
    interpolationFactor,
    isoValue,
  });
  if (!geometry) {
    return null;
  }

  const material = buildChargeDensityMaterial({
    blendMode: "additive",
    color,
    opacity,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = CHARGE_DENSITY_BOUNDARY_FILL_RENDER_ORDER;
  return mesh;
}

function buildSectionMesh({
  cellVectors,
  chargeDensity,
  color,
  fractionalOffset,
  interpolationFactor,
  isoValue,
  opacity,
  sectionAxis,
  sectionPosition,
  surfaceMode,
}: {
  cellVectors: VectorTuple[];
  chargeDensity: ChargeDensitySpec;
  color: string;
  fractionalOffset: [number, number, number];
  interpolationFactor: number;
  isoValue: number;
  opacity: number;
  sectionAxis: ChargeDensitySectionAxis;
  sectionPosition: number;
  surfaceMode: ChargeDensitySurfaceMode;
}): Mesh | null {
  const geometry = chargeDensitySectionGeometry({
    cellVectors,
    chargeDensity,
    fractionalOffset,
    interpolationFactor,
    isoValue,
    sectionAxis,
    sectionPosition,
    surfaceMode,
  });
  if (!geometry) {
    return null;
  }

  const material = buildChargeDensityMaterial({
    blendMode: "additive",
    color,
    opacity,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = CHARGE_DENSITY_SECTION_RENDER_ORDER;
  return mesh;
}

function buildChargeDensityMaterial({
  blendMode = "normal",
  color,
  opacity,
}: {
  blendMode?: "normal" | "additive";
  color: string;
  opacity: number;
}): ShaderMaterial {
  const material = new ShaderMaterial({
    depthTest: true,
    depthWrite: false,
    fragmentShader: CHARGE_DENSITY_FRAGMENT_SHADER,
    opacity,
    side: DoubleSide,
    toneMapped: false,
    transparent: true,
    uniforms: {
      uColor: { value: new Color(color) },
      uEnhancement: { value: CHARGE_DENSITY_FIXED_SURFACE_ENHANCEMENT },
      uMaxChannel: { value: 1 },
      uOpacity: { value: opacity },
      uSpecularStrength: { value: 1 },
      uWhiteMix: { value: 0.08 },
    },
    vertexShader: CHARGE_DENSITY_UNIFORM_COLOR_VERTEX_SHADER,
  });
  if (blendMode === "additive") {
    material.blending = AdditiveBlending;
  }
  return material;
}

function marchingCubesGeometry(
  chargeDensity: ChargeDensitySpec,
  cellVectors: VectorTuple[],
  isoValue: number,
  interpolationFactor: number,
  fractionalOffset: [number, number, number],
): BufferGeometry | null {
  const scalars = chargeDensity.scalarValues;
  const dataGrid = chargeDensity.dataGrid;
  if (!scalars || !dataGrid) {
    return null;
  }

  const [sourceNx, sourceNy, sourceNz] = dataGrid;
  const factor = Math.min(2, Math.max(1, interpolationFactor));
  const nx = Math.max(2, Math.round(sourceNx * factor) + 1);
  const ny = Math.max(2, Math.round(sourceNy * factor) + 1);
  const nz = Math.max(2, Math.round(sourceNz * factor) + 1);
  if (sourceNx < 2 || sourceNy < 2 || sourceNz < 2 || scalars.length !== sourceNx * sourceNy * sourceNz) {
    return null;
  }

  const origin = chargeDensity.dataOrigin ?? [0, 0, 0];
  const stride = chargeDensity.dataStride ?? [1, 1, 1];
  const positions: number[] = [];
  const normals: number[] = [];
  const cornerPositions: GridTuple[] = Array.from({ length: 8 }, () => [0, 0, 0]);
  const cornerSourcePositions: GridTuple[] = Array.from({ length: 8 }, () => [0, 0, 0]);
  const cornerValues = new Array<number>(8).fill(0);
  const edgeVertices: GridTuple[] = Array.from({ length: 12 }, () => [0, 0, 0]);
  const edgeSourceVertices: GridTuple[] = Array.from({ length: 12 }, () => [0, 0, 0]);

  for (let x = 0; x < nx - 1; x += 1) {
    for (let y = 0; y < ny - 1; y += 1) {
      for (let z = 0; z < nz - 1; z += 1) {
        for (let corner = 0; corner < CUBE_CORNERS.length; corner += 1) {
          const [dx, dy, dz] = CUBE_CORNERS[corner] ?? [0, 0, 0];
          const gx = x + dx;
          const gy = y + dy;
          const gz = z + dz;
          const sourceX = sourceCoordinateAtFraction(
            gx / (nx - 1),
            0,
            origin,
            stride,
            chargeDensity.grid,
          );
          const sourceY = sourceCoordinateAtFraction(
            gy / (ny - 1),
            1,
            origin,
            stride,
            chargeDensity.grid,
          );
          const sourceZ = sourceCoordinateAtFraction(
            gz / (nz - 1),
            2,
            origin,
            stride,
            chargeDensity.grid,
          );
          cornerSourcePositions[corner] = [sourceX, sourceY, sourceZ];
          cornerValues[corner] = periodicScalarValueAtSourceGridPoint(
            cornerSourcePositions[corner] ?? [0, 0, 0],
            scalars,
            sourceNx,
            sourceNy,
            sourceNz,
            chargeDensity.grid,
            stride,
            fractionalOffset,
          );
          cornerPositions[corner] = gridPointToCartesian(
            sourceX,
            sourceY,
            sourceZ,
            origin,
            stride,
            chargeDensity.grid,
            cellVectors,
          );
        }

        let cubeIndex = 0;
        for (let corner = 0; corner < 8; corner += 1) {
          if ((cornerValues[corner] ?? 0) < isoValue) {
            cubeIndex |= 1 << corner;
          }
        }

        const edgeBits = MARCHING_CUBES_EDGE_TABLE[cubeIndex] ?? 0;
        if (edgeBits === 0) {
          continue;
        }

        for (let edge = 0; edge < CUBE_EDGES.length; edge += 1) {
          if ((edgeBits & (1 << edge)) === 0) {
            continue;
          }

          const [startCorner, endCorner] = CUBE_EDGES[edge] ?? [0, 0];
          edgeSourceVertices[edge] = interpolateVertex(
            cornerSourcePositions[startCorner] ?? [0, 0, 0],
            cornerSourcePositions[endCorner] ?? [0, 0, 0],
            cornerValues[startCorner] ?? 0,
            cornerValues[endCorner] ?? 0,
            isoValue,
          );
          edgeVertices[edge] = interpolateVertex(
            cornerPositions[startCorner] ?? [0, 0, 0],
            cornerPositions[endCorner] ?? [0, 0, 0],
            cornerValues[startCorner] ?? 0,
            cornerValues[endCorner] ?? 0,
            isoValue,
          );
        }

        const tableOffset = cubeIndex * 16;
        for (let tableIndex = 0; tableIndex < 16; tableIndex += 3) {
          const firstEdge = MARCHING_CUBES_TRI_TABLE[tableOffset + tableIndex] ?? -1;
          if (firstEdge === -1) {
            break;
          }

          const secondEdge = MARCHING_CUBES_TRI_TABLE[tableOffset + tableIndex + 1] ?? -1;
          const thirdEdge = MARCHING_CUBES_TRI_TABLE[tableOffset + tableIndex + 2] ?? -1;
          const first = edgeVertices[firstEdge];
          const second = edgeVertices[secondEdge];
          const third = edgeVertices[thirdEdge];
          const firstSource = edgeSourceVertices[firstEdge];
          const secondSource = edgeSourceVertices[secondEdge];
          const thirdSource = edgeSourceVertices[thirdEdge];
          if (!first || !second || !third || !firstSource || !secondSource || !thirdSource) {
            continue;
          }

          positions.push(...first, ...second, ...third);
          normals.push(
            ...normalAtSourceGridPoint(
              firstSource,
              scalars,
              sourceNx,
              sourceNy,
              sourceNz,
              stride,
              chargeDensity.grid,
              cellVectors,
              isoValue,
              fractionalOffset,
            ),
            ...normalAtSourceGridPoint(
              secondSource,
              scalars,
              sourceNx,
              sourceNy,
              sourceNz,
              stride,
              chargeDensity.grid,
              cellVectors,
              isoValue,
              fractionalOffset,
            ),
            ...normalAtSourceGridPoint(
              thirdSource,
              scalars,
              sourceNx,
              sourceNy,
              sourceNz,
              stride,
              chargeDensity.grid,
              cellVectors,
              isoValue,
              fractionalOffset,
            ),
          );
        }
      }
    }
  }

  if (positions.length === 0) {
    return null;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function chargeDensitySectionGeometry({
  cellVectors,
  chargeDensity,
  fractionalOffset,
  interpolationFactor,
  isoValue,
  sectionAxis,
  sectionPosition,
  surfaceMode,
}: {
  cellVectors: VectorTuple[];
  chargeDensity: ChargeDensitySpec;
  fractionalOffset: [number, number, number];
  interpolationFactor: number;
  isoValue: number;
  sectionAxis: ChargeDensitySectionAxis;
  sectionPosition: number;
  surfaceMode: ChargeDensitySurfaceMode;
}): BufferGeometry | null {
  const scalars = chargeDensity.scalarValues;
  const dataGrid = chargeDensity.dataGrid;
  if (!scalars || !dataGrid) {
    return null;
  }

  const [sourceNx, sourceNy, sourceNz] = dataGrid;
  if (sourceNx < 2 || sourceNy < 2 || sourceNz < 2 || scalars.length !== sourceNx * sourceNy * sourceNz) {
    return null;
  }

  const axisIndex = sectionAxisIndex(sectionAxis);
  const [firstAxis, secondAxis] = boundaryPlaneAxes(axisIndex);
  const factor = Math.min(2, Math.max(1, interpolationFactor));
  const origin = chargeDensity.dataOrigin ?? [0, 0, 0];
  const stride = chargeDensity.dataStride ?? [1, 1, 1];
  const firstSize = Math.max(2, Math.round(dataGrid[firstAxis] * factor) + 1);
  const secondSize = Math.max(2, Math.round(dataGrid[secondAxis] * factor) + 1);
  const fixedSource = sourceCoordinateAtFraction(
    Math.min(100, Math.max(0, sectionPosition)) / 100,
    axisIndex,
    origin,
    stride,
    chargeDensity.grid,
  );
  const positions: number[] = [];
  const normals: number[] = [];

  for (let first = 0; first < firstSize - 1; first += 1) {
    for (let second = 0; second < secondSize - 1; second += 1) {
      const first0 = sourceCoordinateAtFraction(
        first / (firstSize - 1),
        firstAxis,
        origin,
        stride,
        chargeDensity.grid,
      );
      const first1 = sourceCoordinateAtFraction(
        (first + 1) / (firstSize - 1),
        firstAxis,
        origin,
        stride,
        chargeDensity.grid,
      );
      const second0 = sourceCoordinateAtFraction(
        second / (secondSize - 1),
        secondAxis,
        origin,
        stride,
        chargeDensity.grid,
      );
      const second1 = sourceCoordinateAtFraction(
        (second + 1) / (secondSize - 1),
        secondAxis,
        origin,
        stride,
        chargeDensity.grid,
      );
      const source00 = sectionSourcePoint(sectionAxis, fixedSource, first0, second0);
      const source10 = sectionSourcePoint(sectionAxis, fixedSource, first1, second0);
      const source11 = sectionSourcePoint(sectionAxis, fixedSource, first1, second1);
      const source01 = sectionSourcePoint(sectionAxis, fixedSource, first0, second1);
      const cornerSources: GridTuple[] = [source00, source10, source11, source01];
      const cornerValues = cornerSources.map((sourcePoint) =>
        periodicScalarValueAtSourceGridPoint(
          sourcePoint,
          scalars,
          sourceNx,
          sourceNy,
          sourceNz,
          chargeDensity.grid,
          stride,
          fractionalOffset,
        ),
      );

      if (shouldShowPositiveSurface(surfaceMode) && chargeDensity.max >= isoValue) {
        appendChargeDensitySectionPolygon({
          cellVectors,
          fullGrid: chargeDensity.grid,
          normals,
          origin,
          polygon: boundaryFillPolygon(cornerSources, cornerValues, isoValue),
          positions,
          stride,
        });
      }

      if (shouldShowNegativeSurface(surfaceMode) && chargeDensity.min <= -isoValue) {
        appendChargeDensitySectionPolygon({
          cellVectors,
          fullGrid: chargeDensity.grid,
          normals,
          origin,
          polygon: boundaryFillPolygon(cornerSources, cornerValues, -isoValue),
          positions,
          stride,
        });
      }
    }
  }

  if (positions.length === 0) {
    return null;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function appendChargeDensitySectionPolygon({
  cellVectors,
  fullGrid,
  normals,
  origin,
  polygon,
  positions,
  stride,
}: {
  cellVectors: VectorTuple[];
  fullGrid: GridTuple;
  normals: number[];
  origin: GridTuple;
  polygon: BoundaryFillVertex[];
  positions: number[];
  stride: GridTuple;
}) {
  if (polygon.length < 3) {
    return;
  }

  for (let index = 1; index + 1 < polygon.length; index += 1) {
    const firstVertex = polygon[0];
    const secondVertex = polygon[index];
    const thirdVertex = polygon[index + 1];
    if (!firstVertex || !secondVertex || !thirdVertex) {
      continue;
    }

    const firstPosition = gridPointToCartesian(
      firstVertex.point[0],
      firstVertex.point[1],
      firstVertex.point[2],
      origin,
      stride,
      fullGrid,
      cellVectors,
    );
    const secondPosition = gridPointToCartesian(
      secondVertex.point[0],
      secondVertex.point[1],
      secondVertex.point[2],
      origin,
      stride,
      fullGrid,
      cellVectors,
    );
    const thirdPosition = gridPointToCartesian(
      thirdVertex.point[0],
      thirdVertex.point[1],
      thirdVertex.point[2],
      origin,
      stride,
      fullGrid,
      cellVectors,
    );
    const normal = triangleNormalFromPositions(firstPosition, secondPosition, thirdPosition);
    positions.push(...firstPosition, ...secondPosition, ...thirdPosition);
    normals.push(...normal, ...normal, ...normal);
  }
}

function chargeDensityBoundaryLineGeometry({
  boundarySides,
  cellVectors,
  chargeDensity,
  fractionalOffset,
  interpolationFactor,
  isoValue,
}: {
  boundarySides?: BoundarySideMask;
  cellVectors: VectorTuple[];
  chargeDensity: ChargeDensitySpec;
  fractionalOffset: [number, number, number];
  interpolationFactor: number;
  isoValue: number;
}): BufferGeometry | null {
  const scalars = chargeDensity.scalarValues;
  const dataGrid = chargeDensity.dataGrid;
  if (!scalars || !dataGrid) {
    return null;
  }

  const [sourceNx, sourceNy, sourceNz] = dataGrid;
  if (sourceNx < 2 || sourceNy < 2 || sourceNz < 2 || scalars.length !== sourceNx * sourceNy * sourceNz) {
    return null;
  }

  const origin = chargeDensity.dataOrigin ?? [0, 0, 0];
  const stride = chargeDensity.dataStride ?? [1, 1, 1];
  const fullGrid = chargeDensity.grid;
  const factor = Math.min(2, Math.max(1, interpolationFactor));
  const positions: number[] = [];

  for (const axis of [0, 1, 2] as const) {
    const [firstAxis, secondAxis] = boundaryPlaneAxes(axis);
    const firstSize = Math.max(2, Math.round(dataGrid[firstAxis] * factor) + 1);
    const secondSize = Math.max(2, Math.round(dataGrid[secondAxis] * factor) + 1);

    for (const side of [0, 1] as const) {
      if (boundarySides && !boundarySides[axis][side]) {
        continue;
      }

      const fixedSource = sourceCoordinateAtFraction(
        side,
        axis,
        origin,
        stride,
        fullGrid,
      );

      for (let first = 0; first < firstSize - 1; first += 1) {
        for (let second = 0; second < secondSize - 1; second += 1) {
          const first0 = sourceCoordinateAtFraction(
            first / (firstSize - 1),
            firstAxis,
            origin,
            stride,
            fullGrid,
          );
          const first1 = sourceCoordinateAtFraction(
            (first + 1) / (firstSize - 1),
            firstAxis,
            origin,
            stride,
            fullGrid,
          );
          const second0 = sourceCoordinateAtFraction(
            second / (secondSize - 1),
            secondAxis,
            origin,
            stride,
            fullGrid,
          );
          const second1 = sourceCoordinateAtFraction(
            (second + 1) / (secondSize - 1),
            secondAxis,
            origin,
            stride,
            fullGrid,
          );
          const cornerSources: GridTuple[] = [
            boundarySourcePoint(axis, fixedSource, firstAxis, first0, secondAxis, second0),
            boundarySourcePoint(axis, fixedSource, firstAxis, first1, secondAxis, second0),
            boundarySourcePoint(axis, fixedSource, firstAxis, first1, secondAxis, second1),
            boundarySourcePoint(axis, fixedSource, firstAxis, first0, secondAxis, second1),
          ];
          const cornerValues = cornerSources.map((sourcePoint) =>
            periodicScalarValueAtSourceGridPoint(
              sourcePoint,
              scalars,
              sourceNx,
              sourceNy,
              sourceNz,
              fullGrid,
              stride,
              fractionalOffset,
            ),
          );
          const intersections = boundaryContourIntersections(
            cornerSources,
            cornerValues,
            isoValue,
          );

          for (let index = 0; index + 1 < intersections.length; index += 2) {
            const start = intersections[index];
            const end = intersections[index + 1];
            if (!start || !end) {
              continue;
            }
            positions.push(
              ...gridPointToCartesian(start[0], start[1], start[2], origin, stride, fullGrid, cellVectors),
              ...gridPointToCartesian(end[0], end[1], end[2], origin, stride, fullGrid, cellVectors),
            );
          }
        }
      }
    }
  }

  if (positions.length === 0) {
    return null;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function chargeDensityBoundaryFillGeometry({
  boundarySides,
  cellVectors,
  chargeDensity,
  fractionalOffset,
  interpolationFactor,
  isoValue,
}: {
  boundarySides?: BoundarySideMask;
  cellVectors: VectorTuple[];
  chargeDensity: ChargeDensitySpec;
  fractionalOffset: [number, number, number];
  interpolationFactor: number;
  isoValue: number;
}): BufferGeometry | null {
  const scalars = chargeDensity.scalarValues;
  const dataGrid = chargeDensity.dataGrid;
  if (!scalars || !dataGrid) {
    return null;
  }

  const [sourceNx, sourceNy, sourceNz] = dataGrid;
  if (sourceNx < 2 || sourceNy < 2 || sourceNz < 2 || scalars.length !== sourceNx * sourceNy * sourceNz) {
    return null;
  }

  const origin = chargeDensity.dataOrigin ?? [0, 0, 0];
  const stride = chargeDensity.dataStride ?? [1, 1, 1];
  const fullGrid = chargeDensity.grid;
  const factor = Math.min(2, Math.max(1, interpolationFactor));
  const positions: number[] = [];
  const normals: number[] = [];

  for (const axis of [0, 1, 2] as const) {
    const [firstAxis, secondAxis] = boundaryPlaneAxes(axis);
    const firstSize = Math.max(2, Math.round(dataGrid[firstAxis] * factor) + 1);
    const secondSize = Math.max(2, Math.round(dataGrid[secondAxis] * factor) + 1);

    for (const side of [0, 1] as const) {
      if (boundarySides && !boundarySides[axis][side]) {
        continue;
      }

      const fixedSource = sourceCoordinateAtFraction(
        side,
        axis,
        origin,
        stride,
        fullGrid,
      );

      for (let first = 0; first < firstSize - 1; first += 1) {
        for (let second = 0; second < secondSize - 1; second += 1) {
          const first0 = sourceCoordinateAtFraction(
            first / (firstSize - 1),
            firstAxis,
            origin,
            stride,
            fullGrid,
          );
          const first1 = sourceCoordinateAtFraction(
            (first + 1) / (firstSize - 1),
            firstAxis,
            origin,
            stride,
            fullGrid,
          );
          const second0 = sourceCoordinateAtFraction(
            second / (secondSize - 1),
            secondAxis,
            origin,
            stride,
            fullGrid,
          );
          const second1 = sourceCoordinateAtFraction(
            (second + 1) / (secondSize - 1),
            secondAxis,
            origin,
            stride,
            fullGrid,
          );
          const cornerSources: GridTuple[] = [
            boundarySourcePoint(axis, fixedSource, firstAxis, first0, secondAxis, second0),
            boundarySourcePoint(axis, fixedSource, firstAxis, first1, secondAxis, second0),
            boundarySourcePoint(axis, fixedSource, firstAxis, first1, secondAxis, second1),
            boundarySourcePoint(axis, fixedSource, firstAxis, first0, secondAxis, second1),
          ];
          const cornerValues = cornerSources.map((sourcePoint) =>
            periodicScalarValueAtSourceGridPoint(
              sourcePoint,
              scalars,
              sourceNx,
              sourceNy,
              sourceNz,
              fullGrid,
              stride,
              fractionalOffset,
            ),
          );
          const polygon = boundaryFillPolygon(cornerSources, cornerValues, isoValue);
          if (polygon.length < 3) {
            continue;
          }

          for (let index = 1; index + 1 < polygon.length; index += 1) {
            const firstVertex = polygon[0];
            const secondVertex = polygon[index];
            const thirdVertex = polygon[index + 1];
            if (!firstVertex || !secondVertex || !thirdVertex) {
              continue;
            }
            const firstPosition = gridPointToCartesian(
              firstVertex.point[0],
              firstVertex.point[1],
              firstVertex.point[2],
              origin,
              stride,
              fullGrid,
              cellVectors,
            );
            const secondPosition = gridPointToCartesian(
              secondVertex.point[0],
              secondVertex.point[1],
              secondVertex.point[2],
              origin,
              stride,
              fullGrid,
              cellVectors,
            );
            const thirdPosition = gridPointToCartesian(
              thirdVertex.point[0],
              thirdVertex.point[1],
              thirdVertex.point[2],
              origin,
              stride,
              fullGrid,
              cellVectors,
            );
            const normal = triangleNormalFromPositions(firstPosition, secondPosition, thirdPosition);
            positions.push(...firstPosition, ...secondPosition, ...thirdPosition);
            normals.push(...normal, ...normal, ...normal);
          }
        }
      }
    }
  }

  if (positions.length === 0) {
    return null;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function shouldShowPositiveSurface(surfaceMode: ChargeDensitySurfaceMode): boolean {
  return surfaceMode === "both" || surfaceMode === "positive";
}

function shouldShowNegativeSurface(surfaceMode: ChargeDensitySurfaceMode): boolean {
  return surfaceMode === "both" || surfaceMode === "negative";
}

function normalizeChargeDensityRepeat(
  repeat: ChargeDensitySpec["supercellRepeat"],
): GridTuple {
  if (!repeat) {
    return [1, 1, 1];
  }

  return [
    normalizeRepeatAxis(repeat[0]),
    normalizeRepeatAxis(repeat[1]),
    normalizeRepeatAxis(repeat[2]),
  ];
}

function normalizeRepeatAxis(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.round(value));
}

function repeatCellVectors(
  cellVectors: VectorTuple[],
  repeat: GridTuple,
): VectorTuple[] {
  const [a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0]] = cellVectors;
  return [
    scaledVector(a, 1 / repeat[0]),
    scaledVector(b, 1 / repeat[1]),
    scaledVector(c, 1 / repeat[2]),
  ];
}

function sectionPositionForRepeatTile({
  repeat,
  sectionAxis,
  sectionPosition,
  tileOffset,
}: {
  repeat: GridTuple;
  sectionAxis: ChargeDensitySectionAxis;
  sectionPosition: number;
  tileOffset: GridTuple;
}): number | null {
  const axisIndex = sectionAxisIndex(sectionAxis);
  const repeatCount = repeat[axisIndex];
  const axisTileOffset = tileOffset[axisIndex];
  const supercellFraction = Math.min(100, Math.max(0, sectionPosition)) / 100;
  const localFraction = supercellFraction * repeatCount - axisTileOffset;

  if (localFraction < -1e-8 || localFraction > 1 + 1e-8) {
    return null;
  }
  if (localFraction >= 1 - 1e-8 && axisTileOffset < repeatCount - 1) {
    return null;
  }

  return Math.min(100, Math.max(0, localFraction * 100));
}

function translateRenderable<T extends ChargeDensityRenderable>(
  renderable: T | null,
  cellVectors: VectorTuple[],
  tileOffset: GridTuple,
): T | null {
  if (!renderable) {
    return null;
  }

  const [x, y, z] = tileOffsetToCartesian(cellVectors, tileOffset);
  renderable.position.set(x, y, z);
  return renderable;
}

function tileOffsetToCartesian(
  cellVectors: VectorTuple[],
  tileOffset: GridTuple,
): GridTuple {
  const [a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0]] = cellVectors;
  return [
    a[0] * tileOffset[0] + b[0] * tileOffset[1] + c[0] * tileOffset[2],
    a[1] * tileOffset[0] + b[1] * tileOffset[1] + c[1] * tileOffset[2],
    a[2] * tileOffset[0] + b[2] * tileOffset[1] + c[2] * tileOffset[2],
  ];
}

function scalarIndex(x: number, y: number, z: number, ny: number, nz: number): number {
  return (x * ny + y) * nz + z;
}

function sectionAxisIndex(axis: ChargeDensitySectionAxis): 0 | 1 | 2 {
  if (axis === "a") {
    return 0;
  }
  if (axis === "b") {
    return 1;
  }
  return 2;
}

function sectionSourcePoint(
  axis: ChargeDensitySectionAxis,
  fixedSource: number,
  first: number,
  second: number,
): GridTuple {
  if (axis === "a") {
    return [fixedSource, first, second];
  }
  if (axis === "b") {
    return [first, fixedSource, second];
  }
  return [first, second, fixedSource];
}

function boundaryPlaneAxes(axis: 0 | 1 | 2): [0 | 1 | 2, 0 | 1 | 2] {
  if (axis === 0) {
    return [1, 2];
  }
  if (axis === 1) {
    return [0, 2];
  }
  return [0, 1];
}

function boundarySourcePoint(
  axis: 0 | 1 | 2,
  fixedSource: number,
  firstAxis: 0 | 1 | 2,
  first: number,
  secondAxis: 0 | 1 | 2,
  second: number,
): GridTuple {
  const point: GridTuple = [0, 0, 0];
  point[axis] = fixedSource;
  point[firstAxis] = first;
  point[secondAxis] = second;
  return point;
}

function sourceCoordinateAtFraction(
  fraction: number,
  axis: 0 | 1 | 2,
  origin: GridTuple,
  stride: GridTuple,
  sourceGrid: GridTuple,
): number {
  return (Math.min(1, Math.max(0, fraction)) * sourceGrid[axis] - origin[axis]) /
    Math.max(1, stride[axis]);
}

function boundaryContourIntersections(
  cornerSources: GridTuple[],
  cornerValues: number[],
  isoValue: number,
): GridTuple[] {
  const intersections: GridTuple[] = [];

  for (const [startCorner, endCorner] of QUAD_EDGES) {
    const startValue = cornerValues[startCorner] ?? 0;
    const endValue = cornerValues[endCorner] ?? 0;
    const startSide = startValue < isoValue;
    const endSide = endValue < isoValue;
    if (startSide === endSide && startValue !== isoValue && endValue !== isoValue) {
      continue;
    }

    if (Math.abs(startValue - endValue) < 1e-12) {
      continue;
    }

    intersections.push(
      interpolateVertex(
        cornerSources[startCorner] ?? [0, 0, 0],
        cornerSources[endCorner] ?? [0, 0, 0],
        startValue,
        endValue,
        isoValue,
      ),
    );
  }

  return intersections.length === 2 || intersections.length === 4 ? intersections : [];
}

function boundaryFillPolygon(
  cornerSources: GridTuple[],
  cornerValues: number[],
  isoValue: number,
): BoundaryFillVertex[] {
  const polygon = cornerSources.map((point, index) => ({
    point,
    value: cornerValues[index] ?? 0,
  }));
  return clipBoundaryFillPolygonToIsoValue(polygon, isoValue);
}

function clipBoundaryFillPolygonToIsoValue(
  polygon: BoundaryFillVertex[],
  isoValue: number,
): BoundaryFillVertex[] {
  const clipped: BoundaryFillVertex[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    if (!current || !next) {
      continue;
    }

    const currentInside = isBoundaryValueInside(current.value, isoValue);
    const nextInside = isBoundaryValueInside(next.value, isoValue);
    if (currentInside && nextInside) {
      clipped.push(next);
    } else if (currentInside && !nextInside) {
      clipped.push(boundaryFillEdgeIntersection(current, next, isoValue));
    } else if (!currentInside && nextInside) {
      clipped.push(boundaryFillEdgeIntersection(current, next, isoValue), next);
    }
  }

  return clipped;
}

function isBoundaryValueInside(value: number, isoValue: number): boolean {
  return isoValue >= 0 ? value >= isoValue : value <= isoValue;
}

function boundaryFillEdgeIntersection(
  start: BoundaryFillVertex,
  end: BoundaryFillVertex,
  isoValue: number,
): BoundaryFillVertex {
  return {
    point: interpolateVertex(start.point, end.point, start.value, end.value, isoValue),
    value: isoValue,
  };
}

function periodicScalarValueAtSourceGridPoint(
  sourcePoint: GridTuple,
  scalars: readonly number[],
  nx: number,
  ny: number,
  nz: number,
  sourceGrid: GridTuple,
  stride: GridTuple,
  fractionalOffset: GridTuple,
): number {
  return periodicScalarValueAt(
    sourcePoint[0] - fractionalOffset[0] * sourceGrid[0] / Math.max(1, stride[0]),
    sourcePoint[1] - fractionalOffset[1] * sourceGrid[1] / Math.max(1, stride[1]),
    sourcePoint[2] - fractionalOffset[2] * sourceGrid[2] / Math.max(1, stride[2]),
    scalars,
    nx,
    ny,
    nz,
  );
}

function periodicScalarValueAt(
  x: number,
  y: number,
  z: number,
  scalars: readonly number[],
  nx: number,
  ny: number,
  nz: number,
): number {
  const x0 = wrapGridIndex(Math.floor(x), nx);
  const y0 = wrapGridIndex(Math.floor(y), ny);
  const z0 = wrapGridIndex(Math.floor(z), nz);
  const x1 = wrapGridIndex(x0 + 1, nx);
  const y1 = wrapGridIndex(y0 + 1, ny);
  const z1 = wrapGridIndex(z0 + 1, nz);
  const tx = fractionalPart(x);
  const ty = fractionalPart(y);
  const tz = fractionalPart(z);

  const c000 = scalars[scalarIndex(x0, y0, z0, ny, nz)] ?? 0;
  const c100 = scalars[scalarIndex(x1, y0, z0, ny, nz)] ?? 0;
  const c010 = scalars[scalarIndex(x0, y1, z0, ny, nz)] ?? 0;
  const c110 = scalars[scalarIndex(x1, y1, z0, ny, nz)] ?? 0;
  const c001 = scalars[scalarIndex(x0, y0, z1, ny, nz)] ?? 0;
  const c101 = scalars[scalarIndex(x1, y0, z1, ny, nz)] ?? 0;
  const c011 = scalars[scalarIndex(x0, y1, z1, ny, nz)] ?? 0;
  const c111 = scalars[scalarIndex(x1, y1, z1, ny, nz)] ?? 0;
  const c00 = lerp(c000, c100, tx);
  const c10 = lerp(c010, c110, tx);
  const c01 = lerp(c001, c101, tx);
  const c11 = lerp(c011, c111, tx);
  const c0 = lerp(c00, c10, ty);
  const c1 = lerp(c01, c11, ty);
  return lerp(c0, c1, tz);
}

function wrapGridIndex(index: number, size: number): number {
  return ((index % size) + size) % size;
}

function fractionalPart(value: number): number {
  return value - Math.floor(value);
}

function normalAtSourceGridPoint(
  sourcePoint: GridTuple,
  scalars: readonly number[],
  nx: number,
  ny: number,
  nz: number,
  stride: GridTuple,
  sourceGrid: GridTuple,
  cellVectors: VectorTuple[],
  isoValue: number,
  fractionalOffset: GridTuple,
): GridTuple {
  const [x, y, z] = sourcePoint;
  const gradient: GridTuple = [
    scalarDerivativeAt(x, y, z, 0, scalars, nx, ny, nz, sourceGrid, stride, fractionalOffset),
    scalarDerivativeAt(x, y, z, 1, scalars, nx, ny, nz, sourceGrid, stride, fractionalOffset),
    scalarDerivativeAt(x, y, z, 2, scalars, nx, ny, nz, sourceGrid, stride, fractionalOffset),
  ];
  const normal = cartesianNormalFromGridGradient(
    gradient,
    stride,
    sourceGrid,
    cellVectors,
  );
  const direction = isoValue < 0 ? -1 : 1;
  return [
    normal[0] * direction,
    normal[1] * direction,
    normal[2] * direction,
  ];
}

function scalarDerivativeAt(
  x: number,
  y: number,
  z: number,
  axis: 0 | 1 | 2,
  scalars: readonly number[],
  nx: number,
  ny: number,
  nz: number,
  sourceGrid: GridTuple,
  stride: GridTuple,
  fractionalOffset: GridTuple,
): number {
  const values: GridTuple = [x, y, z];
  const lowPoint = [...values] as GridTuple;
  const highPoint = [...values] as GridTuple;
  lowPoint[axis] = values[axis] - 1;
  highPoint[axis] = values[axis] + 1;
  return (
    periodicScalarValueAtSourceGridPoint(
      highPoint,
      scalars,
      nx,
      ny,
      nz,
      sourceGrid,
      stride,
      fractionalOffset,
    ) -
    periodicScalarValueAtSourceGridPoint(
      lowPoint,
      scalars,
      nx,
      ny,
      nz,
      sourceGrid,
      stride,
      fractionalOffset,
    )
  ) / 2;
}

function cartesianNormalFromGridGradient(
  gradient: GridTuple,
  stride: GridTuple,
  sourceGrid: GridTuple,
  cellVectors: VectorTuple[],
): GridTuple {
  const [a = [1, 0, 0], b = [0, 1, 0], c = [0, 0, 1]] = cellVectors;
  const row0 = scaledVector(a, stride[0] / Math.max(1, sourceGrid[0]));
  const row1 = scaledVector(b, stride[1] / Math.max(1, sourceGrid[1]));
  const row2 = scaledVector(c, stride[2] / Math.max(1, sourceGrid[2]));
  return normalizeVector(solveRows(row0, row1, row2, gradient));
}

function scaledVector(vector: VectorTuple, scale: number): GridTuple {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

function solveRows(row0: GridTuple, row1: GridTuple, row2: GridTuple, rhs: GridTuple): GridTuple {
  const [a, b, c] = row0;
  const [d, e, f] = row1;
  const [g, h, i] = row2;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) {
    return normalizeVector(rhs);
  }

  return [
    ((e * i - f * h) * rhs[0] + (c * h - b * i) * rhs[1] + (b * f - c * e) * rhs[2]) / determinant,
    ((f * g - d * i) * rhs[0] + (a * i - c * g) * rhs[1] + (c * d - a * f) * rhs[2]) / determinant,
    ((d * h - e * g) * rhs[0] + (b * g - a * h) * rhs[1] + (a * e - b * d) * rhs[2]) / determinant,
  ];
}

function normalizeVector(vector: GridTuple): GridTuple {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length < 1e-12) {
    return [0, 0, 1];
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function triangleNormalFromPositions(
  first: GridTuple,
  second: GridTuple,
  third: GridTuple,
): GridTuple {
  const firstEdge: GridTuple = [
    second[0] - first[0],
    second[1] - first[1],
    second[2] - first[2],
  ];
  const secondEdge: GridTuple = [
    third[0] - first[0],
    third[1] - first[1],
    third[2] - first[2],
  ];
  return normalizeVector([
    firstEdge[1] * secondEdge[2] - firstEdge[2] * secondEdge[1],
    firstEdge[2] * secondEdge[0] - firstEdge[0] * secondEdge[2],
    firstEdge[0] * secondEdge[1] - firstEdge[1] * secondEdge[0],
  ]);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function gridPointToCartesian(
  x: number,
  y: number,
  z: number,
  origin: GridTuple,
  stride: GridTuple,
  sourceGrid: GridTuple,
  cellVectors: VectorTuple[],
): GridTuple {
  const fractional: GridTuple = [
    (origin[0] + x * stride[0]) / Math.max(1, sourceGrid[0]),
    (origin[1] + y * stride[1]) / Math.max(1, sourceGrid[1]),
    (origin[2] + z * stride[2]) / Math.max(1, sourceGrid[2]),
  ];
  const [a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0]] = cellVectors;

  return [
    fractional[0] * a[0] + fractional[1] * b[0] + fractional[2] * c[0],
    fractional[0] * a[1] + fractional[1] * b[1] + fractional[2] * c[1],
    fractional[0] * a[2] + fractional[1] * b[2] + fractional[2] * c[2],
  ];
}

function interpolateVertex(
  start: GridTuple,
  end: GridTuple,
  startValue: number,
  endValue: number,
  isoValue: number,
): GridTuple {
  const denominator = endValue - startValue;
  const t = Math.abs(denominator) < 1e-12 ? 0.5 : (isoValue - startValue) / denominator;
  const clampedT = Math.min(1, Math.max(0, t));

  return [
    start[0] + (end[0] - start[0]) * clampedT,
    start[1] + (end[1] - start[1]) * clampedT,
    start[2] + (end[2] - start[2]) * clampedT,
  ];
}

const CUBE_CORNERS: GridTuple[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];

const CUBE_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [3, 2],
  [0, 3],
  [4, 5],
  [5, 6],
  [7, 6],
  [4, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

const QUAD_EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
];
