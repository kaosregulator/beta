import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBoardTopology } from './hexMath';
import { generateBoard } from './boardGen';
import {
  applyAction,
  calculateLongestRoad,
  createInitialGameState,
  getPlayerTradeRatios,
  getValidRoadEdges,
  getValidSettlementVertices,
  sanitizeStateForPublic,
} from './rules';
import { evaluateBotTradeResponse } from './aiBot';
import {
  advanceTutorialMission,
  applyTutorialSuppliesForMission,
  getBoardTooltipTarget,
  getTutorialCoachCue,
  makeTutorialDiceRng,
  type TutorialMissionId,
} from './tutorialEngine';
import { chooseBotAction } from './aiBot';
import {
  DEFAULT_SETTLEMENT_HOUSE_SET,
  SETTLEMENT_ARCHETYPE_ORDER,
  selectSettlementArchetype,
} from '../three/pieces';
import {
  DEFAULT_TERRAIN_ELEVATION_PROFILES,
  DEFAULT_TERRAIN_MESH_FIDELITY,
} from '../three/terrain';
import { DEFAULT_TILE_FLIP_ANIMATION } from '../three/BoardScene';

test('hex topology builds 19 hexes, 54 vertices, 72 edges, and 9 harbors', () => {
  const topo = buildBoardTopology();
  assert.equal(topo.hexCoords.length, 19);
  assert.equal(topo.vertices.length, 54);
  assert.equal(topo.edges.length, 72);
  assert.equal(topo.harbors.length, 9);

  // Every vertex connects to 2 or 3 vertices
  for (const v of topo.vertices) {
    assert.ok(v.adjacentVertexIds.length === 2 || v.adjacentVertexIds.length === 3);
    assert.equal(v.adjacentVertexIds.length, v.adjacentEdgeIds.length);
  }
});

test('balanced board generator places desert robber and avoids adjacent 6/8 tokens', () => {
  const board = generateBoard('random_balanced');
  assert.equal(board.hexes.length, 19);
  const deserts = board.hexes.filter((h) => h.terrain === 'desert');
  assert.equal(deserts.length, 1);
  assert.equal(deserts[0].numberToken, null);
  assert.equal(deserts[0].hasRobber, true);

  const numbered = board.hexes.filter((h) => h.numberToken !== null);
  assert.equal(numbered.length, 18);
});

test('snake draft setup grants starting resources on 2nd settlement and transitions to roll', () => {
  let state = createInitialGameState({
    roomId: 'TEST',
    preset: 'standard',
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
    ],
  });

  // P1 forward settlement & road
  const v1 = getValidSettlementVertices(state, 'p1')[0];
  let res = applyAction(state, { type: 'PLACE_SETUP_SETTLEMENT', playerId: 'p1', vertexId: v1 });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;

  const e1 = getValidRoadEdges(state, 'p1')[0];
  res = applyAction(state, { type: 'PLACE_SETUP_ROAD', playerId: 'p1', edgeId: e1 });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.activePlayerIndex, 1);

  // P2 forward settlement & road -> stays on P2 for reverse settlement
  const v2 = getValidSettlementVertices(state, 'p2')[0];
  res = applyAction(state, { type: 'PLACE_SETUP_SETTLEMENT', playerId: 'p2', vertexId: v2 });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;

  const e2 = getValidRoadEdges(state, 'p2')[0];
  res = applyAction(state, { type: 'PLACE_SETUP_ROAD', playerId: 'p2', edgeId: e2 });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.activePlayerIndex, 1);
  assert.equal(state.phase, 'setup_reverse_settlement');

  // P2 reverse settlement & road
  const v3 = getValidSettlementVertices(state, 'p2')[0];
  res = applyAction(state, { type: 'PLACE_SETUP_SETTLEMENT', playerId: 'p2', vertexId: v3 });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  const e3 = getValidRoadEdges(state, 'p2')[0];
  res = applyAction(state, { type: 'PLACE_SETUP_ROAD', playerId: 'p2', edgeId: e3 });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.activePlayerIndex, 0);

  // P1 reverse settlement & road -> transitions to roll
  const v4 = getValidSettlementVertices(state, 'p1')[0];
  res = applyAction(state, { type: 'PLACE_SETUP_SETTLEMENT', playerId: 'p1', vertexId: v4 });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  const e4 = getValidRoadEdges(state, 'p1')[0];
  res = applyAction(state, { type: 'PLACE_SETUP_ROAD', playerId: 'p1', edgeId: e4 });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.phase, 'roll');
  assert.equal(state.activePlayerIndex, 0);
});

