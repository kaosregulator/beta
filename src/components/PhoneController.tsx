import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Dices,
  Hammer,
  Layers,
  Repeat,
  Send,
  Shield,
  X,
} from 'lucide-react';
import {
  getValidCityVertices,
  getValidRoadEdges,
  getValidSettlementVertices,
  emptyResources,
  hasResources,
  totalResourceCount,
} from '../game/rules';
import {
  BUILD_COSTS,
  FACTION_META,
  PIECE_LIMITS,
  RESOURCE_META,
  type FactionColor,
  type GameState,
  type PublicGameState,
  type ResourceBundle,
  type ResourceType,
} from '../game/types';
import { canPlayDevCardNow, getPhasePrompt } from '../utils/hudHelpers';
import { useGameStore } from '../store/useGameStore';
import {
  DEV_CARD_META,
  DevCardIllustration,
  IsleholdCrest,
  ResourceIcon,
} from './ResourceArt';
import { VictoryModal } from './VictoryModal';

const RES_KEYS: ResourceType[] = ['timber', 'wool', 'grain', 'brick', 'ore'];
const FACTION_COLORS: FactionColor[] = ['crimson', 'navy', 'forest', 'ivory'];

/**
 * Interactive tactile SVG mini-map rendered on the Phone Controller whenever
 * the player needs to pick a vertex (Settlement/City), edge (Road), or hex (Robber).
 * Every click immediately validates through the server and animates onto the TV 3D board!
 */
