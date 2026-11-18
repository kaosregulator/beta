import { useState } from 'react';
import {
  Award,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Dices,
  History,
  Home,
  Layers,
  Repeat,
  Send,
  Settings,
  Shield,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { canPlayDevCardNow, getPhasePrompt } from '../utils/hudHelpers';
import {
  BUILD_COSTS,
  FACTION_META,
  RESOURCE_META,
  type ResourceBundle,
  type ResourceType,
} from '../game/types';
import { emptyResources, hasResources, totalResourceCount } from '../game/rules';
import { useGameStore } from '../store/useGameStore';
import { DEV_CARD_META, DevCardIllustration, ResourceIcon } from './ResourceArt';
import { SettingsModal } from './SettingsModal';
import { VictoryModal } from './VictoryModal';

const RES_KEYS: ResourceType[] = ['timber', 'wool', 'grain', 'brick', 'ore'];

export function TVHud() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const privateState = useGameStore((s) => s.privateState);
  const muted = useGameStore((s) => s.muted);
  const toggleMuted = useGameStore((s) => s.toggleMuted);
  const placementIntent = useGameStore((s) => s.placementIntent);
  const setPlacementIntent = useGameStore((s) => s.setPlacementIntent);
  const triggerCameraCommand = useGameStore((s) => s.triggerCameraCommand);
  const dispatchGameAction = useGameStore((s) => s.dispatchGameAction);
  const leaveToTitle = useGameStore((s) => s.leaveToTitle);
  const errorMessage = useGameStore((s) => s.errorMessage);
  const clearError = useGameStore((s) => s.clearError);

  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [subDrawer, setSubDrawer] = useState<'none' | 'trade' | 'cards'>('none');
  const [showChronicle, setShowChronicle] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [tradeGive, setTradeGive] = useState<ResourceType>('timber');
  const [tradeGet, setTradeGet] = useState<ResourceType>('ore');
  const [offerGive, setOfferGive] = useState<ResourceBundle>(emptyResources());
  const [offerWant, setOfferWant] = useState<ResourceBundle>(emptyResources());
  const [discardDraft, setDiscardDraft] = useState<ResourceBundle>(emptyResources());
  const [cardTargetRes1, setCardTargetRes1] = useState<ResourceType>('ore');
  const [cardTargetRes2, setCardTargetRes2] = useState<ResourceType>('grain');

  const game = room?.game;
  if (!room || !game) return null;

  const activePlayer = game.players[game.activePlayerIndex];
  const isMyTurn = Boolean(playerId && activePlayer?.id === playerId);
  const myPublic = game.players.find((p) => p.id === playerId);
  const mustDiscard = Boolean(
    playerId &&
      game.phase === 'discard' &&
      game.pendingDiscardPlayerIds.includes(playerId),
  );
  const latestEvent = game.events[game.events.length - 1];
  const activeMeta = activePlayer ? FACTION_META[activePlayer.color] : FACTION_META.crimson;

  const myRes = privateState?.resources ?? emptyResources();
  const ratios = privateState?.tradeRatios ?? {
    timber: 4,
    wool: 4,
    grain: 4,
    brick: 4,
    ore: 4,
  };

  const requiredDiscard = Math.floor(totalResourceCount(myRes) / 2);
  const draftedDiscardCount = totalResourceCount(discardDraft);

  const incomingOffers = playerId
    ? game.activeTradeOffers.filter(
        (o) =>
          o.fromPlayerId !== playerId &&
          (o.toPlayerId === null || o.toPlayerId === playerId) &&
          !o.rejectedBy.includes(playerId),
      )
    : [];

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-5">
      {/* Top Perimeter Strip: Faction Standings (Left) + Turn/Utilities (Right) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Left: Compact Faction Standings & Active Turn Banner */}
        <div className="pointer-events-auto flex flex-col gap-2 max-w-full">
          <div className="bg-[#101821]/92 border border-[#d4aa54]/35 rounded-xl px-3.5 py-2.5 flex items-center gap-3 shadow-lg">
            <span
              className="w-3.5 h-8 rounded-sm shrink-0"
              style={{ backgroundColor: activeMeta.hex }}
            />
            <div>
              <div className="flex items-center gap-2 text-xs text-[#cbb894]">
                <span>Turn {game.turnNumber}</span>
                <span aria-hidden="true">·</span>
                <span data-testid="active-player-name" className="font-semibold text-[#f7eed7]">
                  {activePlayer?.name}
                </span>
                {game.dice && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-num font-bold text-[#f5d88c]">
                      Rolled {game.dice[0]}+{game.dice[1]} = {game.dice[0] + game.dice[1]}
                    </span>
                  </>
                )}
              </div>
              <div className="text-xs text-[#e2e8f0] mt-0.5">
                {getPhasePrompt(game, playerId)}
              </div>
            </div>
          </div>

          {/* Compact Scoreboard Row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {game.players.map((p) => {
              const fm = FACTION_META[p.color];
              const isActive = p.id === activePlayer?.id;
              return (
                <div
                  key={p.id}
                  className={`rounded-lg px-2.5 py-1.5 text-xs flex items-center gap-2 border ${
                    isActive
                      ? 'bg-[#172330]/95 border-[#d4aa54]/70 text-[#f7eed7]'
                      : 'bg-[#101821]/88 border-white/10 text-[#cbd5e1]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: fm.hex }}
                  />
                  <span className="font-medium truncate max-w-[90px]">{p.name}</span>
                  <span className="font-mono-num font-bold text-[#f5d88c]">
                    {p.id === playerId && privateState
                      ? privateState.totalVP
                      : p.publicVP}
                    VP
                  </span>
                  <span className="text-[11px] text-[#94a3b8] font-mono-num">
                    {p.resourceCount}c
                  </span>
                  {p.hasLongestRoad && (
                    <Award className="w-3.5 h-3.5 text-[#f5d88c]" aria-label="Longest Road" />
                  )}
                  {p.hasLargestArmy && (
                    <Shield className="w-3.5 h-3.5 text-[#f5d88c]" aria-label="Largest Army" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Room PIN (TV Mode), Camera, Chronicle, Settings, Mute & Home */}
        <div className="pointer-events-auto relative flex items-center gap-2">
          {room.mode === 'tv_host' && (
            <div className="bg-[#101821]/92 border border-[#d4aa54]/35 rounded-xl px-3 py-2 text-xs">
              <span className="text-[#cbb894] mr-1.5">PIN</span>
              <span className="font-mono-num font-bold text-[#f5d88c] tracking-widest">
                {room.roomId}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => triggerCameraCommand('iso')}
            aria-label="Reset camera view"
            className="h-10 px-3 rounded-xl bg-[#101821]/92 border border-white/15 hover:border-[#d4aa54]/50 text-xs font-medium text-[#e2e8f0] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5 text-[#d4aa54]" />
            <span className="hidden sm:inline">Reset View</span>
          </button>

          <button
            type="button"
            onClick={() => setShowChronicle((v) => !v)}
            aria-label="Toggle turn chronicle"
            className={`h-10 px-3 rounded-xl border text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              showChronicle
                ? 'bg-[#1a2736] border-[#d4aa54]/60 text-[#f5d88c]'
                : 'bg-[#101821]/92 border-white/15 hover:border-[#d4aa54]/50 text-[#e2e8f0]'
            }`}
          >
            <History className="w-3.5 h-3.5 text-[#d4aa54]" />
            <span className="hidden sm:inline">Chronicle</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Open tabletop settings"
            className="h-10 w-10 rounded-xl bg-[#101821]/92 border border-white/15 hover:border-[#d4aa54]/50 flex items-center justify-center text-[#e2e8f0] cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="h-10 w-10 rounded-xl bg-[#101821]/92 border border-white/15 flex items-center justify-center text-[#e2e8f0] cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={leaveToTitle}
            aria-label="Return to title menu"
            className="h-10 w-10 rounded-xl bg-[#101821]/92 border border-white/15 hover:border-red-400/50 flex items-center justify-center text-[#e2e8f0] cursor-pointer"
          >
            <Home className="w-4 h-4" />
          </button>

          {showChronicle && (
            <div className="absolute right-0 top-12 w-80 max-h-80 overflow-y-auto scroll-thin bg-[#101821]/96 border border-[#d4aa54]/40 rounded-xl p-3.5 shadow-2xl space-y-2">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-display text-xs font-bold text-[#f5d88c] uppercase tracking-wider">
                  Island Chronicle
                </span>
                <button
                  type="button"
                  onClick={() => setShowChronicle(false)}
                  className="text-[#94a3b8] hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1.5 text-xs">
                {[...game.events]
                  .reverse()
                  .slice(0, 14)
                  .map((evt) => (
                    <div
                      key={evt.id}
                      className="rounded-lg bg-[#16212d] px-2.5 py-1.5 text-[#cbd5e1] flex items-start gap-2"
                    >
                      <span className="font-mono-num text-[10px] text-[#cbb894] shrink-0 mt-0.5">
                        T{evt.turn}
                      </span>
                      <span>{evt.message}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center-Safe Contextual Action Modals (Discard / Steal / Incoming Trade / Error Toast) */}
      <div className="my-auto flex flex-col items-center gap-3 pointer-events-none">
        {errorMessage && (
          <div
            role="alert"
            className="pointer-events-auto rounded-xl bg-red-950/95 border border-red-400/50 px-4 py-2.5 text-xs text-red-100 flex items-center gap-3 shadow-xl"
          >
            <span>{errorMessage}</span>
            <button type="button" onClick={clearError} className="underline font-semibold">
              Dismiss
            </button>
          </div>
        )}

        {incomingOffers.map((offer) => {
          const sender = game.players.find((p) => p.id === offer.fromPlayerId);
          const canAccept = playerId ? hasResources(myRes, offer.requesting) : false;
          return (
            <div
              key={offer.id}
              className="pointer-events-auto bg-[#101821]/96 border border-[#d4aa54]/50 rounded-2xl p-4 w-full max-w-sm shadow-2xl space-y-2.5"
            >
              <div className="text-xs font-semibold text-[#f5d88c]">
                Trade Offer from {sender?.name}
              </div>
              <div className="text-xs text-[#e2e8f0]">
                Offers:{' '}
                {RES_KEYS.filter((r) => offer.offering[r] > 0)
                  .map((r) => `${offer.offering[r]} ${RESOURCE_META[r].label}`)
                  .join(', ')}{' '}
                · Requests:{' '}
                {RES_KEYS.filter((r) => offer.requesting[r] > 0)
                  .map((r) => `${offer.requesting[r]} ${RESOURCE_META[r].label}`)
                  .join(', ')}
              </div>
              {playerId && (
                <div className="flex gap-2">
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
                    className="flex-1 min-h-[40px] rounded-xl bg-[#24663c] disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> Accept
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
                    className="flex-1 min-h-[40px] rounded-xl bg-[#2a1d22] text-red-200 text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" /> Decline
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {mustDiscard && playerId && (
          <div className="pointer-events-auto bg-[#101821]/96 border border-[#d4aa54]/50 rounded-2xl p-5 w-full max-w-md shadow-2xl">
            <h3 className="font-display text-lg font-bold text-[#f7eed7] mb-1">
              Robber Alert: Discard {requiredDiscard} Cards
            </h3>
            <p className="text-xs text-[#cbd5e1] mb-4">
              Selected {draftedDiscardCount} / {requiredDiscard}
            </p>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {RES_KEYS.map((r) => (
                <div key={r} className="flex flex-col items-center gap-1 bg-[#16212d] rounded-lg p-2">
                  <ResourceIcon type={r} className="w-7 h-7" />
                  <span className="text-[11px] text-[#cbd5e1]">{RESOURCE_META[r].label}</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setDiscardDraft((d) => ({ ...d, [r]: Math.max(0, d[r] - 1) }))
                      }
                      className="w-6 h-6 rounded bg-[#233242] text-xs font-bold cursor-pointer"
                    >
                      -
                    </button>
                    <span className="font-mono-num text-xs font-bold">{discardDraft[r]}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setDiscardDraft((d) => ({
                          ...d,
                          [r]: Math.min(myRes[r], d[r] + 1),
                        }))
                      }
                      className="w-6 h-6 rounded bg-[#233242] text-xs font-bold cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={draftedDiscardCount !== requiredDiscard}
              onClick={() => {
                dispatchGameAction({
                  type: 'DISCARD_RESOURCES',
                  playerId,
                  bundle: discardDraft,
                });
                setDiscardDraft(emptyResources());
              }}
              className="w-full min-h-[42px] rounded-xl bg-[#b88635] disabled:opacity-40 text-[#14100a] font-semibold text-sm cursor-pointer"
            >
              Confirm Discard
            </button>
          </div>
        )}

        {isMyTurn && game.phase === 'steal' && playerId && (
          <div className="pointer-events-auto bg-[#101821]/96 border border-[#d4aa54]/50 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="font-display text-lg font-bold text-[#f7eed7] mb-3">
              Choose Rival to Raid
            </h3>
            <div className="flex flex-col gap-2">
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
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[#1a2634] hover:bg-[#243548] border border-white/15 flex items-center justify-between text-sm text-[#f5efe2] cursor-pointer"
                  >
                    <span>{target.name}</span>
                    <span className="font-mono-num text-xs text-[#f5d88c]">
                      {target.resourceCount} cards
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Unified Collapsible Bottom Dock */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto mb-1.5 px-3 py-1 rounded-t-lg bg-[#101821]/92 border border-b-0 border-[#d4aa54]/30 text-[11px] font-medium text-[#cbb894] flex items-center gap-1 cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" /> Show Controls
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" /> Hide Controls
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full max-w-[1000px] bg-[#101821]/94 border border-[#d4aa54]/35 rounded-2xl p-3.5 shadow-2xl">
            {/* Sub-drawers for Trade or Dev Cards in Quick Play */}
            {subDrawer === 'trade' && playerId && (
              <div className="mb-3 pb-3 border-b border-white/10 space-y-3 text-xs">
                {/* Maritime / Harbor Trade */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[#cbb894] font-medium">Maritime / Harbor:</span>
                    <select
                      aria-label="Resource to give"
                      value={tradeGive}
                      onChange={(e) => setTradeGive(e.target.value as ResourceType)}
                      className="h-9 rounded-lg bg-[#172330] border border-white/15 px-2 text-[#f5efe2]"
                    >
                      {RES_KEYS.map((r) => (
                        <option key={r} value={r}>
                          {ratios[r]} {RESOURCE_META[r].label} (Have {myRes[r]})
                        </option>
                      ))}
                    </select>
                    <span className="text-[#94a3b8]">for 1</span>
                    <select
                      aria-label="Resource to receive"
                      value={tradeGet}
                      onChange={(e) => setTradeGet(e.target.value as ResourceType)}
                      className="h-9 rounded-lg bg-[#172330] border border-white/15 px-2 text-[#f5efe2]"
                    >
                      {RES_KEYS.map((r) => (
                        <option key={r} value={r}>
                          {RESOURCE_META[r].label}
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
                    className="h-9 px-4 rounded-lg bg-[#b88635] disabled:opacity-40 text-[#14100a] font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Confirm {ratios[tradeGive]}:1 Trade
                  </button>
                </div>

                {/* Propose Player / Bot Trade Offer */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                  <span className="text-[#cbb894] font-medium">Propose Rival Trade:</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {RES_KEYS.map((r) => (
                      <div
                        key={r}
                        className="flex items-center gap-1 bg-[#16212d] border border-white/10 rounded-lg px-2 py-1"
                      >
                        <ResourceIcon type={r} className="w-4 h-4" />
                        <button
                          type="button"
                          title={`Offer ${RESOURCE_META[r].label}`}
                          onClick={() =>
                            setOfferGive((o) => ({
                              ...o,
                              [r]: o[r] >= myRes[r] ? 0 : o[r] + 1,
                            }))
                          }
                          className="px-1 rounded bg-[#213244] text-[#86efac] font-mono-num cursor-pointer"
                        >
                          +{offerGive[r]}
                        </button>
                        <button
                          type="button"
                          title={`Request ${RESOURCE_META[r].label}`}
                          onClick={() =>
                            setOfferWant((o) => ({
                              ...o,
                              [r]: o[r] >= 3 ? 0 : o[r] + 1,
                            }))
                          }
                          className="px-1 rounded bg-[#213244] text-[#fcd34d] font-mono-num cursor-pointer"
                        >
                          -{offerWant[r]}
                        </button>
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
                    className="h-9 px-3.5 rounded-lg bg-[#1d3247] border border-[#d4aa54]/45 disabled:opacity-40 text-[#f5efe2] font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" /> Offer Trade
                  </button>
                </div>
              </div>
            )}

            {subDrawer === 'cards' && playerId && privateState && (
              <div className="mb-3 pb-3 border-b border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-[#cbb894]">
                    Development Cards ({privateState.devCards.filter((c) => !c.played).length})
                  </span>
                  <div className="flex items-center gap-2 text-xs">
                    <select
                      aria-label="Primary card resource"
                      value={cardTargetRes1}
                      onChange={(e) => setCardTargetRes1(e.target.value as ResourceType)}
                      className="h-8 rounded bg-[#172330] border border-white/15 px-2"
                    >
                      {RES_KEYS.map((r) => (
                        <option key={r} value={r}>
                          {RESOURCE_META[r].label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Secondary card resource"
                      value={cardTargetRes2}
                      onChange={(e) => setCardTargetRes2(e.target.value as ResourceType)}
                      className="h-8 rounded bg-[#172330] border border-white/15 px-2"
                    >
                      {RES_KEYS.map((r) => (
                        <option key={r} value={r}>
                          {RESOURCE_META[r].label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {privateState.devCards.filter((c) => !c.played).length === 0 ? (
                    <span className="text-xs text-[#94a3b8]">No unplayed cards yet.</span>
                  ) : (
                    privateState.devCards
                      .filter((c) => !c.played)
                      .map((card) => {
                        const meta = DEV_CARD_META[card.type];
                        const playable = canPlayDevCardNow(game, card, isMyTurn);
                        return (
                          <div
                            key={card.id}
                            className="flex items-center gap-2.5 bg-[#172330] border border-[#d4aa54]/30 rounded-xl px-3 py-2 text-xs"
                          >
                            <DevCardIllustration type={card.type} className="w-7 h-7 shrink-0" />
                            <div>
                              <div className="font-semibold text-[#f7eed7]">{meta.title}</div>
                              <div className="text-[11px] text-[#94a3b8] max-w-[180px] truncate">
                                {meta.summary}
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
                                    resource1: cardTargetRes1,
                                    resource2: cardTargetRes2,
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-[#b88635] disabled:opacity-35 text-[#14100a] font-semibold cursor-pointer"
                              >
                                Play
                              </button>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            )}

            {/* Main Dock Row */}
            {room.mode === 'tv_host' || !playerId ? (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-[#e2e8f0]">
                  <Sparkles className="w-4 h-4 text-[#d4aa54] shrink-0" />
                  <span>{latestEvent?.message ?? 'Ready on the tabletop.'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => triggerCameraCommand('iso')}
                    className="h-9 px-3 rounded-lg bg-[#172330] hover:bg-[#223244] border border-white/10 cursor-pointer"
                  >
                    Isometric
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCameraCommand('top')}
                    className="h-9 px-3 rounded-lg bg-[#172330] hover:bg-[#223244] border border-white/10 cursor-pointer"
                  >
                    Overhead
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerCameraCommand('dice')}
                    className="h-9 px-3 rounded-lg bg-[#172330] hover:bg-[#223244] border border-white/10 cursor-pointer"
                  >
                    Dice Tray
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Private Resource Strip */}
                <div className="flex items-center gap-2">
                  {RES_KEYS.map((r) => (
                    <div
                      key={r}
                      className="flex items-center gap-1.5 bg-[#16212d] border border-white/10 rounded-lg px-2.5 py-1.5"
                      title={`${RESOURCE_META[r].label} (Trade ${ratios[r]}:1)`}
                    >
                      <ResourceIcon type={r} className="w-6 h-6" />
                      <span className="font-mono-num text-sm font-bold text-[#f7eed7]">
                        {myRes[r]}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {isMyTurn && game.phase === 'roll' && (
                    <button
                      type="button"
                      onClick={() =>
                        dispatchGameAction({ type: 'ROLL_DICE', playerId })
                      }
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-[#b88635] hover:bg-[#cc9842] text-[#14100a] font-semibold text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Dices className="w-4 h-4" />
                      Roll Dice
                    </button>
                  )}

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
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer disabled:opacity-35 whitespace-nowrap ${
                      placementIntent === 'road'
                        ? 'bg-[#b88635] text-[#14100a] border-[#f5d88c]'
                        : 'bg-[#16212d] text-[#f5efe2] border-white/15'
                    }`}
                  >
                    Road (T+B)
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
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer disabled:opacity-35 whitespace-nowrap ${
                      placementIntent === 'settlement'
                        ? 'bg-[#b88635] text-[#14100a] border-[#f5d88c]'
                        : 'bg-[#16212d] text-[#f5efe2] border-white/15'
                    }`}
                  >
                    Settlement
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
                    className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium border cursor-pointer disabled:opacity-35 whitespace-nowrap ${
                      placementIntent === 'city'
                        ? 'bg-[#b88635] text-[#14100a] border-[#f5d88c]'
                        : 'bg-[#16212d] text-[#f5efe2] border-white/15'
                    }`}
                  >
                    City (2G+3O)
                  </button>

                  <button
                    type="button"
                    disabled={
                      !isMyTurn ||
                      game.phase !== 'main' ||
                      game.devDeckRemaining === 0 ||
                      !hasResources(myRes, BUILD_COSTS.dev_card)
                    }
                    onClick={() =>
                      dispatchGameAction({ type: 'BUY_DEV_CARD', playerId })
                    }
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-[#16212d] border border-white/15 disabled:opacity-35 text-xs font-medium text-[#f5efe2] cursor-pointer whitespace-nowrap"
                  >
                    Buy Card
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setSubDrawer((d) => (d === 'trade' ? 'none' : 'trade'))
                    }
                    className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                      subDrawer === 'trade'
                        ? 'bg-[#1f3142] border-[#d4aa54] text-[#f5d88c]'
                        : 'bg-[#16212d] border-white/15 text-[#cbd5e1]'
                    }`}
                  >
                    <Repeat className="w-3.5 h-3.5" /> Trade
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setSubDrawer((d) => (d === 'cards' ? 'none' : 'cards'))
                    }
                    className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                      subDrawer === 'cards'
                        ? 'bg-[#1f3142] border-[#d4aa54] text-[#f5d88c]'
                        : 'bg-[#16212d] border-white/15 text-[#cbd5e1]'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" /> Cards
                  </button>

                  {isMyTurn && game.phase === 'main' && (
                    <button
                      type="button"
                      onClick={() =>
                        dispatchGameAction({ type: 'END_TURN', playerId })
                      }
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-[#24663c] hover:bg-[#2d7d4a] text-white font-semibold text-xs cursor-pointer whitespace-nowrap"
                    >
                      End Turn
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <VictoryModal />
    </div>
  );
}
