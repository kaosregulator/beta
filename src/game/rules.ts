import {
  BEGINNER_START_SEATS,
  createDevDeck,
  generateBoard,
  shuffleHexTiles,
} from './boardGen';
import {
  BUILD_COSTS,
  PIECE_LIMITS,
  TERRAIN_RESOURCE,
  type BoardPreset,
  type FactionColor,
  type GameAction,
  type GameEvent,
  type GameState,
  type HarvestGrant,
  type PlayerState,
  type PrivatePlayerState,
  type PublicGameState,
  type ResourceBundle,
  type ResourceType,
} from './types';

const RESOURCE_KEYS: readonly ResourceType[] = [
  'timber',
  'wool',
  'grain',
  'brick',
  'ore',
];

export function emptyResources(): ResourceBundle {
  return { timber: 0, wool: 0, grain: 0, brick: 0, ore: 0 };
}

export function initialBank(): ResourceBundle {
  return { timber: 19, wool: 19, grain: 19, brick: 19, ore: 19 };
}

export function totalResourceCount(r: ResourceBundle): number {
  return r.timber + r.wool + r.grain + r.brick + r.ore;
}

export function hasResources(
  available: ResourceBundle,
  cost: ResourceBundle,
): boolean {
  return (
    available.timber >= cost.timber &&
    available.wool >= cost.wool &&
    available.grain >= cost.grain &&
    available.brick >= cost.brick &&
    available.ore >= cost.ore
  );
}

export function subtractResources(
  available: ResourceBundle,
  cost: ResourceBundle,
): ResourceBundle {
  return {
    timber: available.timber - cost.timber,
    wool: available.wool - cost.wool,
    grain: available.grain - cost.grain,
    brick: available.brick - cost.brick,
    ore: available.ore - cost.ore,
  };
}

export function addResources(
  a: ResourceBundle,
  b: Partial<ResourceBundle>,
): ResourceBundle {
  return {
    timber: a.timber + (b.timber ?? 0),
    wool: a.wool + (b.wool ?? 0),
    grain: a.grain + (b.grain ?? 0),
    brick: a.brick + (b.brick ?? 0),
    ore: a.ore + (b.ore ?? 0),
  };
}

export function cloneGameState(state: GameState): GameState {
  return structuredClone(state);
}

function appendEvent(
  state: GameState,
  event: Omit<GameEvent, 'id' | 'turn' | 'timestamp'>,
) {
  const id = `evt_${state.turnNumber}_${state.events.length}_${Math.floor(Math.random() * 10000)}`;
  state.events = [
    ...state.events.slice(-49),
    {
      ...event,
      id,
      turn: state.turnNumber,
      timestamp: Date.now(),
    },
  ];
}

export interface CreateGameOptions {
  roomId: string;
  preset?: BoardPreset;
  blindStart?: boolean;
  victoryTarget?: number;
  players: Array<{
    id: string;
    name: string;
    color: FactionColor;
    isBot?: boolean;
    connected?: boolean;
  }>;
  rng?: () => number;
}

export function createInitialGameState(options: CreateGameOptions): GameState {
  const rng = options.rng ?? Math.random;
  const preset = options.preset ?? 'random_balanced';
  const blindStart = Boolean(options.blindStart) && preset !== 'beginner_setup';
  const board = generateBoard(preset, rng, { revealed: !blindStart });

  const players: PlayerState[] = options.players.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    isBot: Boolean(p.isBot),
    connected: p.connected ?? true,
    resources: emptyResources(),
    devCards: [],
    knightsPlayed: 0,
    roadsBuilt: 0,
    settlementsBuilt: 0,
    citiesBuilt: 0,
    longestRoadLength: 0,
    hasLongestRoad: false,
    hasLargestArmy: false,
    publicVP: 0,
    totalVP: 0,
  }));

  const state: GameState = {
    roomId: options.roomId,
    preset,
    victoryTarget: options.victoryTarget ?? 10,
    phase:
      preset === 'beginner_setup'
        ? 'roll'
        : blindStart
          ? 'tile_reveal'
          : 'setup_forward_settlement',
    turnNumber: 1,
    players,
    activePlayerIndex: 0,
    setupStepIndex: 0,
    lastPlacedSetupSettlementId: null,
    hexes: board.hexes,
    vertices: board.vertices,
    edges: board.edges,
    harbors: board.harbors,
    devDeck: createDevDeck(rng),
    bank: initialBank(),
    devCardPlayedThisTurn: false,
    dice: null,
    diceRollSeq: 0,
    shuffleSeq: 0,
    lastHarvestGrants: [],
    pendingDiscardPlayerIds: [],
    stealCandidateIds: [],
    activeTradeOffers: [],
    longestRoadOwnerId: null,
    largestArmyOwnerId: null,
    winnerId: null,
    events: [],
  };

  if (preset === 'beginner_setup') {
    const vertexById = new Map(state.vertices.map((v) => [v.id, v]));
    const edgeById = new Map(state.edges.map((e) => [e.id, e]));
    const hexById = new Map(state.hexes.map((h) => [h.id, h]));

    players.forEach((p, idx) => {
      const seat = BEGINNER_START_SEATS[idx];
      if (!seat) return;

      const vStar = vertexById.get(seat.starredSettlementVertexId);
      const eStar = edgeById.get(seat.starredRoadEdgeId);
      const vSecond = vertexById.get(seat.secondSettlementVertexId);
      const eSecond = edgeById.get(seat.secondRoadEdgeId);

      if (vStar) {
        vStar.building = { ownerId: p.id, type: 'settlement' };
        p.settlementsBuilt += 1;
        for (const hId of vStar.adjacentHexIds) {
          const hex = hexById.get(hId);
          if (!hex) continue;
          const res = TERRAIN_RESOURCE[hex.terrain];
          if (res && state.bank[res] > 0) {
            state.bank[res] -= 1;
            p.resources[res] += 1;
          }
        }
      }
      if (eStar) {
        eStar.ownerId = p.id;
        p.roadsBuilt += 1;
      }
      if (vSecond) {
        vSecond.building = { ownerId: p.id, type: 'settlement' };
        p.settlementsBuilt += 1;
      }
      if (eSecond) {
        eSecond.ownerId = p.id;
        p.roadsBuilt += 1;
      }
    });

    recomputeAwardsAndVP(state);
    if (players.length > 0) {
      appendEvent(state, {
        type: 'turn',
        playerId: players[0].id,
        message: `Beginner Set-Up ready: initial settlements, roads, and starting resources dealt. ${players[0].name} rolls to start Turn 1.`,
      });
    }
  } else if (players.length > 0) {
    appendEvent(state, {
      type: 'turn',
      playerId: players[0].id,
      message: blindStart
        ? 'Tiles dealt face-down with numbers showing. Shuffle or flip tiles to reveal the island!'
        : `${players[0].name} begins initial settlement placement.`,
    });
  }

  return state;
}