function PhonePlacementMap({
  game,
  playerId,
  mode,
  onPickVertex,
  onPickEdge,
  onPickHex,
}: {
  game: PublicGameState;
  playerId: string;
  mode: 'settlement' | 'road' | 'city' | 'robber';
  onPickVertex: (id: string) => void;
  onPickEdge: (id: string) => void;
  onPickHex: (id: string) => void;
}) {
  const pseudo = game as unknown as GameState;
  const validIds = useMemo(() => {
    if (mode === 'settlement') return new Set(getValidSettlementVertices(pseudo, playerId));
    if (mode === 'city') return new Set(getValidCityVertices(pseudo, playerId));
    if (mode === 'road') return new Set(getValidRoadEdges(pseudo, playerId));
    return new Set(game.hexes.filter((h) => !h.hasRobber).map((h) => h.id));
  }, [game, playerId, mode]);

  const playerColors = useMemo(
    () => new Map(game.players.map((p) => [p.id, FACTION_META[p.color].hex])),
    [game.players],
  );

  const terrainColors: Record<string, string> = {
    forest: '#2b5229',
    pasture: '#5e8c41',
    fields: '#c99b38',
    hills: '#a64d33',
    mountains: '#646b73',
    desert: '#d1b375',
  };

  return (
    <div className="bg-[#0d1924] border border-[#d4aa54]/40 rounded-2xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-[#f5d88c]">
          Tap a glowing {mode} spot on the island
        </span>
        <span className="text-[11px] text-[#94a3b8]">{validIds.size} valid</span>
      </div>

      <svg viewBox="-9 -8.6 18 17.2" className="w-full max-h-[300px] touch-manipulation">
        {/* Coastal Harbors */}
        {game.harbors.map((hb) => {
          const v1 = game.vertices.find((v) => v.id === hb.vertexIds[0]);
          const v2 = game.vertices.find((v) => v.id === hb.vertexIds[1]);
          const shortKind =
            hb.kind === 'generic_3_1'
              ? 'ANY'
              : hb.kind === 'timber'
                ? 'TIM'
                : hb.kind === 'wool'
                  ? 'WOL'
                  : hb.kind === 'grain'
                    ? 'GRN'
                    : hb.kind === 'brick'
                      ? 'BRK'
                      : 'ORE';
          return (
            <g key={hb.id}>
              {v1 && (
                <line
                  x1={hb.x}
                  y1={hb.z}
                  x2={v1.x}
                  y2={v1.z}
                  stroke="#9c7a4c"
                  strokeWidth="0.1"
                  strokeDasharray="0.2 0.14"
                />
              )}
              {v2 && (
                <line
                  x1={hb.x}
                  y1={hb.z}
                  x2={v2.x}
                  y2={v2.z}
                  stroke="#9c7a4c"
                  strokeWidth="0.1"
                  strokeDasharray="0.2 0.14"
                />
              )}
              <circle
                cx={hb.x}
                cy={hb.z}
                r="0.62"
                fill="#142638"
                stroke="#d4aa54"
                strokeWidth="0.09"
              />
              <text
                x={hb.x}
                y={hb.z - 0.04}
                textAnchor="middle"
                fontSize="0.4"
                fontWeight="bold"
                fill="#f5d88c"
              >
                {hb.ratio}:1
              </text>
              <text
                x={hb.x}
                y={hb.z + 0.36}
                textAnchor="middle"
                fontSize="0.32"
                fontWeight="600"
                fill="#cbd5e1"
              >
                {shortKind}
              </text>
            </g>
          );
        })}

        {/* Hex tiles */}
        {game.hexes.map((h) => {
          const pts: string[] = [];
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 180) * (60 * i - 30);
            pts.push(`${(h.x + 1.56 * Math.cos(a)).toFixed(2)},${(h.z + 1.56 * Math.sin(a)).toFixed(2)}`);
          }
          const isValidHex = mode === 'robber' && validIds.has(h.id);
          return (
            <g
              key={h.id}
              onClick={isValidHex ? () => onPickHex(h.id) : undefined}
              style={{ cursor: isValidHex ? 'pointer' : 'default' }}
            >
              <polygon
                points={pts.join(' ')}
                fill={terrainColors[h.terrain]}
                stroke={isValidHex ? '#f75948' : '#1b2836'}
                strokeWidth={isValidHex ? 0.16 : 0.08}
              />
              {h.numberToken && (
                <text
                  x={h.x}
                  y={h.z + 0.18}
                  textAnchor="middle"
                  fontSize="0.72"
                  fontWeight="bold"
                  fill={h.numberToken === 6 || h.numberToken === 8 ? '#fca5a5' : '#f8f3e6'}
                >
                  {h.numberToken}
                </text>
              )}
              {isValidHex && (
                <circle
                  cx={h.x}
                  cy={h.z}
                  r="0.55"
                  fill="rgba(239, 68, 68, 0.35)"
                  stroke="#fca5a5"
                  strokeWidth="0.1"
                />
              )}
            </g>
          );
        })}

        {/* Built & Valid Edges */}
        {game.edges.map((e) => {
          const vA = game.vertices.find((v) => v.id === e.vertexIds[0]);
          const vB = game.vertices.find((v) => v.id === e.vertexIds[1]);
          if (!vA || !vB) return null;
          const isValid = mode === 'road' && validIds.has(e.id);
          if (!e.ownerId && !isValid) return null;
          return (
            <g
              key={e.id}
              onClick={isValid ? () => onPickEdge(e.id) : undefined}
              style={{ cursor: isValid ? 'pointer' : 'default' }}
            >
              <line
                x1={vA.x}
                y1={vA.z}
                x2={vB.x}
                y2={vB.z}
                stroke={e.ownerId ? playerColors.get(e.ownerId) : '#f5d88c'}
                strokeWidth={isValid ? 0.34 : 0.24}
                strokeLinecap="round"
                opacity={isValid ? 0.92 : 1}
              />
              {isValid && (
                <line
                  x1={vA.x}
                  y1={vA.z}
                  x2={vB.x}
                  y2={vB.z}
                  stroke="transparent"
                  strokeWidth="0.85"
                />
              )}
            </g>
          );
        })}

        {/* Built & Valid Vertices */}
        {game.vertices.map((v) => {
          const isValid =
            (mode === 'settlement' || mode === 'city') && validIds.has(v.id);
          if (!v.building && !isValid) return null;
          return (
            <g
              key={v.id}
              onClick={isValid ? () => onPickVertex(v.id) : undefined}
              style={{ cursor: isValid ? 'pointer' : 'default' }}
            >
              {v.building && (
                <circle
                  cx={v.x}
                  cy={v.z}
                  r={v.building.type === 'city' ? 0.38 : 0.28}
                  fill={playerColors.get(v.building.ownerId)}
                  stroke="#f8f3e6"
                  strokeWidth="0.08"
                />
              )}
              {isValid && (
                <>
                  <circle
                    cx={v.x}
                    cy={v.z}
                    r="0.42"
                    fill="rgba(245, 216, 140, 0.35)"
                    stroke="#f5d88c"
                    strokeWidth="0.12"
                  />
                  <circle cx={v.x} cy={v.z} r="0.65" fill="transparent" />
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function PhoneController({ initialPin = '' }: { initialPin?: string }) {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const privateState = useGameStore((s) => s.privateState);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const leaveToTitle = useGameStore((s) => s.leaveToTitle);
  const dispatchGameAction = useGameStore((s) => s.dispatchGameAction);
  const placementIntent = useGameStore((s) => s.placementIntent);
  const setPlacementIntent = useGameStore((s) => s.setPlacementIntent);
  const errorMessage = useGameStore((s) => s.errorMessage);
  const clearError = useGameStore((s) => s.clearError);

  const [pinInput, setPinInput] = useState(initialPin);
  const [nameInput, setNameInput] = useState('');
  const [colorInput, setColorInput] = useState<FactionColor>('crimson');
  const [joining, setJoining] = useState(false);

  const [tab, setTab] = useState<'play' | 'build' | 'trade' | 'cards'>('play');
  const [tradeGive, setTradeGive] = useState<ResourceType>('timber');
  const [tradeGet, setTradeGet] = useState<ResourceType>('ore');
  const [offerGive, setOfferGive] = useState<ResourceBundle>(emptyResources());
  const [offerWant, setOfferWant] = useState<ResourceBundle>(emptyResources());
  const [discardDraft, setDiscardDraft] = useState<ResourceBundle>(emptyResources());
  const [cardRes1, setCardRes1] = useState<ResourceType>('ore');
  const [cardRes2, setCardRes2] = useState<ResourceType>('grain');

  // Step 1: Join Form if not yet seated in a room
  if (!room || !playerId) {
    return (
      <div className="fixed inset-0 z-20 bg-[#0d151e] overflow-y-auto flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#121c27] border border-[#d4aa54]/35 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <IsleholdCrest className="w-10 h-10" />
              <div>
                <h1 className="font-display text-xl font-bold text-[#f7eed7]">
                  Join Island Table
                </h1>
                <p className="text-xs text-[#9fb0c2]">Phone Controller Setup</p>
              </div>
            </div>
            <button
              type="button"
              onClick={leaveToTitle}
              aria-label="Back to main screen"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-[#192634] text-[#cbd5e1] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-4 rounded-xl bg-red-950/90 border border-red-400/40 p-3 text-xs text-red-100 flex items-center justify-between"
            >
              <span>{errorMessage}</span>
              <button type="button" onClick={clearError} className="underline">
                OK
              </button>
            </div>
          )}

          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!pinInput.trim() || !nameInput.trim() || joining) return;
              setJoining(true);
              try {
                await joinRoom({
                  roomId: pinInput.trim().toUpperCase(),
                  name: nameInput.trim(),
                  color: colorInput,
                });
              } finally {
                setJoining(false);
              }
            }}
          >
            <div>
              <label htmlFor="join-pin" className="block text-xs font-medium text-[#cbb894] mb-1.5">
                Room PIN
              </label>
              <input
                id="join-pin"
                type="text"
                required
                maxLength={6}
                placeholder="e.g. A7K2"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.toUpperCase())}
                className="w-full h-12 rounded-xl bg-[#182431] border border-white/15 px-4 font-mono-num text-lg tracking-widest text-[#f5d88c] uppercase focus:outline-none focus:border-[#d4aa54]"
              />
            </div>

            <div>
              <label htmlFor="join-name" className="block text-xs font-medium text-[#cbb894] mb-1.5">
                Your Name
              </label>
              <input
                id="join-name"
                type="text"
                required
                maxLength={20}
                placeholder="Captain Name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full h-12 rounded-xl bg-[#182431] border border-white/15 px-4 text-sm text-[#f7eed7] focus:outline-none focus:border-[#d4aa54]"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-[#cbb894] mb-2">
                Faction Banner
              </span>
              <div className="grid grid-cols-2 gap-2.5">
                {FACTION_COLORS.map((c) => {
                  const fm = FACTION_META[c];
                  const active = colorInput === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColorInput(c)}
                      className={`min-h-[48px] rounded-xl px-3 py-2 border flex items-center gap-2.5 text-left cursor-pointer ${
                        active
                          ? 'bg-[#1f2f40] border-[#f5d88c]'
                          : 'bg-[#16212d] border-white/10'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-sm shrink-0 border border-white/30"
                        style={{ backgroundColor: fm.hex }}
                      />
                      <span className="text-xs font-medium text-[#f5efe2]">
                        {fm.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={joining || !pinInput.trim() || !nameInput.trim()}
              className="w-full min-h-[50px] rounded-xl bg-[#b88635] hover:bg-[#cc9842] disabled:opacity-45 text-[#14100a] font-semibold text-sm cursor-pointer"
            >
              {joining ? 'Connecting...' : 'Join Table'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const lobbySelf = room.lobbyPlayers.find((p) => p.id === playerId);
  const selfColor = lobbySelf?.color ?? 'crimson';
  const selfMeta = FACTION_META[selfColor];

  // Step 2: Seated in Lobby waiting for TV Host to press Start
  if (room.status === 'lobby' || !room.game) {
    return (
      <div className="fixed inset-0 z-20 bg-[#0d151e] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-sm bg-[#121c27] border border-[#d4aa54]/35 rounded-2xl p-6 shadow-2xl">
          <div
            className="w-12 h-12 mx-auto mb-3 rounded-xl border border-white/25"
            style={{ backgroundColor: selfMeta.hex }}
          />
          <h2 className="font-display text-2xl font-bold text-[#f7eed7]">
            {lobbySelf?.name}
          </h2>
          <p className="text-xs text-[#cbb894] mt-1">
            {selfMeta.label} · Room {room.roomId}
          </p>
          <p className="text-sm text-[#cbd5e1] mt-5">
            You are seated at the table. Look at the TV display while the host starts the
            match.
          </p>
          <div className="mt-5 pt-4 border-t border-white/10 text-xs text-[#94a3b8]">
            {room.lobbyPlayers.length} / 4 players connected
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Active Phone Controller HUD
  const game = room.game;
  const activePlayer = game.players[game.activePlayerIndex];
  const isMyTurn = activePlayer?.id === playerId;
  const myPublic = game.players.find((p) => p.id === playerId);
  const myRes = privateState?.resources ?? emptyResources();
  const ratios = privateState?.tradeRatios ?? {
    timber: 4,
    wool: 4,
    grain: 4,
    brick: 4,
    ore: 4,
  };

  // Determine if interactive placement map is needed right now
  let activePlacementMode: 'settlement' | 'road' | 'city' | 'robber' | null = null;
  if (isMyTurn) {
    if (
      game.phase === 'setup_forward_settlement' ||
      game.phase === 'setup_reverse_settlement'
    ) {
      activePlacementMode = 'settlement';
    } else if (
      game.phase === 'setup_forward_road' ||
      game.phase === 'setup_reverse_road' ||
      game.phase === 'road_building_1' ||
      game.phase === 'road_building_2'
    ) {
      activePlacementMode = 'road';
    } else if (game.phase === 'move_robber') {
      activePlacementMode = 'robber';
    } else if (game.phase === 'main' && placementIntent) {
      activePlacementMode = placementIntent;
    }
  }

  const mustDiscard =
    game.phase === 'discard' && game.pendingDiscardPlayerIds.includes(playerId);
  const requiredDiscard = Math.floor(totalResourceCount(myRes) / 2);

  // Incoming player-to-player trade offers
  const incomingOffers = game.activeTradeOffers.filter(
    (o) =>
      o.fromPlayerId !== playerId &&
      (o.toPlayerId === null || o.toPlayerId === playerId) &&
      !o.rejectedBy.includes(playerId),
  );

  return (
    <div className="fixed inset-0 z-20 bg-[#0d151e] flex flex-col justify-between">
      {/* Compact Sticky Top Header (<= 64px) */}
      <header className="shrink-0 bg-[#121c27] border-b border-[#d4aa54]/30 px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-3.5 h-7 rounded-sm shrink-0"
            style={{ backgroundColor: selfMeta.hex }}
          />
          <div className="min-w-0">
            <div className="text-sm font-bold text-[#f7eed7] truncate">
              {myPublic?.name} · {privateState?.totalVP ?? myPublic?.publicVP ?? 0} VP
            </div>
            <div className="text-[11px] text-[#cbb894] truncate">
              {isMyTurn ? 'Your Turn' : `${activePlayer?.name}'s Turn`} ·{' '}
              {getPhasePrompt(game, playerId)}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono-num text-xs font-bold text-[#f5d88c]">
            PIN {room.roomId}
          </div>
        </div>
      </header>

      {/* Scrollable Middle Stretch Zone */}
      <main className="flex-1 overflow-y-auto scroll-thin p-4 space-y-4">
        {errorMessage && (
          <div
            role="alert"
            className="rounded-xl bg-red-950 border border-red-400/40 p-3 text-xs text-red-100 flex items-center justify-between"
          >
            <span>{errorMessage}</span>
            <button type="button" onClick={clearError} className="underline font-bold">
              OK
            </button>
          </div>
        )}

        {/* Private Resource Hand Always Visible at Top of Content */}
        <section aria-label="My Resources">
          <div className="grid grid-cols-5 gap-2">
            {RES_KEYS.map((r) => (
              <div
                key={r}
                className="bg-[#14202c] border border-white/10 rounded-xl py-2 px-1 flex flex-col items-center"
              >
                <ResourceIcon type={r} className="w-7 h-7" />
                <span className="font-mono-num text-base font-bold text-[#f7eed7] mt-1">
                  {myRes[r]}
                </span>
                <span className="text-[10px] text-[#9fb0c2]">{RESOURCE_META[r].label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Discard Prompt */}
        {mustDiscard && (
          <section className="bg-[#18222e] border border-[#d4aa54]/50 rounded-2xl p-4">
            <h2 className="font-display text-base font-bold text-[#f5d88c] mb-1">
              Discard {requiredDiscard} Cards (7 Rolled)
            </h2>
            <p className="text-xs text-[#cbd5e1] mb-3">
              Selected {totalResourceCount(discardDraft)} / {requiredDiscard}
            </p>
            <div className="space-y-2 mb-3">
              {RES_KEYS.map((r) => (
                <div key={r} className="flex items-center justify-between bg-[#101821] rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <ResourceIcon type={r} className="w-6 h-6" />
                    <span className="text-xs text-[#f5efe2]">
                      {RESOURCE_META[r].label} (Have {myRes[r]})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDiscardDraft((d) => ({ ...d, [r]: Math.max(0, d[r] - 1) }))
                      }
                      className="w-9 h-9 rounded-lg bg-[#1d2c3b] font-bold"
                    >
                      -
                    </button>
                    <span className="font-mono-num w-5 text-center text-sm font-bold">
                      {discardDraft[r]}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setDiscardDraft((d) => ({
                          ...d,
                          [r]: Math.min(myRes[r], d[r] + 1),
                        }))
                      }
                      className="w-9 h-9 rounded-lg bg-[#1d2c3b] font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={totalResourceCount(discardDraft) !== requiredDiscard}
              onClick={() => {
                dispatchGameAction({
                  type: 'DISCARD_RESOURCES',
                  playerId,
                  bundle: discardDraft,
                });
                setDiscardDraft(emptyResources());
              }}
              className="w-full min-h-[48px] rounded-xl bg-[#b88635] disabled:opacity-40 text-[#14100a] font-semibold text-sm"
            >
              Confirm Discard
            </button>
          </section>
        )}

        {/* Steal Target Picker */}
        {isMyTurn && game.phase === 'steal' && (
          <section className="bg-[#18222e] border border-[#d4aa54]/50 rounded-2xl p-4 space-y-2">
            <h2 className="font-display text-base font-bold text-[#f5d88c]">
              Select Rival to Raid
            </h2>
            {game.stealCandidateIds.map((cid) => {
              const target = game.players.find((p) => p.id === cid);
              if (!target) return null;
              return (
                <button
                  key={cid}
                  type="button"
                  onClick={() =>
                    dispatchGameAction({
                      type: 'STEAL_RESOURCE',
                      playerId,
                      targetPlayerId: cid,
                    })
                  }
                  className="w-full min-h-[48px] px-4 rounded-xl bg-[#101821] border border-white/15 flex items-center justify-between text-sm text-[#f5efe2]"
                >
                  <span>{target.name}</span>
                  <span className="font-mono-num text-xs text-[#f5d88c]">
                    {target.resourceCount} cards
                  </span>
                </button>
              );
            })}
          </section>
        )}

        {/* Incoming Trade Offers from Other Players */}
        {incomingOffers.map((offer) => {
          const sender = game.players.find((p) => p.id === offer.fromPlayerId);
          const canAccept = hasResources(myRes, offer.requesting);
          return (
            <div
              key={offer.id}
              className="bg-[#182635] border border-[#d4aa54]/50 rounded-2xl p-4 space-y-2"
            >
              <div className="text-xs font-semibold text-[#f5d88c]">
                Trade Offer from {sender?.name}
              </div>
              <div className="text-xs text-[#e2e8f0]">
                Gives:{' '}
                {RES_KEYS.filter((r) => offer.offering[r] > 0)
                  .map((r) => `${offer.offering[r]} ${RESOURCE_META[r].label}`)
                  .join(', ')}{' '}
                · Wants:{' '}
                {RES_KEYS.filter((r) => offer.requesting[r] > 0)
                  .map((r) => `${offer.requesting[r]} ${RESOURCE_META[r].label}`)
                  .join(', ')}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={!canAccept}
                  onClick={() =>
                    dispatchGameAction({
                      type: 'RESPOND_TRADE_OFFER',
                      playerId,
                      offerId: offer.id,
                      accept: true,
                    })
                  }
                  className="flex-1 min-h-[44px] rounded-xl bg-[#24663c] disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <Check className="w-4 h-4" /> Accept
                </button>
                <button
                  type="button"
                  onClick={() =>
                    dispatchGameAction({
                      type: 'RESPOND_TRADE_OFFER',
                      playerId,
                      offerId: offer.id,
                      accept: false,
                    })
                  }
                  className="flex-1 min-h-[44px] rounded-xl bg-[#2a1d22] text-red-200 text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <X className="w-4 h-4" /> Decline
                </button>
              </div>
            </div>
          );
        })}

        {/* Synchronized Interactive Placement Picker */}
        {activePlacementMode && (
          <PhonePlacementMap
            game={game}
            playerId={playerId}
            mode={activePlacementMode}
            onPickVertex={(vertexId) => {
              if (
                game.phase === 'setup_forward_settlement' ||
                game.phase === 'setup_reverse_settlement'
              ) {
                dispatchGameAction({
                  type: 'PLACE_SETUP_SETTLEMENT',
                  playerId,
                  vertexId,
                });
              } else if (activePlacementMode === 'city') {
                dispatchGameAction({ type: 'UPGRADE_CITY', playerId, vertexId });
                setPlacementIntent(null);
              } else {
                dispatchGameAction({ type: 'BUILD_SETTLEMENT', playerId, vertexId });
                setPlacementIntent(null);
              }
            }}
            onPickEdge={(edgeId) => {
              if (
                game.phase === 'setup_forward_road' ||
                game.phase === 'setup_reverse_road'
              ) {
                dispatchGameAction({ type: 'PLACE_SETUP_ROAD', playerId, edgeId });
              } else {
                dispatchGameAction({ type: 'BUILD_ROAD', playerId, edgeId });
                setPlacementIntent(null);
              }
            }}
            onPickHex={(hexId) => {
              dispatchGameAction({ type: 'MOVE_ROBBER', playerId, hexId });
            }}
          />
        )}

        {/* Tab Views */}
        {tab === 'play' && (
          <div className="space-y-3">
            {isMyTurn && game.phase === 'roll' && (
              <button
                type="button"
                onClick={() => dispatchGameAction({ type: 'ROLL_DICE', playerId })}
                className="w-full min-h-[56px] rounded-2xl bg-[#b88635] active:scale-[0.99] text-[#14100a] font-bold text-base flex items-center justify-center gap-2.5 shadow-lg"
              >
                <Dices className="w-5 h-5" />
                Roll 3D Dice on TV
              </button>
            )}

            {isMyTurn && game.phase === 'main' && (
              <button
                type="button"
                onClick={() => dispatchGameAction({ type: 'END_TURN', playerId })}
                className="w-full min-h-[52px] rounded-2xl bg-[#24663c] text-white font-semibold text-sm flex items-center justify-center gap-2"
              >
                End Turn
              </button>
            )}

            <div className="bg-[#14202c] border border-white/10 rounded-2xl p-4 space-y-2 text-xs">
              <div className="font-semibold text-[#cbb894]">Table Status</div>
              <div className="flex justify-between text-[#cbd5e1]">
                <span>Roads Remaining</span>
                <span className="font-mono-num">
                  {myPublic?.roadsRemaining ?? PIECE_LIMITS.roads}
                </span>
              </div>
              <div className="flex justify-between text-[#cbd5e1]">
                <span>Settlements Remaining</span>
                <span className="font-mono-num">
                  {myPublic?.settlementsRemaining ?? PIECE_LIMITS.settlements}
                </span>
              </div>
              <div className="flex justify-between text-[#cbd5e1]">
                <span>Cities Remaining</span>
                <span className="font-mono-num">
                  {myPublic?.citiesRemaining ?? PIECE_LIMITS.cities}
                </span>
              </div>
              <div className="flex justify-between text-[#cbd5e1]">
                <span>Longest Road</span>
                <span className="font-mono-num">
                  {myPublic?.longestRoadLength ?? 0}
                  {myPublic?.hasLongestRoad ? ' (+2 VP)' : ''}
                </span>
              </div>
              <div className="flex justify-between text-[#cbd5e1]">
                <span>Knights Played</span>
                <span className="font-mono-num">
                  {myPublic?.knightsPlayed ?? 0}
                  {myPublic?.hasLargestArmy ? ' (+2 VP)' : ''}
                </span>
              </div>
            </div>
          </div>
        )}

        {tab === 'build' && (
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={
                !isMyTurn ||
                game.phase !== 'main' ||
                !hasResources(myRes, BUILD_COSTS.road) ||
                (myPublic?.roadsRemaining ?? 0) <= 0
              }
              onClick={() =>
                setPlacementIntent(placementIntent === 'road' ? null : 'road')
              }
              className="w-full min-h-[56px] px-4 py-3 rounded-2xl bg-[#14202c] border border-white/15 disabled:opacity-40 flex items-center justify-between text-left"
            >
              <div>
                <div className="text-sm font-semibold text-[#f7eed7]">Build Road</div>
                <div className="text-xs text-[#9fb0c2]">1 Timber · 1 Brick</div>
              </div>
              <span className="text-xs font-semibold text-[#f5d88c]">
                {placementIntent === 'road' ? 'Cancel' : 'Place'}
              </span>
            </button>

            <button
              type="button"
              disabled={
                !isMyTurn ||
                game.phase !== 'main' ||
                !hasResources(myRes, BUILD_COSTS.settlement) ||
                (myPublic?.settlementsRemaining ?? 0) <= 0
              }
              onClick={() =>
                setPlacementIntent(
                  placementIntent === 'settlement' ? null : 'settlement',
                )
              }
              className="w-full min-h-[56px] px-4 py-3 rounded-2xl bg-[#14202c] border border-white/15 disabled:opacity-40 flex items-center justify-between text-left"
            >
              <div>
                <div className="text-sm font-semibold text-[#f7eed7]">
                  Build Settlement (+1 VP)
                </div>
                <div className="text-xs text-[#9fb0c2]">
                  1 Timber · 1 Brick · 1 Wool · 1 Grain
                </div>
              </div>
              <span className="text-xs font-semibold text-[#f5d88c]">
                {placementIntent === 'settlement' ? 'Cancel' : 'Place'}
              </span>
            </button>

            <button
              type="button"
              disabled={
                !isMyTurn ||
                game.phase !== 'main' ||
                !hasResources(myRes, BUILD_COSTS.city) ||
                (myPublic?.citiesRemaining ?? 0) <= 0
              }
              onClick={() =>
                setPlacementIntent(placementIntent === 'city' ? null : 'city')
              }
              className="w-full min-h-[56px] px-4 py-3 rounded-2xl bg-[#14202c] border border-white/15 disabled:opacity-40 flex items-center justify-between text-left"
            >
              <div>
                <div className="text-sm font-semibold text-[#f7eed7]">
                  Upgrade to City (+2 VP)
                </div>
                <div className="text-xs text-[#9fb0c2]">2 Grain · 3 Ore</div>
              </div>
              <span className="text-xs font-semibold text-[#f5d88c]">
                {placementIntent === 'city' ? 'Cancel' : 'Upgrade'}
              </span>
            </button>

            <button
              type="button"
              disabled={
                !isMyTurn ||
                game.phase !== 'main' ||
                game.devDeckRemaining === 0 ||
                !hasResources(myRes, BUILD_COSTS.dev_card)
              }
              onClick={() => dispatchGameAction({ type: 'BUY_DEV_CARD', playerId })}
              className="w-full min-h-[56px] px-4 py-3 rounded-2xl bg-[#14202c] border border-white/15 disabled:opacity-40 flex items-center justify-between text-left"
            >
              <div>
                <div className="text-sm font-semibold text-[#f7eed7]">
                  Buy Development Card ({game.devDeckRemaining} left)
                </div>
                <div className="text-xs text-[#9fb0c2]">1 Wool · 1 Grain · 1 Ore</div>
              </div>
              <span className="text-xs font-semibold text-[#f5d88c]">Draw</span>
            </button>
          </div>
        )}

        {tab === 'trade' && (
          <div className="space-y-4">
            {/* Maritime / Harbor Trade */}
            <div className="bg-[#14202c] border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-semibold text-[#cbb894]">
                Maritime & Harbor Trade
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  aria-label="Give resource"
                  value={tradeGive}
                  onChange={(e) => setTradeGive(e.target.value as ResourceType)}
                  className="h-11 rounded-xl bg-[#101821] border border-white/15 px-3 text-xs"
                >
                  {RES_KEYS.map((r) => (
                    <option key={r} value={r}>
                      Give {ratios[r]} {RESOURCE_META[r].label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Receive resource"
                  value={tradeGet}
                  onChange={(e) => setTradeGet(e.target.value as ResourceType)}
                  className="h-11 rounded-xl bg-[#101821] border border-white/15 px-3 text-xs"
                >
                  {RES_KEYS.map((r) => (
                    <option key={r} value={r}>
                      Get 1 {RESOURCE_META[r].label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={
                  !isMyTurn ||
                  game.phase !== 'main' ||
                  tradeGive === tradeGet ||
                  myRes[tradeGive] < ratios[tradeGive]
                }
                onClick={() =>
                  dispatchGameAction({
                    type: 'BANK_TRADE',
                    playerId,
                    give: tradeGive,
                    receive: tradeGet,
                  })
                }
                className="w-full min-h-[46px] rounded-xl bg-[#b88635] disabled:opacity-40 text-[#14100a] font-semibold text-xs"
              >
                Trade {ratios[tradeGive]}:1 with Harbor/Bank
              </button>
            </div>

            {/* Player-to-Player Offer */}
            <div className="bg-[#14202c] border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="text-xs font-semibold text-[#cbb894]">
                Propose Player Trade
              </div>
              <div className="space-y-1.5">
                {RES_KEYS.map((r) => (
                  <div key={r} className="flex items-center justify-between text-xs">
                    <span className="w-16 text-[#cbd5e1]">{RESOURCE_META[r].label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[#94a3b8]">Give</span>
                      <button
                        type="button"
                        onClick={() =>
                          setOfferGive((o) => ({ ...o, [r]: Math.max(0, o[r] - 1) }))
                        }
                        className="w-8 h-8 rounded bg-[#1d2b3a]"
                      >
                        -
                      </button>
                      <span className="font-mono-num w-4 text-center">{offerGive[r]}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setOfferGive((o) => ({
                            ...o,
                            [r]: Math.min(myRes[r], o[r] + 1),
                          }))
                        }
                        className="w-8 h-8 rounded bg-[#1d2b3a]"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[#94a3b8]">Want</span>
                      <button
                        type="button"
                        onClick={() =>
                          setOfferWant((o) => ({ ...o, [r]: Math.max(0, o[r] - 1) }))
                        }
                        className="w-8 h-8 rounded bg-[#1d2b3a]"
                      >
                        -
                      </button>
                      <span className="font-mono-num w-4 text-center">{offerWant[r]}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setOfferWant((o) => ({ ...o, [r]: o[r] + 1 }))
                        }
                        className="w-8 h-8 rounded bg-[#1d2b3a]"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={
                  !isMyTurn ||
                  game.phase !== 'main' ||
                  totalResourceCount(offerGive) === 0 ||
                  totalResourceCount(offerWant) === 0
                }
                onClick={() => {
                  dispatchGameAction({
                    type: 'CREATE_TRADE_OFFER',
                    playerId,
                    toPlayerId: null,
                    offering: offerGive,
                    requesting: offerWant,
                  });
                  setOfferGive(emptyResources());
                  setOfferWant(emptyResources());
                }}
                className="w-full min-h-[46px] rounded-xl bg-[#1f3447] border border-[#d4aa54]/40 disabled:opacity-40 text-xs font-semibold text-[#f7eed7] flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Broadcast Trade Offer
              </button>
            </div>
          </div>
        )}

        {tab === 'cards' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs bg-[#14202c] border border-white/10 rounded-xl p-3">
              <div>
                <label htmlFor="phone-res1" className="block text-[11px] text-[#9fb0c2] mb-1">
                  Target Resource 1
                </label>
                <select
                  id="phone-res1"
                  value={cardRes1}
                  onChange={(e) => setCardRes1(e.target.value as ResourceType)}
                  className="w-full h-10 rounded-lg bg-[#101821] border border-white/15 px-2"
                >
                  {RES_KEYS.map((r) => (
                    <option key={r} value={r}>
                      {RESOURCE_META[r].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="phone-res2" className="block text-[11px] text-[#9fb0c2] mb-1">
                  Target Resource 2
                </label>
                <select
                  id="phone-res2"
                  value={cardRes2}
                  onChange={(e) => setCardRes2(e.target.value as ResourceType)}
                  className="w-full h-10 rounded-lg bg-[#101821] border border-white/15 px-2"
                >
                  {RES_KEYS.map((r) => (
                    <option key={r} value={r}>
                      {RESOURCE_META[r].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(privateState?.devCards ?? []).filter((c) => !c.played).length === 0 ? (
              <div className="text-center text-xs text-[#94a3b8] py-8">
                No development cards in your hand.
              </div>
            ) : (
              (privateState?.devCards ?? [])
                .filter((c) => !c.played)
                .map((card) => {
                  const meta = DEV_CARD_META[card.type];
                  const playable = canPlayDevCardNow(game, card, isMyTurn);
                  return (
                    <div
                      key={card.id}
                      className="bg-[#14202c] border border-[#d4aa54]/30 rounded-2xl p-4 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <DevCardIllustration type={card.type} className="w-10 h-10 shrink-0" />
                        <div>
                          <div className="text-sm font-bold text-[#f7eed7]">{meta.title}</div>
                          <div className="text-xs text-[#9fb0c2]">{meta.summary}</div>
                        </div>
                      </div>
                      {card.type !== 'victory_point' && (
                        <button
                          type="button"
                          disabled={!playable}
                          onClick={() =>
                            dispatchGameAction({
                              type: 'PLAY_DEV_CARD',
                              playerId,
                              cardId: card.id,
                              resource1: cardRes1,
                              resource2: cardRes2,
                            })
                          }
                          className="min-h-[44px] px-4 rounded-xl bg-[#b88635] disabled:opacity-35 text-[#14100a] font-semibold text-xs shrink-0"
                        >
                          Play
                        </button>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        )}
      </main>

      {/* Fixed Bottom Thumb-Zone Tab Bar (64px) */}
      <nav
        aria-label="Controller Navigation"
        className="shrink-0 bg-[#121c27] border-t border-[#d4aa54]/30 grid grid-cols-4 h-16"
      >
        <button
          type="button"
          onClick={() => setTab('play')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            tab === 'play' ? 'text-[#f5d88c]' : 'text-[#94a3b8]'
          }`}
        >
          <Shield className="w-5 h-5" />
          <span>Turn</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('build')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            tab === 'build' ? 'text-[#f5d88c]' : 'text-[#94a3b8]'
          }`}
        >
          <Hammer className="w-5 h-5" />
          <span>Build</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('trade')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            tab === 'trade' ? 'text-[#f5d88c]' : 'text-[#94a3b8]'
          }`}
        >
          <Repeat className="w-5 h-5" />
          <span>Trade</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('cards')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            tab === 'cards' ? 'text-[#f5d88c]' : 'text-[#94a3b8]'
          }`}
        >
          <Layers className="w-5 h-5" />
          <span>Cards</span>
        </button>
      </nav>

      <VictoryModal />
    </div>
  );
}