test('building rules validate resources, distance rule, city upgrades, and harbor trading', () => {
  let state = createInitialGameState({
    roomId: 'TEST',
    preset: 'standard',
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
    ],
  });
  state.phase = 'main';
  state.dice = [3, 3];

  // Give p1 resources and a starting settlement on a 3:1 harbor vertex
  const harbor = state.harbors.find((h) => h.kind === 'generic_3_1')!;
  const harborVertex = state.vertices.find((v) => v.id === harbor.vertexIds[0])!;
  harborVertex.building = { ownerId: 'p1', type: 'settlement' };
  state.players[0].settlementsBuilt = 1;
  state.players[0].resources = {
    timber: 4,
    wool: 1,
    grain: 3,
    brick: 2,
    ore: 3,
  };

  // Harbor 3:1 trade should cost 3 timber instead of 4
  const ratios = getPlayerTradeRatios(state, 'p1');
  assert.equal(ratios.timber, 3);
  let res = applyAction(state, {
    type: 'BANK_TRADE',
    playerId: 'p1',
    give: 'timber',
    receive: 'wool',
  });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.players[0].resources.timber, 1);
  assert.equal(state.players[0].resources.wool, 2);

  // Upgrade settlement to city
  res = applyAction(state, {
    type: 'UPGRADE_CITY',
    playerId: 'p1',
    vertexId: harborVertex.id,
  });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.players[0].citiesBuilt, 1);
  assert.equal(state.players[0].settlementsBuilt, 0);
  assert.equal(state.players[0].publicVP, 2);

  // Reject settlement build on adjacent vertex (distance rule)
  const adjVertexId = harborVertex.adjacentVertexIds[0];
  res = applyAction(state, {
    type: 'BUILD_SETTLEMENT',
    playerId: 'p1',
    vertexId: adjVertexId,
  });
  assert.equal(res.ok, false);

  // Public sanitization never exposes private hand or devCards
  const pub = sanitizeStateForPublic(state);
  assert.equal('resources' in pub.players[0], false);
  assert.equal('devCards' in pub.players[0], false);
});

test('longest road splits correctly when opponent places a settlement in the middle', () => {
  const state = createInitialGameState({
    roomId: 'ROAD',
    preset: 'standard',
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
    ],
  });

  // Walk a 5-edge chain of connected edges
  const chainEdges: string[] = [];
  const usedVertices = new Set<string>();
  let currV = state.vertices[15];
  usedVertices.add(currV.id);

  for (let i = 0; i < 5; i++) {
    const nextEdge = state.edges.find(
      (e) =>
        !chainEdges.includes(e.id) &&
        e.vertexIds.includes(currV.id) &&
        !usedVertices.has(
          e.vertexIds[0] === currV.id ? e.vertexIds[1] : e.vertexIds[0],
        ),
    )!;
    chainEdges.push(nextEdge.id);
    nextEdge.ownerId = 'p1';
    const nextVId =
      nextEdge.vertexIds[0] === currV.id
        ? nextEdge.vertexIds[1]
        : nextEdge.vertexIds[0];
    usedVertices.add(nextVId);
    currV = state.vertices.find((v) => v.id === nextVId)!;
  }

  assert.equal(calculateLongestRoad(state, 'p1'), 5);

  // Place rival p2 settlement on the middle vertex between edge[1] and edge[2]
  const edge1 = state.edges.find((e) => e.id === chainEdges[1])!;
  const edge2 = state.edges.find((e) => e.id === chainEdges[2])!;
  const sharedVId = edge1.vertexIds.find((id) => edge2.vertexIds.includes(id))!;
  const sharedV = state.vertices.find((v) => v.id === sharedVId)!;
  sharedV.building = { ownerId: 'p2', type: 'settlement' };

  // Road is now split into lengths 2 and 3 -> longest is 3
  assert.equal(calculateLongestRoad(state, 'p1'), 3);
});

test('rolling 7 triggers half-hand discard for 8+ cards and robber steal', () => {
  let state = createInitialGameState({
    roomId: 'ROB7',
    preset: 'standard',
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
    ],
  });
  state.phase = 'roll';
  state.players[1].resources = {
    timber: 4,
    wool: 2,
    grain: 2,
    brick: 0,
    ore: 0,
  };
  // Place Bob settlement on a non-desert hex
  const targetHex = state.hexes.find((h) => !h.hasRobber)!;
  const adjV = state.vertices.find((v) => v.adjacentHexIds.includes(targetHex.id))!;
  adjV.building = { ownerId: 'p2', type: 'settlement' };

  // Deterministic RNG returning 0.5 -> d1=4, d2=3 -> sum 7!
  // Wait: Math.floor(0.5*6)+1 = 4, and for 7 we can use alternating rng
  let toggle = 0;
  const rng7 = () => {
    toggle += 1;
    return toggle === 1 ? 0.5 : 0.4; // d1 = 4, d2 = 3 => sum 7
  };

  let res = applyAction(state, { type: 'ROLL_DICE', playerId: 'p1' }, rng7);
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.phase, 'discard');
  assert.deepEqual(state.pendingDiscardPlayerIds, ['p2']);

  // Bob discards 4 cards
  res = applyAction(state, {
    type: 'DISCARD_RESOURCES',
    playerId: 'p2',
    bundle: { timber: 3, wool: 1, grain: 0, brick: 0, ore: 0 },
  });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.phase, 'move_robber');

  // Alice moves robber onto targetHex and automatically steals 1 from Bob (sole adjacent)
  res = applyAction(state, { type: 'MOVE_ROBBER', playerId: 'p1', hexId: targetHex.id });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.phase, 'main');
  assert.equal(
    state.players[0].resources.timber +
      state.players[0].resources.wool +
      state.players[0].resources.grain,
    1,
  );
  assert.equal(
    state.players[1].resources.timber +
      state.players[1].resources.wool +
      state.players[1].resources.grain,
    3,
  );
});

