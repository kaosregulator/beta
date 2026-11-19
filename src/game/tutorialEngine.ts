import {
  getValidCityVertices,
  getValidRoadEdges,
  getValidSettlementVertices,
  hasResources,
  totalResourceCount,
} from './rules';
import {
  BUILD_COSTS,
  RESOURCE_META,
  type GameAction,
  type GameState,
  type HexTile,
  type PublicGameState,
  type ResourceBundle,
  type ResourceType,
} from './types';

export type TutorialMissionId =
  | 'flip_tiles'
  | 'setup_settlement_1'
  | 'setup_road_1'
  | 'setup_settlement_2'
  | 'setup_road_2'
  | 'turn1_roll'
  | 'turn1_build_road'
  | 'turn1_trade'
  | 'turn1_end_turn'
  | 'turn2_roll'
  | 'turn2_build_settlement'
  | 'turn2_end_turn'
  | 'turn3_roll'
  | 'turn3_upgrade_city'
  | 'turn3_buy_card'
  | 'turn3_end_turn'
  | 'turn4_play_knight'
  | 'turn4_move_robber'
  | 'free_play';

export type TutorialHighlightControl =
  | 'board_flip'
  | 'board_vertex'
  | 'board_edge'
  | 'board_hex'
  | 'roll'
  | 'road'
  | 'settlement'
  | 'city'
  | 'buy_card'
  | 'trade'
  | 'trade_confirm'
  | 'cards'
  | 'card_play'
  | 'end_turn'
  | null;

export interface TutorialCoachCue {
  missionId: TutorialMissionId;
  stepIndex: number;
  totalSteps: number;
  title: string;
  instruction: string;
  ruleTip: string;
  highlightControl: TutorialHighlightControl;
  waitingOnRival: boolean;
  completed: boolean;
}

export const TUTORIAL_TOTAL_GUIDED_STEPS = 18;

const MISSION_ORDER: TutorialMissionId[] = [
  'flip_tiles',
  'setup_settlement_1',
  'setup_road_1',
  'setup_settlement_2',
  'setup_road_2',
  'turn1_roll',
  'turn1_build_road',
  'turn1_trade',
  'turn1_end_turn',
  'turn2_roll',
  'turn2_build_settlement',
  'turn2_end_turn',
  'turn3_roll',
  'turn3_upgrade_city',
  'turn3_buy_card',
  'turn3_end_turn',
  'turn4_play_knight',
  'turn4_move_robber',
  'free_play',
];

const RES_KEYS: ResourceType[] = ['timber', 'wool', 'grain', 'brick', 'ore'];

function grantMissingFromBank(
  state: GameState,
  playerId: string,
  target: Partial<ResourceBundle>,
): ResourceBundle {
  const player = state.players.find((p) => p.id === playerId);
  const granted: ResourceBundle = { timber: 0, wool: 0, grain: 0, brick: 0, ore: 0 };
  if (!player) return granted;

  for (const r of RES_KEYS) {
    const need = target[r] ?? 0;
    if (player.resources[r] < need) {
      const shortfall = need - player.resources[r];
      const take = Math.min(shortfall, state.bank[r]);
      if (take > 0) {
        player.resources[r] += take;
        state.bank[r] -= take;
        granted[r] = take;
      }
    }
  }
  return granted;
}

/**
 * Ensures the human trainee receives only the missing Bank resources required to
 * practice the current tutorial move without ever draining the 95-card Bank invariant.
 */
export function applyTutorialSuppliesForMission(
  mission: TutorialMissionId,
  state: GameState,
  humanId: string,
): void {
  const player = state.players.find((p) => p.id === humanId);
  if (!player) return;

  if (mission === 'turn1_build_road') {
    grantMissingFromBank(state, humanId, BUILD_COSTS.road);
    return;
  }

  if (mission === 'turn1_trade') {
    // Give the player 4 of whichever resource they already hold most of (or Timber) so 4:1 Maritime Trade is ready
    const sorted = [...RES_KEYS].sort((a, b) => {
      const diff = player.resources[b] - player.resources[a];
      return diff !== 0 ? diff : state.bank[b] - state.bank[a];
    });
    const bestRes = sorted.find((r) => player.resources[r] + state.bank[r] >= 4) ?? 'timber';
    grantMissingFromBank(state, humanId, { [bestRes]: 4 });
    return;
  }

  if (mission === 'turn2_build_settlement') {
    const validSites = getValidSettlementVertices(state, humanId);
    if (validSites.length === 0) {
      // Ensure player can also build 1 road first if needed to open a settlement site
      grantMissingFromBank(state, humanId, {
        timber: BUILD_COSTS.settlement.timber + BUILD_COSTS.road.timber,
        wool: BUILD_COSTS.settlement.wool,
        grain: BUILD_COSTS.settlement.grain,
        brick: BUILD_COSTS.settlement.brick + BUILD_COSTS.road.brick,
      });
    } else {
      grantMissingFromBank(state, humanId, BUILD_COSTS.settlement);
    }
    return;
  }

  if (mission === 'turn3_upgrade_city') {
    if (getValidCityVertices(state, humanId).length > 0) {
      grantMissingFromBank(state, humanId, BUILD_COSTS.city);
    }
    return;
  }

  if (mission === 'turn3_buy_card') {
    grantMissingFromBank(state, humanId, BUILD_COSTS.dev_card);
    // Guarantee the top card drawn via devDeck.pop() is a playable Harbor Knight for Turn 4's lesson
    const knightIdx = state.devDeck.lastIndexOf('knight');
    if (knightIdx >= 0 && knightIdx !== state.devDeck.length - 1) {
      const [k] = state.devDeck.splice(knightIdx, 1);
      state.devDeck.push(k);
    } else if (knightIdx === -1) {
      state.devDeck.push('knight');
    }
  }
}

