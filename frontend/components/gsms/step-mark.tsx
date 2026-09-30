import { CircleCheck, CircleDashed, CircleMinus, CircleX, Clock } from 'lucide-react';
import { STEP_STATE } from '@/lib/gsms/labels';
import type { StepState } from '@/lib/gsms/types';
import { cn } from '@/lib/utils';

const ICONS: Record<StepState, { icon: typeof CircleCheck; color: string }> = {
  FAIT: { icon: CircleCheck, color: 'text-green-600' },
  A_VENIR: { icon: CircleDashed, color: 'text-muted-foreground' },
  A_ECHEANCE: { icon: Clock, color: 'text-yellow-600' },
  EN_RETARD: { icon: CircleX, color: 'text-destructive' },
  SANS_OBJET: { icon: CircleMinus, color: 'text-muted-foreground/60' },
};

// Pastille d'état d'une étape du parcours (état calculé par l'API).
export function StepMark({ state, label, className }: { state: StepState; label?: string; className?: string }) {
  const { icon: Icon, color } = ICONS[state];
  const text = `${label ? `${label} : ` : ''}${STEP_STATE[state].label}`;
  return <Icon className={cn('size-4 shrink-0', color, className)} aria-label={text} role="img" />;
}