test('development cards support Year of Plenty, Monopoly, Knights (Largest Army), and hidden VP victory', () => {
  let state = createInitialGameState({
    roomId: 'DEV',
    preset: 'standard',
    victoryTarget: 6,
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
    ],
  });
  state.phase = 'main';
  state.dice = [2, 3];
  state.turnNumber = 2;
  state.players[1].resources = {
    timber: 3,
    wool: 0,
    grain: 0,
    brick: 0,
    ore: 0,
  };
  state.players[0].settlementsBuilt = 2; // 2 VP
  state.players[0].publicVP = 2;
  state.players[0].totalVP = 2;
  state.players[0].devCards = [
    { id: 'c_yop', type: 'year_of_plenty', boughtTurn: 1, played: false },
    { id: 'c_mono', type: 'monopoly', boughtTurn: 1, played: false },
    { id: 'c_k1', type: 'knight', boughtTurn: 1, played: false },
    { id: 'c_k2', type: 'knight', boughtTurn: 1, played: false },
    { id: 'c_k3', type: 'knight', boughtTurn: 1, played: false },
    { id: 'c_vp1', type: 'victory_point', boughtTurn: 1, played: false },
  ];

  // Year of Plenty adds 2 chosen resources
  let res = applyAction(state, {
    type: 'PLAY_DEV_CARD',
    playerId: 'p1',
    cardId: 'c_yop',
    resource1: 'ore',
    resource2: 'grain',
  });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.players[0].resources.ore, 1);
  assert.equal(state.players[0].resources.grain, 1);

  // Only 1 dev card per turn -> Monopoly rejected same turn
  res = applyAction(state, {
    type: 'PLAY_DEV_CARD',
    playerId: 'p1',
    cardId: 'c_mono',
    resource1: 'timber',
  });
  assert.equal(res.ok, false);

  // Advance to next turn so Monopoly can be played
  state.devCardPlayedThisTurn = false;
  state.turnNumber = 3;
  res = applyAction(state, {
    type: 'PLAY_DEV_CARD',
    playerId: 'p1',
    cardId: 'c_mono',
    resource1: 'timber',
  });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.players[0].resources.timber, 3);
  assert.equal(state.players[1].resources.timber, 0);

  // Play 3 knights across turns -> Largest Army (+2 VP) + 2 settlements (2 VP) + 1 hidden VP = 5 VP
  for (const kid of ['c_k1', 'c_k2', 'c_k3']) {
    state.devCardPlayedThisTurn = false;
    state.phase = 'main';
    res = applyAction(state, { type: 'PLAY_DEV_CARD', playerId: 'p1', cardId: kid });
    assert.equal(res.ok, true);
    state = res.ok ? res.state : state;
    const altHex = state.hexes.find((h) => !h.hasRobber)!;
    res = applyAction(state, { type: 'MOVE_ROBBER', playerId: 'p1', hexId: altHex.id });
    assert.equal(res.ok, true);
    state = res.ok ? res.state : state;
  }

  assert.equal(state.players[0].hasLargestArmy, true);
  assert.equal(state.players[0].publicVP, 4);
  assert.equal(state.players[0].totalVP, 5);

  // Buying a Victory Point card from top of deck reaches 6 VP -> instant victory
  state.devDeck.push('victory_point');
  state.players[0].resources = { timber: 0, wool: 1, grain: 1, brick: 0, ore: 1 };
  res = applyAction(state, { type: 'BUY_DEV_CARD', playerId: 'p1' });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerId, 'p1');
});

test('player-to-player trade offers and bot trade evaluation work cleanly', () => {
  let state = createInitialGameState({
    roomId: 'TRADE',
    preset: 'standard',
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'bot1', name: 'Capt. Thorne', color: 'navy', isBot: true },
    ],
  });
  state.phase = 'main';
  state.dice = [5, 4];
  state.players[0].resources = { timber: 2, wool: 0, grain: 0, brick: 0, ore: 0 };
  state.players[1].resources = { timber: 0, wool: 2, grain: 0, brick: 0, ore: 0 };

  let res = applyAction(state, {
    type: 'CREATE_TRADE_OFFER',
    playerId: 'p1',
    toPlayerId: null,
    offering: { timber: 1, wool: 0, grain: 0, brick: 0, ore: 0 },
    requesting: { timber: 0, wool: 1, grain: 0, brick: 0, ore: 0 },
  });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.activeTradeOffers.length, 1);

  const offer = state.activeTradeOffers[0];
  assert.equal(evaluateBotTradeResponse(state, 'bot1', offer), true);

  res = applyAction(state, {
    type: 'RESPOND_TRADE_OFFER',
    playerId: 'bot1',
    offerId: offer.id,
    accept: true,
  });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.activeTradeOffers.length, 0);
  assert.equal(state.players[0].resources.wool, 1);
  assert.equal(state.players[1].resources.timber, 1);
});