/**
 * Returns a deterministic RNG for ROLL_DICE during guided tutorial turns so dice
 * land on one of the trainee's revealed settlement numbers (avoiding an unexpected 7).
 */
export function makeTutorialDiceRng(
  state: GameState,
  humanId: string,
): (() => number) | undefined {
  const humanHexTokens: number[] = [];
  for (const v of state.vertices) {
    if (v.building?.ownerId !== humanId) continue;
    for (const hId of v.adjacentHexIds) {
      const hex = state.hexes.find((h) => h.id === hId);
      if (hex && hex.numberToken && !hex.hasRobber && hex.numberToken !== 7) {
        humanHexTokens.push(hex.numberToken);
      }
    }
  }

  const targetSum =
    humanHexTokens.find((n) => n === 6 || n === 8 || n === 5 || n === 9) ??
    humanHexTokens[0] ??
    6;

  // Split targetSum into two valid die faces 1..6
  const d1 = Math.min(6, Math.max(1, Math.floor(targetSum / 2)));
  const d2 = Math.min(6, Math.max(1, targetSum - d1));
  let calls = 0;
  return () => {
    calls += 1;
    const face = calls === 1 ? d1 : d2;
    return (face - 0.5) / 6;
  };
}

/**
 * Advances the guided tutorial mission based on the succeeded human action and resulting state.
 */
export function advanceTutorialMission(
  current: TutorialMissionId,
  action: GameAction,
  nextState: GameState,
  humanId: string,
): TutorialMissionId {
  if (action.playerId !== humanId || current === 'free_play') {
    return current;
  }

  switch (current) {
    case 'flip_tiles':
      return nextState.phase !== 'tile_reveal' ? 'setup_settlement_1' : 'flip_tiles';

    case 'setup_settlement_1':
      return action.type === 'PLACE_SETUP_SETTLEMENT' ? 'setup_road_1' : current;

    case 'setup_road_1':
      return action.type === 'PLACE_SETUP_ROAD' ? 'setup_settlement_2' : current;

    case 'setup_settlement_2':
      return action.type === 'PLACE_SETUP_SETTLEMENT' ? 'setup_road_2' : current;

    case 'setup_road_2':
      return action.type === 'PLACE_SETUP_ROAD' ? 'turn1_roll' : current;

    case 'turn1_roll':
      return action.type === 'ROLL_DICE' ? 'turn1_build_road' : current;

    case 'turn1_build_road':
      return action.type === 'BUILD_ROAD' ? 'turn1_trade' : current;

    case 'turn1_trade':
      return action.type === 'BANK_TRADE' || action.type === 'CREATE_TRADE_OFFER'
        ? 'turn1_end_turn'
        : current;

    case 'turn1_end_turn':
      return action.type === 'END_TURN' ? 'turn2_roll' : current;

    case 'turn2_roll':
      return action.type === 'ROLL_DICE' ? 'turn2_build_settlement' : current;

    case 'turn2_build_settlement':
      return action.type === 'BUILD_SETTLEMENT' ? 'turn2_end_turn' : current;

    case 'turn2_end_turn':
      return action.type === 'END_TURN' ? 'turn3_roll' : current;

    case 'turn3_roll':
      return action.type === 'ROLL_DICE' ? 'turn3_upgrade_city' : current;

    case 'turn3_upgrade_city':
      return action.type === 'UPGRADE_CITY' ? 'turn3_buy_card' : current;

    case 'turn3_buy_card':
      return action.type === 'BUY_DEV_CARD' ? 'turn3_end_turn' : current;

    case 'turn3_end_turn':
      return action.type === 'END_TURN' ? 'turn4_play_knight' : current;

    case 'turn4_play_knight':
      if (action.type === 'PLAY_DEV_CARD' && nextState.phase === 'move_robber') {
        return 'turn4_move_robber';
      }
      return current;

    case 'turn4_move_robber':
      if (
        (action.type === 'MOVE_ROBBER' && nextState.phase !== 'steal') ||
        action.type === 'STEAL_RESOURCE'
      ) {
        return 'free_play';
      }
      return current;

    default:
      return current;
  }
}

