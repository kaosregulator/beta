import type { DevCardType, ResourceType } from '../game/types';

export function IsleholdCrest({ className = 'w-14 h-14' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="crestGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5d88c" />
          <stop offset="100%" stopColor="#a67c32" />
        </linearGradient>
      </defs>
      <polygon
        points="32,4 56,18 56,46 32,60 8,46 8,18"
        fill="#192836"
        stroke="url(#crestGold)"
        strokeWidth="2.8"
      />
      <polygon
        points="32,9 51,20 51,44 32,55 13,44 13,20"
        fill="none"
        stroke="#d6af61"
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      {/* Stylized island peak & lighthouse tower */}
      <path d="M16 42 L26 24 L34 35 L41 26 L48 42 Z" fill="#2c4e66" />
      <path d="M26 24 L29 29 L24 30 Z" fill="#f3efe2" />
      {/* Miniature keep silhouette */}
      <rect x="29" y="21" width="6" height="14" fill="#d9b466" />
      <polygon points="28,21 32,14 36,21" fill="#a62626" />
      {/* Ocean wave */}
      <path
        d="M15 44 Q23 41 32 44 T49 44"
        fill="none"
        stroke="#66b3cf"
        strokeWidth="2.2"
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
          <circle cx="16" cy="16" r="14" fill="#1e381b" stroke="#4d7c41" strokeWidth="1.5" />
          <path d="M16 5 L23 15 H19 L24 22 H8 L13 15 H9 Z" fill="#5aa14e" />
          <rect x="14.5" y="22" width="3" height="5" fill="#70492b" />
        </svg>
      );
    case 'wool':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="#2b3a1b" stroke="#9cc267" strokeWidth="1.5" />
          <circle cx="13" cy="15" r="4.5" fill="#f2ecdb" />
          <circle cx="19" cy="15" r="4.5" fill="#f2ecdb" />
          <circle cx="16" cy="12" r="4.5" fill="#faf5e8" />
          <circle cx="21" cy="17" r="3" fill="#3a332c" />
          <rect x="12" y="19" width="2" height="5" fill="#3a332c" />
          <rect x="18" y="19" width="2" height="5" fill="#3a332c" />
        </svg>
      );
    case 'grain':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="#3f300f" stroke="#dfb14b" strokeWidth="1.5" />
          <path d="M16 25 V8" stroke="#f0c75e" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="13" cy="13" rx="2.2" ry="3.5" transform="rotate(-30 13 13)" fill="#f0c75e" />
          <ellipse cx="19" cy="13" rx="2.2" ry="3.5" transform="rotate(30 19 13)" fill="#f0c75e" />
          <ellipse cx="13" cy="18" rx="2.2" ry="3.5" transform="rotate(-30 13 18)" fill="#d6a536" />
          <ellipse cx="19" cy="18" rx="2.2" ry="3.5" transform="rotate(30 19 18)" fill="#d6a536" />
        </svg>
      );
    case 'brick':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="#401a11" stroke="#bf593b" strokeWidth="1.5" />
          <rect x="7" y="10" width="8.5" height="4.5" rx="0.8" fill="#c95b3c" />
          <rect x="16.5" y="10" width="8.5" height="4.5" rx="0.8" fill="#b3492c" />
          <rect x="11" y="15.5" width="10" height="4.5" rx="0.8" fill="#d96b4a" />
          <rect x="7" y="21" width="8.5" height="4" rx="0.8" fill="#b3492c" />
          <rect x="16.5" y="21" width="8.5" height="4" rx="0.8" fill="#c95b3c" />
        </svg>
      );
    case 'ore':
      return (
        <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
          <circle cx="16" cy="16" r="14" fill="#1e242b" stroke="#8a97a6" strokeWidth="1.5" />
          <polygon points="8,22 14,9 21,15 24,22" fill="#788494" />
          <polygon points="14,9 18,17 21,15" fill="#adb8c7" />
          <polygon points="10,19 15,15 17,21" fill="#4b5563" />
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
          <path d="M20 5 L32 10 V20 C32 28 20 35 20 35 C20 35 8 28 8 20 V10 Z" fill="#4f2222" stroke="#d4aa54" strokeWidth="1.8" />
          <path d="M20 9 V30 M13 18 H27" stroke="#e8dcc0" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      );
    case 'victory_point':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
          <circle cx="20" cy="20" r="15" fill="#2c3e26" stroke="#d4aa54" strokeWidth="1.8" />
          <polygon points="20,9 23.5,16 31,17 25.5,22.5 27,30 20,26.2 13,30 14.5,22.5 9,17 16.5,16" fill="#f0c75e" />
        </svg>
      );
    case 'road_building':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
          <rect x="6" y="6" width="28" height="28" rx="6" fill="#2b2119" stroke="#d4aa54" strokeWidth="1.8" />
          <path d="M11 29 L18 11 H22 L29 29 Z" fill="#8f5d38" />
          <path d="M20 13 V27" stroke="#f2e6cc" strokeWidth="1.8" strokeDasharray="3 3" />
        </svg>
      );
    case 'year_of_plenty':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
          <rect x="6" y="6" width="28" height="28" rx="6" fill="#1e332c" stroke="#d4aa54" strokeWidth="1.8" />
          <circle cx="15" cy="22" r="5" fill="#dfb14b" />
          <circle cx="25" cy="22" r="5" fill="#5aa14e" />
          <circle cx="20" cy="14" r="5" fill="#bf593b" />
        </svg>
      );
    case 'monopoly':
      return (
        <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
          <rect x="6" y="6" width="28" height="28" rx="6" fill="#222a3a" stroke="#d4aa54" strokeWidth="1.8" />
          <path d="M11 25 L14 14 L20 19 L26 14 L29 25 Z" fill="#e8be5a" />
          <rect x="11" y="26" width="18" height="3" fill="#b48a34" />
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
