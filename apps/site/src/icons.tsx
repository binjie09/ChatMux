// Inline SVG icon set — hand-tuned to the phosphor-terminal aesthetic,
// avoids pulling an icon dependency into the marketing bundle.

type P = React.SVGProps<SVGSVGElement>;

const S = (p: P) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...p}
  />
);

export const IconTerminal = (p: P) => (
  <S {...p}>
    <polyline points="4 7 8 11 4 15" />
    <line x1="11" y1="15" x2="17" y2="15" />
  </S>
);
export const IconLayers = (p: P) => (
  <S {...p}>
    <polygon points="12 3 21 8 12 13 3 8 12 3" />
    <polyline points="3 12 12 17 21 12" />
  </S>
);
export const IconHistory = (p: P) => (
  <S {...p}>
    <path d="M3 3v5h5" />
    <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
    <polyline points="12 7 12 12 15 14" />
  </S>
);
export const IconServer = (p: P) => (
  <S {...p}>
    <rect x="3" y="4" width="18" height="7" rx="2" />
    <rect x="3" y="13" width="18" height="7" rx="2" />
    <line x1="7" y1="7.5" x2="7" y2="7.5" />
    <line x1="7" y1="16.5" x2="7" y2="16.5" />
  </S>
);
export const IconPhone = (p: P) => (
  <S {...p}>
    <rect x="6" y="2" width="12" height="20" rx="3" />
    <line x1="11" y1="18" x2="13" y2="18" />
  </S>
);
export const IconSpark = (p: P) => (
  <S {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  </S>
);
export const IconShield = (p: P) => (
  <S {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    <polyline points="9 12 11 14 15 9" />
  </S>
);
export const IconGrid = (p: P) => (
  <S {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </S>
);
export const IconArrow = (p: P) => (
  <S {...p}>
    <line x1="6" y1="18" x2="18" y2="6" />
    <polyline points="9 6 18 6 18 15" />
  </S>
);
export const IconCopy = (p: P) => (
  <S {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h8" />
  </S>
);
export const IconCheck = (p: P) => (
  <S {...p}>
    <polyline points="20 6 9 17 4 12" />
  </S>
);
export const IconAlert = (p: P) => (
  <S {...p}>
    <path d="M12 3l9 16H3z" />
    <line x1="12" y1="10" x2="12" y2="14" />
    <line x1="12" y1="17" x2="12" y2="17" />
  </S>
);
export const IconGithub = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.5v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.6.8.5 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
  </svg>
);
export const IconStar = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
  </svg>
);
export const IconApple = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.8-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1 2.8-2.1c.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.7zM14.1 5.6c.6-.8 1.1-1.9.9-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.2-.6 2.9-1.3z" />
  </svg>
);
export const IconWindows = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M3 5.5l8-1.1v8.1H3zM3 13h8v8.1l-8-1.1zM12 4.2L21 3v9.5h-9zM12 13h9V21l-9-1.2z" />
  </svg>
);
export const IconLinux = (p: P) => (
  <S {...p}>
    <path d="M9 4c-1 1.5-1 3 0 4.5C7 9 6 11 6 14c0 2 1 3 2 4 .5 1 1 2 1.5 2.5M15 4c1 1.5 1 3 0 4.5 2 .5 3 2.5 3 5.5 0 2-1 3-2 4-.5 1-1 2-1.5 2.5" />
    <circle cx="10" cy="8" r="0.6" fill="currentColor" />
    <circle cx="14" cy="8" r="0.6" fill="currentColor" />
  </S>
);
export const IconAndroid = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M6 10v6a1 1 0 0 0 1 1h1v3a1 1 0 0 0 2 0v-3h4v3a1 1 0 0 0 2 0v-3h1a1 1 0 0 0 1-1v-6zM4.5 10A1.5 1.5 0 0 0 3 11.5v4a1.5 1.5 0 0 0 3 0v-4A1.5 1.5 0 0 0 4.5 10zm15 0A1.5 1.5 0 0 0 18 11.5v4a1.5 1.5 0 0 0 3 0v-4a1.5 1.5 0 0 0-1.5-1.5zM8.6 3.5L7.2 1.9a.4.4 0 0 1 .6-.5L9.4 3a6 6 0 0 1 5.2 0l1.6-1.6a.4.4 0 1 1 .6.5l-1.4 1.6A5.8 5.8 0 0 1 18 8.5H6a5.8 5.8 0 0 1 2.6-5zM9.5 6a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4zm5 0a.7.7 0 1 0 0-1.4.7.7 0 0 0 0 1.4z" />
  </svg>
);
export const IconGlobe = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9z" />
  </S>
);