test('beginner setup pre-places 2 settlements/roads per seat, obeys distance rule, deals 3 resources from Bank, and starts at Turn 1 roll', () => {
  const state = createInitialGameState({
    roomId: 'BEG4',
    preset: 'beginner_setup',
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
      { id: 'p3', name: 'Carol', color: 'forest' },
      { id: 'p4', name: 'Dan', color: 'ivory' },
    ],
  });

  assert.equal(state.phase, 'roll');
  assert.equal(state.turnNumber, 1);
  assert.equal(state.activePlayerIndex, 0);

  const builtVertices = state.vertices.filter((v) => v.building !== null);
  const builtEdges = state.edges.filter((e) => e.ownerId !== null);
  assert.equal(builtVertices.length, 8);
  assert.equal(builtEdges.length, 8);

  // Verify Distance Rule across all 8 starting settlements
  for (const v of builtVertices) {
    for (const adjId of v.adjacentVertexIds) {
      const adj = state.vertices.find((x) => x.id === adjId)!;
      assert.equal(adj.building, null);
    }
  }

  // Every player starts with 2 settlements, 2 roads, 2 VP, and 3 starting resources
  for (const p of state.players) {
    assert.equal(p.settlementsBuilt, 2);
    assert.equal(p.roadsBuilt, 2);
    assert.equal(p.publicVP, 2);
    const totalRes =
      p.resources.timber +
      p.resources.wool +
      p.resources.grain +
      p.resources.brick +
      p.resources.ore;
    assert.equal(totalRes, 3);
  }

  // Conservation of the 95-card Bank (19 of each resource across bank + players)
  for (const r of ['timber', 'wool', 'grain', 'brick', 'ore'] as const) {
    const held = state.players.reduce((sum, p) => sum + p.resources[r], 0);
    assert.equal(state.bank[r] + held, 19);
  }

  // 3-player game omits 4th seat's pieces
  const state3 = createInitialGameState({
    roomId: 'BEG3',
    preset: 'beginner_setup',
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
      { id: 'p3', name: 'Carol', color: 'forest' },
    ],
  });
  assert.equal(state3.vertices.filter((v) => v.building !== null).length, 6);
  assert.equal(state3.edges.filter((e) => e.ownerId !== null).length, 6);
});

test('95-card Bank enforces shortage rules (sole recipient takes remainder; 2+ recipients receive none)', () => {
  let state = createInitialGameState({
    roomId: 'BANK',
    preset: 'standard',
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
    ],
  });

  const targetHex = state.hexes.find(
    (h) => h.terrain === 'forest' && h.numberToken !== null && !h.hasRobber,
  )!;
  const rollTarget = targetHex.numberToken!;
  const makeRollRng = (sum: number) => {
    const d1 = Math.min(6, Math.max(1, sum - 1 > 6 ? 6 : Math.floor(sum / 2)));
    const d2 = sum - d1;
    let call = 0;
    return () => {
      call += 1;
      const val = call === 1 ? d1 : d2;
      return (val - 0.5) / 6;
    };
  };

  // Find two non-adjacent vertices touching targetHex
  const hexVerts = state.vertices.filter((v) => v.adjacentHexIds.includes(targetHex.id));
  const vAId = hexVerts[0].id;
  const vBId = hexVerts.find(
    (v) => v.id !== vAId && !hexVerts[0].adjacentVertexIds.includes(v.id),
  )!.id;

  // Case 1: 2 players need Timber (total demand 2), Bank only has 1 -> nobody receives Timber
  state.vertices.find((v) => v.id === vAId)!.building = { ownerId: 'p1', type: 'settlement' };
  state.vertices.find((v) => v.id === vBId)!.building = { ownerId: 'p2', type: 'settlement' };
  state.bank.timber = 1;
  state.phase = 'roll';

  let res = applyAction(state, { type: 'ROLL_DICE', playerId: 'p1' }, makeRollRng(rollTarget));
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.players[0].resources.timber, 0);
  assert.equal(state.players[1].resources.timber, 0);
  assert.equal(state.bank.timber, 1);

  // Case 2: Single recipient upgrades to city (demands 2), Bank has 1 -> sole recipient takes remaining 1
  state.vertices.find((v) => v.id === vBId)!.building = null;
  state.vertices.find((v) => v.id === vAId)!.building = { ownerId: 'p1', type: 'city' };
  state.phase = 'roll';
  state.dice = null;
  res = applyAction(state, { type: 'ROLL_DICE', playerId: 'p1' }, makeRollRng(rollTarget));
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.players[0].resources.timber, 1);
  assert.equal(state.bank.timber, 0);

  // Case 3: Bank trade for empty resource is rejected
  state.players[0].resources.wool = 4;
  res = applyAction(state, {
    type: 'BANK_TRADE',
    playerId: 'p1',
    give: 'wool',
    receive: 'timber',
  });
  assert.equal(res.ok, false);
});

