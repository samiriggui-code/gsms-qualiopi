// Statut d'un indicateur dans un audit Qualiopi, partagé par les composants d'audit.
// `info` : relecture humaine attendue ; `none` : pas encore évalué.
export type AuditStatus = 'ok' | 'warn' | 'ko' | 'info' | 'none';

/** Libellés à afficher à la place des libellés par défaut (par exemple ceux du moteur). */
export type StatusLabels = Partial<Record<AuditStatus, string>>;

// Libellés de la maquette de démonstration. Dans l'application, les pages passent ceux du moteur.
export const STATUS_LABEL: Record<AuditStatus, string> = {
  ok: 'Conforme',
  warn: 'À clarifier',
  ko: 'À corriger',
  info: 'Revue humaine',
  none: 'Non évalué',
};

export function statusLabel(status: AuditStatus, labels?: StatusLabels) {
  return labels?.[status] ?? STATUS_LABEL[status];
}

// Classes Tailwind complètes (pas de concaténation) pour que Tailwind les détecte.
export const STATUS_DOT: Record<AuditStatus, string> = {
  ok: 'bg-conforme',
  warn: 'bg-clarifier',
  ko: 'bg-corriger',
  info: 'bg-audit-accent',
  none: 'bg-ink-faint',
};

export const STATUS_TEXT: Record<AuditStatus, string> = {
  ok: 'text-conforme',
  warn: 'text-clarifier',
  ko: 'text-corriger',
  info: 'text-audit-accent',
  none: 'text-ink-soft',
};

export const STATUS_SOFT_BG: Record<AuditStatus, string> = {
  ok: 'bg-conforme-bg',
  warn: 'bg-clarifier-bg',
  ko: 'bg-corriger-bg',
  info: 'bg-audit-accent/10',
  none: 'bg-audit-bg',
};

export const STATUS_BORDER_LEFT: Record<AuditStatus, string> = {
  ok: 'border-l-conforme',
  warn: 'border-l-clarifier',
  ko: 'border-l-corriger',
  info: 'border-l-audit-accent',
  none: 'border-l-ink-faint',
};
