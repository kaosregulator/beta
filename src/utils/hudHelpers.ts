import {
  RESOURCE_META,
  type DevCardInstance,
  type HarvestGrant,
  type PublicGameState,
  type ResourceType,
} from '../game/types';

export interface TurnPopupCard {
  id: string;
  turn: number;
  kind: 'turn' | 'harvest' | 'robber' | 'build' | 'trade' | 'award';
  title: string;
  subtitle: string;
  accentHex?: string;
  grants?: Array<{ resource: ResourceType; amount: number }>;
}

const RES_ORDER: ResourceType[] = ['timber', 'wool', 'grain', 'brick', 'ore'];

export function getPhasePrompt(
  game: PublicGameState,
  viewerId: string | null,
): string {
  const active = game.players[game.activePlayerIndex];
  const isMe = Boolean(viewerId && active?.id === viewerId);

  switch (game.phase) {
    case 'tile_reveal': {
      const revealedCount = game.hexes.filter((h) => h.revealed).length;
      return `Classic Blind Start (${revealedCount}/19 revealed) — Shuffle or tap tiles to flip them over.`;
    }
    case 'setup_forward_settlement':
    case 'setup_reverse_settlement':
      return isMe
        ? 'Place your starting Settlement on a glowing intersection.'
        : `Waiting for ${active?.name} to place a Settlement.`;
    case 'setup_forward_road':
    case 'setup_reverse_road':
      return isMe
        ? 'Place an adjacent Road along a glowing edge.'
        : `Waiting for ${active?.name} to place a Road.`;
    case 'roll':
      return isMe
        ? 'Roll the dice to begin your turn.'
        : `${active?.name} is rolling the dice.`;
    case 'discard':
      return 'Robber 7 rolled — players with 8+ cards must discard half.';
    case 'move_robber':
      return isMe
        ? 'Tap a terrain hex to relocate the Robber.'
        : `${active?.name} is moving the Robber.`;
    case 'steal':
      return isMe
        ? 'Choose an adjacent rival to raid.'
        : `${active?.name} is raiding a rival.`;
    case 'road_building_1':
    case 'road_building_2':
      return isMe
        ? 'Place your free Highway road on a glowing edge.'
        : `${active?.name} is laying roads.`;
    case 'main':
      return isMe
        ? 'Build, trade, play cards, or end your turn.'
        : `${active?.name} is taking their turn.`;
    case 'finished':
      return 'Match Complete.';
    default:
      return '';
  }
}

export function canPlayDevCardNow(
  game: PublicGameState,
  card: DevCardInstance,
  isMyTurn: boolean,
): boolean {
  if (!isMyTurn || card.played || game.devCardPlayedThisTurn) return false;
  if (card.type === 'victory_point') return false;
  if (card.boughtTurn === game.turnNumber) return false;
  return game.phase === 'roll' || game.phase === 'main';
}

export function filterHarvestGrantsForViewer(
  grants: HarvestGrant[] | undefined,
  viewerId: string | null,
): HarvestGrant[] {
  if (!grants || grants.length === 0) return [];
  if (!viewerId) return grants;
  return grants.filter((g) => g.playerId === viewerId);
}

export function summarizeHarvestByResource(
  grants: HarvestGrant[],
): Array<{ resource: ResourceType; amount: number }> {
  const totals = new Map<ResourceType, number>();
  for (const g of grants) {
    totals.set(g.resource, (totals.get(g.resource) ?? 0) + g.amount);
  }
  return RES_ORDER.filter((r) => (totals.get(r) ?? 0) > 0).map((r) => ({
    resource: r,
    amount: totals.get(r)!,
  }));
}

export function deriveTurnPopupCard(
  prevGame: PublicGameState | null,
  nextGame: PublicGameState,
  viewerId: string | null,
): TurnPopupCard | null {
  const active = nextGame.players[nextGame.activePlayerIndex];
  const isMe = Boolean(viewerId && active?.id === viewerId);

  // 1. Dice rolled -> harvest summary or robber 7 alert
  if (
    nextGame.dice &&
    nextGame.diceRollSeq > 0 &&
    nextGame.diceRollSeq !== prevGame?.diceRollSeq
  ) {
    const sum = nextGame.dice[0] + nextGame.dice[1];
    if (sum === 7) {
      return {
        id: `popup_roll_${nextGame.diceRollSeq}`,
        turn: nextGame.turnNumber,
        kind: 'robber',
        title: `Rolled 7 · Robber Activated`,
        subtitle: isMe
          ? 'Move the Robber to block a rival tile.'
          : `${active?.name} rolled a 7 and moves the Robber.`,
      };
    }

    const viewerGrants = filterHarvestGrantsForViewer(
      nextGame.lastHarvestGrants,
      viewerId,
    );
    const summary = summarizeHarvestByResource(viewerGrants);
    if (summary.length > 0) {
      const text = summary
        .map((s) => `+${s.amount} ${RESOURCE_META[s.resource].label}`)
        .join(', ');
      return {
        id: `popup_roll_${nextGame.diceRollSeq}`,
        turn: nextGame.turnNumber,
        kind: 'harvest',
        title: `Rolled ${sum} · Resources Collected`,
        subtitle: viewerId ? `You collected ${text}.` : `${active?.name} rolled ${sum} (${text}).`,
        grants: summary,
      };
    }

    return {
      id: `popup_roll_${nextGame.diceRollSeq}`,
      turn: nextGame.turnNumber,
      kind: 'turn',
      title: `Rolled ${sum}`,
      subtitle: `${active?.name} rolled ${nextGame.dice[0]} + ${nextGame.dice[1]}.`,
    };
  }

  // 2. Turn change -> clean Turn-for-Turn card
  if (
    prevGame &&
    (prevGame.turnNumber !== nextGame.turnNumber ||
      prevGame.activePlayerIndex !== nextGame.activePlayerIndex) &&
    nextGame.phase !== 'finished'
  ) {
    return {
      id: `popup_turn_${nextGame.turnNumber}_${active?.id ?? 'x'}_${nextGame.phase}`,
      turn: nextGame.turnNumber,
      kind: 'turn',
      title: isMe ? `Your Turn · Turn ${nextGame.turnNumber}` : `${active?.name}'s Turn`,
      subtitle: getPhasePrompt(nextGame, viewerId),
    };
  }

  // 3. Notable build / award / trade events within a turn
  const prevLastId = prevGame?.events[prevGame.events.length - 1]?.id;
  const lastEvt = nextGame.events[nextGame.events.length - 1];
  if (
    lastEvt &&
    lastEvt.id !== prevLastId &&
    (lastEvt.type === 'build' ||
      lastEvt.type === 'award' ||
      lastEvt.type === 'trade' ||
      lastEvt.type === 'dev_card')
  ) {
    const title =
      lastEvt.type === 'build'
        ? 'Construction Complete'
        : lastEvt.type === 'award'
          ? 'Honor Claimed'
          : lastEvt.type === 'trade'
            ? 'Harbor & Trade'
            : 'Development Card';
    return {
      id: `popup_evt_${lastEvt.id}`,
      turn: nextGame.turnNumber,
      kind: lastEvt.type === 'dev_card' ? 'turn' : lastEvt.type,
      title,
      subtitle: lastEvt.message,
    };
  }

  return null;
}
