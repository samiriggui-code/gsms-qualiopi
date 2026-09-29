'use client';

import { CalendarCheck, FileText, Users } from 'lucide-react';
import { formatDate, percent } from '@/lib/format';
import {
  DOCUMENT_KINDS,
  DOCUMENT_STATUS,
  ENROLLMENT_STATUS,
  PERIOD_LABELS,
  SessionDetail,
} from '@/lib/formation/sessions';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusIcon } from './status-icon';

function Enrollments({ session }: { session: SessionDetail }) {
  if (!session.enrollments.length) {
    return <p className="text-muted-foreground py-4">Aucun inscrit pour le moment.</p>;
  }
  const started = session.slots.some((s) => s.trainer_signed_at);
  const finished = session.status === 'TERMINEE' || session.status === 'CLOTUREE';

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Apprenant</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Financement</TableHead>
          <TableHead className="text-center">Analyse du besoin</TableHead>
          <TableHead className="text-center">Positionnement</TableHead>
          <TableHead>Convocation</TableHead>
          <TableHead>Convention</TableHead>
          <TableHead>Assiduité</TableHead>
          <TableHead className="text-center">Évaluation</TableHead>
          <TableHead>Attestation</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {session.enrollments.map((e) => (
          <TableRow key={e.id}>
            <TableCell>
              <div className="font-medium text-foreground">{e.learner_name}</div>
              <div className="text-xs text-muted-foreground">
                {e.company_name ?? 'Particulier'}
              </div>
            </TableCell>
            <TableCell>
              <Badge variant="outline">{ENROLLMENT_STATUS[e.status] ?? e.status}</Badge>
            </TableCell>
            <TableCell className="text-secondary-foreground">{e.funding ?? '—'}</TableCell>
            <TableCell>
              <div className="flex items-center justify-center gap-1.5">
                <StatusIcon state={e.needs_analysis_done ? 'ok' : 'missing'} />
                {e.adaptation_required && (
                  <Badge variant="info" appearance="light" size="sm">
                    Adaptation
                  </Badge>
                )}
              </div>
            </TableCell>
            <TableCell>
              <div className="flex justify-center">
                <StatusIcon
                  state={
                    !session.program.is_certifying ? 'na' : e.positioning_done ? 'ok' : 'missing'
                  }
                />
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {e.convocation_sent_on ? (
                formatDate(e.convocation_sent_on, 'd MMM')
              ) : (
                <span className="text-muted-foreground">Non envoyée</span>
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {e.agreement_signed_on ? (
                formatDate(e.agreement_signed_on, 'd MMM')
              ) : (
                <span className="text-destructive">Non signée</span>
              )}
            </TableCell>
            <TableCell>
              {started ? (
                <div className="flex items-center gap-2">
                  <Progress
                    value={percent(e.attendance_present, session.slots_signed)}
                    className="h-1.5 w-14"
                  />
                  <span className="text-xs whitespace-nowrap">
                    {e.attendance_present}/{session.slots_signed}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex justify-center">
                <StatusIcon state={!finished ? 'na' : e.assessments ? 'ok' : 'missing'} />
              </div>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {e.certificate_issued_on ? (
                formatDate(e.certificate_issued_on, 'd MMM')
              ) : (
                <span className={finished ? 'text-destructive' : 'text-muted-foreground'}>
                  {finished ? 'Non délivrée' : '—'}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Attendance({ session }: { session: SessionDetail }) {
  if (!session.slots.length) {
    return (
      <p className="text-muted-foreground py-4">
        Aucune demi-journée d&apos;émargement générée pour cette session.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Jour</TableHead>
          <TableHead>Demi-journée</TableHead>
          <TableHead>Présents</TableHead>
          <TableHead>Signature formateur</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {session.slots.map((slot) => {
          const past = slot.present + slot.signed > 0 || !!slot.trainer_signed_at;
          return (
            <TableRow key={slot.id}>
              <TableCell className="capitalize">{formatDate(slot.day, 'EEEE d MMMM')}</TableCell>
              <TableCell>{PERIOD_LABELS[slot.period]}</TableCell>
              <TableCell>
                {past ? (
                  `${slot.present}/${session.enrolled}`
                ) : (
                  <span className="text-muted-foreground">À venir</span>
                )}
              </TableCell>
              <TableCell>
                {slot.trainer_signed_at ? (
                  <span className="inline-flex items-center gap-1.5">
                    <StatusIcon state="ok" />
                    {formatDate(slot.trainer_signed_at, 'd MMM HH:mm')}
                  </span>
                ) : past ? (
                  <span className="inline-flex items-center gap-1.5 text-destructive">
                    <StatusIcon state="missing" />
                    Manquante
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function Documents({ session }: { session: SessionDetail }) {
  if (!session.documents.length) {
    return <p className="text-muted-foreground py-4">Aucun document rattaché.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Document</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Version</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {session.documents.map((doc) => (
          <TableRow key={doc.id}>
            <TableCell className="font-medium text-foreground">
              <span className="inline-flex items-center gap-2">
                <FileText className="size-4 text-muted-foreground" />
                {doc.title}
              </span>
            </TableCell>
            <TableCell>{DOCUMENT_KINDS[doc.kind] ?? doc.kind}</TableCell>
            <TableCell>v{doc.version}</TableCell>
            <TableCell>
              <Badge variant={doc.status === 'SIGNE' ? 'success' : 'outline'} appearance="light">
                {DOCUMENT_STATUS[doc.status] ?? doc.status}
              </Badge>
            </TableCell>
            <TableCell className="whitespace-nowrap">
              {formatDate(doc.signed_at ?? doc.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function SessionRecords({ session }: { session: SessionDetail | undefined }) {
  return (
    <Tabs defaultValue="enrollments" className="grow text-sm min-w-0">
      <TabsList
        variant="line"
        className="px-5 gap-6 bg-transparent [&_button]:border-b [&_button_svg]:size-4 [&_button]:text-secondary-foreground"
      >
        <TabsTrigger value="enrollments">
          <Users /> Inscrits
          {session && (
            <Badge variant="primary" size="xs">
              {session.enrollments.length}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="attendance">
          <CalendarCheck /> Émargements
        </TabsTrigger>
        <TabsTrigger value="documents">
          <FileText /> Documents
          {session && (
            <Badge variant="secondary" size="xs">
              {session.documents.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <ScrollArea className="w-full h-[calc(100vh-10rem)]">
        <div className="px-5 py-3">
          {!session ? (
            <div className="space-y-2.5">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <>
              <TabsContent value="enrollments">
                <Enrollments session={session} />
              </TabsContent>
              <TabsContent value="attendance">
                <Attendance session={session} />
              </TabsContent>
              <TabsContent value="documents">
                <Documents session={session} />
              </TabsContent>
            </>
          )}
        </div>
      </ScrollArea>
    </Tabs>
  );
}
