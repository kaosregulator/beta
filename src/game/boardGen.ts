import { areHexesAdjacent, buildBoardTopology } from './hexMath';
import type { BoardPreset, DevCardType, HarborKind, HexTile, TerrainType } from './types';

const STANDARD_TERRAINS: TerrainType[] = [
  'mountains',
  'pasture',
  'forest',
  'fields',
  'hills',
  'pasture',
  'hills',
  'fields',
  'forest',
  'desert',
  'forest',
  'mountains',
  'forest',
  'mountains',
  'fields',
  'pasture',
  'hills',
  'fields',
  'pasture',
];

const STANDARD_NUMBERS_NO_DESERT = [
  10, 2, 9, 12, 6, 4, 10, 9, 11, 3, 8, 8, 3, 4, 5, 5, 6, 11,
];

const HARBOR_POOL: HarborKind[] = [
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

export function shuffleArray<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function createDevDeck(rng: () => number = Math.random): DevCardType[] {
  const deck: DevCardType[] = [
    ...Array<DevCardType>(14).fill('knight'),
    ...Array<DevCardType>(5).fill('victory_point'),
    ...Array<DevCardType>(2).fill('road_building'),
    ...Array<DevCardType>(2).fill('year_of_plenty'),
    ...Array<DevCardType>(2).fill('monopoly'),
  ];
  return shuffleArray(deck, rng);
}

export interface BeginnerSeatPlacement {
  starredSettlementVertexId: string;
  starredRoadEdgeId: string;
  secondSettlementVertexId: string;
  secondRoadEdgeId: string;
}

/**
 * Official Set-Up for Beginners starting positions on the fixed Standard Island.
 * Each seat places 2 settlements obeying the Distance Rule (>= 2 edges apart)
 * and 2 connected roads, with the starred settlement granting 3 starting resource cards.
 */
export const BEGINNER_START_SEATS: readonly BeginnerSeatPlacement[] = [
  {
    // Seat 0: Fields(12) + Hills(6) + Forest(11) & Mountains(3) + Fields(4) + Fields(6)
    starredSettlementVertexId: 'v_14',
    starredRoadEdgeId: 'e_16',
    secondSettlementVertexId: 'v_41',
    secondRoadEdgeId: 'e_58',
  },
  {
    // Seat 1: Forest(3) + Fields(4) + Pasture(5) & Mountains(10) + Pasture(2) + Hills(6)
    starredSettlementVertexId: 'v_34',
    starredRoadEdgeId: 'e_56',
    secondSettlementVertexId: 'v_1',
    secondRoadEdgeId: 'e_0',
  },
  {
    // Seat 2: Forest(9) + Pasture(4) + Hills(10) & Forest(8) + Mountains(3) + Hills(5)
    starredSettlementVertexId: 'v_12',
    starredRoadEdgeId: 'e_13',
    secondSettlementVertexId: 'v_38',
    secondRoadEdgeId: 'e_49',
  },
  {
    // Seat 3: Hills(10) + Forest(3) + Mountains(8) & Fields(9) + Forest(11) + Forest(8)
    starredSettlementVertexId: 'v_24',
    starredRoadEdgeId: 'e_28',
    secondSettlementVertexId: 'v_25',
    secondRoadEdgeId: 'e_31',
  },
];

export function generateBoard(
  preset: BoardPreset = 'random_balanced',
  rng: () => number = Math.random,
  options?: { revealed?: boolean },
) {
  const revealed = options?.revealed ?? true;
  const isFixedLayout = preset === 'standard' || preset === 'beginner_setup';
  const harborKinds = isFixedLayout ? HARBOR_POOL : shuffleArray(HARBOR_POOL, rng);
  const topology = buildBoardTopology(harborKinds);

  const terrains = isFixedLayout
    ? [...STANDARD_TERRAINS]
    : shuffleArray(STANDARD_TERRAINS, rng);

  let hexes: HexTile[] = [];

  if (isFixedLayout) {
    let nIdx = 0;
    hexes = topology.hexCoords.map((coord, idx) => {
      const terrain = terrains[idx];
      const isDesert = terrain === 'desert';
      return {
        ...coord,
        terrain,
        numberToken: isDesert ? null : STANDARD_NUMBERS_NO_DESERT[nIdx++],
        hasRobber: isDesert,
        revealed,
      };
    });
  } else {
    // Random balanced: try up to 50 shuffles to ensure no two 6/8 tiles touch
    for (let attempt = 0; attempt < 50; attempt++) {
      const nums = shuffleArray(STANDARD_NUMBERS_NO_DESERT, rng);
      let nIdx = 0;
      const candidate: HexTile[] = topology.hexCoords.map((coord, idx) => {
        const terrain = terrains[idx];
        const isDesert = terrain === 'desert';
        return {
          ...coord,
          terrain,
          numberToken: isDesert ? null : nums[nIdx++],
          hasRobber: isDesert,
          revealed,
        };
      });

      const redHexes = candidate.filter(
        (h) => h.numberToken === 6 || h.numberToken === 8,
      );
      let hasAdjacentReds = false;
      for (let i = 0; i < redHexes.length; i++) {
        for (let j = i + 1; j < redHexes.length; j++) {
          if (areHexesAdjacent(redHexes[i], redHexes[j])) {
            hasAdjacentReds = true;
            break;
          }
        }
        if (hasAdjacentReds) break;
      }

      hexes = candidate;
      if (!hasAdjacentReds) break;
    }
  }

  return {
    hexes,
    vertices: topology.vertices,
    edges: topology.edges,
    harbors: topology.harbors,
  };
}

/**
 * Reshuffles all unrevealed tiles' terrains and number tokens (keeping any
 * already-revealed tiles fixed) while preserving balanced non-adjacent 6/8 placement.
 */
export function shuffleHexTiles(
  hexes: readonly HexTile[],
  preset: BoardPreset = 'random_balanced',
  rng: () => number = Math.random,
): HexTile[] {
  const unrevealedIndices: number[] = [];
  for (let i = 0; i < hexes.length; i++) {
    if (!hexes[i].revealed) unrevealedIndices.push(i);
  }
  if (unrevealedIndices.length < 2) {
    return hexes.map((h) => ({ ...h }));
  }

  const poolTerrains = unrevealedIndices.map((idx) => hexes[idx].terrain);
  const poolNumbers = unrevealedIndices
    .map((idx) => hexes[idx].numberToken)
    .filter((n): n is number => n !== null);

  let bestResult: HexTile[] = hexes.map((h) => ({ ...h }));
  const maxAttempts = preset === 'standard' ? 12 : 60;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const shuffledTerrains = shuffleArray(poolTerrains, rng);
    const shuffledNums = shuffleArray(poolNumbers, rng);
    let nIdx = 0;

    const candidate = hexes.map((h) => ({ ...h }));
    for (let k = 0; k < unrevealedIndices.length; k++) {
      const hexIdx = unrevealedIndices[k];
      const t = shuffledTerrains[k];
      const isDesert = t === 'desert';
      candidate[hexIdx].terrain = t;
      candidate[hexIdx].numberToken = isDesert ? null : shuffledNums[nIdx++];
      candidate[hexIdx].hasRobber = isDesert;
    }

    const changed = unrevealedIndices.some(
      (idx) =>
        candidate[idx].terrain !== hexes[idx].terrain ||
        candidate[idx].numberToken !== hexes[idx].numberToken,
    );
    if (!changed && attempt < maxAttempts - 1) continue;

    bestResult = candidate;
    if (preset === 'standard') break;

    const redHexes = candidate.filter(
      (h) => h.numberToken === 6 || h.numberToken === 8,
    );
    let hasAdjacentReds = false;
    for (let i = 0; i < redHexes.length; i++) {
      for (let j = i + 1; j < redHexes.length; j++) {
        if (areHexesAdjacent(redHexes[i], redHexes[j])) {
          hasAdjacentReds = true;
          break;
        }
      }
      if (hasAdjacentReds) break;
    }
    if (!hasAdjacentReds) break;
  }

  return bestResult;
}