export function getTutorialCoachCue(
  missionId: TutorialMissionId,
  game: PublicGameState,
  humanId: string | null,
  uiState?: {
    placementIntent?: 'settlement' | 'road' | 'city' | 'robber' | null;
    subDrawer?: 'none' | 'trade' | 'cards';
  },
): TutorialCoachCue {
  const stepNumber = Math.min(
    TUTORIAL_TOTAL_GUIDED_STEPS,
    MISSION_ORDER.indexOf(missionId) + 1,
  );
  const activePlayer = game.players[game.activePlayerIndex];
  const isHumanActive = Boolean(humanId && activePlayer?.id === humanId);

  // Handle unexpected discard / steal prompts cleanly
  if (humanId && game.phase === 'discard' && game.pendingDiscardPlayerIds.includes(humanId)) {
    return {
      missionId,
      stepIndex: stepNumber,
      totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
      title: 'Robber Rule: 7-Card Hand Limit',
      instruction:
        'A 7 was rolled while you held 8+ cards! Select half your hand (rounded down) in the center card dialog and click Confirm Discard.',
      ruleTip: 'Holding 7 or fewer cards keeps your hand safe whenever a 7 is rolled.',
      highlightControl: null,
      waitingOnRival: false,
      completed: false,
    };
  }

  if (isHumanActive && game.phase === 'steal') {
    return {
      missionId,
      stepIndex: stepNumber,
      totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
      title: 'Raid a Rival Resource',
      instruction:
        'Select Capt. Thorne in the center Raid prompt to draw 1 random card from his hand.',
      ruleTip: 'Moving the Robber next to a rival’s house or city lets you steal 1 card.',
      highlightControl: null,
      waitingOnRival: false,
      completed: false,
    };
  }

  // When it is Capt. Thorne's turn (snake draft or rival turn)
  if (
    missionId !== 'flip_tiles' &&
    missionId !== 'free_play' &&
    !isHumanActive
  ) {
    return {
      missionId,
      stepIndex: stepNumber,
      totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
      title: `${activePlayer?.name ?? 'Capt. Thorne'}'s Turn`,
      instruction:
        game.phase.startsWith('setup')
          ? 'Watch Capt. Thorne place his starting houses and roads following the 2-edge Distance Rule.'
          : 'Capt. Thorne is rolling the dice and taking his turn. Your next lesson step resumes right after.',
      ruleTip: 'All players collect resources even on rival turns if their hex numbers roll!',
      highlightControl: null,
      waitingOnRival: true,
      completed: false,
    };
  }

  switch (missionId) {
    case 'flip_tiles': {
      const revealed = game.hexes.filter((h) => h.revealed).length;
      return {
        missionId,
        stepIndex: 1,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Classic Blind Start: Reveal the Island',
        instruction:
          revealed === 0
            ? 'Tiles start face-down showing only dice numbers. Click any plain tile to flip it, click Shuffle Tiles to randomize, or click Flip All & Begin.'
            : `${revealed}/19 tiles revealed! Keep flipping tiles individually or click Flip All & Begin to start founding settlements.`,
        ruleTip: 'Red numbers (6 and 8) have 5 probability dots and roll most often.',
        highlightControl: 'board_flip',
        waitingOnRival: false,
        completed: false,
      };
    }

    case 'setup_settlement_1':
      return {
        missionId,
        stepIndex: 2,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Place 1st Settlement (+1 VP)',
        instruction:
          'Click any glowing golden intersection on the 3D board to build your 1st medieval house. Aim for junctions touching red 6/8 tiles or 3 different resources.',
        ruleTip: 'Every Settlement produces 1 card per matching dice roll and is worth 1 Victory Point.',
        highlightControl: 'board_vertex',
        waitingOnRival: false,
        completed: false,
      };

    case 'setup_road_1':
      return {
        missionId,
        stepIndex: 3,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Connect Your 1st Road',
        instruction:
          'Click one of the glowing golden road edges touching your new house to point your trade route toward the coast or rich inland hexes.',
        ruleTip: 'You can only build new settlements along roads connected to your network.',
        highlightControl: 'board_edge',
        waitingOnRival: false,
        completed: false,
      };

    case 'setup_settlement_2':
      return {
        missionId,
        stepIndex: 4,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: '2nd Settlement & Starting Hand',
        instruction:
          'Click a glowing intersection at least 2 edges away from any house (Distance Rule). Your 2nd Settlement immediately grants 1 starting resource from each touching tile!',
        ruleTip: 'Check which resources (Timber, Wool, Grain, Brick, Ore) you lack before picking!',
        highlightControl: 'board_vertex',
        waitingOnRival: false,
        completed: false,
      };

    case 'setup_road_2':
      return {
        missionId,
        stepIndex: 5,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Lay Your 2nd Starting Road',
        instruction:
          'Click a glowing road edge next to your 2nd Settlement to finish setup and begin Turn 1.',
        ruleTip: 'Notice your starting resource cards below—gifted from your 2nd Settlement’s tiles.',
        highlightControl: 'board_edge',
        waitingOnRival: false,
        completed: false,
      };

    case 'turn1_roll':
      return {
        missionId,
        stepIndex: 6,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Turn 1: Roll the Dice to Harvest',
        instruction:
          'Every turn starts with a 2-dice roll. Click Roll Dice in the bottom dock to roll and harvest resources from matching tiles.',
        ruleTip: 'Tiles matching the dice sum grant resources to every adjacent player (except if blocked by the Robber).',
        highlightControl: 'roll',
        waitingOnRival: false,
        completed: false,
      };

    case 'turn1_build_road': {
      const roadSelected = uiState?.placementIntent === 'road';
      return {
        missionId,
        stepIndex: 7,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Turn 1: Build a Road (Timber + Brick)',
        instruction: roadSelected
          ? 'Great! Now click any glowing road edge connected to your network to lay your new Timber + Brick road.'
          : 'Roads expand your territory and compete for Longest Road (+2 VP at 5+ connected edges). Click Road · T+B below.',
        ruleTip: 'A Road costs 1 Timber + 1 Brick. We topped up your hand from the Bank for this drill.',
        highlightControl: roadSelected ? 'board_edge' : 'road',
        waitingOnRival: false,
        completed: false,
      };
    }

    case 'turn1_trade': {
      const tradeOpen = uiState?.subDrawer === 'trade';
      return {
        missionId,
        stepIndex: 8,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Turn 1: Trade Resources (Bank or Rival)',
        instruction: tradeOpen
          ? 'Inside the Trade panel, click Confirm 4:1 Trade (using your 4 surplus cards) or send a Rival Trade Offer to Capt. Thorne.'
          : 'Too many of one resource? Click Trade below to swap 4 matching cards with the Bank (or 3:1 / 2:1 at Harbors) or propose a player trade.',
        ruleTip: 'Building on coastal Harbor intersections cuts trade rates down to 3:1 or 2:1!',
        highlightControl: tradeOpen ? 'trade_confirm' : 'trade',
        waitingOnRival: false,
        completed: false,
      };
    }

    case 'turn1_end_turn':
      return {
        missionId,
        stepIndex: 9,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Turn 1 Complete: Pass the Dice',
        instruction:
          'You rolled, built a road, and practiced trading! Click End Turn so Capt. Thorne takes his turn.',
        ruleTip: 'You can always trade and build in any order after rolling dice.',
        highlightControl: 'end_turn',
        waitingOnRival: false,
        completed: false,
      };

    case 'turn2_roll':
      return {
        missionId,
        stepIndex: 10,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Turn 2: Roll Dice Again',
        instruction:
          'It is back to your turn! Click Roll Dice to gather more resources across your settlements.',
        ruleTip: 'Once you expand onto new intersections, more numbers will pay out on every roll.',
        highlightControl: 'roll',
        waitingOnRival: false,
        completed: false,
      };

    case 'turn2_build_settlement': {
      const hasOpenSite = humanId
        ? game.vertices.some((v) => {
            if (v.building !== null) return false;
            const distOk = v.adjacentVertexIds.every((adjId) => {
              const adj = game.vertices.find((x) => x.id === adjId);
              return adj?.building === null;
            });
            if (!distOk) return false;
            return v.adjacentEdgeIds.some(
              (eId) => game.edges.find((e) => e.id === eId)?.ownerId === humanId,
            );
          })
        : true;
      const roadSelected = uiState?.placementIntent === 'road';
      if (!hasOpenSite) {
        return {
          missionId,
          stepIndex: 11,
          totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
          title: 'Turn 2: Extend a Road, Then Build Settlement',
          instruction: roadSelected
            ? 'Click a glowing edge to extend your road outward to an open intersection.'
            : 'Your road network needs 1 more edge to reach an open intersection obeying the Distance Rule. Click Road · T+B first!',
          ruleTip: 'New settlements must sit at least 2 road edges away from existing houses.',
          highlightControl: roadSelected ? 'board_edge' : 'road',
          waitingOnRival: false,
          completed: false,
        };
      }
      const settleSelected = uiState?.placementIntent === 'settlement';
      return {
        missionId,
        stepIndex: 11,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Turn 2: Found a New Settlement (+1 VP)',
        instruction: settleSelected
          ? 'Now click a glowing intersection along your road network at least 2 edges away from existing buildings!'
          : 'Click Settlement · +1 VP below (costs 1 Timber, 1 Wool, 1 Grain, 1 Brick) to expand your empire.',
        ruleTip: 'Remember the Distance Rule: Settlements can never sit directly adjacent to another house or city.',
        highlightControl: settleSelected ? 'board_vertex' : 'settlement',
        waitingOnRival: false,
        completed: false,
      };
    }

    case 'turn2_end_turn':
      return {
        missionId,
        stepIndex: 12,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Turn 2 Complete: End Turn',
        instruction:
          'Nice expansion! Click End Turn to pass the dice to Capt. Thorne before learning City upgrades.',
        ruleTip: 'Notice your VP counter increased by +1 after placing that Settlement.',
        highlightControl: 'end_turn',
        waitingOnRival: false,
        completed: false,
      };

    case 'turn3_roll':
      return {
        missionId,
        stepIndex: 13,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Turn 3: Roll Dice for Ore & Grain',
        instruction:
          'Click Roll Dice to harvest resources for Turn 3, where you will upgrade a house into a fortified City.',
        ruleTip: 'Cities require 2 Grain + 3 Ore—Mountains and Fields are crucial mid-game.',
        highlightControl: 'roll',
        waitingOnRival: false,
        completed: false,
      };

    case 'turn3_upgrade_city': {
      const citySelected = uiState?.placementIntent === 'city';
      return {
        missionId,
        stepIndex: 14,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Turn 3: Upgrade to a City (+2 VP Total)',
        instruction: citySelected
          ? 'Click any of your glowing Timber Settlements on the 3D board to transform it into a fortified Citadel!'
          : 'Cities double adjacent hex harvests (2 cards per roll!) and count for 2 VP. Click City · +2 VP below.',
        ruleTip: 'Upgrading returns your wooden Settlement piece back to your supply so you can build it again.',
        highlightControl: citySelected ? 'board_vertex' : 'city',
        waitingOnRival: false,
        completed: false,
      };
    }

    case 'turn3_buy_card':
      return {
        missionId,
        stepIndex: 15,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Turn 3: Buy a Development Card',
        instruction:
          'Click Buy Card below (costs 1 Wool + 1 Grain + 1 Ore) to draw a Harbor Knight from the Development Deck.',
        ruleTip: 'Playing 3 Knights earns Largest Army (+2 VP). Victory Point cards score silently!',
        highlightControl: 'buy_card',
        waitingOnRival: false,
        completed: false,
      };

    case 'turn3_end_turn':
      return {
        missionId,
        stepIndex: 16,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Cooldown Rule: Wait 1 Turn to Play Card',
        instruction:
          'Action Development Cards cannot be played on the same turn they were bought. Click End Turn so your Knight activates next turn.',
        ruleTip: 'Hidden Victory Point cards count immediately if they push you to the win target on your turn.',
        highlightControl: 'end_turn',
        waitingOnRival: false,
        completed: false,
      };

    case 'turn4_play_knight': {
      const cardsOpen = uiState?.subDrawer === 'cards';
      return {
        missionId,
        stepIndex: 17,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Turn 4: Play Your Knight Card',
        instruction: cardsOpen
          ? 'Click Play on your Harbor Knight card! You can play a Development Card even before rolling the dice.'
          : 'Your Knight is now unlocked! Click Cards in the bottom dock to open your hand.',
        ruleTip: 'Playing a Knight early removes the Robber from your best hex before you roll!',
        highlightControl: cardsOpen ? 'card_play' : 'cards',
        waitingOnRival: false,
        completed: false,
      };
    }

    case 'turn4_move_robber':
      return {
        missionId,
        stepIndex: 18,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Final Drill: Move the Robber & Raid',
        instruction:
          'Click any terrain tile on the board (ideally one touching Capt. Thorne) to relocate the Robber, block that tile’s production, and raid 1 card!',
        ruleTip: 'Rolling a 7 also forces players with 8+ cards to discard half before moving the Robber.',
        highlightControl: 'board_hex',
        waitingOnRival: false,
        completed: false,
      };

    case 'free_play':
    default:
      return {
        missionId: 'free_play',
        stepIndex: TUTORIAL_TOTAL_GUIDED_STEPS,
        totalSteps: TUTORIAL_TOTAL_GUIDED_STEPS,
        title: 'Training Complete — Claim Islehold!',
        instruction: `You've practiced every rule! Continue playing freely in this live match — first ruler to ${game.victoryTarget} VP on their own turn wins.`,
        ruleTip: 'Aim for Settlements, Cities, Longest Road (5+ edges), or Largest Army (3+ Knights).',
        highlightControl: null,
        waitingOnRival: false,
        completed: true,
      };
  }
}

