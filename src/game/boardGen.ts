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

export function generateBoard(
  preset: BoardPreset = 'random_balanced',
  rng: () => number = Math.random,
) {
  const harborKinds =
    preset === 'standard' ? HARBOR_POOL : shuffleArray(HARBOR_POOL, rng);
  const topology = buildBoardTopology(harborKinds);

  const terrains =
    preset === 'standard' ? [...STANDARD_TERRAINS] : shuffleArray(STANDARD_TERRAINS, rng);

  let hexes: HexTile[] = [];

  if (preset === 'standard') {
    let nIdx = 0;
    hexes = topology.hexCoords.map((coord, idx) => {
      const terrain = terrains[idx];
      const isDesert = terrain === 'desert';
      return {
        ...coord,
        terrain,
        numberToken: isDesert ? null : STANDARD_NUMBERS_NO_DESERT[nIdx++],
        hasRobber: isDesert,
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
