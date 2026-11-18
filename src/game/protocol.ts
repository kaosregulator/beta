import { z } from 'zod';
import {
  GameActionSchema,
  type BoardPreset,
  type FactionColor,
  type GameAction,
  type PrivatePlayerState,
  type PublicGameState,
} from './types';

export const FactionColorSchema = z.enum(['crimson', 'navy', 'forest', 'ivory']);
export const BoardPresetSchema = z.enum(['standard', 'random_balanced']);

export interface LobbyPlayerSlot {
  id: string;
  name: string;
  color: FactionColor;
  isBot: boolean;
  connected: boolean;
}

export interface RoomSnapshot {
  roomId: string;
  mode: 'tv_host' | 'quick_play';
  preset: BoardPreset;
  victoryTarget: number;
  status: 'lobby' | 'playing' | 'finished';
  lobbyPlayers: LobbyPlayerSlot[];
  game: PublicGameState | null;
  /** Highlighted placement preview broadcasted from phone controller to TV */
  activePlacementHighlight: {
    playerId: string;
    kind: 'settlement' | 'road' | 'city' | 'robber' | null;
  } | null;
}

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CREATE_ROOM'),
    mode: z.enum(['tv_host', 'quick_play']),
    hostName: z.string().trim().min(1).max(20).optional(),
    hostColor: FactionColorSchema.optional(),
    preset: BoardPresetSchema.optional(),
    victoryTarget: z.number().int().min(6).max(15).optional(),
    botCount: z.number().int().min(0).max(3).optional(),
  }),
  z.object({
    type: z.literal('JOIN_ROOM'),
    roomId: z.string().trim().min(3).max(8),
    name: z.string().trim().min(1).max(20),
    color: FactionColorSchema.optional(),
    sessionToken: z.string().optional(),
  }),
  z.object({
    type: z.literal('WATCH_ROOM'),
    roomId: z.string().trim().min(3).max(8),
  }),
  z.object({
    type: z.literal('RECONNECT_SESSION'),
    roomId: z.string().trim().min(3).max(8),
    sessionToken: z.string(),
  }),
  z.object({
    type: z.literal('UPDATE_ROOM_SETTINGS'),
    roomId: z.string(),
    preset: BoardPresetSchema.optional(),
    victoryTarget: z.number().int().min(6).max(15).optional(),
  }),
  z.object({
    type: z.literal('ADD_BOT'),
    roomId: z.string(),
  }),
  z.object({
    type: z.literal('REMOVE_PLAYER'),
    roomId: z.string(),
    playerId: z.string(),
  }),
  z.object({
    type: z.literal('START_GAME'),
    roomId: z.string(),
  }),
  z.object({
    type: z.literal('REMATCH'),
    roomId: z.string(),
  }),
  z.object({
    type: z.literal('SET_PLACEMENT_HIGHLIGHT'),
    roomId: z.string(),
    playerId: z.string(),
    kind: z.enum(['settlement', 'road', 'city', 'robber']).nullable(),
  }),
  z.object({
    type: z.literal('GAME_ACTION'),
    roomId: z.string(),
    action: GameActionSchema,
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export type ServerMessage =
  | {
      type: 'SESSION_ASSIGNED';
      roomId: string;
      playerId: string | null;
      sessionToken: string | null;
      isHost: boolean;
    }
  | {
      type: 'ROOM_STATE';
      room: RoomSnapshot;
    }
  | {
      type: 'PRIVATE_STATE';
      privateState: PrivatePlayerState;
    }
  | {
      type: 'ACTION_ERROR';
      message: string;
    };

export type { GameAction };