export function isTutorialSupplyStep(mission: TutorialMissionId): boolean {
  return (
    mission === 'turn1_build_road' ||
    mission === 'turn1_trade' ||
    mission === 'turn2_build_settlement' ||
    mission === 'turn3_upgrade_city' ||
    mission === 'turn3_buy_card'
  );
}

export function countPlayerTotalCards(state: GameState, playerId: string): number {
  const p = state.players.find((x) => x.id === playerId);
  return p ? totalResourceCount(p.resources) : 0;
}

export interface BoardTooltipTarget {
  id: string;
  kind: 'hex' | 'vertex' | 'edge' | 'dice_tray' | 'harbor';
  worldPos: { x: number; y: number; z: number };
  badge: string;
  title: string;
  body: string;
  tone: 'gold' | 'emerald' | 'crimson' | 'azure';
}

const TOKEN_PIPS: Record<number, number> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};

function scoreVertexSite(
  game: PublicGameState,
  vertexId: string,
): { score: number; summary: string } {
  const v = game.vertices.find((x) => x.id === vertexId);
  if (!v) return { score: 0, summary: '' };
  const harbor = v.harborId ? game.harbors.find((hb) => hb.id === v.harborId) : undefined;
  let score = harbor ? 2 : 0;
  const seenRes = new Set<string>();
  const labels: string[] = [];

  for (const hId of v.adjacentHexIds) {
    const h = game.hexes.find((x) => x.id === hId);
    if (!h) continue;
    const pips = h.numberToken ? TOKEN_PIPS[h.numberToken] ?? 0 : 0;
    score += pips * 2;
    if (h.revealed && h.terrain !== 'desert') {
      if (!seenRes.has(h.terrain)) {
        seenRes.add(h.terrain);
        score += 3;
      }
      const resLabel =
        h.terrain === 'forest'
          ? 'Timber'
          : h.terrain === 'pasture'
            ? 'Wool'
            : h.terrain === 'fields'
              ? 'Grain'
              : h.terrain === 'hills'
                ? 'Brick'
                : 'Ore';
      labels.push(`${resLabel} ${h.numberToken ?? ''}`.trim());
    } else if (!h.revealed && h.numberToken) {
      labels.push(`Tile #${h.numberToken}`);
    }
  }
  if (harbor) {
    labels.push(
      harbor.kind === 'generic_3_1' ? '3:1 Harbor' : `${RESOURCE_META[harbor.kind].label} 2:1`,
    );
  }
  return {
    score,
    summary: labels.slice(0, 3).join(' · '),
  };
}