test('development cards (Road Building, Year of Plenty) are playable before rolling and return to roll phase', () => {
  let state = createInitialGameState({
    roomId: 'PREROLL',
    preset: 'beginner_setup',
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
    ],
  });
  state.turnNumber = 2;
  state.players[0].devCards.push(
    { id: 'rb1', type: 'road_building', boughtTurn: 1, played: false },
    { id: 'yop1', type: 'year_of_plenty', boughtTurn: 1, played: false },
  );

  // Play Road Building BEFORE rolling
  let res = applyAction(state, { type: 'PLAY_DEV_CARD', playerId: 'p1', cardId: 'rb1' });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.phase, 'road_building_1');

  const e1 = getValidRoadEdges(state, 'p1')[0];
  res = applyAction(state, { type: 'BUILD_ROAD', playerId: 'p1', edgeId: e1 });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.phase, 'road_building_2');

  const e2 = getValidRoadEdges(state, 'p1')[0];
  res = applyAction(state, { type: 'BUILD_ROAD', playerId: 'p1', edgeId: e2 });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  // Must return to 'roll' because player hasn't rolled dice yet!
  assert.equal(state.phase, 'roll');
  assert.equal(state.dice, null);

  // Same-resource domestic trade offer must be rejected
  state.phase = 'main';
  state.dice = [3, 4];
  state.players[0].resources.timber = 2;
  res = applyAction(state, {
    type: 'CREATE_TRADE_OFFER',
    playerId: 'p1',
    toPlayerId: null,
    offering: { timber: 1, wool: 0, grain: 0, brick: 0, ore: 0 },
    requesting: { timber: 2, wool: 0, grain: 0, brick: 0, ore: 0 },
  });
  assert.equal(res.ok, false);
});

test('victory is awarded ONLY on your own turn (off-turn threshold waits until your turn starts)', () => {
  let state = createInitialGameState({
    roomId: 'WIN_TURN',
    preset: 'standard',
    victoryTarget: 10,
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
    ],
  });

  // Active player is p1 (turn 1, main phase)
  state.phase = 'main';
  state.dice = [2, 4];
  state.players[0].settlementsBuilt = 2;
  state.players[1].settlementsBuilt = 4; // 4 VP
  state.players[1].citiesBuilt = 2; // +4 VP = 8 VP
  // Give p2 5 connected roads so if p2 earns Longest Road (+2 VP = 10 VP) while it is p1's turn...
  const p2Chain: string[] = [];
  const usedV = new Set<string>();
  let curV = state.vertices[18];
  usedV.add(curV.id);
  for (let i = 0; i < 5; i++) {
    const nextEdge = state.edges.find(
      (e) =>
        !p2Chain.includes(e.id) &&
        e.vertexIds.includes(curV.id) &&
        !usedV.has(e.vertexIds[0] === curV.id ? e.vertexIds[1] : e.vertexIds[0]),
    )!;
    p2Chain.push(nextEdge.id);
    nextEdge.ownerId = 'p2';
    const nextVId = nextEdge.vertexIds[0] === curV.id ? nextEdge.vertexIds[1] : nextEdge.vertexIds[0];
    usedV.add(nextVId);
    curV = state.vertices.find((v) => v.id === nextVId)!;
  }

  // Trigger recompute on p1's turn via p1 buying a dev card
  state.players[0].resources = { timber: 0, wool: 1, grain: 1, brick: 0, ore: 1 };
  let res = applyAction(state, { type: 'BUY_DEV_CARD', playerId: 'p1' });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;

  // p2 now has 10 totalVP (8 building + 2 Longest Road), but it is still p1's turn -> game MUST NOT finish yet!
  assert.equal(state.players[1].totalVP, 10);
  assert.equal(state.phase, 'main');
  assert.equal(state.winnerId, null);

  // Once p1 ends turn and p2's turn begins, p2 immediately claims victory on their turn!
  res = applyAction(state, { type: 'END_TURN', playerId: 'p1' });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerId, 'p2');
});

