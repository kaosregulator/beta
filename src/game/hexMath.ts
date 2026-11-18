import type { BoardEdge, BoardVertex, Harbor, HarborKind, HexTile } from './types';

export const HEX_RADIUS = 1.65; // Pointy-top hex radius in world units

const SQRT3 = Math.sqrt(3);

export function axialToWorld(q: number, r: number, radius = HEX_RADIUS): { x: number; z: number } {
  const x = radius * SQRT3 * (q + r / 2);
  const z = radius * 1.5 * r;
  return { x, z };
}

/**
 * Generates the standard 19-hex axial grid of radius 2 in spiral order
 * starting from outer top-left ring spiraling inward to center (0, 0).
 */
export function generateIslandAxialCoords(): Array<{ q: number; r: number }> {
  const coords: Array<{ q: number; r: number }> = [];
  for (let r = -2; r <= 2; r++) {
    const qMin = Math.max(-2, -r - 2);
    const qMax = Math.min(2, -r + 2);
    for (let q = qMin; q <= qMax; q++) {
      coords.push({ q, r });
    }
  }
  return coords;
}

function keyFromPos(x: number, z: number): string {
  // Quantize to 3 decimal places to merge shared hex corners cleanly
  const kx = Math.round(x * 1000);
  const kz = Math.round(z * 1000);
  return `${kx}_${kz}`;
}

export interface BoardTopology {
  hexCoords: Array<{ id: string; q: number; r: number; x: number; z: number }>;
  vertices: BoardVertex[];
  edges: BoardEdge[];
  harbors: Harbor[];
}

/**
 * Builds deterministic topology of 19 hexes, 54 vertices, 72 edges, and 9 coastal harbors.
 */
