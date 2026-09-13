import * as THREE from "three";

export type IfcViewerMesh = THREE.Mesh<
  THREE.BufferGeometry,
  THREE.Material | THREE.Material[]
>;

export interface CameraClipRange {
  near: number;
  far: number;
}

export interface MeshVisibility {
  hidden: boolean;
  ghosted: boolean;
}

export interface MaterialVisibility {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
}

export function indexMeshesByGuid(
  meshes: Iterable<THREE.Object3D>,
): Map<string, IfcViewerMesh[]> {
  const byGuid = new Map<string, IfcViewerMesh[]>();
  for (const object of meshes) {
    if (!(object instanceof THREE.Mesh)) continue;
    const guid = object.userData?.guid;
    if (typeof guid !== "string" || !guid) continue;
    const matches = byGuid.get(guid);
    if (matches) matches.push(object as IfcViewerMesh);
    else byGuid.set(guid, [object as IfcViewerMesh]);
  }
  return byGuid;
}

export function deriveCameraClipRange(
  distance: number,
  radius: number,
): CameraClipRange | null {
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 10;
  const near = Math.max(distance * 0.0015, safeRadius * 0.00005, 0.01);
  const far = Math.max(distance + safeRadius * 12, safeRadius * 40, near * 100, 100);
  return near < far ? { near, far } : null;
}

export function shouldUpdateCameraClipRange(
  current: CameraClipRange,
  next: CameraClipRange,
): boolean {
  return (
    Math.abs(current.near - next.near) / next.near > 0.05
    || Math.abs(current.far - next.far) / next.far > 0.05
  );
}

export function deriveMeshVisibility(
  guid: string | undefined,
  hidden: ReadonlySet<string>,
  isolated: ReadonlySet<string> | null,
): MeshVisibility {
  const isHidden = guid ? hidden.has(guid) : false;
  return {
    hidden: isHidden,
    ghosted: !isHidden && isolated !== null ? !(guid && isolated.has(guid)) : false,
  };
}

export function deriveMaterialVisibility(
  baseOpacity: number,
  baseTransparent: boolean,
  ghosted: boolean,
  ghostOpacity = 0.07,
): MaterialVisibility {
  return ghosted
    ? { transparent: true, opacity: ghostOpacity, depthWrite: false }
    : { transparent: baseTransparent, opacity: baseOpacity, depthWrite: true };
}

export function selectedGuids(meshes: Iterable<THREE.Object3D>): string[] {
  return [
    ...new Set(
      [...meshes]
        .map((mesh) => mesh.userData?.guid)
        .filter((guid): guid is string => typeof guid === "string" && guid.length > 0),
    ),
  ];
}

export function clipHeight(bounds: THREE.Box3, fraction: number): number {
  const clamped = Math.min(1, Math.max(0, Number(fraction)));
  return bounds.min.y + (bounds.max.y - bounds.min.y) * clamped;
}

export function measureMarkerRadius(modelRadius: number): number {
  return Math.min(Math.max(modelRadius * 0.004, 0.025), 0.18);
}
