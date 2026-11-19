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

interface DisplayPrefs {
  reducedMotion: boolean;
  autoCameraFocus: boolean;
  quality: QualityPreset;
}

const PREFS_KEY = 'islehold_display_prefs';

function loadDisplayPrefs(): DisplayPrefs {
  const defaults: DisplayPrefs = {
    reducedMotion: false,
    autoCameraFocus: true,
    quality: 'high',
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      reducedMotion: Boolean(parsed.reducedMotion),
      autoCameraFocus: parsed.autoCameraFocus !== false,
      quality:
        parsed.quality === 'balanced' || parsed.quality === 'reduced'
          ? parsed.quality
          : 'high',
    };
  } catch {
    return defaults;
  }
}

function saveDisplayPrefs(prefs: DisplayPrefs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage errors
  }
}

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
  reducedMotion: boolean;
  autoCameraFocus: boolean;
  muted: boolean;
  masterVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  placementIntent: PlacementIntent;
  activeSubDrawer: 'none' | 'trade' | 'cards';
  showBoardTooltips: boolean;
  cameraCommand: { type: 'reset' | 'top' | 'iso' | 'dice'; seq: number } | null;

  setScreen: (screen: AppScreen) => void;
  setQuality: (q: QualityPreset) => void;
  setReducedMotion: (v: boolean) => void;
  setAutoCameraFocus: (v: boolean) => void;
  toggleMuted: () => void;
  setMasterVolume: (v: number) => void;
  setSfxVolume: (v: number) => void;
  setAmbienceVolume: (v: number) => void;
  setPlacementIntent: (intent: PlacementIntent) => void;
  setActiveSubDrawer: (drawer: 'none' | 'trade' | 'cards') => void;
  setShowBoardTooltips: (show: boolean) => void;
  clearError: () => void;
  triggerCameraCommand: (type: 'reset' | 'top' | 'iso' | 'dice') => void;

  connectSocket: () => Promise<void>;
  createRoom: (opts: {
    mode: 'tv_host' | 'quick_play' | 'tutorial';
    hostName?: string;
    hostColor?: FactionColor;
    preset?: BoardPreset;
    blindStart?: boolean;
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
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;

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

const initialPrefs = loadDisplayPrefs();
const initialAudio = tabletopAudio.getSettings();

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
  quality: initialPrefs.quality,
  reducedMotion: initialPrefs.reducedMotion,
  autoCameraFocus: initialPrefs.autoCameraFocus,
  muted: initialAudio.muted,
  masterVolume: initialAudio.masterVolume,
  sfxVolume: initialAudio.sfxVolume,
  ambienceVolume: initialAudio.ambienceVolume,
  placementIntent: null,
  activeSubDrawer: 'none',
  showBoardTooltips: true,
  cameraCommand: null,

  setScreen: (screen) => set({ screen }),
  setQuality: (quality) => {
    set({ quality });
    const s = get();
    saveDisplayPrefs({
      quality,
      reducedMotion: s.reducedMotion,
      autoCameraFocus: s.autoCameraFocus,
    });
  },
  setReducedMotion: (reducedMotion) => {
    set({ reducedMotion });
    const s = get();
    saveDisplayPrefs({
      quality: s.quality,
      reducedMotion,
      autoCameraFocus: s.autoCameraFocus,
    });
  },
  setAutoCameraFocus: (autoCameraFocus) => {
    set({ autoCameraFocus });
    const s = get();
    saveDisplayPrefs({
      quality: s.quality,
      reducedMotion: s.reducedMotion,
      autoCameraFocus,
    });
  },
  toggleMuted: () => {
    const next = !get().muted;
    tabletopAudio.muted = next;
    set({ muted: next });
  },
  setMasterVolume: (v) => {
    tabletopAudio.masterVolume = v;
    set({ masterVolume: tabletopAudio.masterVolume });
  },
  setSfxVolume: (v) => {
    tabletopAudio.sfxVolume = v;
    set({ sfxVolume: tabletopAudio.sfxVolume });
  },
  setAmbienceVolume: (v) => {
    tabletopAudio.ambienceVolume = v;
    set({ ambienceVolume: tabletopAudio.ambienceVolume });
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
  setActiveSubDrawer: (activeSubDrawer) => set({ activeSubDrawer }),
  setShowBoardTooltips: (showBoardTooltips) => set({ showBoardTooltips }),
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
        reconnectAttempt = 0;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        set({ connected: true, connecting: false });
        connectPromise = null;
        resolve();
      };

      ws.onerror = () => {
        set({
          connected: false,
          connecting: false,
        });
        connectPromise = null;
        reject(new Error('WebSocket error'));
      };

      ws.onclose = () => {
        set({ connected: false, connecting: false });
        connectPromise = null;
        socket = null;

        // Auto-reconnect if client is actively inside a room
        const state = get();
        if (state.room && state.screen !== 'title' && typeof window !== 'undefined') {
          const delay = Math.min(4000, 750 * Math.pow(1.6, reconnectAttempt));
          reconnectAttempt += 1;
          reconnectTimer = setTimeout(() => {
            const current = get();
            if (!current.room || current.screen === 'title') return;
            current
              .connectSocket()
              .then(() => {
                const refreshed = get();
                if (!refreshed.room) return;
                if (refreshed.sessionToken) {
                  refreshed.sendMessage({
                    type: 'RECONNECT_SESSION',
                    roomId: refreshed.room.roomId,
                    sessionToken: refreshed.sessionToken,
                  });
                } else if (refreshed.isHost) {
                  refreshed.sendMessage({
                    type: 'WATCH_ROOM',
                    roomId: refreshed.room.roomId,
                  });
                }
              })
              .catch(() => {});
          }, delay);
        }
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
            if (nextRoom.game.shuffleSeq !== prevRoom.game.shuffleSeq) {
              tabletopAudio.playTileShuffle();
            }
            const prevRevealed = prevRoom.game.hexes.filter((h) => h.revealed).length;
            const nextRevealed = nextRoom.game.hexes.filter((h) => h.revealed).length;
            if (nextRevealed > prevRevealed) {
              tabletopAudio.playTileFlip();
            }

            if (nextRoom.game.diceRollSeq !== prevRoom.game.diceRollSeq) {
              tabletopAudio.playDiceRoll();
              const diceSum = nextRoom.game.dice
                ? nextRoom.game.dice[0] + nextRoom.game.dice[1]
                : 0;
              if (diceSum === 7) {
                setTimeout(() => tabletopAudio.playRobberThud(), 360);
              } else if (nextRoom.game.events[nextRoom.game.events.length - 1]?.message.includes('+')) {
                setTimeout(() => tabletopAudio.playResourceCollect(), 380);
              }
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

            // Robber moved outside of dice 7 roll (e.g., Knight or post-discard)
            const prevRobberHex = prevRoom.game.hexes.find((h) => h.hasRobber)?.id;
            const nextRobberHex = nextRoom.game.hexes.find((h) => h.hasRobber)?.id;
            if (prevRobberHex && nextRobberHex && prevRobberHex !== nextRobberHex) {
              tabletopAudio.playRobberThud();
            }

            // Dev card deck decreased or trade completed
            if (nextRoom.game.devDeckRemaining < prevRoom.game.devDeckRemaining) {
              tabletopAudio.playCardDraw();
            }
            const lastEvent = nextRoom.game.events[nextRoom.game.events.length - 1];
            const prevLastId = prevRoom.game.events[prevRoom.game.events.length - 1]?.id;
            if (
              lastEvent &&
              lastEvent.id !== prevLastId &&
              lastEvent.type === 'trade' &&
              (lastEvent.message.includes('accepted') || lastEvent.message.includes('traded'))
            ) {
              tabletopAudio.playTradeCoin();
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

          let nextIntent = state.placementIntent;
          if (
            nextRoom.game?.phase === 'move_robber' &&
            nextRoom.game.players[nextRoom.game.activePlayerIndex]?.id === state.playerId
          ) {
            nextIntent = 'robber';
          } else if (
            nextRoom.game?.phase === 'road_building_1' ||
            nextRoom.game?.phase === 'road_building_2'
          ) {
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
    tabletopAudio.unlockAndStartAmbience();
    await get().connectSocket();
    get().sendMessage({
      type: 'CREATE_ROOM',
      mode: opts.mode,
      hostName: opts.hostName,
      hostColor: opts.hostColor,
      preset: opts.preset,
      blindStart: opts.blindStart,
      victoryTarget: opts.victoryTarget,
      botCount: opts.botCount,
    });
  },

  joinRoom: async (opts) => {
    tabletopAudio.unlockAndStartAmbience();
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
    tabletopAudio.unlockAndStartAmbience();
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
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
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
      activeSubDrawer: 'none',
      errorMessage: null,
    });
  },
}));
