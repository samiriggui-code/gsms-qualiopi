'use client';

import { ComponentProps } from 'react';
import { Info, LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Decision } from '@/lib/gsms/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Props = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  decision: Decision | undefined;
  onRun: () => void;
  pending?: boolean;
};

/**
 * Bouton gouverné par le moteur : il n'invente aucune règle, il affiche la décision de l'API.
 * Refusé → reste visible et atteignable au clavier ; la raison est donnée au survol, au focus
 * et au clic (sur mobile, pas de survol : une notification la dit).
 */
export function ActionGate({ decision, onRun, pending, children, ...props }: Props) {
  if (!decision) return null;
  if (decision.allowed) {
    return (
      <Button {...props} onClick={onRun} disabled={pending} aria-busy={pending || undefined}>
        {pending && <LoaderCircleIcon className="size-4 animate-spin" />}
        {children}
      </Button>
    );
  }
  const reason = decision.message;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          {...props}
          aria-disabled
          className={`${props.className ?? ''} opacity-60`}
          onClick={() => toast.info(reason, { icon: <Info className="size-4" /> })}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}
