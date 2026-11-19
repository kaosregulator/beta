import { z } from 'zod';

export type TerrainType =
  | 'forest'
  | 'pasture'
  | 'fields'
  | 'hills'
  | 'mountains'
  | 'desert';

export type ResourceType = 'timber' | 'wool' | 'grain' | 'brick' | 'ore';

export type FactionColor = 'crimson' | 'navy' | 'forest' | 'ivory';

export type DevCardType =
  | 'knight'
  | 'victory_point'
  | 'road_building'
  | 'year_of_plenty'
  | 'monopoly';

export type GamePhase =
  | 'lobby'
  | 'tile_reveal'
  | 'setup_forward_settlement'
  | 'setup_forward_road'
  | 'setup_reverse_settlement'
  | 'setup_reverse_road'
  | 'roll'
  | 'discard'
  | 'move_robber'
  | 'steal'
  | 'main'
  | 'road_building_1'
  | 'road_building_2'
  | 'finished';

export type BoardPreset = 'beginner_setup' | 'standard' | 'random_balanced';

export interface ResourceBundle {
  timber: number;
  wool: number;
  grain: number;
  brick: number;
  ore: number;
}

export interface HexTile {
  id: string;
  q: number;
  r: number;
  x: number;
  z: number;
  terrain: TerrainType;
  numberToken: number | null;
  hasRobber: boolean;
  revealed: boolean;
}

export interface BoardVertex {
  id: string;
  x: number;
  z: number;
  adjacentHexIds: string[];
  adjacentVertexIds: string[];
  adjacentEdgeIds: string[];
  harborId: string | null;
  building: {
    ownerId: string;
    type: 'settlement' | 'city';
  } | null;
}

export interface BoardEdge {
  id: string;
  x: number;
  z: number;
  angle: number;
  vertexIds: [string, string];
  adjacentHexIds: string[];
  ownerId: string | null;
}

export type HarborKind = 'generic_3_1' | ResourceType;

export interface Harbor {
  id: string;
  kind: HarborKind;
  ratio: 2 | 3;
  x: number;
  z: number;
  angle: number;
  vertexIds: [string, string];
}

export interface DevCardInstance {
  id: string;
  type: DevCardType;
  boughtTurn: number;
  played: boolean;
}

export interface TradeOffer {
  id: string;
  fromPlayerId: string;
  toPlayerId: string | null; // null = open to any player
  offering: ResourceBundle;
  requesting: ResourceBundle;
  rejectedBy: string[];
}

export interface PlayerState {
  id: string;
  name: string;
  color: FactionColor;
  isBot: boolean;
  connected: boolean;
  resources: ResourceBundle;
  devCards: DevCardInstance[];
  knightsPlayed: number;
  roadsBuilt: number;
  settlementsBuilt: number;
  citiesBuilt: number;
  longestRoadLength: number;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
  publicVP: number;
  totalVP: number;
}

export interface PublicPlayerSummary {
  id: string;
  name: string;
  color: FactionColor;
  isBot: boolean;
  connected: boolean;
  resourceCount: number;
  devCardCount: number;
  knightsPlayed: number;
  roadsRemaining: number;
  settlementsRemaining: number;
  citiesRemaining: number;
  longestRoadLength: number;
  hasLongestRoad: boolean;
  hasLargestArmy: boolean;
  publicVP: number;
  totalVP?: number; // only populated on victory
}

