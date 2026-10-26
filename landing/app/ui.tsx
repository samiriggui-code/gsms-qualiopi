import type { ReactNode } from "react";

// Icônes au trait (24 × 24), dessinées pour la landing : aucun paquet d'icônes importé.
const paths: Record<string, ReactNode> = {
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  play: <path d="m9 5 11 7-11 7Z" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 12l2 2 4-4" /></>,
  book: <path d="M12 6C9 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 2v15" />,
  shield: <path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6l9-4Z" />,
  badge: <><path d="m12 2 2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9L3.2 15.8l1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></>,
  crosshair: <><circle cx="12" cy="12" r="9" /><path d="M12 3v4m0 10v4M3 12h4m10 0h4" /></>,
  shieldCheck: <><path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6l9-4Z" /><path d="m8 12 3 3 5-6" /></>,
  users: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6m0-17a4 4 0 0 1 0 8m3 3c2 1 3 3 3 6" /></>,
  trend: <path d="m3 17 6-6 4 4 8-8m-5 0h5v5" />,
  graduation: <><path d="m12 4 10 5-10 5L2 9l10-5Z" /><path d="M6 11v5c3 3 9 3 12 0v-5M22 9v6" /></>,
  phone: <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  pin: <><path d="M12 22s7-6.6 7-12a7 7 0 0 0-14 0c0 5.4 7 12 7 12Z" /><circle cx="12" cy="10" r="2.5" /></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9Z" />,
  award: <><circle cx="12" cy="9" r="6" /><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8" /></>,
  flame: <path d="M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-5 5-5 8-1-1-2-2-2-4-2 2-2 5-2 8 0 4 3 7 7 7Z" />,
  heart: <path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11Zm-5-9h3l1.5-2.5 2 5L15 11h2" />,
  library: <path d="M4 4v16m4-16v16m4-14 4 14m3-16v16" />,
  userCog: <><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3-6 7-6 1.4 0 2.6.3 3.6.8" /><circle cx="18" cy="17" r="2.5" /><path d="M18 13v1.5m0 5V21m4-4h-1.5m-5 0H14" /></>,
  handshake: <path d="m11 17 2 2a1.5 1.5 0 0 0 2-2m-4-4 3 3a1.5 1.5 0 0 0 2-2l-3.5-3.5L10 13a2 2 0 0 1-3-3l3-3h4l3 3h4M3 10h3l6 7" />,
  building: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 21v-4h6v4M8 7h2m4 0h2m-8 4h2m4 0h2" /></>,
  activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  facebook: <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6v4h3v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2Z" />,
  x: <path d="m4 4 16 16M20 4 4 20" />,
  github: <path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7m12 5v-3.5c0-1 .1-1.4-.5-2 3.4-.4 7-1.7 7-7.5a5.7 5.7 0 0 0-1.5-4 5.4 5.4 0 0 0-.1-4S18.6-.1 15.5 2a14 14 0 0 0-7 0C5.4-.1 4.1.3 4.1.3A5.4 5.4 0 0 0 4 4.3a5.7 5.7 0 0 0-1.5 4c0 5.8 3.6 7.1 7 7.5-.6.6-.6 1.2-.5 2V21" />,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4m-4-7v7" /></>,
  close: <path d="m5 5 14 14M5 19 19 5" />,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

/** Initiales d'un nom, pour les pastilles de profil (aucune photo de démonstration). */
export function initials(name: string) {
  return name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}
