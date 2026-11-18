import type { DevCardType, ResourceType } from '../game/types';

export function IsleholdCrest({ className = 'w-14 h-14' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="crestGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8de97" />
          <stop offset="55%" stopColor="#d4aa54" />
          <stop offset="100%" stopColor="#8c6323" />
        </linearGradient>
        <linearGradient id="crestSea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1b3145" />
          <stop offset="100%" stopColor="#0e1b26" />
        </linearGradient>
      </defs>
      <polygon
        points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5"
        fill="url(#crestSea)"
        stroke="url(#crestGold)"
        strokeWidth="2.8"
      />
      <polygon
        points="32,8.5 52,20 52,44 32,55.5 12,44 12,20"
        fill="none"
        stroke="#d6af61"
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      {/* Mountain ridge silhouette */}
      <path d="M15 41 L25 23 L33 34 L41 25 L49 41 Z" fill="#2d4f68" />
      <path d="M25 23 L29 29 L23 30 Z" fill="#f3efe2" />
      {/* Citadel Watchtower */}
      <rect x="28.5" y="19" width="7" height="16" fill="#d9b466" />
      <rect x="27.5" y="17" width="9" height="3" fill="#b48a3a" />
      <polygon points="27.5,17 32,10.5 36.5,17" fill="#a62626" />
      {/* Ocean swells */}
      <path
        d="M14 44 Q23 40.5 32 44 T50 44"
        fill="none"
        stroke="#6ac0de"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M19 48.5 Q25.5 46.5 32 48.5 T45 48.5"
        fill="none"
        stroke="#489ab8"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ResourceIcon({
  type,
  className = 'w-7 h-7',
}: {
  type: ResourceType;
  className?: string;
}) {
  switch (type) {
    case 'timber':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="#1b3419" stroke="#538746" strokeWidth="1.5" />
          <path d="M16 4.5 L23.5 14 H19.5 L24.5 21.5 H7.5 L12.5 14 H8.5 Z" fill="#5aa84d" />
          <path d="M16 4.5 L23.5 14 H19.5 L24.5 21.5 H16 Z" fill="#468c3a" />
          <rect x="14.5" y="21.5" width="3" height="5" rx="0.5" fill="#7c502e" />
        </svg>
      );
    case 'wool':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="#283819" stroke="#9cc267" strokeWidth="1.5" />
          <circle cx="12.5" cy="15.5" r="4.5" fill="#f5efe0" />
          <circle cx="18.5" cy="15.5" r="4.5" fill="#ede4ce" />
          <circle cx="15.5" cy="12" r="4.6" fill="#fcf8ed" />
          <circle cx="21.2" cy="17" r="3" fill="#3a332c" />
          <rect x="11.5" y="19" width="2" height="5.5" rx="0.6" fill="#3a332c" />
          <rect x="17.5" y="19" width="2" height="5.5" rx="0.6" fill="#3a332c" />
        </svg>
      );
    case 'grain':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="#3c2d0e" stroke="#dfb14b" strokeWidth="1.5" />
          <path d="M16 25.5 V7.5" stroke="#f4ce66" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="12.8" cy="12.5" rx="2.3" ry="3.7" transform="rotate(-32 12.8 12.5)" fill="#f4ce66" />
          <ellipse cx="19.2" cy="12.5" rx="2.3" ry="3.7" transform="rotate(32 19.2 12.5)" fill="#e3b642" />
          <ellipse cx="12.8" cy="18" rx="2.3" ry="3.7" transform="rotate(-32 12.8 18)" fill="#deb03d" />
          <ellipse cx="19.2" cy="18" rx="2.3" ry="3.7" transform="rotate(32 19.2 18)" fill="#c9992b" />
        </svg>
      );
    case 'brick':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="#3f1910" stroke="#c76042" strokeWidth="1.5" />
          <rect x="7" y="9.5" width="8.5" height="4.5" rx="0.8" fill="#d16040" />
          <rect x="16.5" y="9.5" width="8.5" height="4.5" rx="0.8" fill="#b84b2c" />
          <rect x="11" y="15" width="10" height="4.5" rx="0.8" fill="#de7150" />
          <rect x="7" y="20.5" width="8.5" height="4.2" rx="0.8" fill="#b84b2c" />
          <rect x="16.5" y="20.5" width="8.5" height="4.2" rx="0.8" fill="#d16040" />
        </svg>
      );
    case 'ore':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="#1b2229" stroke="#8a97a6" strokeWidth="1.5" />
          <polygon points="7.5,22 14,8.5 21.5,14.5 24.5,22" fill="#778596" />
          <polygon points="14,8.5 18,17.5 21.5,14.5" fill="#b8c4d4" />
          <polygon points="9.5,20 15,15 17,22" fill="#4b5663" />
        </svg>
      );
  }
}