export function getPlayerTradeRatios(
  state: GameState,
  playerId: string,
): Record<ResourceType, number> {
  const ratios: Record<ResourceType, number> = {
    timber: 4,
    wool: 4,
    grain: 4,
    brick: 4,
    ore: 4,
  };

  const ownedHarborIds = new Set<string>();
  for (const v of state.vertices) {
    if (v.building?.ownerId === playerId && v.harborId) {
      ownedHarborIds.add(v.harborId);
    }
  }

  for (const harbor of state.harbors) {
    if (!ownedHarborIds.has(harbor.id)) continue;
    if (harbor.kind === 'generic_3_1') {
      for (const r of Object.keys(ratios) as ResourceType[]) {
        ratios[r] = Math.min(ratios[r], 3);
      }
    } else {
      ratios[harbor.kind] = Math.min(ratios[harbor.kind], 2);
    }
  }

  return ratios;
}

export function getValidSetupSettlementVertices(state: GameState): string[] {
  const vertexById = new Map(state.vertices.map((v) => [v.id, v]));
  return state.vertices
    .filter((v) => {
      if (v.building !== null) return false;
      // Distance rule: no adjacent vertex may contain a building
      return v.adjacentVertexIds.every((adjId) => vertexById.get(adjId)?.building === null);
    })
    .map((v) => v.id);
}

export function getValidSettlementVertices(
  state: GameState,
  playerId: string,
): string[] {
  if (
    state.phase === 'setup_forward_settlement' ||
    state.phase === 'setup_reverse_settlement'
  ) {
    return getValidSetupSettlementVertices(state);
  }

  const vertexById = new Map(state.vertices.map((v) => [v.id, v]));
  const edgeById = new Map(state.edges.map((e) => [e.id, e]));

  return state.vertices
    .filter((v) => {
      if (v.building !== null) return false;
      const respectsDistance = v.adjacentVertexIds.every(
        (adjId) => vertexById.get(adjId)?.building === null,
      );
      if (!respectsDistance) return false;
      // Must connect to at least one owned road
      return v.adjacentEdgeIds.some((eId) => edgeById.get(eId)?.ownerId === playerId);
    })
    .map((v) => v.id);
}

export function getValidRoadEdges(state: GameState, playerId: string): string[] {
  if (
    state.phase === 'setup_forward_road' ||
    state.phase === 'setup_reverse_road'
  ) {
    const anchorId = state.lastPlacedSetupSettlementId;
    if (!anchorId) return [];
    const anchor = state.vertices.find((v) => v.id === anchorId);
    if (!anchor) return [];
    return state.edges
      .filter((e) => e.ownerId === null && anchor.adjacentEdgeIds.includes(e.id))
      .map((e) => e.id);
  }

  const vertexById = new Map(state.vertices.map((v) => [v.id, v]));
  const edgeById = new Map(state.edges.map((e) => [e.id, e]));

  return state.edges
    .filter((e) => {
      if (e.ownerId !== null) return false;
      // Valid if either endpoint has an owned building OR an owned road not blocked by an enemy building
      return e.vertexIds.some((vId) => {
        const v = vertexById.get(vId);
        if (!v) return false;
        if (v.building?.ownerId === playerId) return true;
        if (v.building !== null && v.building.ownerId !== playerId) return false; // blocked by rival settlement/city
        return v.adjacentEdgeIds.some((adjEdgeId) => {
          const adjEdge = edgeById.get(adjEdgeId);
          return adjEdge && adjEdge.id !== e.id && adjEdge.ownerId === playerId;
        });
      });
    })
    .map((e) => e.id);
}

export function getValidCityVertices(state: GameState, playerId: string): string[] {
  return state.vertices
    .filter(
      (v) => v.building?.ownerId === playerId && v.building.type === 'settlement',
    )
    .map((v) => v.id);
}

/**
 * Computes longest simple path of roads for a given player, respecting
 * rival settlements/cities that break road continuity through a vertex.
 */
export function calculateLongestRoad(state: GameState, playerId: string): number {
  const playerEdges = state.edges.filter((e) => e.ownerId === playerId);
  if (playerEdges.length === 0) return 0;

  const vertexById = new Map(state.vertices.map((v) => [v.id, v]));
  const edgesAtVertex = new Map<string, typeof playerEdges>();

  for (const edge of playerEdges) {
    for (const vId of edge.vertexIds) {
      const list = edgesAtVertex.get(vId) ?? [];
      list.push(edge);
      edgesAtVertex.set(vId, list);
    }
  }

  let best = 0;

  function dfs(currentVertexId: string, usedEdges: Set<string>, length: number) {
    if (length > best) best = length;

    const v = vertexById.get(currentVertexId);
    // If an opponent owns a building on this vertex, we cannot pass *through* it to another edge
    if (length > 0 && v?.building && v.building.ownerId !== playerId) {
      return;
    }

    const connected = edgesAtVertex.get(currentVertexId) ?? [];
    for (const edge of connected) {
      if (usedEdges.has(edge.id)) continue;
      usedEdges.add(edge.id);
      const nextVertexId =
        edge.vertexIds[0] === currentVertexId ? edge.vertexIds[1] : edge.vertexIds[0];
      dfs(nextVertexId, usedEdges, length + 1);
      usedEdges.delete(edge.id);
    }
  }

  for (const startVertexId of edgesAtVertex.keys()) {
    dfs(startVertexId, new Set<string>(), 0);
  }

  return best;
}

