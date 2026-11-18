import { useEffect, useMemo, useRef } from 'react';
import {
  getValidCityVertices,
  getValidRoadEdges,
  getValidSettlementVertices,
} from '../game/rules';
import type { GameState, PublicGameState } from '../game/types';
import { BoardSceneController, type ValidHighlights } from '../three/BoardScene';
import { useGameStore } from '../store/useGameStore';

/**
 * Computes valid highlighted board slots for either the local controlling player
 * or the remote active phone controller's placement intent.
 */
function computeHighlights(
  game: PublicGameState | null,
  localPlayerId: string | null,
  localIntent: string | null,
  remoteHighlight: { playerId: string; kind: string | null } | null,
): ValidHighlights {
  const empty: ValidHighlights = {
    vertices: [],
    edges: [],
    cities: [],
    robberHexes: [],
  };
  if (!game || game.phase === 'finished') return empty;

  const active = game.players[game.activePlayerIndex];
  if (!active) return empty;

  // Determine which player's perspective to highlight
  const isLocalActive = localPlayerId && active.id === localPlayerId;
  const targetPlayerId = isLocalActive
    ? localPlayerId
    : remoteHighlight?.playerId === active.id
      ? remoteHighlight.playerId
      : null;

  if (!targetPlayerId) return empty;

  const pseudoState = game as unknown as GameState;

  if (
    game.phase === 'setup_forward_settlement' ||
    game.phase === 'setup_reverse_settlement'
  ) {
    return {
      ...empty,
      vertices: getValidSettlementVertices(pseudoState, targetPlayerId),
    };
  }

  if (
    game.phase === 'setup_forward_road' ||
    game.phase === 'setup_reverse_road' ||
    game.phase === 'road_building_1' ||
    game.phase === 'road_building_2'
  ) {
    return {
      ...empty,
      edges: getValidRoadEdges(pseudoState, targetPlayerId),
    };
  }

  if (game.phase === 'move_robber') {
    return {
      ...empty,
      robberHexes: game.hexes.filter((h) => !h.hasRobber).map((h) => h.id),
    };
  }

  const intent = isLocalActive ? localIntent : remoteHighlight?.kind ?? null;
  if (game.phase === 'main' && intent) {
    if (intent === 'settlement') {
      return {
        ...empty,
        vertices: getValidSettlementVertices(pseudoState, targetPlayerId),
      };
    }
    if (intent === 'road') {
      return {
        ...empty,
        edges: getValidRoadEdges(pseudoState, targetPlayerId),
      };
    }
    if (intent === 'city') {
      return {
        ...empty,
        cities: getValidCityVertices(pseudoState, targetPlayerId),
      };
    }
    if (intent === 'robber') {
      return {
        ...empty,
        robberHexes: game.hexes.filter((h) => !h.hasRobber).map((h) => h.id),
      };
    }
  }

  return empty;
}

export function BoardCanvas() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<BoardSceneController | null>(null);

  const screen = useGameStore((s) => s.screen);
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const quality = useGameStore((s) => s.quality);
  const reducedMotion = useGameStore((s) => s.reducedMotion);
  const autoCameraFocus = useGameStore((s) => s.autoCameraFocus);
  const placementIntent = useGameStore((s) => s.placementIntent);
  const cameraCommand = useGameStore((s) => s.cameraCommand);
  const dispatchGameAction = useGameStore((s) => s.dispatchGameAction);

  const callbacksRef = useRef({
    onSelectVertex: (_vertexId: string) => {},
    onSelectEdge: (_edgeId: string) => {},
    onSelectHex: (_hexId: string) => {},
  });

  // Update interaction callbacks dynamically without tearing down Three.js canvas
  useEffect(() => {
    callbacksRef.current = {
      onSelectVertex: (vertexId: string) => {
        const state = useGameStore.getState();
        const game = state.room?.game;
        const pid = state.playerId;
        if (!game || !pid) return;
        const active = game.players[game.activePlayerIndex];
        if (!active || active.id !== pid) return;

        if (
          game.phase === 'setup_forward_settlement' ||
          game.phase === 'setup_reverse_settlement'
        ) {
          dispatchGameAction({
            type: 'PLACE_SETUP_SETTLEMENT',
            playerId: pid,
            vertexId,
          });
        } else if (game.phase === 'main') {
          if (state.placementIntent === 'city') {
            dispatchGameAction({ type: 'UPGRADE_CITY', playerId: pid, vertexId });
            state.setPlacementIntent(null);
          } else if (state.placementIntent === 'settlement') {
            dispatchGameAction({ type: 'BUILD_SETTLEMENT', playerId: pid, vertexId });
            state.setPlacementIntent(null);
          }
        }
      },
      onSelectEdge: (edgeId: string) => {
        const state = useGameStore.getState();
        const game = state.room?.game;
        const pid = state.playerId;
        if (!game || !pid) return;
        const active = game.players[game.activePlayerIndex];
        if (!active || active.id !== pid) return;

        if (
          game.phase === 'setup_forward_road' ||
          game.phase === 'setup_reverse_road'
        ) {
          dispatchGameAction({ type: 'PLACE_SETUP_ROAD', playerId: pid, edgeId });
        } else if (
          game.phase === 'main' ||
          game.phase === 'road_building_1' ||
          game.phase === 'road_building_2'
        ) {
          dispatchGameAction({ type: 'BUILD_ROAD', playerId: pid, edgeId });
          if (game.phase === 'main') state.setPlacementIntent(null);
        }
      },
      onSelectHex: (hexId: string) => {
        const state = useGameStore.getState();
        const game = state.room?.game;
        const pid = state.playerId;
        if (!game || !pid) return;
        if (game.phase === 'move_robber') {
          dispatchGameAction({ type: 'MOVE_ROBBER', playerId: pid, hexId });
        }
      },
    };
  }, [dispatchGameAction]);

  // Mount WebGL canvas once
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const ctrl = new BoardSceneController(el, callbacksRef);
    controllerRef.current = ctrl;
    return () => {
      ctrl.dispose();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setMode(screen === 'title' ? 'title' : 'game');
  }, [screen]);

  useEffect(() => {
    controllerRef.current?.setQuality(quality);
  }, [quality]);

  useEffect(() => {
    controllerRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    controllerRef.current?.setAutoCameraFocus(autoCameraFocus);
  }, [autoCameraFocus]);

  useEffect(() => {
    if (cameraCommand) {
      controllerRef.current?.setCameraPreset(cameraCommand.type);
    }
  }, [cameraCommand]);

  const highlights = useMemo(
    () =>
      computeHighlights(
        room?.game ?? null,
        playerId,
        placementIntent,
        room?.activePlacementHighlight ?? null,
      ),
    [room?.game, playerId, placementIntent, room?.activePlacementHighlight],
  );

  useEffect(() => {
    controllerRef.current?.syncGameState(room?.game ?? null, highlights);
  }, [room?.game, highlights]);

  return (
    <div
      ref={mountRef}
      data-testid="board-canvas-container"
      className="fixed inset-0 w-full h-full z-0"
    />
  );
}
