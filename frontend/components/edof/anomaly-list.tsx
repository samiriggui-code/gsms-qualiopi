'use client';

import { ArrowRight, CircleCheck, Cpu, Hand } from 'lucide-react';
import type { Anomaly, Level } from '@/lib/gsms/edof';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LEVEL, STEP_LABEL } from './labels';

const ORDER: Level[] = ['BLOQUANT', 'A_VERIFIER', 'INFO'];

/**
 * Anomalies calculées par l'API. Chacune mène à l'endroit où la corriger (`onGo`).
 * Le mode dit qui peut lever le point : un contrôle automatique ou une personne.
 */
export function AnomalyList({
  anomalies,
  onGo,
  empty = 'Aucune anomalie : rien ne bloque côté GSMS.',
}: {
  anomalies: Anomaly[];
  onGo?: (a: Anomaly) => void;
  empty?: string;
}) {
  if (!anomalies.length)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <CircleCheck className="size-4 text-green-600" /> {empty}
      </p>
    );
  const sorted = [...anomalies].sort(
    (a, b) => ORDER.indexOf(a.niveau) - ORDER.indexOf(b.niveau),
  );
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {sorted.map((a, i) => (
        <li
          key={`${a.code}-${i}`}
          className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm"
        >
          <Badge size="sm" className={cn('shrink-0', LEVEL[a.niveau].color)}>
            {LEVEL[a.niveau].label}
          </Badge>
          <div className="min-w-0 grow basis-60">
            <div className="font-medium text-foreground">{a.message}</div>
            {a.detail && (
              <div className="text-muted-foreground text-xs mt-0.5 break-words">
                {a.detail}
              </div>
            )}
            <div className="text-muted-foreground text-xs mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span>{STEP_LABEL[a.etape]}</span>
              <span className="inline-flex items-center gap-1">
                {a.controle === 'HUMAIN' ? (
                  <Hand className="size-3" />
                ) : (
                  <Cpu className="size-3" />
                )}
                {a.controle === 'HUMAIN'
                  ? 'Constat humain'
                  : 'Contrôle automatique'}
              </span>
            </div>
          </div>
          {onGo && (
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 ms-auto"
              onClick={() => onGo(a)}
            >
              Corriger <ArrowRight />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
