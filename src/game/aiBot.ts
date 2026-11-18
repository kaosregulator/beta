import {
  emptyResources,
  getPlayerTradeRatios,
  getValidCityVertices,
  getValidRoadEdges,
  getValidSettlementVertices,
  getValidSetupSettlementVertices,
  hasResources,
  totalResourceCount,
} from './rules';
import {
  BUILD_COSTS,
  PIECE_LIMITS,
  TERRAIN_RESOURCE,
  type GameAction,
  type GameState,
  type ResourceType,
  type TradeOffer,
} from './types';

function numberProbabilityDots(num: number | null): number {
  if (!num) return 0;
  return 6 - Math.abs(7 - num);
}

function scoreVertex(state: GameState, vertexId: string): number {
  const v = state.vertices.find((x) => x.id === vertexId);
  if (!v) return 0;
  let score = 0;
  const seenRes = new Set<ResourceType>();
  for (const hId of v.adjacentHexIds) {
    const h = state.hexes.find((x) => x.id === hId);
    if (!h) continue;
    score += numberProbabilityDots(h.numberToken);
    const res = TERRAIN_RESOURCE[h.terrain];
    if (res) seenRes.add(res);
  }
  score += seenRes.size * 1.5;
  if (v.harborId) score += 0.8;
  return score;
}

/**
 * Evaluates an open human-to-player trade offer from a bot's perspective.
 * Bots accept fair or advantageous trades that improve their build readiness.
 */
export function evaluateBotTradeResponse(
  state: GameState,
  botId: string,
  offer: TradeOffer,
): boolean {
  const bot = state.players.find((p) => p.id === botId);
  if (!bot || !bot.isBot || state.phase !== 'main') return false;
  if (offer.fromPlayerId === botId) return false;
  if (offer.toPlayerId && offer.toPlayerId !== botId) return false;
  if (offer.rejectedBy.includes(botId)) return false;
  if (!hasResources(bot.resources, offer.requesting)) return false;

  const resKeys: ResourceType[] = ['timber', 'wool', 'grain', 'brick', 'ore'];
  let gainScore = 0;
  let costScore = 0;

  for (const r of resKeys) {
    const giveQty = offer.requesting[r];
    const getQty = offer.offering[r];
    // Surplus resources cost less; scarce resources are valued higher
    const current = bot.resources[r];
    if (getQty > 0) {
      const scarcityBonus = current === 0 ? 1.5 : current === 1 ? 1.2 : 0.9;
      gainScore += getQty * scarcityBonus;
    }
    if (giveQty > 0) {
      const retentionCost = current - giveQty === 0 ? 1.35 : 0.95;
      costScore += giveQty * retentionCost;
    }
  }

  // Slight bonus if trade immediately enables a settlement or city upgrade
  const afterResources = { ...bot.resources };
  for (const r of resKeys) {
    afterResources[r] = afterResources[r] - offer.requesting[r] + offer.offering[r];
  }
  const canBuildCityNow = hasResources(bot.resources, BUILD_COSTS.city);
  const canBuildCityAfter = hasResources(afterResources, BUILD_COSTS.city);
  if (!canBuildCityNow && canBuildCityAfter) gainScore += 1.2;

  const canBuildSettleNow = hasResources(bot.resources, BUILD_COSTS.settlement);
  const canBuildSettleAfter = hasResources(afterResources, BUILD_COSTS.settlement);
  if (!canBuildSettleNow && canBuildSettleAfter) gainScore += 1.0;

  return gainScore >= costScore;
}

