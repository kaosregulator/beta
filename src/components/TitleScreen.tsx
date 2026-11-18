import { useEffect, useState } from 'react';
import { BookOpen, Monitor, Play, Smartphone, Volume2, VolumeX } from 'lucide-react';
import { useGameStore, type QualityPreset } from '../store/useGameStore';
import { IsleholdCrest } from './ResourceArt';
import { TutorialModal } from './TutorialModal';

export function TitleScreen() {
  const createRoom = useGameStore((s) => s.createRoom);
  const setScreen = useGameStore((s) => s.setScreen);
  const quality = useGameStore((s) => s.quality);
  const setQuality = useGameStore((s) => s.setQuality);
  const muted = useGameStore((s) => s.muted);
  const toggleMuted = useGameStore((s) => s.toggleMuted);
  const errorMessage = useGameStore((s) => s.errorMessage);
  const clearError = useGameStore((s) => s.clearError);

  const [showTutorial, setShowTutorial] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleQuickPlay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await createRoom({
        mode: 'quick_play',
        hostName: 'Commander',
        hostColor: 'crimson',
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
      if (showTutorial) return;
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
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 md:p-10">
      {/* Top quiet bar: quality & audio controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="pointer-events-auto flex items-center gap-3 bg-[#101923]/90 border border-[#d4aa54]/30 rounded-lg px-3.5 py-2">
          <span className="text-xs font-medium tracking-wide text-[#d4aa54]">
            Boared Games Room
          </span>
          <span className="text-[#6c7a89]" aria-hidden="true">·</span>
          <span className="text-xs text-[#cbd5e1]">3D Tabletop Edition</span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <label htmlFor="quality-select" className="sr-only">
            Graphics Quality
          </label>
          <select
            id="quality-select"
            value={quality}
            onChange={(e) => setQuality(e.target.value as QualityPreset)}
            className="h-10 rounded-lg bg-[#101923]/92 border border-[#d4aa54]/30 px-3 text-xs font-medium text-[#f5efe2] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <option value="high">High Detail</option>
            <option value="balanced">Balanced</option>
            <option value="reduced">Reduced Effects</option>
          </select>

          <button
            type="button"
            onClick={toggleMuted}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="h-10 w-10 rounded-lg bg-[#101923]/92 border border-[#d4aa54]/30 flex items-center justify-center text-[#e8dcc0] hover:border-[#d4aa54] transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Title Card anchored cleanly on the left side leaving right/center 3D island open */}
      <div className="my-auto max-w-md pointer-events-auto bg-[#101821]/92 border border-[#d4aa54]/35 rounded-2xl p-6 md:p-8 shadow-2xl">
        <div className="flex items-center gap-4 mb-5">
          <IsleholdCrest className="w-14 h-14 shrink-0" />
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold tracking-wider text-[#f7eed7] text-balance">
              ISLEHOLD
            </h1>
            <p className="text-xs text-[#cbb894] mt-1">
              2–4 Players · Island Strategy · TV & Phone Sync
            </p>
          </div>
        </div>

        <p className="text-sm text-[#cbd5e1] leading-relaxed mb-6">
          Chart coastlines, raise timber settlements into stone citadels, and command
          maritime harbors on a handcrafted miniature island board.
        </p>

        {errorMessage && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-red-950/90 border border-red-500/40 px-3.5 py-2.5 text-xs text-red-100 flex items-center justify-between gap-2"
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
      <div className="flex items-center justify-between text-xs text-[#a3b1c2]">
        <span>Drag to Orbit · Scroll to Zoom · Click Highlighted Sites to Build</span>
        <span className="hidden sm:inline">Press Enter to Quick Start</span>
      </div>

      {showTutorial && <TutorialModal onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