export function buildBoardTopology(
  harborKinds?: HarborKind[],
  radius = HEX_RADIUS,
): BoardTopology {
  const coords = generateIslandAxialCoords();
  const hexCoords = coords.map(({ q, r }, idx) => {
    const { x, z } = axialToWorld(q, r, radius);
    return { id: `hex_${idx}`, q, r, x, z };
  });

  const vertexMap = new Map<string, BoardVertex>();
  const vertexPosKeyToId = new Map<string, string>();
  const edgeMap = new Map<string, BoardEdge>();
  const edgePairToId = new Map<string, string>();

  let vCounter = 0;
  let eCounter = 0;

  // Pointy-top hex corners: angle = 60*i - 30 degrees (starts top-right, clockwise)
  for (const hex of hexCoords) {
    const cornerIds: string[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      const vx = hex.x + radius * Math.cos(angle);
      const vz = hex.z + radius * Math.sin(angle);
      const pKey = keyFromPos(vx, vz);

      let vId = vertexPosKeyToId.get(pKey);
      if (!vId) {
        vId = `v_${vCounter++}`;
        vertexPosKeyToId.set(pKey, vId);
        vertexMap.set(vId, {
          id: vId,
          x: vx,
          z: vz,
          adjacentHexIds: [],
          adjacentVertexIds: [],
          adjacentEdgeIds: [],
          harborId: null,
          building: null,
        });
      }
      const vertex = vertexMap.get(vId)!;
      if (!vertex.adjacentHexIds.includes(hex.id)) {
        vertex.adjacentHexIds.push(hex.id);
      }
      cornerIds.push(vId);
    }

    for (let i = 0; i < 6; i++) {
      const vAId = cornerIds[i];
      const vBId = cornerIds[(i + 1) % 6];
      const pairKey = vAId < vBId ? `${vAId}|${vBId}` : `${vBId}|${vAId}`;

      let eId = edgePairToId.get(pairKey);
      if (!eId) {
        const vA = vertexMap.get(vAId)!;
        const vB = vertexMap.get(vBId)!;
        const ex = (vA.x + vB.x) / 2;
        const ez = (vA.z + vB.z) / 2;
        const angle = Math.atan2(vB.z - vA.z, vB.x - vA.x);

        eId = `e_${eCounter++}`;
        edgePairToId.set(pairKey, eId);
        edgeMap.set(eId, {
          id: eId,
          x: ex,
          z: ez,
          angle,
          vertexIds: [vAId, vBId],
          adjacentHexIds: [hex.id],
          ownerId: null,
        });

        if (!vA.adjacentVertexIds.includes(vBId)) vA.adjacentVertexIds.push(vBId);
        if (!vB.adjacentVertexIds.includes(vAId)) vB.adjacentVertexIds.push(vAId);
        if (!vA.adjacentEdgeIds.includes(eId)) vA.adjacentEdgeIds.push(eId);
        if (!vB.adjacentEdgeIds.includes(eId)) vB.adjacentEdgeIds.push(eId);
      } else {
        const edge = edgeMap.get(eId)!;
        if (!edge.adjacentHexIds.includes(hex.id)) {
          edge.adjacentHexIds.push(hex.id);
        }
      }
    }
  }

  // Identify the 30 coastal perimeter edges sorted clockwise around center (0, 0)
  const coastalEdges = Array.from(edgeMap.values())
    .filter((e) => e.adjacentHexIds.length === 1)
    .sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));

  // Walk the coastal ring in connected order so harbors sit evenly spaced around the island
  const orderedCoastalEdges: BoardEdge[] = [];
  if (coastalEdges.length > 0) {
    const remaining = new Set(coastalEdges.map((e) => e.id));
    let current = coastalEdges[0];
    orderedCoastalEdges.push(current);
    remaining.delete(current.id);

    while (remaining.size > 0) {
      const next = coastalEdges.find(
        (cand) =>
          remaining.has(cand.id) &&
          (cand.vertexIds[0] === current.vertexIds[0] ||
            cand.vertexIds[0] === current.vertexIds[1] ||
            cand.vertexIds[1] === current.vertexIds[0] ||
            cand.vertexIds[1] === current.vertexIds[1]),
      );
      if (!next) break;
      orderedCoastalEdges.push(next);
      remaining.delete(next.id);
      current = next;
    }
  }

  const defaultHarborKinds: HarborKind[] = [
    'generic_3_1',
    'grain',
    'ore',
    'generic_3_1',
    'wool',
    'generic_3_1',
    'brick',
    'timber',
    'generic_3_1',
  ];
  const chosenKinds = harborKinds && harborKinds.length === 9 ? harborKinds : defaultHarborKinds;

  // Place 9 harbors along the 30 coastal edges spaced by ~3 edges (indices 0,3,7,10,13,17,20,23,27)
  const harborEdgeIndices = [0, 3, 7, 10, 13, 17, 20, 23, 27];
  const harbors: Harbor[] = [];

  harborEdgeIndices.forEach((edgeIdx, hIdx) => {
    const edge = orderedCoastalEdges[edgeIdx % orderedCoastalEdges.length];
    if (!edge) return;

    const kind = chosenKinds[hIdx];
    const ratio: 2 | 3 = kind === 'generic_3_1' ? 3 : 2;
    const hId = `harbor_${hIdx}`;

    // Outward normal from island center
    const len = Math.hypot(edge.x, edge.z) || 1;
    const nx = edge.x / len;
    const nz = edge.z / len;
    const harborDist = 0.54;
    const hx = edge.x + nx * harborDist;
    const hz = edge.z + nz * harborDist;
    const hAngle = Math.atan2(nz, nx);

    harbors.push({
      id: hId,
      kind,
      ratio,
      x: hx,
      z: hz,
      angle: hAngle,
      vertexIds: edge.vertexIds,
    });

    for (const vId of edge.vertexIds) {
      const v = vertexMap.get(vId);
      if (v) v.harborId = hId;
    }
  });

  return {
    hexCoords,
    vertices: Array.from(vertexMap.values()),
    edges: Array.from(edgeMap.values()),
    harbors,
  };
}

/**
 * Computes adjacency between hex tiles based on shared coordinates.
 */
export function areHexesAdjacent(a: HexTile, b: HexTile): boolean {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -a.q - a.r - (-b.q - b.r);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2 === 1;
}
