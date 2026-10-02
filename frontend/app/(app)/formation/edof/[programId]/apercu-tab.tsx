'use client';

import { useState } from 'react';
import { ExternalLink, FileText, Info } from 'lucide-react';
import { formatDate } from '@/lib/format';
import {
  programmeUrl,
  usePedagogy,
  usePublicPreview,
  type Fiche,
  type PedagogySummary,
} from '@/lib/gsms/edof';
import { Alert, AlertDescription, AlertIcon } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Refusal } from '@/components/gsms/refusal';

function Preview({
  programId,
  versionId,
}: {
  programId: string;
  versionId: string;
}) {
  const { data, error } = usePublicPreview(programId, versionId);
  if (error) return <Refusal error={error} />;
  if (!data) return <Skeleton className="h-48 w-full" />;
  const list = (items: string[]) =>
    items.length ? (
      <ul className="list-disc ps-4">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    ) : (
      <span className="text-muted-foreground">Non précisé</span>
    );
  return (
    <Card>
      <CardHeader className="flex-wrap gap-2">
        <CardTitle>{data.intitule}</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {data.duree_heures && (
            <Badge variant="outline">{data.duree_heures} h</Badge>
          )}
          {data.modalite && <Badge variant="outline">{data.modalite}</Badge>}
          {data.certification && (
            <Badge variant="outline">{data.certification.code}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {data.public && <p>{data.public}</p>}
        <div>
          <h4 className="font-semibold mb-1">Objectifs</h4>
          {list(data.objectifs)}
        </div>
        <div>
          <h4 className="font-semibold mb-1">Prérequis</h4>
          {list(data.prerequis)}
        </div>
        <div>
          <h4 className="font-semibold mb-1">Programme</h4>
          {list(data.modules.map((m) => `${m.code} — ${m.title}`))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <h4 className="font-semibold mb-1">Évaluation</h4>
            <p>
              {data.evaluation ?? (
                <span className="text-muted-foreground">Non précisée</span>
              )}
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Accessibilité</h4>
            <p>
              {data.accessibilite ?? (
                <span className="text-muted-foreground">Non précisée</span>
              )}
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Délai d’accès</h4>
            <p>
              {data.delai_acces ?? (
                <span className="text-muted-foreground">Non précisé</span>
              )}
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Tarif</h4>
            <p>
              {data.tarif_eur != null ? (
                `${data.tarif_eur.toLocaleString('fr-FR')} €`
              ) : (
                <span className="text-muted-foreground">Non précisé</span>
              )}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground border-t pt-2">
          Aucune mention « éligible CPF » : elle ne s’affichera que lorsqu’une
          offre publiée sur EDOF aura été constatée.
        </p>
      </CardContent>
    </Card>
  );
}

export function ApercuTab({ fiche }: { fiche: Fiche }) {
  const [selected, setSelected] = useState<string | undefined>(
    fiche.versions[0]?.id,
  );
  return (
    <div className="space-y-5">
      <Alert appearance="light" variant="info" size="sm">
        <AlertIcon>
          <Info />
        </AlertIcon>
        <AlertDescription>
          Documents et aperçu sont tirés d’une version validée, jamais de la
          fiche en cours d’édition. La vitrine publique de Form’SSI n’existe pas
          encore dans GSMS Qualiopi : ceci est un aperçu, rien n’est publié.
        </AlertDescription>
      </Alert>
      {fiche.versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune version validée : validez la fiche dans l’onglet Programme.
        </p>
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FileText className="size-4 text-primary" /> Versions validées
            </h3>
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {fiche.versions.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center gap-2 px-3 py-2"
                >
                  <span className="grow min-w-0 basis-56">
                    Version {v.version} — {v.validated_by},{' '}
                    {formatDate(v.validated_at)}
                    {v.note && (
                      <span className="block text-xs text-muted-foreground">
                        {v.note}
                      </span>
                    )}
                    <span className="block text-[11px] text-muted-foreground break-all">
                      Empreinte {v.sha256}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant={selected === v.id ? 'primary' : 'outline'}
                    onClick={() => setSelected(v.id)}
                  >
                    Aperçu
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <a
                      href={programmeUrl(fiche.program.id, v.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink /> Programme
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          {selected && (
            <Preview programId={fiche.program.id} versionId={selected} />
          )}
        </>
      )}
    </div>
  );
}

function rate(r: PedagogySummary['sessions'][number]['attendance']) {
  return r.rate == null
    ? '—'
    : `${r.rate.toLocaleString('fr-FR')} % (${r.present}/${r.expected})`;
}

export function SuiviTab({ programId }: { programId: string }) {
  const { data, error } = usePedagogy(programId);
  if (error) return <Refusal error={error} />;
  if (!data) return <Skeleton className="h-32 w-full" />;
  return (
    <div className="space-y-4">
      <ul className="list-disc ps-4 text-xs text-muted-foreground">
        {data.limits.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {data.sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune session de cette formation n’est encore enregistrée.
        </p>
      ) : (
        <ScrollArea>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-end">Stagiaires</TableHead>
                <TableHead>Présence émargée</TableHead>
                <TableHead className="text-end">Évalués</TableHead>
                <TableHead className="text-end">Attestations</TableHead>
                <TableHead className="text-end">Abandons</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.sessions.map((s) => (
                <TableRow key={s.session_id}>
                  <TableCell className="font-medium">{s.reference}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(s.start_date)} → {formatDate(s.end_date)}
                  </TableCell>
                  <TableCell className="text-end">{s.learners}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {rate(s.attendance)}
                  </TableCell>
                  <TableCell className="text-end">
                    {s.assessed_learners}
                  </TableCell>
                  <TableCell className="text-end">{s.certificates}</TableCell>
                  <TableCell className="text-end">{s.abandons}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  );
}
