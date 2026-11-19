import { Volume2, VolumeX, X } from 'lucide-react';
import { useGameStore, type QualityPreset } from '../store/useGameStore';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const quality = useGameStore((s) => s.quality);
  const setQuality = useGameStore((s) => s.setQuality);
  const reducedMotion = useGameStore((s) => s.reducedMotion);
  const setReducedMotion = useGameStore((s) => s.setReducedMotion);
  const autoCameraFocus = useGameStore((s) => s.autoCameraFocus);
  const setAutoCameraFocus = useGameStore((s) => s.setAutoCameraFocus);

  const muted = useGameStore((s) => s.muted);
  const toggleMuted = useGameStore((s) => s.toggleMuted);
  const masterVolume = useGameStore((s) => s.masterVolume);
  const setMasterVolume = useGameStore((s) => s.setMasterVolume);
  const sfxVolume = useGameStore((s) => s.sfxVolume);
  const setSfxVolume = useGameStore((s) => s.setSfxVolume);
  const ambienceVolume = useGameStore((s) => s.ambienceVolume);
  const setAmbienceVolume = useGameStore((s) => s.setAmbienceVolume);

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto bg-black/75 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="w-full max-w-md bg-[#101821] border border-[#d4aa54]/45 rounded-2xl p-6 text-[#f5efe2] shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h2 id="settings-title" className="font-display text-xl font-bold text-[#f7eed7]">
            Tabletop Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="min-h-[40px] min-w-[40px] rounded-lg bg-[#1b2735] hover:bg-[#263649] flex items-center justify-center text-[#cbd5e1] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Audio Section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#cbb894]">
              Audio Mixer
            </span>
            <button
              type="button"
              onClick={toggleMuted}
              className="h-8 px-3 rounded-lg bg-[#182431] border border-white/15 text-xs flex items-center gap-1.5 text-[#f5efe2] cursor-pointer"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-red-300" /> : <Volume2 className="w-3.5 h-3.5 text-[#f5d88c]" />}
              {muted ? 'Muted' : 'Sound Active'}
            </button>
          </div>

          <div className="space-y-2.5 text-xs">
            <label className="block">
              <div className="flex justify-between mb-1 text-[#cbd5e1]">
                <span>Master Volume</span>
                <span className="font-mono-num text-[#f5d88c]">
                  {Math.round(masterVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(masterVolume * 100)}
                onChange={(e) => setMasterVolume(Number(e.target.value) / 100)}
                className="w-full accent-[#d4aa54]"
              />
            </label>

            <label className="block">
              <div className="flex justify-between mb-1 text-[#cbd5e1]">
                <span>Tabletop SFX</span>
                <span className="font-mono-num text-[#f5d88c]">
                  {Math.round(sfxVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(sfxVolume * 100)}
                onChange={(e) => setSfxVolume(Number(e.target.value) / 100)}
                className="w-full accent-[#d4aa54]"
              />
            </label>

            <label className="block">
              <div className="flex justify-between mb-1 text-[#cbd5e1]">
                <span>Ocean Surf Ambience</span>
                <span className="font-mono-num text-[#f5d88c]">
                  {Math.round(ambienceVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(ambienceVolume * 100)}
                onChange={(e) => setAmbienceVolume(Number(e.target.value) / 100)}
                className="w-full accent-[#d4aa54]"
              />
            </label>
          </div>
        </section>

        {/* Visual & Camera Section */}
        <section className="space-y-3 pt-3 border-t border-white/10">
          <div className="text-xs uppercase tracking-wider font-semibold text-[#cbb894]">
            Display & Camera
          </div>

          <label className="block text-xs">
            <span className="block text-[#cbd5e1] mb-1.5">3D Rendering Detail</span>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as QualityPreset)}
              className="w-full h-10 rounded-xl bg-[#182431] border border-white/15 px-3 text-xs text-[#f5efe2]"
            >
              <option value="high">High Detail (Bloom, DOF & Shadows)</option>
              <option value="balanced">Balanced (Bloom, Shadows, Moderate DPR)</option>
              <option value="reduced">Reduced Effects (Best Battery & Speed)</option>
            </select>
          </label>

          <label className="flex items-center justify-between gap-3 py-1.5 text-xs text-[#e2e8f0] cursor-pointer">
            <span>Auto-Focus Camera on Dice Rolls</span>
            <input
              type="checkbox"
              checked={autoCameraFocus}
              onChange={(e) => setAutoCameraFocus(e.target.checked)}
              className="w-4 h-4 accent-[#d4aa54]"
            />
          </label>

          <label className="flex items-center justify-between gap-3 py-1.5 text-xs text-[#e2e8f0] cursor-pointer">
            <span>Reduced Motion (Static Waves & Camera)</span>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
              className="w-4 h-4 accent-[#d4aa54]"
            />
          </label>
        </section>

        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[44px] rounded-xl bg-[#b88635] hover:bg-[#cc9842] text-[#14100a] font-semibold text-sm cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
}