export function recomputeAwardsAndVP(state: GameState): void {
  // 1. Update longest road lengths
  for (const p of state.players) {
    p.longestRoadLength = calculateLongestRoad(state, p.id);
  }

  // Longest Road award (min 5; ties keep current holder if still >= max)
  let maxRoad = 4;
  for (const p of state.players) {
    if (p.longestRoadLength > maxRoad) maxRoad = p.longestRoadLength;
  }

  if (maxRoad >= 5) {
    const contenders = state.players.filter((p) => p.longestRoadLength === maxRoad);
    if (contenders.length === 1) {
      if (state.longestRoadOwnerId !== contenders[0].id) {
        state.longestRoadOwnerId = contenders[0].id;
        appendEvent(state, {
          type: 'award',
          playerId: contenders[0].id,
          message: `${contenders[0].name} claims Longest Road (${maxRoad} roads)!`,
        });
      }
    } else if (
      state.longestRoadOwnerId &&
      !contenders.some((c) => c.id === state.longestRoadOwnerId)
    ) {
      // Current holder was surpassed by multiple tied players -> no one holds it until broken
      state.longestRoadOwnerId = null;
    }
  } else {
    state.longestRoadOwnerId = null;
  }

  // Largest Army award (min 3 knights)
  let maxKnights = 2;
  for (const p of state.players) {
    if (p.knightsPlayed > maxKnights) maxKnights = p.knightsPlayed;
  }
  if (maxKnights >= 3) {
    const contenders = state.players.filter((p) => p.knightsPlayed === maxKnights);
    if (contenders.length === 1) {
      if (state.largestArmyOwnerId !== contenders[0].id) {
        state.largestArmyOwnerId = contenders[0].id;
        appendEvent(state, {
          type: 'award',
          playerId: contenders[0].id,
          message: `${contenders[0].name} claims Largest Army (${maxKnights} knights)!`,
        });
      }
    }
  }

  // Recompute VP for all players
  for (const p of state.players) {
    p.hasLongestRoad = state.longestRoadOwnerId === p.id;
    p.hasLargestArmy = state.largestArmyOwnerId === p.id;

    const buildingVP = p.settlementsBuilt * 1 + p.citiesBuilt * 2;
    const awardVP = (p.hasLongestRoad ? 2 : 0) + (p.hasLargestArmy ? 2 : 0);
    const hiddenVP = p.devCards.filter((c) => c.type === 'victory_point').length;

    p.publicVP = buildingVP + awardVP;
    p.totalVP = p.publicVP + hiddenVP;
  }

  // Check victory condition (official rule: a player can only win on their own turn)
  const activePlayer = state.players[state.activePlayerIndex];
  if (activePlayer && activePlayer.totalVP >= state.victoryTarget) {
    state.winnerId = activePlayer.id;
    state.phase = 'finished';
    appendEvent(state, {
      type: 'victory',
      playerId: activePlayer.id,
      message: `${activePlayer.name} wins the island with ${activePlayer.totalVP} Victory Points!`,
    });
  }
}

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };

