'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  CalendarClock,
  DoorOpen,
  ExternalLink,
  MapPin,
  PanelRightOpen,
  Presentation,
  Tag,
  Users,
} from 'lucide-react';
import { formatDateRange, percent } from '@/lib/format';
import { ENROLLMENT_STATUS, SESSION_STATUS } from '@/lib/gsms/labels';
import {
  useSession,
  useSessionActivity,
  useSessions,
} from '@/lib/gsms/sessions';
import type { SessionRow } from '@/lib/gsms/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RecordSheet,
  SideCard,
  SideLine,
} from '@/components/page/record-sheet';
import { SectionCard, SectionEmpty } from '@/components/page/section-card';
import { ActivityList } from '../../formation/sessions/[id]/session-overview';
import { Repere, RepereNote } from './repere';

// Modèle « fiche détaillée » : grand panneau ouvert depuis une liste, monté ici sur une vraie session.
export function SheetModel() {
  const { data: sessions = [], isLoading } = useSessions();
  const [open, setOpen] = useState<SessionRow | null>(null);
  const sample =
    sessions.find((s) => s.status === 'EN_COURS') ??
    sessions.find((s) => s.learners_count > 0) ??
    sessions[0];

  return (
    <div className="space-y-8">
      <Repere n={1} name="Ouverture depuis la liste">
        <RepereNote>
          Une carte ou une ligne de liste ouvre la fiche en grand panneau, sans
          quitter la liste.
        </RepereNote>
        <SectionCard title="Fiche témoin" icon={PanelRightOpen}>
          {isLoading ? (
            <Skeleton className="h-10 w-64" />
          ) : sample ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-secondary-foreground">
                Session{' '}
                <span className="font-medium text-foreground">
                  {sample.reference}
                </span>
                , {sample.program_title}
              </p>
              <Button onClick={() => setOpen(sample)}>
                <PanelRightOpen /> Ouvrir la fiche
              </Button>
            </div>
          ) : (
            <SectionEmpty icon={CalendarClock}>
              Aucune session pour monter la fiche.
            </SectionEmpty>
          )}
        </SectionCard>
      </Repere>
      <Repere n={2} name="Contenu d’une fiche">
        <SectionCard title="Ce que contient chaque fiche" icon={BookOpen}>
          <ol className="list-decimal space-y-1.5 ps-5 text-sm text-secondary-foreground">
            <li>
              Bandeau : nom, badges d’état, métadonnées séparées par des points,
              actions à droite.
            </li>
            <li>
              Colonne de gauche : petites cartes clé / valeur ; une valeur
              absente est écrite « Non renseigné ».
            </li>
            <li>
              Onglets à droite : vue d’ensemble, éléments liés (stagiaires,
              documents…), activité.
            </li>
            <li>
              Pied : action principale (ouvrir le dossier complet, enregistrer).
            </li>
          </ol>
        </SectionCard>
      </Repere>
      {open && <SessionSheet session={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function SessionSheet({
  session: s,
  onClose,
}: {
  session: SessionRow;
  onClose: () => void;
}) {
  const detail = useSession(s.id);
  const activity = useSessionActivity(s.id);
  const inscriptions = detail.data?.inscriptions ?? [];
  const status = SESSION_STATUS[s.status];

  return (
    <RecordSheet
      open
      onClose={onClose}
      label="Fiche session"
      title={s.program_title ?? s.reference}
      badges={
        <Badge size="sm" className={status.color}>
          {status.label}
        </Badge>
      }
      meta={[
        { label: 'Référence', value: s.reference },
        { label: 'Dates', value: formatDateRange(s.start_date, s.end_date) },
        ...(s.program_track_label
          ? [{ label: 'Filière', value: s.program_track_label }]
          : []),
      ]}
      side={
        <>
          <SideCard title="Formation">
            <SideLine icon={BookOpen}>{s.program_title}</SideLine>
            <SideLine icon={Tag}>{s.program_code}</SideLine>
          </SideCard>
          <SideCard title="Lieu">
            <SideLine icon={MapPin}>{s.location}</SideLine>
            <SideLine icon={DoorOpen} missing="Salle non renseignée">
              {s.room}
            </SideLine>
          </SideCard>
          <SideCard title="Formateur">
            <SideLine icon={Presentation} missing="À affecter">
              {s.trainer_name}
            </SideLine>
          </SideCard>
        </>
      }
      tabs={[
        {
          value: 'apercu',
          label: 'Vue d’ensemble',
          content: (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Inscrits
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {s.learners_count}
                  {s.capacity ? (
                    <span className="text-base text-muted-foreground">
                      /{s.capacity}
                    </span>
                  ) : null}
                </p>
                {s.capacity ? (
                  <Progress
                    value={percent(s.learners_count, s.capacity)}
                    className="mt-3 h-1.5"
                    aria-label="Remplissage"
                  />
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Capacité non renseignée
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Période
                </p>
                <p className="mt-1 text-base font-semibold">
                  {formatDateRange(s.start_date, s.end_date)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {status.label}
                </p>
              </div>
            </div>
          ),
        },
        {
          value: 'stagiaires',
          label: 'Stagiaires',
          count: detail.data ? inscriptions.length : undefined,
          content: detail.isPending ? (
            <Skeleton className="h-32" />
          ) : inscriptions.length === 0 ? (
            <SectionEmpty icon={Users}>Aucun stagiaire inscrit.</SectionEmpty>
          ) : (
            <ul className="divide-y divide-dashed divide-border rounded-lg border border-border">
              {inscriptions.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="truncate font-medium">{e.stagiaire}</span>
                  <Badge
                    size="sm"
                    className={ENROLLMENT_STATUS[e.statut].color}
                  >
                    {ENROLLMENT_STATUS[e.statut].label}
                  </Badge>
                </li>
              ))}
            </ul>
          ),
        },
        {
          value: 'activite',
          label: 'Activité',
          content: activity.isPending ? (
            <Skeleton className="h-32" />
          ) : (
            <ActivityList items={activity.data ?? []} />
          ),
        },
      ]}
      footer={
        <Button asChild>
          <Link href={`/formation/sessions/${s.id}`}>
            <ExternalLink /> Ouvrir le dossier de la session
          </Link>
        </Button>
      }
    />
  );
}