test('classic blindStart begins in tile_reveal with face-down tiles, supports SHUFFLE_TILES, FLIP_TILE, and FLIP_ALL_TILES', () => {
  let state = createInitialGameState({
    roomId: 'BLIND1',
    preset: 'random_balanced',
    blindStart: true,
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
    ],
  });

  assert.equal(state.phase, 'tile_reveal');
  assert.equal(state.shuffleSeq, 0);
  assert.equal(state.hexes.length, 19);
  assert.equal(state.hexes.every((h) => !h.revealed), true);
  assert.equal(state.hexes.filter((h) => h.numberToken !== null).length, 18);

  const beforeSig = state.hexes.map((h) => `${h.terrain}:${h.numberToken}`).join('|');

  // Non-active player (p2) is allowed to shuffle and flip during tile_reveal
  let res = applyAction(state, { type: 'SHUFFLE_TILES', playerId: 'p2' });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.shuffleSeq, 1);
  assert.equal(state.hexes.every((h) => !h.revealed), true);
  const afterSig = state.hexes.map((h) => `${h.terrain}:${h.numberToken}`).join('|');
  assert.notEqual(afterSig, beforeSig);

  // Flip a single tile
  const firstId = state.hexes[0].id;
  res = applyAction(state, { type: 'FLIP_TILE', playerId: 'p1', hexId: firstId });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.hexes[0].revealed, true);
  assert.equal(state.hexes.filter((h) => h.revealed).length, 1);
  assert.equal(state.phase, 'tile_reveal');

  // Re-flipping an already-revealed tile is rejected
  const dupRes = applyAction(state, { type: 'FLIP_TILE', playerId: 'p1', hexId: firstId });
  assert.equal(dupRes.ok, false);

  // Flip All reveals remaining 18 and transitions to setup_forward_settlement
  res = applyAction(state, { type: 'FLIP_ALL_TILES', playerId: 'p2' });
  assert.equal(res.ok, true);
  state = res.ok ? res.state : state;
  assert.equal(state.hexes.every((h) => h.revealed), true);
  assert.equal(state.phase, 'setup_forward_settlement');
  assert.equal(state.activePlayerIndex, 0);

  // Beginner setup ignores blindStart and starts revealed in roll phase
  const beginnerState = createInitialGameState({
    roomId: 'BEGBLIND',
    preset: 'beginner_setup',
    blindStart: true,
    players: [
      { id: 'p1', name: 'Alice', color: 'crimson' },
      { id: 'p2', name: 'Bob', color: 'navy' },
    ],
  });
  assert.equal(beginnerState.phase, 'roll');
  assert.equal(beginnerState.hexes.every((h) => h.revealed), true);
});