function pickBestHexForReveal(game: PublicGameState): HexTile | null {
  const unrevealed = game.hexes.filter((h) => !h.revealed);
  if (unrevealed.length === 0) return null;
  return [...unrevealed].sort((a, b) => {
    const pipsA = a.numberToken ? TOKEN_PIPS[a.numberToken] ?? 0 : 0;
    const pipsB = b.numberToken ? TOKEN_PIPS[b.numberToken] ?? 0 : 0;
    if (pipsB !== pipsA) return pipsB - pipsA;
    return Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z);
  })[0];
}

function pickBestRobberHex(game: PublicGameState, actorId: string): HexTile | null {
  const candidates = game.hexes.filter((h) => !h.hasRobber);
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = -999;

  for (const h of candidates) {
    let score = h.numberToken ? TOKEN_PIPS[h.numberToken] ?? 0 : 0;
    const touching = game.vertices.filter((v) => v.adjacentHexIds.includes(h.id) && v.building);
    let touchesSelf = false;
    let touchesRival = false;
    for (const v of touching) {
      if (v.building?.ownerId === actorId) touchesSelf = true;
      else if (v.building) {
        touchesRival = true;
        score += v.building.type === 'city' ? 12 : 8;
      }
    }
    if (touchesSelf) score -= 20;
    if (!touchesRival && h.terrain === 'desert') score -= 5;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

/**
 * Resolves a context-aware 3D world-space tooltip target anchored directly above
 * the active board element (hex, intersection, road edge, harbor, or dice tray).
 */
export function getBoardTooltipTarget(
  game: PublicGameState,
  viewerId: string | null,
  opts?: {
    missionId?: TutorialMissionId;
    placementIntent?: 'settlement' | 'road' | 'city' | 'robber' | null;
    subDrawer?: 'none' | 'trade' | 'cards';
    myResources?: ResourceBundle;
  },
): BoardTooltipTarget | null {
  if (!game || game.phase === 'finished') return null;

  const mission = opts?.missionId;
  const active = game.players[game.activePlayerIndex];
  const isMyTurn = Boolean(viewerId && active?.id === viewerId);
  const pseudoState = game as unknown as GameState;

  // 1. Pre-game Blind Start Tile Reveal
  if (game.phase === 'tile_reveal') {
    const targetHex = pickBestHexForReveal(game);
    if (!targetHex) return null;
    const revealed = game.hexes.filter((h) => h.revealed).length;
    return {
      id: targetHex.id,
      kind: 'hex',
      worldPos: { x: targetHex.x, y: 0.72, z: targetHex.z },
      badge: mission ? `STEP 1 · ${revealed}/19` : `SETUP · ${revealed}/19`,
      title: 'Click Plain Tile to Flip',
      body: targetHex.numberToken
        ? `Tile #${targetHex.numberToken} (${TOKEN_PIPS[targetHex.numberToken] ?? 1} odds dots) — click to flip or use Shuffle & Flip All.`
        : 'Desert tile slot — click to reveal terrain or Shuffle & Flip All below.',
      tone: 'gold',
    };
  }

  // Wait cleanly when rival bot is taking its turn
  if (!isMyTurn || !viewerId) return null;

  // 2. Starting Settlement Setup
  if (
    game.phase === 'setup_forward_settlement' ||
    game.phase === 'setup_reverse_settlement'
  ) {
    const validVerts = getValidSettlementVertices(pseudoState, viewerId);
    if (validVerts.length === 0) return null;
    const ranked = validVerts
      .map((id) => ({ id, ...scoreVertexSite(game, id) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const v = game.vertices.find((x) => x.id === best.id);
    if (!v) return null;
    const isSecond = game.phase === 'setup_reverse_settlement';
    return {
      id: v.id,
      kind: 'vertex',
      worldPos: { x: v.x, y: 0.85, z: v.z },
      badge: isSecond ? '2ND SETTLEMENT · +CARDS' : 'PRIME SITE · +1 VP',
      title: isSecond ? 'Found 2nd Settlement Here' : 'Build 1st Settlement Here',
      body: `${best.summary || '3-Hex Junction'} · Distance Rule keeps houses 2+ edges apart.`,
      tone: 'gold',
    };
  }

  // 3. Starting Road Setup or Road Building Card
  if (
    game.phase === 'setup_forward_road' ||
    game.phase === 'setup_reverse_road' ||
    game.phase === 'road_building_1' ||
    game.phase === 'road_building_2'
  ) {
    const validEdges = getValidRoadEdges(pseudoState, viewerId);
    if (validEdges.length === 0) return null;
    const bestEdgeId =
      validEdges.find((eId) => {
        const edge = game.edges.find((e) => e.id === eId);
        return edge?.vertexIds.some((vid) => game.vertices.find((v) => v.id === vid)?.harborId);
      }) ?? validEdges[0];
    const edge = game.edges.find((e) => e.id === bestEdgeId);
    if (!edge) return null;
    return {
      id: edge.id,
      kind: 'edge',
      worldPos: { x: edge.x, y: 0.65, z: edge.z },
      badge: 'TRADE ROUTE',
      title: 'Click Glowing Edge for Road',
      body: 'Roads extend outward toward new Settlement sites, Harbors & Longest Road.',
      tone: 'gold',
    };
  }

  // 4. Robber Placement Phase (Rolling 7 or Playing Knight)
  if (game.phase === 'move_robber') {
    const targetHex = pickBestRobberHex(game, viewerId);
    if (!targetHex) return null;
    return {
      id: targetHex.id,
      kind: 'hex',
      worldPos: { x: targetHex.x, y: 1.05, z: targetHex.z },
      badge: 'ROBBER RAID',
      title: 'Click Tile to Move Robber',
      body: `Places the Robber here to freeze #${targetHex.numberToken ?? '—'} harvests and steal 1 rival card.`,
      tone: 'crimson',
    };
  }

  // 5. Roll Phase
  if (game.phase === 'roll') {
    if (mission === 'turn4_play_knight') {
      const playerBuilding = game.vertices.find((v) => v.building?.ownerId === viewerId);
      const anchor = playerBuilding
        ? { x: playerBuilding.x, y: 1.08, z: playerBuilding.z }
        : { x: 9.3, y: 1.35, z: 2.35 };
      return {
        id: 'knight_hint',
        kind: playerBuilding ? 'vertex' : 'dice_tray',
        worldPos: anchor,
        badge: 'STEP 17 · KNIGHT',
        title: 'Play Harbor Knight First!',
        body:
          opts?.subDrawer === 'cards'
            ? 'Click Play on your Harbor Knight card before rolling the dice.'
            : 'Click Cards in the bottom dock to activate your Knight before rolling.',
        tone: 'azure',
      };
    }

    return {
      id: 'dice_tray',
      kind: 'dice_tray',
      worldPos: { x: 9.3, y: 1.4, z: 2.35 },
      badge: 'START OF TURN',
      title: 'Roll the 3D Dice',
      body: 'Click Roll Dice below — matching numbers pay out Timber, Wool, Grain, Brick & Ore.',
      tone: 'gold',
    };
  }

  // 6. Main Phase (Build / Upgrade / Trade / Cards / End Turn)
  if (game.phase === 'main') {
    // Explicit City intent or tutorial city step
    if (opts?.placementIntent === 'city' || mission === 'turn3_upgrade_city') {
      const cityVerts = getValidCityVertices(pseudoState, viewerId);
      const bestCityId =
        cityVerts
          .map((id) => ({ id, ...scoreVertexSite(game, id) }))
          .sort((a, b) => b.score - a.score)[0]?.id ?? cityVerts[0];
      const v = game.vertices.find((x) => x.id === bestCityId);
      if (v) {
        return {
          id: v.id,
          kind: 'vertex',
          worldPos: { x: v.x, y: 1.05, z: v.z },
          badge: 'UPGRADE · +2 VP',
          title:
            opts?.placementIntent === 'city'
              ? 'Click Glowing Settlement to Upgrade'
              : 'Select City · +2 VP Below',
          body: '2 Grain + 3 Ore · Transforms house into a Citadel yielding 2× cards per roll.',
          tone: 'emerald',
        };
      }
    }

    // Explicit Settlement intent or tutorial build settlement step
    if (opts?.placementIntent === 'settlement' || mission === 'turn2_build_settlement') {
      const validVerts = getValidSettlementVertices(pseudoState, viewerId);
      if (validVerts.length > 0) {
        const best = validVerts
          .map((id) => ({ id, ...scoreVertexSite(game, id) }))
          .sort((a, b) => b.score - a.score)[0];
        const v = game.vertices.find((x) => x.id === best.id);
        if (v) {
          return {
            id: v.id,
            kind: 'vertex',
            worldPos: { x: v.x, y: 0.85, z: v.z },
            badge: 'EXPAND · +1 VP',
            title:
              opts?.placementIntent === 'settlement'
                ? 'Click Highlighted Site to Build'
                : 'Click Settlement · +1 VP Below',
            body: `Costs 1 Timber, Wool, Grain, Brick · ${best.summary || 'Distance Rule valid'}.`,
            tone: 'emerald',
          };
        }
      }
    }

    // Explicit Road intent or tutorial build road step (or needing road extension for Turn 2)
    if (
      opts?.placementIntent === 'road' ||
      mission === 'turn1_build_road' ||
      mission === 'turn2_build_settlement'
    ) {
      const validEdges = getValidRoadEdges(pseudoState, viewerId);
      if (validEdges.length > 0) {
        const edge = game.edges.find((e) => e.id === validEdges[0]);
        if (edge) {
          return {
            id: edge.id,
            kind: 'edge',
            worldPos: { x: edge.x, y: 0.65, z: edge.z },
            badge: 'ROAD · T+B',
            title:
              opts?.placementIntent === 'road'
                ? 'Click Highlighted Road Edge'
                : 'Click Road · T+B Below',
            body: 'Costs 1 Timber + 1 Brick · Opens new Settlement spots & Longest Road.',
            tone: 'gold',
          };
        }
      }
    }

    // Trade Drawer open or tutorial trade step -> point at coastal Harbor
    if (opts?.subDrawer === 'trade' || mission === 'turn1_trade') {
      const playerHarbor =
        game.harbors.find((hb) =>
          hb.vertexIds.some(
            (vid) => game.vertices.find((v) => v.id === vid)?.building?.ownerId === viewerId,
          ),
        ) ?? game.harbors[0];
      if (playerHarbor) {
        return {
          id: playerHarbor.id,
          kind: 'harbor',
          worldPos: { x: playerHarbor.x, y: 0.92, z: playerHarbor.z },
          badge: 'MARITIME TRADE',
          title:
            opts?.subDrawer === 'trade'
              ? 'Confirm 4:1 or Harbor Trade'
              : 'Click Trade in Bottom Dock',
          body: 'Swap 4 matching cards with the Bank, or claim coastal Harbors for 3:1 & 2:1 rates!',
          tone: 'azure',
        };
      }
    }

    // Tutorial Buy Dev Card step
    if (mission === 'turn3_buy_card') {
      const stronghold =
        game.vertices.find((v) => v.building?.ownerId === viewerId && v.building.type === 'city') ??
        game.vertices.find((v) => v.building?.ownerId === viewerId);
      if (stronghold) {
        return {
          id: stronghold.id,
          kind: 'vertex',
          worldPos: { x: stronghold.x, y: 1.15, z: stronghold.z },
          badge: 'DEV CARD · 1W 1G 1O',
          title: 'Click Buy Card Below',
          body: 'Draws a Harbor Knight, Road Building, Plenty, or +1 VP card into your private hand.',
          tone: 'azure',
        };
      }
    }

    // Tutorial End Turn step
    if (
      mission === 'turn1_end_turn' ||
      mission === 'turn2_end_turn' ||
      mission === 'turn3_end_turn'
    ) {
      return {
        id: 'dice_tray_end',
        kind: 'dice_tray',
        worldPos: { x: 9.3, y: 1.32, z: 2.35 },
        badge: 'PASS THE DICE',
        title: 'Click End Turn Below',
        body:
          mission === 'turn3_end_turn'
            ? 'New Development Cards rest 1 turn — pass the dice to unlock your Knight!'
            : 'Pass the dice to Capt. Thorne and watch his turn unfold.',
        tone: 'gold',
      };
    }

    // Quick Play / Free Play helpful suggestion when Board Hints enabled
    if (opts?.myResources) {
      if (hasResources(opts.myResources, BUILD_COSTS.city)) {
        const cityVerts = getValidCityVertices(pseudoState, viewerId);
        const v = game.vertices.find((x) => x.id === cityVerts[0]);
        if (v) {
          return {
            id: v.id,
            kind: 'vertex',
            worldPos: { x: v.x, y: 1.05, z: v.z },
            badge: 'READY · CITY',
            title: 'Can Upgrade to City (+2 VP)',
            body: 'Click City · +2 VP in the bottom dock, then select a glowing house.',
            tone: 'emerald',
          };
        }
      }
      if (hasResources(opts.myResources, BUILD_COSTS.settlement)) {
        const verts = getValidSettlementVertices(pseudoState, viewerId);
        const v = game.vertices.find((x) => x.id === verts[0]);
        if (v) {
          return {
            id: v.id,
            kind: 'vertex',
            worldPos: { x: v.x, y: 0.85, z: v.z },
            badge: 'READY · SETTLEMENT',
            title: 'Can Found Settlement (+1 VP)',
            body: 'Click Settlement · +1 VP below, then click a highlighted intersection.',
            tone: 'emerald',
          };
        }
      }
    }
  }

  return null;
}

