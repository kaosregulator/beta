import { create } from 'zustand';
import type { ClientMessage, RoomSnapshot, ServerMessage } from '../game/protocol';
import type {
  BoardPreset,
  FactionColor,
  GameAction,
  PrivatePlayerState,
} from '../game/types';
import { tabletopAudio } from '../utils/sound';

export type AppScreen = 'title' | 'tv_lobby' | 'tv_game' | 'controller';
export type QualityPreset = 'high' | 'balanced' | 'reduced';
export type PlacementIntent = 'settlement' | 'road' | 'city' | 'robber' | null;

interface GameStore {
  screen: AppScreen;
  connected: boolean;
  connecting: boolean;
  room: RoomSnapshot | null;
  playerId: string | null;
  sessionToken: string | null;
  isHost: boolean;
  privateState: PrivatePlayerState | null;
  errorMessage: string | null;
  quality: QualityPreset;
  muted: boolean;
  placementIntent: PlacementIntent;
  cameraCommand: { type: 'reset' | 'top' | 'iso' | 'dice'; seq: number } | null;

  setScreen: (screen: AppScreen) => void;
  setQuality: (q: QualityPreset) => void;
  toggleMuted: () => void;
  setPlacementIntent: (intent: PlacementIntent) => void;
  clearError: () => void;
  triggerCameraCommand: (type: 'reset' | 'top' | 'iso' | 'dice') => void;

  connectSocket: () => Promise<void>;
  createRoom: (opts: {
    mode: 'tv_host' | 'quick_play';
    hostName?: string;
    hostColor?: FactionColor;
    preset?: BoardPreset;
    victoryTarget?: number;
    botCount?: number;
  }) => Promise<void>;
  joinRoom: (opts: {
    roomId: string;
    name: string;
    color?: FactionColor;
  }) => Promise<void>;
  tryAutoReconnect: (roomId: string) => Promise<void>;
  sendMessage: (msg: ClientMessage) => void;
  dispatchGameAction: (action: GameAction) => void;
  leaveToTitle: () => void;
}

let socket: WebSocket | null = null;
let connectPromise: Promise<void> | null = null;

function getWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

function saveSession(roomId: string, token: string, playerId: string) {
  try {
    localStorage.setItem(
      `islehold_session_${roomId.toUpperCase()}`,
      JSON.stringify({ token, playerId }),
    );
  } catch {
    // ignore storage errors
  }
}

