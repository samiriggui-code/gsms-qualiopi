import Link from 'next/link';
import { CalendarClock, MapPin, Presentation, Users } from 'lucide-react';
import { formatDateRange, percent } from '@/lib/format';
import { SESSION_STATUS, TONE } from '@/lib/gsms/labels';
import type { SessionRow } from '@/lib/gsms/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { FormationVisual } from '@/components/catalogue/formation-visual';

// Carte de session de la vue en grille (GSMS School : grille des sessions de vie scolaire) : visuel de la
// formation, statut, dates, lieu, formateur et remplissage. Les valeurs viennent telles quelles de l'API.
export function SessionCard({ s }: { s: SessionRow }) {
  const status = SESSION_STATUS[s.status];
  const href = `/formation/sessions/${s.id}`;
  return (
    <Card className="group flex flex-col overflow-hidden border-border shadow-none transition-all hover:border-primary/50">
      <Link href={href} tabIndex={-1} aria-hidden className="relative block">
        <FormationVisual
          slug={s.program_slug}
          track={s.program_track ?? 'AUTRES'}
          code={s.program_code ?? s.reference}
          className="aspect-[16/9] w-full border-b border-border"
        />
        <Badge className={cn('absolute start-3 top-3 shadow-sm', status.color)}>
          {status.label}
        </Badge>
      </Link>
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-1.5">
          {s.program_track_label && (
            <Badge
              variant="outline"
              className={cn(
                TONE.info,
                'text-[10px] font-bold uppercase tracking-wide',
              )}
            >
              {s.program_track_label}
            </Badge>
          )}
          <Badge size="sm" variant="outline" className="text-[10px]">
            {s.reference}
          </Badge>
        </div>
        <Link
          href={href}
          className="line-clamp-2 font-semibold leading-snug text-foreground hover:text-primary"
        >
          {s.program_title ?? s.reference}
        </Link>
        <ul className="space-y-1.5 text-xs text-secondary-foreground">
          <li className="flex items-center gap-2">
            <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
            {formatDateRange(s.start_date, s.end_date)}
          </li>
          <li className="flex min-w-0 items-center gap-2">
            <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {[s.location, s.room].filter(Boolean).join(' · ') || (
                <span className="text-muted-foreground">
                  Lieu non renseigné
                </span>
              )}
            </span>
          </li>
          <li className="flex min-w-0 items-center gap-2">
            <Presentation className="size-3.5 shrink-0 text-muted-foreground" />
            {s.trainer_name ? (
              <span className="truncate">{s.trainer_name}</span>
            ) : (
              <span className="text-destructive">Formateur à affecter</span>
            )}
          </li>
        </ul>
        <div className="mt-auto flex items-center gap-3 border-t border-dashed border-border pt-3">
          <Users className="size-4 shrink-0 text-muted-foreground" />
          {s.capacity ? (
            <>
              <Progress
                value={percent(s.learners_count, s.capacity)}
                className="h-1.5 flex-1"
                aria-label="Remplissage"
              />
              <span className="whitespace-nowrap text-xs font-medium text-foreground tabular-nums">
                {s.learners_count}/{s.capacity}
              </span>
            </>
          ) : (
            <span className="text-xs text-secondary-foreground">
              {s.learners_count} inscrit{s.learners_count > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
