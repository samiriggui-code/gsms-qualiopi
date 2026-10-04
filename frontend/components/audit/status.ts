// Statut d'un indicateur dans un audit Qualiopi, partagé par les composants d'audit.
export type AuditStatus = 'ok' | 'warn' | 'ko';

export const STATUS_LABEL: Record<AuditStatus, string> = {
  ok: 'Conforme',
  warn: 'À clarifier',
  ko: 'À corriger',
};

// Classes Tailwind complètes (pas de concaténation) pour que Tailwind les détecte.
export const STATUS_DOT: Record<AuditStatus, string> = {
  ok: 'bg-conforme',
  warn: 'bg-clarifier',
  ko: 'bg-corriger',
};

export const STATUS_TEXT: Record<AuditStatus, string> = {
  ok: 'text-conforme',
  warn: 'text-clarifier',
  ko: 'text-corriger',
};

export const STATUS_SOFT_BG: Record<AuditStatus, string> = {
  ok: 'bg-conforme-bg',
  warn: 'bg-clarifier-bg',
  ko: 'bg-corriger-bg',
};

export const STATUS_BORDER_LEFT: Record<AuditStatus, string> = {
  ok: 'border-l-conforme',
  warn: 'border-l-clarifier',
  ko: 'border-l-corriger',
};
