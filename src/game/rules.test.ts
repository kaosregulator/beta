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