export function applyAction(
  currentState: GameState,
  action: GameAction,
  rng: () => number = Math.random,
): ActionResult {
  if (currentState.phase === 'finished') {
    return { ok: false, error: 'Game has already finished.' };
  }

  const state = cloneGameState(currentState);
  const activePlayer = state.players[state.activePlayerIndex];
  const actor = state.players.find((p) => p.id === action.playerId);

  if (!actor) {
    return { ok: false, error: 'Unknown player.' };
  }

  // Actions allowed outside activePlayer turn: DISCARD_RESOURCES, RESPOND_TRADE_OFFER, and tile_reveal shuffle/flips
  const isTileRevealAction =
    state.phase === 'tile_reveal' &&
    (action.type === 'SHUFFLE_TILES' ||
      action.type === 'FLIP_TILE' ||
      action.type === 'FLIP_ALL_TILES');

  if (
    !isTileRevealAction &&
    action.type !== 'DISCARD_RESOURCES' &&
    action.type !== 'RESPOND_TRADE_OFFER' &&
    actor.id !== activePlayer.id
  ) {
    return { ok: false, error: 'It is not your turn.' };
  }

  switch (action.type) {
    case 'SHUFFLE_TILES': {
      if (state.phase !== 'tile_reveal') {
        return { ok: false, error: 'Tiles can only be shuffled before setup begins.' };
      }
      const unrevealedCount = state.hexes.filter((h) => !h.revealed).length;
      if (unrevealedCount < 2) {
        return { ok: false, error: 'Not enough face-down tiles left to shuffle.' };
      }
      state.hexes = shuffleHexTiles(state.hexes, state.preset, rng);
      state.shuffleSeq += 1;
      appendEvent(state, {
        type: 'turn',
        playerId: actor.id,
        message: `${actor.name} shuffled the face-down island tiles.`,
      });
      return { ok: true, state };
    }

    case 'FLIP_TILE': {
      if (state.phase !== 'tile_reveal') {
        return { ok: false, error: 'All tiles have already been revealed.' };
      }
      const hex = state.hexes.find((h) => h.id === action.hexId);
      if (!hex) {
        return { ok: false, error: 'Invalid tile.' };
      }
      if (hex.revealed) {
        return { ok: false, error: 'Tile is already revealed.' };
      }
      hex.revealed = true;
      const allRevealed = state.hexes.every((h) => h.revealed);
      if (allRevealed) {
        state.phase = 'setup_forward_settlement';
        state.activePlayerIndex = 0;
        appendEvent(state, {
          type: 'turn',
          playerId: state.players[0]?.id,
          message: `All island tiles revealed! ${state.players[0]?.name} begins initial settlement placement.`,
        });
      }
      return { ok: true, state };
    }

    case 'FLIP_ALL_TILES': {
      if (state.phase !== 'tile_reveal') {
        return { ok: false, error: 'All tiles have already been revealed.' };
      }
      for (const h of state.hexes) {
        h.revealed = true;
      }
      state.phase = 'setup_forward_settlement';
      state.activePlayerIndex = 0;
      appendEvent(state, {
        type: 'turn',
        playerId: state.players[0]?.id,
        message: `${actor.name} flipped all island tiles! ${state.players[0]?.name} begins initial settlement placement.`,
      });
      return { ok: true, state };
    }

    case 'PLACE_SETUP_SETTLEMENT': {
      if (
        state.phase !== 'setup_forward_settlement' &&
        state.phase !== 'setup_reverse_settlement'
      ) {
        return { ok: false, error: 'Cannot place setup settlement right now.' };
      }

      const validVertices = getValidSetupSettlementVertices(state);
      if (!validVertices.includes(action.vertexId)) {
        return { ok: false, error: 'Invalid settlement placement (distance rule).' };
      }

      const vertex = state.vertices.find((v) => v.id === action.vertexId)!;
      vertex.building = { ownerId: actor.id, type: 'settlement' };
      actor.settlementsBuilt += 1;
      state.lastPlacedSetupSettlementId = vertex.id;

      // Second (reverse) settlement grants starting resources from adjacent non-desert hexes
      if (state.phase === 'setup_reverse_settlement') {
        const gained = emptyResources();
        for (const hId of vertex.adjacentHexIds) {
          const hex = state.hexes.find((h) => h.id === hId);
          if (!hex) continue;
          const res = TERRAIN_RESOURCE[hex.terrain];
          if (res && state.bank[res] > 0) {
            state.bank[res] -= 1;
            gained[res] += 1;
          }
        }
        actor.resources = addResources(actor.resources, gained);
      }

      state.phase =
        state.phase === 'setup_forward_settlement'
          ? 'setup_forward_road'
          : 'setup_reverse_road';

      appendEvent(state, {
        type: 'build',
        playerId: actor.id,
        message: `${actor.name} founded a settlement.`,
      });
      recomputeAwardsAndVP(state);
      return { ok: true, state };
    }

    case 'PLACE_SETUP_ROAD': {
      if (
        state.phase !== 'setup_forward_road' &&
        state.phase !== 'setup_reverse_road'
      ) {
        return { ok: false, error: 'Cannot place setup road right now.' };
      }

      const validEdges = getValidRoadEdges(state, actor.id);
      if (!validEdges.includes(action.edgeId)) {
        return { ok: false, error: 'Setup road must connect to your new settlement.' };
      }

      const edge = state.edges.find((e) => e.id === action.edgeId)!;
      edge.ownerId = actor.id;
      actor.roadsBuilt += 1;
      state.lastPlacedSetupSettlementId = null;

      const count = state.players.length;
      if (state.phase === 'setup_forward_road') {
        if (state.activePlayerIndex < count - 1) {
          state.activePlayerIndex += 1;
          state.phase = 'setup_forward_settlement';
        } else {
          // Last player places their second settlement immediately
          state.phase = 'setup_reverse_settlement';
        }
      } else {
        if (state.activePlayerIndex > 0) {
          state.activePlayerIndex -= 1;
          state.phase = 'setup_reverse_settlement';
        } else {
          // Setup complete — start turn 1 roll phase for player 0
          state.phase = 'roll';
          state.turnNumber = 1;
        }
      }

      appendEvent(state, {
        type: 'build',
        playerId: actor.id,
        message: `${actor.name} built a road.`,
      });
      recomputeAwardsAndVP(state);
      return { ok: true, state };
    }

    case 'ROLL_DICE': {
      if (state.phase !== 'roll') {
        return { ok: false, error: 'Dice have already been rolled this turn.' };
      }

      const d1 = Math.floor(rng() * 6) + 1;
      const d2 = Math.floor(rng() * 6) + 1;
      const sum = d1 + d2;
      state.dice = [d1, d2];
      state.diceRollSeq += 1;
      state.lastHarvestGrants = [];

      if (sum === 7) {
        const mustDiscard = state.players
          .filter((p) => totalResourceCount(p.resources) > 7)
          .map((p) => p.id);

        if (mustDiscard.length > 0) {
          state.pendingDiscardPlayerIds = mustDiscard;
          state.phase = 'discard';
          appendEvent(state, {
            type: 'dice',
            playerId: actor.id,
            message: `${actor.name} rolled a 7! Players with 8+ cards must discard half.`,
            details: { dice: [d1, d2], sum },
          });
        } else {
          state.phase = 'move_robber';
          appendEvent(state, {
            type: 'dice',
            playerId: actor.id,
            message: `${actor.name} rolled a 7 and moves the Robber!`,
            details: { dice: [d1, d2], sum },
          });
        }
        return { ok: true, state };
      }

      // Distribute resources for matching tiles without robber, enforcing the 95-card Bank supply
      const matchingHexes = state.hexes.filter(
        (h) => h.numberToken === sum && !h.hasRobber,
      );
      const vertexById = new Map(state.vertices.map((v) => [v.id, v]));
      const demandByPlayer = new Map<string, ResourceBundle>();
      const rawHexDemands: HarvestGrant[] = [];

      for (const hex of matchingHexes) {
        const res = TERRAIN_RESOURCE[hex.terrain];
        if (!res) continue;

        const hexPlayerAmounts = new Map<string, number>();
        for (const v of vertexById.values()) {
          if (!v.building || !v.adjacentHexIds.includes(hex.id)) continue;
          const amount = v.building.type === 'city' ? 2 : 1;
          const ownerId = v.building.ownerId;
          const pDemand = demandByPlayer.get(ownerId) ?? emptyResources();
          pDemand[res] += amount;
          demandByPlayer.set(ownerId, pDemand);
          hexPlayerAmounts.set(ownerId, (hexPlayerAmounts.get(ownerId) ?? 0) + amount);
        }

        for (const [ownerId, amount] of hexPlayerAmounts) {
          rawHexDemands.push({
            hexId: hex.id,
            terrain: hex.terrain,
            numberToken: sum,
            playerId: ownerId,
            resource: res,
            amount,
            hexX: hex.x,
            hexZ: hex.z,
          });
        }
      }

      const grantedByPlayer = new Map<string, ResourceBundle>();
      const finalGrants: HarvestGrant[] = [];
      const shortageNotes: string[] = [];

      for (const res of RESOURCE_KEYS) {
        let totalDemand = 0;
        const claimants: Array<{ playerId: string; qty: number }> = [];
        for (const p of state.players) {
          const qty = demandByPlayer.get(p.id)?.[res] ?? 0;
          if (qty > 0) {
            totalDemand += qty;
            claimants.push({ playerId: p.id, qty });
          }
        }
        if (totalDemand === 0) continue;

        const available = state.bank[res];
        if (totalDemand <= available) {
          state.bank[res] -= totalDemand;
          for (const c of claimants) {
            const g = grantedByPlayer.get(c.playerId) ?? emptyResources();
            g[res] += c.qty;
            grantedByPlayer.set(c.playerId, g);
          }
          for (const item of rawHexDemands) {
            if (item.resource === res) {
              finalGrants.push(item);
            }
          }
        } else if (claimants.length === 1) {
          // Single recipient gets whatever remains in the Bank
          if (available > 0) {
            const sole = claimants[0];
            const g = grantedByPlayer.get(sole.playerId) ?? emptyResources();
            g[res] += available;
            grantedByPlayer.set(sole.playerId, g);
            state.bank[res] = 0;

            let rem = available;
            for (const item of rawHexDemands) {
              if (item.resource === res && item.playerId === sole.playerId && rem > 0) {
                const take = Math.min(rem, item.amount);
                finalGrants.push({ ...item, amount: take });
                rem -= take;
              }
            }
          }
          shortageNotes.push(`Bank low on ${res}`);
        } else {
          // 2+ players need this resource and Bank lacks enough -> none distributed
          shortageNotes.push(`Bank shortage: no ${res} dealt`);
        }
      }

      state.lastHarvestGrants = finalGrants;

      const summaryParts: string[] = [];
      for (const p of state.players) {
        const gain = grantedByPlayer.get(p.id);
        if (gain && totalResourceCount(gain) > 0) {
          p.resources = addResources(p.resources, gain);
          summaryParts.push(`${p.name} +${totalResourceCount(gain)}`);
        }
      }

      state.phase = 'main';
      const detailText =
        summaryParts.length > 0
          ? summaryParts.join(', ')
          : 'no resources yielded';
      const suffix = shortageNotes.length > 0 ? `; ${shortageNotes.join('; ')}` : '';
      appendEvent(state, {
        type: 'dice',
        playerId: actor.id,
        message: `${actor.name} rolled ${sum} (${detailText}${suffix}).`,
        details: { dice: [d1, d2], sum },
      });
      return { ok: true, state };
    }

    case 'DISCARD_RESOURCES': {
      if (state.phase !== 'discard') {
        return { ok: false, error: 'Not in discard phase.' };
      }
      if (!state.pendingDiscardPlayerIds.includes(actor.id)) {
        return { ok: false, error: 'You do not need to discard.' };
      }

      const totalHeld = totalResourceCount(actor.resources);
      const requiredDiscard = Math.floor(totalHeld / 2);
      const providedDiscard = totalResourceCount(action.bundle);

      if (providedDiscard !== requiredDiscard) {
        return {
          ok: false,
          error: `Must discard exactly ${requiredDiscard} resources.`,
        };
      }
      if (!hasResources(actor.resources, action.bundle)) {
        return { ok: false, error: 'Cannot discard resources you do not have.' };
      }

      actor.resources = subtractResources(actor.resources, action.bundle);
      state.bank = addResources(state.bank, action.bundle);
      state.pendingDiscardPlayerIds = state.pendingDiscardPlayerIds.filter(
        (id) => id !== actor.id,
      );

      appendEvent(state, {
        type: 'robber',
        playerId: actor.id,
        message: `${actor.name} discarded ${requiredDiscard} cards.`,
      });

      if (state.pendingDiscardPlayerIds.length === 0) {
        state.phase = 'move_robber';
      }
      return { ok: true, state };
    }

    case 'MOVE_ROBBER': {
      if (state.phase !== 'move_robber') {
        return { ok: false, error: 'Cannot move the robber right now.' };
      }
      const targetHex = state.hexes.find((h) => h.id === action.hexId);
      if (!targetHex) {
        return { ok: false, error: 'Invalid hex.' };
      }
      if (targetHex.hasRobber) {
        return { ok: false, error: 'Robber must move to a different tile.' };
      }

      for (const h of state.hexes) h.hasRobber = false;
      targetHex.hasRobber = true;

      // Find adjacent opponents with >= 1 resource card
      const candidateIds = new Set<string>();
      for (const v of state.vertices) {
        if (
          v.building &&
          v.building.ownerId !== actor.id &&
          v.adjacentHexIds.includes(targetHex.id)
        ) {
          const opp = state.players.find((p) => p.id === v.building!.ownerId);
          if (opp && totalResourceCount(opp.resources) > 0) {
            candidateIds.add(opp.id);
          }
        }
      }

      if (candidateIds.size === 1) {
        const [soleTargetId] = Array.from(candidateIds);
        stealRandomResource(actor, state.players.find((p) => p.id === soleTargetId)!, state, rng);
        state.stealCandidateIds = [];
        state.phase = state.dice ? 'main' : 'roll';
      } else if (candidateIds.size > 1) {
        state.stealCandidateIds = Array.from(candidateIds);
        state.phase = 'steal';
        appendEvent(state, {
          type: 'robber',
          playerId: actor.id,
          message: `${actor.name} placed the Robber and chooses a rival to raid.`,
        });
      } else {
        state.stealCandidateIds = [];
        state.phase = state.dice ? 'main' : 'roll';
        appendEvent(state, {
          type: 'robber',
          playerId: actor.id,
          message: `${actor.name} moved the Robber.`,
        });
      }

      return { ok: true, state };
    }

    case 'STEAL_RESOURCE': {
      if (state.phase !== 'steal') {
        return { ok: false, error: 'Not in steal phase.' };
      }
      if (!state.stealCandidateIds.includes(action.targetPlayerId)) {
        return { ok: false, error: 'Invalid steal target.' };
      }
      const victim = state.players.find((p) => p.id === action.targetPlayerId)!;
      stealRandomResource(actor, victim, state, rng);
      state.stealCandidateIds = [];
      state.phase = state.dice ? 'main' : 'roll';
      return { ok: true, state };
    }

    case 'BUILD_ROAD': {
      const isFreeRoad =
        state.phase === 'road_building_1' || state.phase === 'road_building_2';
      if (state.phase !== 'main' && !isFreeRoad) {
        return { ok: false, error: 'Can only build roads during main phase.' };
      }
      if (actor.roadsBuilt >= PIECE_LIMITS.roads) {
        return { ok: false, error: 'No roads remaining in your supply.' };
      }
      if (!isFreeRoad && !hasResources(actor.resources, BUILD_COSTS.road)) {
        return { ok: false, error: 'Insufficient resources for a Road.' };
      }

      const validEdges = getValidRoadEdges(state, actor.id);
      if (!validEdges.includes(action.edgeId)) {
        return { ok: false, error: 'Invalid road placement.' };
      }

      if (!isFreeRoad) {
        actor.resources = subtractResources(actor.resources, BUILD_COSTS.road);
        state.bank = addResources(state.bank, BUILD_COSTS.road);
      }

      const edge = state.edges.find((e) => e.id === action.edgeId)!;
      edge.ownerId = actor.id;
      actor.roadsBuilt += 1;

      const returnPhase = state.dice ? 'main' : 'roll';
      if (state.phase === 'road_building_1') {
        const nextValid = getValidRoadEdges(state, actor.id);
        state.phase =
          actor.roadsBuilt < PIECE_LIMITS.roads && nextValid.length > 0
            ? 'road_building_2'
            : returnPhase;
      } else if (state.phase === 'road_building_2') {
        state.phase = returnPhase;
      }

      appendEvent(state, {
        type: 'build',
        playerId: actor.id,
        message: `${actor.name} built a road.`,
      });
      recomputeAwardsAndVP(state);
      return { ok: true, state };
    }

    case 'BUILD_SETTLEMENT': {
      if (state.phase !== 'main') {
        return { ok: false, error: 'Can only build settlements during main phase.' };
      }
      if (actor.settlementsBuilt >= PIECE_LIMITS.settlements) {
        return { ok: false, error: 'No settlements remaining in your supply.' };
      }
      if (!hasResources(actor.resources, BUILD_COSTS.settlement)) {
        return { ok: false, error: 'Insufficient resources for a Settlement.' };
      }

      const validVertices = getValidSettlementVertices(state, actor.id);
      if (!validVertices.includes(action.vertexId)) {
        return { ok: false, error: 'Invalid settlement location.' };
      }

      actor.resources = subtractResources(actor.resources, BUILD_COSTS.settlement);
      state.bank = addResources(state.bank, BUILD_COSTS.settlement);
      const vertex = state.vertices.find((v) => v.id === action.vertexId)!;
      vertex.building = { ownerId: actor.id, type: 'settlement' };
      actor.settlementsBuilt += 1;

      appendEvent(state, {
        type: 'build',
        playerId: actor.id,
        message: `${actor.name} built a settlement!`,
      });
      recomputeAwardsAndVP(state);
      return { ok: true, state };
    }

    case 'UPGRADE_CITY': {
      if (state.phase !== 'main') {
        return { ok: false, error: 'Can only upgrade cities during main phase.' };
      }
      if (actor.citiesBuilt >= PIECE_LIMITS.cities) {
        return { ok: false, error: 'No cities remaining in your supply.' };
      }
      if (!hasResources(actor.resources, BUILD_COSTS.city)) {
        return { ok: false, error: 'Insufficient resources for a City.' };
      }

      const validVertices = getValidCityVertices(state, actor.id);
      if (!validVertices.includes(action.vertexId)) {
        return { ok: false, error: 'Must select one of your settlements to upgrade.' };
      }

      actor.resources = subtractResources(actor.resources, BUILD_COSTS.city);
      state.bank = addResources(state.bank, BUILD_COSTS.city);
      const vertex = state.vertices.find((v) => v.id === action.vertexId)!;
      vertex.building = { ownerId: actor.id, type: 'city' };
      actor.settlementsBuilt -= 1;
      actor.citiesBuilt += 1;

      appendEvent(state, {
        type: 'build',
        playerId: actor.id,
        message: `${actor.name} upgraded a settlement into a City!`,
      });
      recomputeAwardsAndVP(state);
      return { ok: true, state };
    }

    case 'BUY_DEV_CARD': {
      if (state.phase !== 'main') {
        return { ok: false, error: 'Can only buy development cards during main phase.' };
      }
      if (state.devDeck.length === 0) {
        return { ok: false, error: 'Development deck is empty.' };
      }
      if (!hasResources(actor.resources, BUILD_COSTS.dev_card)) {
        return { ok: false, error: 'Insufficient resources for a Development Card.' };
      }

      actor.resources = subtractResources(actor.resources, BUILD_COSTS.dev_card);
      state.bank = addResources(state.bank, BUILD_COSTS.dev_card);
      const cardType = state.devDeck.pop()!;
      actor.devCards.push({
        id: `dc_${state.turnNumber}_${actor.devCards.length}_${Math.floor(rng() * 10000)}`,
        type: cardType,
        boughtTurn: state.turnNumber,
        played: false,
      });

      appendEvent(state, {
        type: 'dev_card',
        playerId: actor.id,
        message: `${actor.name} acquired a Development Card.`,
      });
      recomputeAwardsAndVP(state);
      return { ok: true, state };
    }

    case 'PLAY_DEV_CARD': {
      if (state.phase !== 'roll' && state.phase !== 'main') {
        return { ok: false, error: 'Cannot play a development card right now.' };
      }
      if (state.devCardPlayedThisTurn) {
        return { ok: false, error: 'You may only play one development card per turn.' };
      }

      const card = actor.devCards.find((c) => c.id === action.cardId);
      if (!card || card.played) {
        return { ok: false, error: 'Development card unavailable.' };
      }
      if (card.type === 'victory_point') {
        return { ok: false, error: 'Victory Point cards count automatically.' };
      }
      if (card.boughtTurn === state.turnNumber) {
        return { ok: false, error: 'Cannot play a card on the same turn it was bought.' };
      }

      if (card.type === 'knight') {
        card.played = true;
        state.devCardPlayedThisTurn = true;
        actor.knightsPlayed += 1;
        state.phase = 'move_robber';
        appendEvent(state, {
          type: 'dev_card',
          playerId: actor.id,
          message: `${actor.name} played a Knight!`,
        });
        recomputeAwardsAndVP(state);
        return { ok: true, state };
      }

      if (card.type === 'road_building') {
        const valid = getValidRoadEdges(state, actor.id);
        if (actor.roadsBuilt >= PIECE_LIMITS.roads || valid.length === 0) {
          return {
            ok: false,
            error: 'No valid road placements or road pieces remaining.',
          };
        }
        card.played = true;
        state.devCardPlayedThisTurn = true;
        state.phase = 'road_building_1';
        appendEvent(state, {
          type: 'dev_card',
          playerId: actor.id,
          message: `${actor.name} played Road Building!`,
        });
        return { ok: true, state };
      }

      if (card.type === 'year_of_plenty') {
        if (!action.resource1 || !action.resource2) {
          return { ok: false, error: 'Select 2 resources for Year of Plenty.' };
        }
        const needed = emptyResources();
        needed[action.resource1] += 1;
        needed[action.resource2] += 1;
        if (!hasResources(state.bank, needed)) {
          return {
            ok: false,
            error: 'The Bank does not have enough of the chosen resource(s).',
          };
        }
        card.played = true;
        state.devCardPlayedThisTurn = true;
        state.bank = subtractResources(state.bank, needed);
        actor.resources = addResources(actor.resources, needed);
        appendEvent(state, {
          type: 'dev_card',
          playerId: actor.id,
          message: `${actor.name} played Year of Plenty (+1 ${action.resource1}, +1 ${action.resource2}).`,
        });
        return { ok: true, state };
      }

      if (card.type === 'monopoly') {
        if (!action.resource1) {
          return { ok: false, error: 'Select a resource for Monopoly.' };
        }
        card.played = true;
        state.devCardPlayedThisTurn = true;
        const targetRes = action.resource1;
        let stolenTotal = 0;
        for (const p of state.players) {
          if (p.id === actor.id) continue;
          const qty = p.resources[targetRes];
          if (qty > 0) {
            p.resources[targetRes] = 0;
            stolenTotal += qty;
          }
        }
        actor.resources[targetRes] += stolenTotal;
        appendEvent(state, {
          type: 'dev_card',
          playerId: actor.id,
          message: `${actor.name} played Monopoly on ${targetRes} (claimed ${stolenTotal}).`,
        });
        return { ok: true, state };
      }

      return { ok: false, error: 'Unsupported card type.' };
    }

    case 'BANK_TRADE': {
      if (state.phase !== 'main') {
        return { ok: false, error: 'Can only trade with the bank during main phase.' };
      }
      if (action.give === action.receive) {
        return { ok: false, error: 'Cannot trade a resource for itself.' };
      }
      if (state.bank[action.receive] < 1) {
        return { ok: false, error: `The Bank is out of ${action.receive}.` };
      }
      const ratios = getPlayerTradeRatios(state, actor.id);
      const ratio = ratios[action.give];
      if (actor.resources[action.give] < ratio) {
        return {
          ok: false,
          error: `Need ${ratio} ${action.give} for maritime/bank trade.`,
        };
      }

      actor.resources[action.give] -= ratio;
      state.bank[action.give] += ratio;
      state.bank[action.receive] -= 1;
      actor.resources[action.receive] += 1;
      appendEvent(state, {
        type: 'trade',
        playerId: actor.id,
        message: `${actor.name} traded ${ratio} ${action.give} for 1 ${action.receive}.`,
      });
      return { ok: true, state };
    }

    case 'CREATE_TRADE_OFFER': {
      if (state.phase !== 'main') {
        return { ok: false, error: 'Can only offer trades during main phase.' };
      }
      if (
        totalResourceCount(action.offering) === 0 ||
        totalResourceCount(action.requesting) === 0
      ) {
        return { ok: false, error: 'Trade must offer and request at least 1 resource.' };
      }
      if (
        RESOURCE_KEYS.some(
          (r) => action.offering[r] > 0 && action.requesting[r] > 0,
        )
      ) {
        return {
          ok: false,
          error: 'Cannot offer and request the same resource type.',
        };
      }
      if (!hasResources(actor.resources, action.offering)) {
        return { ok: false, error: 'You do not possess all offered resources.' };
      }

      state.activeTradeOffers.push({
        id: `tr_${state.turnNumber}_${state.activeTradeOffers.length}_${Math.floor(rng() * 10000)}`,
        fromPlayerId: actor.id,
        toPlayerId: action.toPlayerId,
        offering: action.offering,
        requesting: action.requesting,
        rejectedBy: [],
      });
      appendEvent(state, {
        type: 'trade',
        playerId: actor.id,
        message: `${actor.name} proposed a trade.`,
      });
      return { ok: true, state };
    }

    case 'RESPOND_TRADE_OFFER': {
      if (state.phase !== 'main') {
        return { ok: false, error: 'Trading is only open during main phase.' };
      }
      const offerIdx = state.activeTradeOffers.findIndex((o) => o.id === action.offerId);
      if (offerIdx === -1) {
        return { ok: false, error: 'Trade offer no longer exists.' };
      }
      const offer = state.activeTradeOffers[offerIdx];
      if (offer.fromPlayerId === actor.id) {
        return { ok: false, error: 'Cannot respond to your own offer.' };
      }
      if (offer.toPlayerId && offer.toPlayerId !== actor.id) {
        return { ok: false, error: 'This offer was directed to another player.' };
      }

      if (!action.accept) {
        if (!offer.rejectedBy.includes(actor.id)) {
          offer.rejectedBy.push(actor.id);
        }
        return { ok: true, state };
      }

      const sender = state.players.find((p) => p.id === offer.fromPlayerId);
      if (!sender) return { ok: false, error: 'Offer sender missing.' };

      if (!hasResources(sender.resources, offer.offering)) {
        state.activeTradeOffers.splice(offerIdx, 1);
        return { ok: false, error: 'Offer sender no longer holds those resources.' };
      }
      if (!hasResources(actor.resources, offer.requesting)) {
        return { ok: false, error: 'You do not hold the requested resources.' };
      }

      sender.resources = addResources(
        subtractResources(sender.resources, offer.offering),
        offer.requesting,
      );
      actor.resources = addResources(
        subtractResources(actor.resources, offer.requesting),
        offer.offering,
      );
      state.activeTradeOffers.splice(offerIdx, 1);

      appendEvent(state, {
        type: 'trade',
        playerId: actor.id,
        message: `${actor.name} accepted ${sender.name}'s trade offer!`,
      });
      return { ok: true, state };
    }

    case 'CANCEL_TRADE_OFFER': {
      state.activeTradeOffers = state.activeTradeOffers.filter(
        (o) => !(o.id === action.offerId && o.fromPlayerId === actor.id),
      );
      return { ok: true, state };
    }

    case 'END_TURN': {
      if (state.phase !== 'main') {
        return { ok: false, error: 'Must finish current step before ending turn.' };
      }

      state.activeTradeOffers = [];
      state.devCardPlayedThisTurn = false;
      state.dice = null;
      state.lastHarvestGrants = [];
      state.activePlayerIndex = (state.activePlayerIndex + 1) % state.players.length;
      state.turnNumber += 1;
      state.phase = 'roll';

      const nextPlayer = state.players[state.activePlayerIndex];
      appendEvent(state, {
        type: 'turn',
        playerId: nextPlayer.id,
        message: `${nextPlayer.name}'s turn begins.`,
      });
      recomputeAwardsAndVP(state);
      return { ok: true, state };
    }
  }
}

