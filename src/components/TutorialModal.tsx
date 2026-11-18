import { X } from 'lucide-react';
import { ResourceIcon } from './ResourceArt';

export function TutorialModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 pointer-events-auto bg-black/75 flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-title"
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto scroll-thin bg-[#101821] border border-[#d4aa54]/45 rounded-2xl p-6 md:p-8 text-[#f5efe2] shadow-2xl"
      >
        <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/10">
          <h2 id="tutorial-title" className="font-display text-2xl font-bold text-[#f7eed7]">
            Islehold Rules & Tabletop Guide
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tutorial"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg bg-[#1b2735] hover:bg-[#263649] text-[#cbd5e1] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5 text-sm text-[#cbd5e1] leading-relaxed">
          <section>
            <h3 className="font-display text-base font-bold text-[#f5d88c] mb-1.5">
              1. TV Host + Phone Controllers
            </h3>
            <p>
              Launch <strong>Host TV Table</strong> on your television or big screen to
              display a Room PIN and QR code. Players scan the QR code on their phones to
              claim a faction and hold private resources, build menus, and trade offers in
              their hands. For solo or desktop play, choose <strong>Quick Play vs Bots</strong>.
            </p>
          </section>

          <section>
            <h3 className="font-display text-base font-bold text-[#f5d88c] mb-1.5">
              2. Founding & Harvest
            </h3>
            <p>
              Each player places two starting settlements and roads in snake-draft order
              (first forward, then reverse). Your second settlement immediately harvests 1
              resource from each adjacent land tile. On your turn, roll the 3D dice—every
              settlement touching a matching number collects 1 resource, and fortified cities
              collect 2.
            </p>
          </section>

          <section>
            <h3 className="font-display text-base font-bold text-[#f5d88c] mb-2">
              3. Building Costs & Harbors
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-[#16212d] border border-white/10 rounded-xl p-3 flex items-center justify-between">
                <span className="font-semibold text-[#f5efe2]">Wooden Road (0 VP)</span>
                <div className="flex items-center gap-1">
                  <ResourceIcon type="timber" className="w-6 h-6" />
                  <ResourceIcon type="brick" className="w-6 h-6" />
                </div>
              </div>
              <div className="bg-[#16212d] border border-white/10 rounded-xl p-3 flex items-center justify-between">
                <span className="font-semibold text-[#f5efe2]">Settlement (1 VP)</span>
                <div className="flex items-center gap-1">
                  <ResourceIcon type="timber" className="w-6 h-6" />
                  <ResourceIcon type="brick" className="w-6 h-6" />
                  <ResourceIcon type="wool" className="w-6 h-6" />
                  <ResourceIcon type="grain" className="w-6 h-6" />
                </div>
              </div>
              <div className="bg-[#16212d] border border-white/10 rounded-xl p-3 flex items-center justify-between">
                <span className="font-semibold text-[#f5efe2]">City Citadel (2 VP)</span>
                <div className="flex items-center gap-1">
                  <ResourceIcon type="grain" className="w-6 h-6" />
                  <ResourceIcon type="grain" className="w-6 h-6" />
                  <ResourceIcon type="ore" className="w-6 h-6" />
                  <ResourceIcon type="ore" className="w-6 h-6" />
                  <ResourceIcon type="ore" className="w-6 h-6" />
                </div>
              </div>
              <div className="bg-[#16212d] border border-white/10 rounded-xl p-3 flex items-center justify-between">
                <span className="font-semibold text-[#f5efe2]">Development Card</span>
                <div className="flex items-center gap-1">
                  <ResourceIcon type="wool" className="w-6 h-6" />
                  <ResourceIcon type="grain" className="w-6 h-6" />
                  <ResourceIcon type="ore" className="w-6 h-6" />
                </div>
              </div>
            </div>
            <p className="text-xs text-[#9fb0c2] mt-2">
              Settlements built beside coastal harbor piers unlock 3:1 generic or 2:1
              specialized maritime exchange rates.
            </p>
          </section>

          <section>
            <h3 className="font-display text-base font-bold text-[#f5d88c] mb-1.5">
              4. The Robber & Victory
            </h3>
            <p>
              Rolling a 7 (or playing a Harbor Knight) activates the Robber: any player with
              more than 7 cards discards half, then you relocate the Robber onto a tile to
              block its yield and raid 1 resource from an adjacent rival. Claim 10 Victory
              Points via buildings, Longest Road (5+ connected roads, +2 VP), Largest Army
              (3+ Knights, +2 VP), and Royal Charters to win the island!
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
