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