function stealRandomResource(
  thief: PlayerState,
  victim: PlayerState,
  state: GameState,
  rng: () => number,
) {
  const pool: ResourceType[] = [];
  for (const r of ['timber', 'wool', 'grain', 'brick', 'ore'] as ResourceType[]) {
    for (let i = 0; i < victim.resources[r]; i++) {
      pool.push(r);
    }
  }
  if (pool.length === 0) return;
  const picked = pool[Math.floor(rng() * pool.length)];
  victim.resources[picked] -= 1;
  thief.resources[picked] += 1;
  appendEvent(state, {
    type: 'robber',
    playerId: thief.id,
    message: `${thief.name} raided a resource from ${victim.name}.`,
  });
}

export function sanitizeStateForPublic(state: GameState): PublicGameState {
  const isFinished = state.phase === 'finished';
  return {
    roomId: state.roomId,
    preset: state.preset,
    victoryTarget: state.victoryTarget,
    phase: state.phase,
    turnNumber: state.turnNumber,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isBot: p.isBot,
      connected: p.connected,
      resourceCount: totalResourceCount(p.resources),
      devCardCount: p.devCards.filter((c) => !c.played).length,
      knightsPlayed: p.knightsPlayed,
      roadsRemaining: PIECE_LIMITS.roads - p.roadsBuilt,
      settlementsRemaining: PIECE_LIMITS.settlements - p.settlementsBuilt,
      citiesRemaining: PIECE_LIMITS.cities - p.citiesBuilt,
      longestRoadLength: p.longestRoadLength,
      hasLongestRoad: p.hasLongestRoad,
      hasLargestArmy: p.hasLargestArmy,
      publicVP: p.publicVP,
      totalVP: isFinished ? p.totalVP : undefined,
    })),
    activePlayerIndex: state.activePlayerIndex,
    setupStepIndex: state.setupStepIndex,
    lastPlacedSetupSettlementId: state.lastPlacedSetupSettlementId,
    hexes: state.hexes,
    vertices: state.vertices,
    edges: state.edges,
    harbors: state.harbors,
    devDeckRemaining: state.devDeck.length,
    bank: state.bank,
    devCardPlayedThisTurn: state.devCardPlayedThisTurn,
    dice: state.dice,
    diceRollSeq: state.diceRollSeq,
    shuffleSeq: state.shuffleSeq,
    lastHarvestGrants: state.lastHarvestGrants,
    pendingDiscardPlayerIds: state.pendingDiscardPlayerIds,
    stealCandidateIds: state.stealCandidateIds,
    activeTradeOffers: state.activeTradeOffers,
    longestRoadOwnerId: state.longestRoadOwnerId,
    largestArmyOwnerId: state.largestArmyOwnerId,
    winnerId: state.winnerId,
    events: state.events,
  };
}

export function getPrivatePlayerState(
  state: GameState,
  playerId: string,
): PrivatePlayerState | null {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  return {
    playerId: player.id,
    resources: player.resources,
    devCards: player.devCards,
    totalVP: player.totalVP,
    tradeRatios: getPlayerTradeRatios(state, playerId),
  };
}
