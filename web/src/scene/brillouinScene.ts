import type { SceneSpec } from "../api/scene";
import type { VectorTuple } from "./viewMath";

export function sceneForBrillouinZoneView(scene: SceneSpec | null): SceneSpec | null {
  if (!scene?.brillouinZone) {
    return null;
  }

  return {
    ...scene,
    atoms: [],
    bonds: [],
    cell: {
      vectors: scene.brillouinZone.basis.map((vector) => [...vector] as VectorTuple),
    },
    polyhedra: [],
  };
}