export function DevCardIllustration({
  type,
  className = 'w-10 h-10',
}: {
  type: DevCardType;
  className?: string;
}) {
  switch (type) {
    case 'knight':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
          <path
            d="M20 4.5 L32.5 10 V20.5 C32.5 28.5 20 35.5 20 35.5 C20 35.5 7.5 28.5 7.5 20.5 V10 Z"
            fill="#572323"
            stroke="#d4aa54"
            strokeWidth="1.8"
          />
          <path
            d="M20 9.5 V29.5 M13 18 H27"
            stroke="#f0e4ca"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'victory_point':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
          <circle cx="20" cy="20" r="15" fill="#2a3d24" stroke="#d4aa54" strokeWidth="1.8" />
          <polygon
            points="20,8.5 23.5,15.8 31.5,16.8 25.7,22.5 27.2,30.2 20,26.3 12.8,30.2 14.3,22.5 8.5,16.8 16.5,15.8"
            fill="#f4ce66"
          />
        </svg>
      );
    case 'road_building':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
          <rect
            x="6"
            y="6"
            width="28"
            height="28"
            rx="6"
            fill="#2b2119"
            stroke="#d4aa54"
            strokeWidth="1.8"
          />
          <path d="M11 29.5 L18 10.5 H22 L29 29.5 Z" fill="#9a643c" />
          <path
            d="M20 13 V27.5"
            stroke="#f2e6cc"
            strokeWidth="1.8"
            strokeDasharray="3 3"
          />
        </svg>
      );
    case 'year_of_plenty':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
          <rect
            x="6"
            y="6"
            width="28"
            height="28"
            rx="6"
            fill="#1c322b"
            stroke="#d4aa54"
            strokeWidth="1.8"
          />
          <circle cx="15" cy="22.5" r="5" fill="#e5b84b" />
          <circle cx="25" cy="22.5" r="5" fill="#5aa84d" />
          <circle cx="20" cy="14" r="5" fill="#c95d3e" />
        </svg>
      );
    case 'monopoly':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
          <rect
            x="6"
            y="6"
            width="28"
            height="28"
            rx="6"
            fill="#21293a"
            stroke="#d4aa54"
            strokeWidth="1.8"
          />
          <path d="M11 25 L14 14 L20 19.5 L26 14 L29 25 Z" fill="#edc461" />
          <rect x="11" y="26.5" width="18" height="3" rx="0.8" fill="#b88c34" />
        </svg>
      );
  }
}

export const DEV_CARD_META: Record<
  DevCardType,
  { title: string; summary: string }
> = {
  knight: {
    title: 'Harbor Knight',
    summary: 'Move the Robber to another tile and raid a rival. Counts toward Largest Army.',
  },
  victory_point: {
    title: 'Royal Charter',
    summary: '+1 Victory Point (automatically revealed upon reaching the victory target).',
  },
  road_building: {
    title: 'King’s Highway',
    summary: 'Construct 2 wooden roads immediately at no resource cost.',
  },
  year_of_plenty: {
    title: 'Bountiful Harvest',
    summary: 'Draw any 2 resources of your choice from the island supply.',
  },
  monopoly: {
    title: 'Trade Monopoly',
    summary: 'Name 1 resource and claim every card of that type held by opponents.',
  },
};