export interface GameEvent {
  id: string;
  turn: number;
  timestamp: number;
  type:
    | 'dice'
    | 'build'
    | 'resource'
    | 'robber'
    | 'trade'
    | 'dev_card'
    | 'award'
    | 'turn'
    | 'victory';
  playerId?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface HarvestGrant {
  hexId: string;
  terrain: TerrainType;
  numberToken: number;
  playerId: string;
  resource: ResourceType;
  amount: number;
  hexX: number;
  hexZ: number;
}

export interface GameState {
  roomId: string;
  preset: BoardPreset;
  victoryTarget: number;
  phase: GamePhase;
  turnNumber: number;
  players: PlayerState[];
  activePlayerIndex: number;
  setupStepIndex: number;
  lastPlacedSetupSettlementId: string | null;
  hexes: HexTile[];
  vertices: BoardVertex[];
  edges: BoardEdge[];
  harbors: Harbor[];
  devDeck: DevCardType[];
  bank: ResourceBundle;
  devCardPlayedThisTurn: boolean;
  dice: [number, number] | null;
  diceRollSeq: number;
  shuffleSeq: number;
  lastHarvestGrants: HarvestGrant[];
  pendingDiscardPlayerIds: string[];
  stealCandidateIds: string[];
  activeTradeOffers: TradeOffer[];
  longestRoadOwnerId: string | null;
  largestArmyOwnerId: string | null;
  winnerId: string | null;
  events: GameEvent[];
}

export interface PublicGameState {
  roomId: string;
  preset: BoardPreset;
  victoryTarget: number;
  phase: GamePhase;
  turnNumber: number;
  players: PublicPlayerSummary[];
  activePlayerIndex: number;
  setupStepIndex: number;
  lastPlacedSetupSettlementId: string | null;
  hexes: HexTile[];
  vertices: BoardVertex[];
  edges: BoardEdge[];
  harbors: Harbor[];
  devDeckRemaining: number;
  bank: ResourceBundle;
  devCardPlayedThisTurn: boolean;
  dice: [number, number] | null;
  diceRollSeq: number;
  shuffleSeq: number;
  lastHarvestGrants: HarvestGrant[];
  pendingDiscardPlayerIds: string[];
  stealCandidateIds: string[];
  activeTradeOffers: TradeOffer[];
  longestRoadOwnerId: string | null;
  largestArmyOwnerId: string | null;
  winnerId: string | null;
  events: GameEvent[];
}

export interface PrivatePlayerState {
  playerId: string;
  resources: ResourceBundle;
  devCards: DevCardInstance[];
  totalVP: number;
  tradeRatios: Record<ResourceType, number>;
}

export const ResourceBundleSchema = z.object({
  timber: z.number().int().min(0).max(30),
  wool: z.number().int().min(0).max(30),
  grain: z.number().int().min(0).max(30),
  brick: z.number().int().min(0).max(30),
  ore: z.number().int().min(0).max(30),
});

export const ResourceTypeSchema = z.enum(['timber', 'wool', 'grain', 'brick', 'ore']);

export const GameActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SHUFFLE_TILES'),
    playerId: z.string(),
  }),
  z.object({
    type: z.literal('FLIP_TILE'),
    playerId: z.string(),
    hexId: z.string(),
  }),
  z.object({
    type: z.literal('FLIP_ALL_TILES'),
    playerId: z.string(),
  }),
  z.object({
    type: z.literal('PLACE_SETUP_SETTLEMENT'),
    playerId: z.string(),
    vertexId: z.string(),
  }),
  z.object({
    type: z.literal('PLACE_SETUP_ROAD'),
    playerId: z.string(),
    edgeId: z.string(),
  }),
  z.object({
    type: z.literal('ROLL_DICE'),
    playerId: z.string(),
  }),
  z.object({
    type: z.literal('DISCARD_RESOURCES'),
    playerId: z.string(),
    bundle: ResourceBundleSchema,
  }),
  z.object({
    type: z.literal('MOVE_ROBBER'),
    playerId: z.string(),
    hexId: z.string(),
  }),
  z.object({
    type: z.literal('STEAL_RESOURCE'),
    playerId: z.string(),
    targetPlayerId: z.string(),
  }),
  z.object({
    type: z.literal('BUILD_ROAD'),
    playerId: z.string(),
    edgeId: z.string(),
  }),
  z.object({
    type: z.literal('BUILD_SETTLEMENT'),
    playerId: z.string(),
    vertexId: z.string(),
  }),
  z.object({
    type: z.literal('UPGRADE_CITY'),
    playerId: z.string(),
    vertexId: z.string(),
  }),
  z.object({
    type: z.literal('BUY_DEV_CARD'),
    playerId: z.string(),
  }),
  z.object({
    type: z.literal('PLAY_DEV_CARD'),
    playerId: z.string(),
    cardId: z.string(),
    resource1: ResourceTypeSchema.optional(),
    resource2: ResourceTypeSchema.optional(),
  }),
  z.object({
    type: z.literal('BANK_TRADE'),
    playerId: z.string(),
    give: ResourceTypeSchema,
    receive: ResourceTypeSchema,
  }),
  z.object({
    type: z.literal('CREATE_TRADE_OFFER'),
    playerId: z.string(),
    toPlayerId: z.string().nullable(),
    offering: ResourceBundleSchema,
    requesting: ResourceBundleSchema,
  }),
  z.object({
    type: z.literal('RESPOND_TRADE_OFFER'),
    playerId: z.string(),
    offerId: z.string(),
    accept: z.boolean(),
  }),
  z.object({
    type: z.literal('CANCEL_TRADE_OFFER'),
    playerId: z.string(),
    offerId: z.string(),
  }),
  z.object({
    type: z.literal('END_TURN'),
    playerId: z.string(),
  }),
]);

export type GameAction = z.infer<typeof GameActionSchema>;

export const FACTION_META: Record<
  FactionColor,
  { label: string; hex: string; accent: string; dark: string; textOn: string }
> = {
  crimson: {
    label: 'Crimson Guard',
    hex: '#a62626',
    accent: '#d94848',
    dark: '#5c1212',
    textOn: '#fff8f6',
  },
  navy: {
    label: 'Royal Navy',
    hex: '#1d4b82',
    accent: '#3a78c2',
    dark: '#0e2847',
    textOn: '#f4f8ff',
  },
  forest: {
    label: 'Verdant Guild',
    hex: '#24663c',
    accent: '#3e945e',
    dark: '#113820',
    textOn: '#f3fbf6',
  },
  ivory: {
    label: 'Ivory Crown',
    hex: '#e8dec8',
    accent: '#f7f1e3',
    dark: '#9c8d72',
    textOn: '#1d1912',
  },
};

export const RESOURCE_META: Record<
  ResourceType,
  { label: string; color: string; bg: string }
> = {
  timber: { label: 'Timber', color: '#4d7c41', bg: '#20381c' },
  wool: { label: 'Wool', color: '#9cc267', bg: '#32421e' },
  grain: { label: 'Grain', color: '#dfb14b', bg: '#473612' },
  brick: { label: 'Brick', color: '#bf593b', bg: '#451d14' },
  ore: { label: 'Ore', color: '#8a97a6', bg: '#232930' },
};

export const TERRAIN_RESOURCE: Record<TerrainType, ResourceType | null> = {
  forest: 'timber',
  pasture: 'wool',
  fields: 'grain',
  hills: 'brick',
  mountains: 'ore',
  desert: null,
};

export const BUILD_COSTS = {
  road: { timber: 1, wool: 0, grain: 0, brick: 1, ore: 0 },
  settlement: { timber: 1, wool: 1, grain: 1, brick: 1, ore: 0 },
  city: { timber: 0, wool: 0, grain: 2, brick: 0, ore: 3 },
  dev_card: { timber: 0, wool: 1, grain: 1, brick: 0, ore: 1 },
} as const;

export const PIECE_LIMITS = {
  roads: 15,
  settlements: 5,
  cities: 4,
} as const;
