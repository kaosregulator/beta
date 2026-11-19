export type WorldPointProjector = (
  x: number,
  y: number,
  z: number,
) => { x: number; y: number; visible: boolean } | null;

let activeProjector: WorldPointProjector | null = null;

export function registerBoardProjector(fn: WorldPointProjector | null) {
  activeProjector = fn;
}

export function projectBoardWorldPoint(
  x: number,
  y: number,
  z: number,
): { x: number; y: number; visible: boolean } | null {
  return activeProjector ? activeProjector(x, y, z) : null;
}