export function loadSavedSession(
  roomId: string,
): { token: string; playerId: string } | null {
  try {
    const raw = localStorage.getItem(`islehold_session_${roomId.toUpperCase()}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const useGameStore = create<GameStore>((set, get) => ({
  screen: 'title',
  connected: false,
  connecting: false,
  room: null,
  playerId: null,
  sessionToken: null,
  isHost: false,
  privateState: null,
  errorMessage: null,
  quality: 'high',
  muted: false,
  placementIntent: null,
  cameraCommand: null,

  setScreen: (screen) => set({ screen }),
  setQuality: (quality) => set({ quality }),
  toggleMuted: () => {
    const next = !get().muted;
    tabletopAudio.muted = next;
    set({ muted: next });
  },
  setPlacementIntent: (intent) => {
    set({ placementIntent: intent });
    const { room, playerId, sendMessage } = get();
    if (room && playerId) {
      sendMessage({
        type: 'SET_PLACEMENT_HIGHLIGHT',
        roomId: room.roomId,
        playerId,
        kind: intent,
      });
    }
  },
  clearError: () => set({ errorMessage: null }),
  triggerCameraCommand: (type) =>
    set((s) => ({
      cameraCommand: { type, seq: (s.cameraCommand?.seq ?? 0) + 1 },
    })),

  connectSocket: () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (connectPromise) return connectPromise;

    set({ connecting: true });
    connectPromise = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(getWsUrl());
      socket = ws;

      ws.onopen = () => {
        set({ connected: true, connecting: false });
        connectPromise = null;
        resolve();
      };

      ws.onerror = () => {
        set({
          connected: false,
          connecting: false,
          errorMessage: 'Unable to reach multiplayer server.',
        });
        connectPromise = null;
        reject(new Error('WebSocket error'));
      };

      ws.onclose = () => {
        set({ connected: false, connecting: false });
        connectPromise = null;
        socket = null;
      };

      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === 'SESSION_ASSIGNED') {
          if (msg.sessionToken && msg.playerId) {
            saveSession(msg.roomId, msg.sessionToken, msg.playerId);
          }
          set({
            playerId: msg.playerId,
            sessionToken: msg.sessionToken,
            isHost: msg.isHost,
            errorMessage: null,
          });
          return;
        }

        if (msg.type === 'ROOM_STATE') {
          const prevRoom = get().room;
          const nextRoom = msg.room;
          const state = get();

          // Audio cues on discrete state changes
          if (prevRoom?.game && nextRoom.game) {
            if (nextRoom.game.diceRollSeq !== prevRoom.game.diceRollSeq) {
              tabletopAudio.playDiceRoll();
            }
            const prevBuildings = prevRoom.game.vertices.filter((v) => v.building).length;
            const nextBuildings = nextRoom.game.vertices.filter((v) => v.building).length;
            const prevCities = prevRoom.game.vertices.filter(
              (v) => v.building?.type === 'city',
            ).length;
            const nextCities = nextRoom.game.vertices.filter(
              (v) => v.building?.type === 'city',
            ).length;
            const prevRoads = prevRoom.game.edges.filter((e) => e.ownerId).length;
            const nextRoads = nextRoom.game.edges.filter((e) => e.ownerId).length;

            if (nextCities > prevCities) tabletopAudio.playCityUpgrade();
            else if (nextBuildings > prevBuildings || nextRoads > prevRoads) {
              tabletopAudio.playWoodPlace();
            }

            if (
              nextRoom.game.activePlayerIndex !== prevRoom.game.activePlayerIndex &&
              nextRoom.game.phase === 'roll'
            ) {
              tabletopAudio.playTurnBell();
            }
            if (nextRoom.game.winnerId && !prevRoom.game.winnerId) {
              tabletopAudio.playVictoryFanfare();
            }
          }

          let nextScreen = state.screen;
          if (state.isHost) {
            nextScreen = nextRoom.status === 'lobby' ? 'tv_lobby' : 'tv_game';
          } else if (state.playerId) {
            nextScreen = 'controller';
          }

          if (nextScreen === 'tv_game' && typeof document !== 'undefined') {
            document.body.dataset.state = 'playing';
          }

          // Clear placement intent if phase changed away from main/setup
          let nextIntent = state.placementIntent;
          if (
            nextRoom.game?.phase === 'move_robber' &&
            nextRoom.game.players[nextRoom.game.activePlayerIndex]?.id === state.playerId
          ) {
            nextIntent = 'robber';
          } else if (nextRoom.game?.phase === 'road_building_1' || nextRoom.game?.phase === 'road_building_2') {
            if (nextRoom.game.players[nextRoom.game.activePlayerIndex]?.id === state.playerId) {
              nextIntent = 'road';
            }
          } else if (prevRoom?.game?.phase !== nextRoom.game?.phase) {
            nextIntent = null;
          }

          set({
            room: nextRoom,
            screen: nextScreen,
            placementIntent: nextIntent,
          });
          return;
        }

        if (msg.type === 'PRIVATE_STATE') {
          set({ privateState: msg.privateState });
          return;
        }

        if (msg.type === 'ACTION_ERROR') {
          set({ errorMessage: msg.message });
        }
      };
    });

    return connectPromise;
  },

  sendMessage: (msg) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      set({ errorMessage: 'Connection lost. Reconnecting...' });
      get()
        .connectSocket()
        .then(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(msg));
          }
        })
        .catch(() => {});
      return;
    }
    socket.send(JSON.stringify(msg));
  },

  createRoom: async (opts) => {
    await get().connectSocket();
    get().sendMessage({
      type: 'CREATE_ROOM',
      mode: opts.mode,
      hostName: opts.hostName,
      hostColor: opts.hostColor,
      preset: opts.preset,
      victoryTarget: opts.victoryTarget,
      botCount: opts.botCount,
    });
  },

  joinRoom: async (opts) => {
    await get().connectSocket();
    const saved = loadSavedSession(opts.roomId);
    get().sendMessage({
      type: 'JOIN_ROOM',
      roomId: opts.roomId.toUpperCase(),
      name: opts.name,
      color: opts.color,
      sessionToken: saved?.token,
    });
  },

  tryAutoReconnect: async (roomId) => {
    const saved = loadSavedSession(roomId);
    if (!saved) return;
    await get().connectSocket();
    get().sendMessage({
      type: 'RECONNECT_SESSION',
      roomId: roomId.toUpperCase(),
      sessionToken: saved.token,
    });
  },

  dispatchGameAction: (action) => {
    const room = get().room;
    if (!room) return;
    get().sendMessage({
      type: 'GAME_ACTION',
      roomId: room.roomId,
      action,
    });
  },

  leaveToTitle: () => {
    if (typeof document !== 'undefined') {
      document.body.dataset.state = 'title';
    }
    set({
      screen: 'title',
      room: null,
      playerId: null,
      sessionToken: null,
      isHost: false,
      privateState: null,
      placementIntent: null,
      errorMessage: null,
    });
  },
}));
