import * as THREE from "three";

interface DisposableModel {
  dispose(): void;
}

interface ViewerResources {
  grid?: THREE.Object3D | null;
  ground?: THREE.Object3D | null;
  model?: DisposableModel | null;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    material.forEach((entry) => entry.dispose());
    return;
  }
  material.dispose();
}

export function disposeObjectResources(object: THREE.Object3D | null | undefined): void {
  if (!object) return;
  object.traverse((child) => {
    const resource = child as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    resource.geometry?.dispose();
    if (resource.material) disposeMaterial(resource.material);
  });
}

export function clearDisposableGroup(group: THREE.Group | null | undefined): void {
  if (!group) return;
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    disposeObjectResources(child);
  }
}

export function disposeViewerResources(resources: ViewerResources | null | undefined): void {
  if (!resources) return;
  disposeObjectResources(resources.grid);
  disposeObjectResources(resources.ground);
  resources.model?.dispose();
}
