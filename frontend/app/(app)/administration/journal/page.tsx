'use client';

// Journal d'activité : le fil des modifications de toutes les données (qui, quoi, quand, quels champs),
// tel qu'enregistré par l'API. Lecture seule : c'est la piste d'audit de l'organisme.
import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { History, LoaderCircleIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { useJournal, type JournalLine } from '@/lib/gsms/administration';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { PageHero } from '@/components/page/page-hero';

// Tables du journal → libellé lisible (sinon le nom technique)
const TABLES: Record<string, string> = {
  'formation.session': 'Sessions',
  'formation.enrollment': 'Inscriptions',
  'formation.learner': 'Apprenants',
  'formation.trainer': 'Formateurs',
  'formation.program': 'Formations',
  'formation.company': 'Entreprises',
  'formation.needs_analysis': 'Analyses du besoin',
  'formation.positioning': 'Positionnements',
  'formation.agreement': 'Conventions',
  'formation.convocation': 'Convocations',
  'formation.assessment': 'Évaluations',
  'formation.certificate': 'Attestations',
  'formation.attendance_slot': 'Émargement (créneaux)',
  'formation.attendance_signature': 'Émargement (signatures)',
  'formation.satisfaction_survey': 'Satisfaction',
  'formation.complaint': 'Réclamations',
  'formation.document': 'Documents',
  'formation.organization': 'Organisme',
  'qualite.evidence': 'Preuves',
  'qualite.capa_action': 'Actions correctives',
  'qualite.audit': 'Audits internes',
  'iam.user': 'Comptes',
  'iam.user_role': 'Rôles des comptes',
  'config.setting_value': 'Paramètres',
  'config.feature_state': 'Modules',
};
const tableLabel = (t: string) => TABLES[t] ?? t;

const ACTION = {
  CREATION: {
    label: 'Création',
    icon: Plus,
    tone: 'text-green-600 bg-green-500/10',
  },
  MODIFICATION: {
    label: 'Modification',
    icon: Pencil,
    tone: 'text-primary bg-primary/10',
  },
  SUPPRESSION: {
    label: 'Suppression',
    icon: Trash2,
    tone: 'text-destructive bg-destructive/10',
  },
} as const;

const ALL = '__toutes__';

function Line({ line }: { line: JournalLine }) {
  const a = ACTION[line.action as keyof typeof ACTION] ?? ACTION.MODIFICATION;
  const Icon = a.icon;
  return (
    <li className="flex min-w-0 gap-3 px-4 py-3">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          a.tone,
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 grow">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
          <span className="font-medium">{a.label}</span>
          <Badge size="sm" variant="secondary">
            {tableLabel(line.table)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            par {line.actor} · {format(parseISO(line.at), 'HH:mm')}
          </span>
        </span>
        {line.action === 'MODIFICATION' && line.champs.length > 0 && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {line.champs.length} champ{line.champs.length > 1 ? 's' : ''} :{' '}
            {line.champs.join(', ')}
          </span>
        )}
      </span>
    </li>
  );
}

export default function JournalPage() {
  const [table, setTable] = useState<string | null>(null);
  const q = useJournal(table);
  const lines = useMemo(
    () => q.data?.pages.flatMap((p) => p.lignes) ?? [],
    [q.data],
  );
  const tables = q.data?.pages[0]?.tables ?? [];

  // Regroupées par jour, du plus récent au plus ancien
  const days = useMemo(() => {
    const out: { day: string; lines: JournalLine[] }[] = [];
    for (const l of lines) {
      const day = format(parseISO(l.at), 'yyyy-MM-dd'); // jour local, comme l'heure affichée
      if (out.at(-1)?.day !== day) out.push({ day, lines: [] });
      out.at(-1)!.lines.push(l);
    }
    return out;
  }, [lines]);

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <History className="size-4 text-primary" /> Journal d’activité
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Administration"
            icon={History}
            title="Journal d’activité"
            description="Chaque création, modification et suppression, avec son auteur et l'heure : la piste d'audit de l'organisme. Rien ne s'y efface."
          />
          {q.error ? (
            <Refusal error={q.error} />
          ) : (
            <Card className="shadow-none overflow-hidden [contain:inline-size]">
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
                <Select
                  value={table ?? ALL}
                  onValueChange={(v) => setTable(v === ALL ? null : v)}
                >
                  <SelectTrigger
                    className="w-full sm:w-64"
                    aria-label="Filtrer par donnée"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Toutes les données</SelectItem>
                    {tables.map((t) => (
                      <SelectItem key={t} value={t}>
                        {tableLabel(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                  {lines.length} entrée{lines.length > 1 ? 's' : ''} affichée
                  {lines.length > 1 ? 's' : ''}
                </span>
              </div>
              {q.isLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 6 }, (_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : lines.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Aucune modification enregistrée.
                </p>
              ) : (
                <>
                  {days.map((d) => (
                    <section key={d.day}>
                      <h2 className="sticky top-0 z-[1] bg-muted/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                        {format(parseISO(d.day), 'EEEE d MMMM yyyy', {
                          locale: fr,
                        })}
                      </h2>
                      <ul className="divide-y divide-border">
                        {d.lines.map((l) => (
                          <Line key={l.id} line={l} />
                        ))}
                      </ul>
                    </section>
                  ))}
                  {q.hasNextPage && (
                    <div className="border-t border-border p-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={q.isFetchingNextPage}
                        onClick={() => q.fetchNextPage()}
                      >
                        {q.isFetchingNextPage && (
                          <LoaderCircleIcon className="animate-spin" />
                        )}{' '}
                        Plus ancien
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          )}
        </div>
      </Content>
    </>
  );
}