export function chooseBotAction(state: GameState, botId: string): GameAction | null {
  const bot = state.players.find((p) => p.id === botId);
  if (!bot || state.phase === 'finished') return null;

  // Discard phase can apply to any player
  if (state.phase === 'discard' && state.pendingDiscardPlayerIds.includes(botId)) {
    const needed = Math.floor(totalResourceCount(bot.resources) / 2);
    const bundle = emptyResources();
    let left = needed;
    const order: ResourceType[] = ['timber', 'wool', 'grain', 'brick', 'ore'];
    while (left > 0) {
      let progressed = false;
      for (const r of order) {
        if (left > 0 && bot.resources[r] - bundle[r] > 0) {
          bundle[r] += 1;
          left -= 1;
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    return { type: 'DISCARD_RESOURCES', playerId: botId, bundle };
  }

  const active = state.players[state.activePlayerIndex];
  if (!active || active.id !== botId) return null;

  if (
    state.phase === 'setup_forward_settlement' ||
    state.phase === 'setup_reverse_settlement'
  ) {
    const valid = getValidSetupSettlementVertices(state);
    if (valid.length === 0) return null;
    valid.sort((a, b) => scoreVertex(state, b) - scoreVertex(state, a));
    return { type: 'PLACE_SETUP_SETTLEMENT', playerId: botId, vertexId: valid[0] };
  }

  if (state.phase === 'setup_forward_road' || state.phase === 'setup_reverse_road') {
    const valid = getValidRoadEdges(state, botId);
    if (valid.length === 0) return null;
    return { type: 'PLACE_SETUP_ROAD', playerId: botId, edgeId: valid[0] };
  }

  if (state.phase === 'roll') {
    // Play a Knight before rolling if the Robber is currently blocking one of the bot's hexes
    if (!state.devCardPlayedThisTurn) {
      const knight = bot.devCards.find(
        (c) => c.type === 'knight' && !c.played && c.boughtTurn < state.turnNumber,
      );
      const robberHex = state.hexes.find((h) => h.hasRobber);
      const robberHurtsBot =
        robberHex &&
        state.vertices.some(
          (v) => v.building?.ownerId === botId && v.adjacentHexIds.includes(robberHex.id),
        );
      if (knight && robberHurtsBot) {
        return { type: 'PLAY_DEV_CARD', playerId: botId, cardId: knight.id };
      }
    }
    return { type: 'ROLL_DICE', playerId: botId };
  }

  if (state.phase === 'move_robber') {
    // Target hex adjacent to highest-VP opponent (without bot's own buildings)
    let bestHex = state.hexes.find((h) => !h.hasRobber)?.id ?? state.hexes[0].id;
    let bestScore = -999;
    for (const h of state.hexes) {
      if (h.hasRobber) continue;
      let s = numberProbabilityDots(h.numberToken);
      for (const v of state.vertices) {
        if (!v.building || !v.adjacentHexIds.includes(h.id)) continue;
        if (v.building.ownerId === botId) s -= 10;
        else s += v.building.type === 'city' ? 5 : 3;
      }
      if (s > bestScore) {
        bestScore = s;
        bestHex = h.id;
      }
    }
    return { type: 'MOVE_ROBBER', playerId: botId, hexId: bestHex };
  }

  if (state.phase === 'steal' && state.stealCandidateIds.length > 0) {
    return {
      type: 'STEAL_RESOURCE',
      playerId: botId,
      targetPlayerId: state.stealCandidateIds[0],
    };
  }

  if (state.phase === 'road_building_1' || state.phase === 'road_building_2') {
    const valid = getValidRoadEdges(state, botId);
    if (valid.length > 0) {
      return { type: 'BUILD_ROAD', playerId: botId, edgeId: valid[0] };
    }
  }

  if (state.phase === 'main') {
    // 1. Upgrade city if possible
    if (
      bot.citiesBuilt < PIECE_LIMITS.cities &&
      hasResources(bot.resources, BUILD_COSTS.city)
    ) {
      const cities = getValidCityVertices(state, botId);
      if (cities.length > 0) {
        return { type: 'UPGRADE_CITY', playerId: botId, vertexId: cities[0] };
      }
    }

    // 2. Build settlement if possible
    if (
      bot.settlementsBuilt < PIECE_LIMITS.settlements &&
      hasResources(bot.resources, BUILD_COSTS.settlement)
    ) {
      const sites = getValidSettlementVertices(state, botId);
      if (sites.length > 0) {
        sites.sort((a, b) => scoreVertex(state, b) - scoreVertex(state, a));
        return { type: 'BUILD_SETTLEMENT', playerId: botId, vertexId: sites[0] };
      }
    }

    // 3. Build road if possible and helpful
    if (
      bot.roadsBuilt < PIECE_LIMITS.roads &&
      hasResources(bot.resources, BUILD_COSTS.road)
    ) {
      const roads = getValidRoadEdges(state, botId);
      if (roads.length > 0 && (bot.roadsBuilt < 6 || bot.settlementsBuilt < 4)) {
        return { type: 'BUILD_ROAD', playerId: botId, edgeId: roads[0] };
      }
    }

    // 4. Buy dev card if possible
    if (
      state.devDeck.length > 0 &&
      hasResources(bot.resources, BUILD_COSTS.dev_card)
    ) {
      return { type: 'BUY_DEV_CARD', playerId: botId };
    }

    // 5. Maritime trade excess resources to avoid 7-card robber loss
    const ratios = getPlayerTradeRatios(state, botId);
    const resKeys: ResourceType[] = ['timber', 'wool', 'grain', 'brick', 'ore'];
    for (const give of resKeys) {
      if (bot.resources[give] >= ratios[give] + 1) {
        const scarcest = [...resKeys].sort(
          (a, b) => bot.resources[a] - bot.resources[b],
        )[0];
        if (scarcest !== give) {
          return { type: 'BANK_TRADE', playerId: botId, give, receive: scarcest };
        }
      }
    }

    return { type: 'END_TURN', playerId: botId };
  }

  return null;
}