test('playable tutorial engine drives all 18 move-by-move steps and preserves 95-card Bank invariant', () => {
  let state = createInitialGameState({
    roomId: 'TUT1',
    preset: 'standard',
    blindStart: true,
    victoryTarget: 8,
    players: [
      { id: 'p1', name: 'Commander', color: 'crimson', isBot: false },
      { id: 'bot_1', name: 'Capt. Thorne', color: 'navy', isBot: true },
    ],
  });

  let mission: TutorialMissionId = 'flip_tiles';

  const runHumanAction = (action: Parameters<typeof applyAction>[1], useTutRng = false) => {
    const rng = useTutRng ? makeTutorialDiceRng(state, 'p1') : undefined;
    const res = applyAction(state, action, rng);
    assert.equal(res.ok, true, `Action ${action.type} failed: ${res.ok ? '' : res.error}`);
    if (!res.ok) return;
    state = res.state;
    const next = advanceTutorialMission(mission, action, state, 'p1');
    if (next !== mission) {
      mission = next;
      applyTutorialSuppliesForMission(mission, state, 'p1');
    }
    // Verify 95-card Bank invariant after every tutorial step & supply grant
    for (const r of ['timber', 'wool', 'grain', 'brick', 'ore'] as const) {
      const held = state.players.reduce((s, p) => s + p.resources[r], 0);
      assert.equal(state.bank[r] + held, 19, `Bank invariant broken for ${r} at ${mission}`);
    }
  };

  const drainBotTurns = () => {
    let guard = 0;
    while (
      state.phase !== 'finished' &&
      state.players[state.activePlayerIndex]?.id === 'bot_1' &&
      guard < 25
    ) {
      guard += 1;
      const act = chooseBotAction(state, 'bot_1');
      if (!act) break;
      const botRng =
        act.type === 'ROLL_DICE'
          ? (() => {
              let c = 0;
              return () => (++c === 1 ? 0.25 : 0.4); // 2 + 3 = 5 (never 7)
            })()
          : undefined;
      const res = applyAction(state, act, botRng);
      assert.equal(res.ok, true);
      if (!res.ok) break;
      state = res.state;
    }
  };

  // Step 1: flip_tiles -> flip 1 then Flip All
  assert.equal(getTutorialCoachCue(mission, sanitizeStateForPublic(state), 'p1').highlightControl, 'board_flip');
  runHumanAction({ type: 'FLIP_TILE', playerId: 'p1', hexId: state.hexes[0].id });
  assert.equal(mission, 'flip_tiles');
  runHumanAction({ type: 'FLIP_ALL_TILES', playerId: 'p1' });
  assert.equal(mission, 'setup_settlement_1');

  // Step 2-3: Setup 1 settlement + road
  runHumanAction({
    type: 'PLACE_SETUP_SETTLEMENT',
    playerId: 'p1',
    vertexId: getValidSettlementVertices(state, 'p1')[0],
  });
  assert.equal(mission, 'setup_road_1');
  runHumanAction({
    type: 'PLACE_SETUP_ROAD',
    playerId: 'p1',
    edgeId: getValidRoadEdges(state, 'p1')[0],
  });
  assert.equal(mission, 'setup_settlement_2');
  drainBotTurns();

  // Step 4-5: Setup 2 settlement + road
  runHumanAction({
    type: 'PLACE_SETUP_SETTLEMENT',
    playerId: 'p1',
    vertexId: getValidSettlementVertices(state, 'p1')[0],
  });
  assert.equal(mission, 'setup_road_2');
  runHumanAction({
    type: 'PLACE_SETUP_ROAD',
    playerId: 'p1',
    edgeId: getValidRoadEdges(state, 'p1')[0],
  });
  assert.equal(mission, 'turn1_roll');

  // Step 6-9: Turn 1 Roll -> Build Road -> Maritime Trade -> End Turn
  runHumanAction({ type: 'ROLL_DICE', playerId: 'p1' }, true);
  assert.notEqual(state.dice![0] + state.dice![1], 7);
  assert.equal(mission, 'turn1_build_road');
  assert.equal(getTutorialCoachCue(mission, sanitizeStateForPublic(state), 'p1').highlightControl, 'road');

  runHumanAction({
    type: 'BUILD_ROAD',
    playerId: 'p1',
    edgeId: getValidRoadEdges(state, 'p1')[0],
  });
  assert.equal(mission, 'turn1_trade');

  const surplusRes = (['timber', 'wool', 'grain', 'brick', 'ore'] as const).find(
    (r) => state.players[0].resources[r] >= 4,
  )!;
  const receiveRes = surplusRes === 'ore' ? 'grain' : 'ore';
  runHumanAction({
    type: 'BANK_TRADE',
    playerId: 'p1',
    give: surplusRes,
    receive: receiveRes,
  });
  assert.equal(mission, 'turn1_end_turn');
  runHumanAction({ type: 'END_TURN', playerId: 'p1' });
  assert.equal(mission, 'turn2_roll');
  drainBotTurns();

  // Step 10-12: Turn 2 Roll -> (optional extending road if needed) -> Build Settlement -> End Turn
  runHumanAction({ type: 'ROLL_DICE', playerId: 'p1' }, true);
  assert.equal(mission, 'turn2_build_settlement');
  if (getValidSettlementVertices(state, 'p1').length === 0) {
    runHumanAction({
      type: 'BUILD_ROAD',
      playerId: 'p1',
      edgeId: getValidRoadEdges(state, 'p1')[0],
    });
    assert.equal(mission, 'turn2_build_settlement');
  }
  runHumanAction({
    type: 'BUILD_SETTLEMENT',
    playerId: 'p1',
    vertexId: getValidSettlementVertices(state, 'p1')[0],
  });
  assert.equal(mission, 'turn2_end_turn');
  runHumanAction({ type: 'END_TURN', playerId: 'p1' });
  assert.equal(mission, 'turn3_roll');
  drainBotTurns();

  // Step 13-16: Turn 3 Roll -> Upgrade City -> Buy Knight Dev Card -> End Turn (Cooldown)
  runHumanAction({ type: 'ROLL_DICE', playerId: 'p1' }, true);
  assert.equal(mission, 'turn3_upgrade_city');
  const houseVId = state.vertices.find(
    (v) => v.building?.ownerId === 'p1' && v.building.type === 'settlement',
  )!.id;
  runHumanAction({ type: 'UPGRADE_CITY', playerId: 'p1', vertexId: houseVId });
  assert.equal(mission, 'turn3_buy_card');

  runHumanAction({ type: 'BUY_DEV_CARD', playerId: 'p1' });
  assert.equal(mission, 'turn3_end_turn');
  const boughtKnight = state.players[0].devCards.find((c) => c.type === 'knight');
  assert.ok(boughtKnight);

  runHumanAction({ type: 'END_TURN', playerId: 'p1' });
  assert.equal(mission, 'turn4_play_knight');
  drainBotTurns();

  // Step 17-18: Turn 4 Play Knight before rolling -> Move Robber -> free_play
  assert.equal(getTutorialCoachCue(mission, sanitizeStateForPublic(state), 'p1').highlightControl, 'cards');
  runHumanAction({
    type: 'PLAY_DEV_CARD',
    playerId: 'p1',
    cardId: boughtKnight!.id,
  });
  assert.equal(mission, 'turn4_move_robber');

  const robberTarget = state.hexes.find((h) => !h.hasRobber)!;
  runHumanAction({
    type: 'MOVE_ROBBER',
    playerId: 'p1',
    hexId: robberTarget.id,
  });
  assert.equal(mission, 'free_play');
  assert.equal(getTutorialCoachCue(mission, sanitizeStateForPublic(state), 'p1').completed, true);
});

