import { useEffect, useState } from 'react';
import {
  BookOpen,
  Monitor,
  Play,
  Settings,
  Smartphone,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { FACTION_META, type FactionColor } from '../game/types';
import { useGameStore } from '../store/useGameStore';
import { IsleholdCrest } from './ResourceArt';
import { SettingsModal } from './SettingsModal';
import { TutorialModal } from './TutorialModal';

const COLORS: FactionColor[] = ['crimson', 'navy', 'forest', 'ivory'];

export function TitleScreen() {
  const createRoom = useGameStore((s) => s.createRoom);
  const setScreen = useGameStore((s) => s.setScreen);
  const muted = useGameStore((s) => s.muted);
  const toggleMuted = useGameStore((s) => s.toggleMuted);
  const errorMessage = useGameStore((s) => s.errorMessage);
  const clearError = useGameStore((s) => s.clearError);

  const [hostColor, setHostColor] = useState<FactionColor>('crimson');
  const [showTutorial, setShowTutorial] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleQuickPlay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createRoom({
        mode: 'quick_play',
        hostName: 'Commander',
        hostColor,
        preset: 'random_balanced',
        victoryTarget: 10,
        botCount: 3,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleHostTV = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createRoom({
        mode: 'tv_host',
        preset: 'random_balanced',
        victoryTarget: 10,
      });
    } finally {
      setBusy(false);
    }
  };

  // Support Enter / Space start handshake on Title screen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showTutorial || showSettings) return;
      if (e.key === 'Enter' || e.key === ' ') {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'BUTTON' || tag === 'SELECT') return;
        e.preventDefault();
        handleQuickPlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-5 md:p-10">
      {/* Top quiet utility bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="pointer-events-auto flex items-center gap-3 bg-[#101821]/92 border border-[#d4aa54]/30 rounded-xl px-4 py-2 shadow-lg">
          <span className="text-xs font-semibold tracking-wider uppercase text-[#d4aa54]">
            Boared Games Room
          </span>
          <span className="text-[#6c7a89]" aria-hidden="true">·</span>
          <span className="text-xs text-[#cbd5e1]">Handcrafted 3D Tabletop</span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            aria-label="Open settings"
            className="h-10 px-3.5 rounded-xl bg-[#101821]/92 border border-[#d4aa54]/30 hover:border-[#d4aa54] flex items-center gap-2 text-xs font-medium text-[#e8dcc0] transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4 text-[#d4aa54]" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          <button
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="h-10 w-10 rounded-xl bg-[#101821]/92 border border-[#d4aa54]/30 hover:border-[#d4aa54] flex items-center justify-center text-[#e8dcc0] transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Title Card anchored cleanly on the left side leaving right/center 3D island showcase wide open */}
      <div className="my-auto max-w-md pointer-events-auto bg-[#101821]/94 border border-[#d4aa54]/40 rounded-2xl p-6 md:p-8 shadow-2xl">
        <div className="flex items-center gap-4 mb-4">
          <IsleholdCrest className="w-16 h-16 shrink-0" />
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-wider text-[#f7eed7] text-balance">
              ISLEHOLD
            </h1>
            <p className="text-xs text-[#cbb894] mt-1">
              2–4 Players · Island Strategy · TV & Phone Sync
            </p>
          </div>
        </div>

        <p className="text-sm text-[#cbd5e1] leading-relaxed mb-5">
          Chart harbors, raise timber settlements into fortified stone citadels, and command
          rival trade routes across a living miniature diorama.
        </p>

        {/* Quick Play Faction Banner Picker */}
        <div className="mb-5">
          <div className="text-[11px] uppercase tracking-wider text-[#cbb894] mb-2">
            Your Faction Banner
          </div>
          <div className="grid grid-cols-4 gap-2">
            {COLORS.map((c) => {
              const fm = FACTION_META[c];
              const active = hostColor === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setHostColor(c)}
                  aria-label={`Select ${fm.label}`}
                  className={`min-h-[38px] rounded-lg px-2 py-1.5 border flex items-center justify-center gap-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#1f2e3d] border-[#f5d88c] text-[#f7eed7]'
                      : 'bg-[#15202b] border-white/10 text-[#9fb0c2] hover:border-white/25'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-sm border border-white/30 shrink-0"
                    style={{ backgroundColor: fm.hex }}
                  />
                  <span className="truncate capitalize">{c}</span>
                </button>
              );
            })}
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-xl bg-red-950/90 border border-red-500/40 px-3.5 py-2.5 text-xs text-red-100 flex items-center justify-between gap-2"
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={clearError}
              className="text-red-300 hover:text-white font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            type="button"
            data-start="true"
            disabled={busy}
            onClick={handleQuickPlay}
            className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[#b88635] hover:bg-[#cc9842] text-[#14100a] font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
          >
            <Play className="w-4 h-4 fill-current" />
            Quick Play vs Bots
          </button>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={handleHostTV}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#1b2938] hover:bg-[#24364a] border border-[#d4aa54]/35 text-[#f5efe2] font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Monitor className="w-4 h-4 text-[#d4aa54]" />
              Host TV Table
            </button>

            <button
              type="button"
              onClick={() => setScreen('controller')}
              className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#1b2938] hover:bg-[#24364a] border border-white/15 text-[#f5efe2] font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Smartphone className="w-4 h-4 text-[#8ac4e8]" />
              Join on Phone
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-transparent hover:bg-white/5 text-[#d7c6a3] text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            Rules & Tabletop Guide
          </button>
        </div>
      </div>

      {/* Bottom control hint line */}
      <div className="flex items-center justify-between text-xs text-[#b5c2d1]">
        <span>Drag to Orbit · Scroll to Zoom · Click Highlighted Sites to Build</span>
        <span className="hidden sm:inline">Press Enter to Quick Start</span>
      </div>

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
