import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, Bot, Play, Trash2, Users } from 'lucide-react';
import { FACTION_META, type BoardPreset } from '../game/types';
import { useGameStore } from '../store/useGameStore';
import { IsleholdCrest } from './ResourceArt';

export function TVLobby() {
  const room = useGameStore((s) => s.room);
  const sendMessage = useGameStore((s) => s.sendMessage);
  const leaveToTitle = useGameStore((s) => s.leaveToTitle);
  const errorMessage = useGameStore((s) => s.errorMessage);
  const clearError = useGameStore((s) => s.clearError);

  const [qrSvg, setQrSvg] = useState<string>('');

  const joinUrl =
    typeof window !== 'undefined' && room
      ? `${window.location.origin}/?join=${room.roomId}`
      : '';

  useEffect(() => {
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, {
      width: 240,
      margin: 1,
      color: { dark: '#141a22', light: '#f5efe2' },
    })
      .then((url) => setQrSvg(url))
      .catch(() => {});
  }, [joinUrl]);

  if (!room) return null;

  const canStart = room.lobbyPlayers.length >= 2;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex items-center justify-center p-4 md:p-8">
      <div className="pointer-events-auto w-full max-w-4xl bg-[#101821]/95 border border-[#d4aa54]/45 rounded-2xl p-6 md:p-8 shadow-2xl grid grid-cols-1 md:grid-cols-12 gap-8">
        {/* Left: QR Code & PIN */}
        <div className="md:col-span-5 flex flex-col items-center justify-between bg-[#15202c] border border-[#d4aa54]/25 rounded-xl p-6 text-center">
          <div className="flex items-center gap-3">
            <IsleholdCrest className="w-10 h-10" />
            <div className="text-left">
              <div className="font-display text-lg font-bold tracking-wide text-[#f7eed7]">
                TV Table Lobby
              </div>
              <div className="text-xs text-[#b8c4d0]">Scan QR or enter PIN on phone</div>
            </div>
          </div>

          <div className="my-5 bg-[#f5efe2] p-3 rounded-xl shadow-inner border border-[#d4aa54]/40">
            {qrSvg ? (
              <img
                src={qrSvg}
                alt={`Join room ${room.roomId} QR code`}
                className="w-44 h-44 block"
              />
            ) : (
              <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-700">
                Generating QR...
              </div>
            )}
          </div>

          <div className="w-full">
            <div className="text-xs uppercase tracking-widest text-[#cbb894] mb-1">
              Room PIN
            </div>
            <div
              data-testid="room-pin"
              className="font-mono-num text-4xl font-bold tracking-[0.22em] text-[#f5d88c]"
            >
              {room.roomId}
            </div>
            <a
              href={`/?join=${room.roomId}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs text-[#8ac4e8] hover:underline break-all"
            >
              Open Controller Link ({`/?join=${room.roomId}`})
            </a>
          </div>
        </div>

        {/* Right: Players & Match Settings */}
        <div className="md:col-span-7 flex flex-col justify-between gap-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#d4aa54]" />
                <h2 className="font-display text-xl font-bold text-[#f7eed7]">
                  Seated Factions ({room.lobbyPlayers.length}/4)
                </h2>
              </div>
              {room.lobbyPlayers.length < 4 && (
                <button
                  type="button"
                  onClick={() => sendMessage({ type: 'ADD_BOT', roomId: room.roomId })}
                  className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#1d2b3a] hover:bg-[#27394d] border border-[#d4aa54]/30 text-xs font-medium text-[#f5efe2] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Bot className="w-3.5 h-3.5 text-[#d4aa54]" />
                  Add AI Rival
                </button>
              )}
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="mb-3 rounded-lg bg-red-950/90 border border-red-500/40 px-3 py-2 text-xs text-red-100 flex items-center justify-between"
              >
                <span>{errorMessage}</span>
                <button type="button" onClick={clearError} className="underline">
                  Close
                </button>
              </div>
            )}

            <div className="space-y-2.5 min-h-[210px]">
              {room.lobbyPlayers.length === 0 ? (
                <div className="h-[200px] rounded-xl border border-dashed border-[#d4aa54]/25 flex flex-col items-center justify-center text-center p-6 text-sm text-[#9fb0c2]">
                  Waiting for players to scan the QR code on their phones, or add an AI
                  rival to fill seats.
                </div>
              ) : (
                room.lobbyPlayers.map((p) => {
                  const meta = FACTION_META[p.color];
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl bg-[#16212d] border border-white/10 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="w-4 h-4 rounded-sm border border-white/30 shrink-0"
                          style={{ backgroundColor: meta.hex }}
                          aria-hidden="true"
                        />
                        <div>
                          <div className="text-sm font-semibold text-[#f7eed7]">
                            {p.name}
                          </div>
                          <div className="text-xs text-[#9fb0c2]">
                            {meta.label} · {p.isBot ? 'AI Bot' : p.connected ? 'Phone Connected' : 'Reconnecting'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        aria-label={`Remove ${p.name}`}
                        onClick={() =>
                          sendMessage({
                            type: 'REMOVE_PLAYER',
                            roomId: room.roomId,
                            playerId: p.id,
                          })
                        }
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#9fb0c2] hover:text-red-300 hover:bg-red-950/50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Settings */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/10">
              <div>
                <label
                  htmlFor="lobby-preset"
                  className="block text-xs text-[#cbb894] mb-1.5"
                >
                  Island Layout
                </label>
                <select
                  id="lobby-preset"
                  value={room.preset}
                  onChange={(e) =>
                    sendMessage({
                      type: 'UPDATE_ROOM_SETTINGS',
                      roomId: room.roomId,
                      preset: e.target.value as BoardPreset,
                    })
                  }
                  className="w-full h-10 rounded-lg bg-[#16212d] border border-white/15 px-3 text-xs text-[#f5efe2]"
                >
                  <option value="random_balanced">Balanced Random</option>
                  <option value="standard">Classic Standard</option>
                </select>
              </div>

              <div>
                <label htmlFor="lobby-vp" className="block text-xs text-[#cbb894] mb-1.5">
                  Victory Target
                </label>
                <select
                  id="lobby-vp"
                  value={room.victoryTarget}
                  onChange={(e) =>
                    sendMessage({
                      type: 'UPDATE_ROOM_SETTINGS',
                      roomId: room.roomId,
                      victoryTarget: Number(e.target.value),
                    })
                  }
                  className="w-full h-10 rounded-lg bg-[#16212d] border border-white/15 px-3 text-xs text-[#f5efe2]"
                >
                  <option value={8}>8 Victory Points (Brisk)</option>
                  <option value={10}>10 Victory Points (Standard)</option>
                  <option value={12}>12 Victory Points (Epic)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={leaveToTitle}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#16212d] hover:bg-[#1e2c3b] border border-white/15 text-xs font-medium text-[#cbd5e1] flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <button
              type="button"
              disabled={!canStart}
              onClick={() => sendMessage({ type: 'START_GAME', roomId: room.roomId })}
              className="flex-1 min-h-[48px] px-6 py-3 rounded-xl bg-[#b88635] hover:bg-[#cc9842] disabled:opacity-45 text-[#14100a] font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              {canStart ? 'Begin Island Match' : 'Need 2+ Players'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