test('modular 3D medieval house set maps vertex seeds cleanly across all 4 house archetypes', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 40; i++) {
    const id = selectSettlementArchetype(`v_${i}`);
    assert.ok(DEFAULT_SETTLEMENT_HOUSE_SET[id]);
    seen.add(id);
  }
  assert.equal(seen.size, SETTLEMENT_ARCHETYPE_ORDER.length);
  assert.equal(selectSettlementArchetype(), 'tudor_cottage');
});

test('context-aware board tooltips target 3D hexes, prime vertices, edges, dice tray, harbors, cities, and robber', () => {
  const applyOk = (
    cur: ReturnType<typeof createInitialGameState>,
    act: Parameters<typeof applyAction>[1],
    rng?: () => number,
  ) => {
    const res = applyAction(cur, act, rng);
    assert.equal(res.ok, true, res.ok ? '' : res.error);
    if (!res.ok) throw new Error('Action failed');
    return res.state;
  };

  let state = createInitialGameState({
    roomId: 'TIP1',
    preset: 'standard',
    blindStart: true,
    victoryTarget: 8,
    players: [
      { id: 'p1', name: 'Commander', color: 'crimson', isBot: false },
      { id: 'bot_1', name: 'Capt. Thorne', color: 'navy', isBot: true },
    ],
  });

  // 1. Tile reveal targets an unrevealed hex
  const flipTip = getBoardTooltipTarget(sanitizeStateForPublic(state), 'p1', {
    missionId: 'flip_tiles',
  });
  assert.equal(flipTip?.kind, 'hex');
  assert.ok(flipTip && flipTip.worldPos.y > 0.3);

  state = applyOk(state, { type: 'FLIP_ALL_TILES', playerId: 'p1' });

  // 2. Setup settlement targets a prime valid vertex
  const settleTip = getBoardTooltipTarget(sanitizeStateForPublic(state), 'p1', {
    missionId: 'setup_settlement_1',
  });
  assert.equal(settleTip?.kind, 'vertex');
  assert.ok(getValidSettlementVertices(state, 'p1').includes(settleTip!.id));

  state = applyOk(state, {
    type: 'PLACE_SETUP_SETTLEMENT',
    playerId: 'p1',
    vertexId: settleTip!.id,
  });

  // 3. Setup road targets an adjacent valid edge
  const roadTip = getBoardTooltipTarget(sanitizeStateForPublic(state), 'p1', {
    missionId: 'setup_road_1',
  });
  assert.equal(roadTip?.kind, 'edge');
  assert.ok(getValidRoadEdges(state, 'p1').includes(roadTip!.id));

  state = applyOk(state, {
    type: 'PLACE_SETUP_ROAD',
    playerId: 'p1',
    edgeId: roadTip!.id,
  });

  // Complete bot snake turn & player's 2nd setup
  while (state.players[state.activePlayerIndex]?.id === 'bot_1') {
    const act = chooseBotAction(state, 'bot_1')!;
    state = applyOk(state, act);
  }
  state = applyOk(state, {
    type: 'PLACE_SETUP_SETTLEMENT',
    playerId: 'p1',
    vertexId: getValidSettlementVertices(state, 'p1')[0],
  });
  state = applyOk(state, {
    type: 'PLACE_SETUP_ROAD',
    playerId: 'p1',
    edgeId: getValidRoadEdges(state, 'p1')[0],
  });

  // 4. Roll phase targets the 3D dice tray
  const rollTip = getBoardTooltipTarget(sanitizeStateForPublic(state), 'p1', {
    missionId: 'turn1_roll',
  });
  assert.equal(rollTip?.kind, 'dice_tray');

  state = applyOk(state, { type: 'ROLL_DICE', playerId: 'p1' }, makeTutorialDiceRng(state, 'p1'));

  // 5. Trade mission targets a coastal harbor
  const tradeTip = getBoardTooltipTarget(sanitizeStateForPublic(state), 'p1', {
    missionId: 'turn1_trade',
    subDrawer: 'trade',
  });
  assert.equal(tradeTip?.kind, 'harbor');

  // 6. City upgrade mission targets player's settlement vertex
  const cityTip = getBoardTooltipTarget(sanitizeStateForPublic(state), 'p1', {
    missionId: 'turn3_upgrade_city',
    placementIntent: 'city',
  });
  assert.equal(cityTip?.kind, 'vertex');
});

test('terrain mesh fidelity and pre-game randomized tile flip configs have valid high-detail parameters', () => {
  assert.ok(DEFAULT_TERRAIN_MESH_FIDELITY.subdivisionRings >= 10);
  assert.ok(DEFAULT_TERRAIN_MESH_FIDELITY.perTileElevationVariance > 0);
  assert.equal(DEFAULT_TILE_FLIP_ANIMATION.randomizedCascade, true);
  assert.equal(DEFAULT_TILE_FLIP_ANIMATION.preGameShuffleRipple, true);
  assert.ok(
    DEFAULT_TERRAIN_ELEVATION_PROFILES.mountains.revealedTokenY >
      DEFAULT_TERRAIN_ELEVATION_PROFILES.pasture.revealedTokenY,
  );
});



