import { Award, RotateCcw, Trophy } from 'lucide-react';
import { FACTION_META, PIECE_LIMITS } from '../game/types';
import { useGameStore } from '../store/useGameStore';

export function VictoryModal() {
  const room = useGameStore((s) => s.room);
  const sendMessage = useGameStore((s) => s.sendMessage);
  const leaveToTitle = useGameStore((s) => s.leaveToTitle);

  const game = room?.game;
  if (!room || !game || game.phase !== 'finished' || !game.winnerId) return null;

  const winner = game.players.find((p) => p.id === game.winnerId);
  if (!winner) return null;

  const meta = FACTION_META[winner.color];

  return (
    <div className="fixed inset-0 z-40 pointer-events-auto bg-black/75 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl bg-[#101821] border border-[#d4aa54]/50 rounded-2xl p-6 md:p-8 text-center shadow-2xl"
      >
        <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-[#292114] border border-[#d4aa54]/50 flex items-center justify-center text-[#f5d88c]">
          <Trophy className="w-7 h-7" />
        </div>

        <div className="text-xs uppercase tracking-widest text-[#cbb894] mb-1">
          Sovereign of the Island · Turn {game.turnNumber}
        </div>
        <h2 className="font-display text-3xl font-bold text-[#f7eed7] mb-1">
          {winner.name} Wins
        </h2>
        <div className="text-xs font-medium mb-6" style={{ color: meta.accent }}>
          {meta.label} · {winner.totalVP ?? winner.publicVP} Victory Points
        </div>

        <div className="space-y-2.5 text-left mb-6">
          {[...game.players]
            .sort((a, b) => (b.totalVP ?? b.publicVP) - (a.totalVP ?? a.publicVP))
            .map((p) => {
              const pm = FACTION_META[p.color];
              const vp = p.totalVP ?? p.publicVP;
              const settlements = PIECE_LIMITS.settlements - p.settlementsRemaining;
              const cities = PIECE_LIMITS.cities - p.citiesRemaining;
              const roads = PIECE_LIMITS.roads - p.roadsRemaining;
              return (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#16212d] border border-white/10 px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-sm shrink-0"
                        style={{ backgroundColor: pm.hex }}
                      />
                      <span className="text-sm font-semibold text-[#f5efe2]">{p.name}</span>
                      {p.hasLongestRoad && (
                        <span className="text-[11px] text-[#f5d88c] flex items-center gap-0.5">
                          <Award className="w-3 h-3" /> Road
                        </span>
                      )}
                      {p.hasLargestArmy && (
                        <span className="text-[11px] text-[#f5d88c] flex items-center gap-0.5">
                          <Award className="w-3 h-3" /> Army
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#94a3b8] mt-0.5 font-mono-num">
                      {cities} Cities · {settlements} Settlements · {roads} Roads
                    </div>
                  </div>
                  <span className="font-mono-num text-base font-bold text-[#f5d88c]">
                    {vp} VP
                  </span>
                </div>
              );
            })}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={leaveToTitle}
            className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-[#16212d] hover:bg-[#1f2d3d] border border-white/15 text-sm font-medium text-[#cbd5e1] cursor-pointer"
          >
            Main Menu
          </button>
          <button
            type="button"
            data-start="true"
            onClick={() => sendMessage({ type: 'REMATCH', roomId: room.roomId })}
            className="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-[#b88635] hover:bg-[#cc9842] text-[#14100a] font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Play Again
          </button>
        </div>
      </div>
    </div>
  );
}
