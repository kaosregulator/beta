import type { DevCardInstance, PublicGameState } from '../game/types';

export function getPhasePrompt(
  game: PublicGameState,
  viewerId: string | null,
): string {
  const active = game.players[game.activePlayerIndex];
  const isMe = Boolean(viewerId && active?.id === viewerId);

  switch (game.phase) {
    case 'setup_forward_settlement':
    case 'setup_reverse_settlement':
      return isMe
        ? 'Select a glowing intersection to place your starting Settlement.'
        : `Waiting for ${active?.name} to place a Settlement.`;
    case 'setup_forward_road':
    case 'setup_reverse_road':
      return isMe
        ? 'Select an adjacent glowing edge to place your starting Road.'
        : `Waiting for ${active?.name} to place a Road.`;
    case 'roll':
      return isMe ? 'Roll the 3D dice to start your turn.' : `${active?.name} is rolling the dice.`;
    case 'discard':
      return 'Robber 7 rolled — players with 8+ cards must discard half.';
    case 'move_robber':
      return isMe
        ? 'Select a hex tile to relocate the Robber.'
        : `${active?.name} is relocating the Robber.`;
    case 'steal':
      return isMe
        ? 'Choose an adjacent rival to raid.'
        : `${active?.name} is choosing a rival to raid.`;
    case 'road_building_1':
    case 'road_building_2':
      return isMe ? 'Place your free Highway road on a glowing edge.' : `${active?.name} is laying roads.`;
    case 'main':
      return isMe
        ? 'Build, trade, play cards, or end your turn.'
        : `${active?.name} is planning their turn.`;
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
  if (game.phase === 'roll') return card.type === 'knight';
  return game.phase === 'main';
}
