import { CircleCheck, CircleX, Minus } from 'lucide-react';

// Présence d'une étape du dossier : faite, manquante, ou non concernée.
export function StatusIcon({ state, title }: { state: 'ok' | 'missing' | 'na'; title?: string }) {
  if (state === 'ok') return <CircleCheck className="size-4 text-emerald-600" aria-label={title ?? 'Fait'} />;
  if (state === 'missing') return <CircleX className="size-4 text-destructive" aria-label={title ?? 'Manquant'} />;
  return <Minus className="size-4 text-muted-foreground" aria-label={title ?? 'Non concerné'} />;
}
