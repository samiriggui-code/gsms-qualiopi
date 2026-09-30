'use client';

// Contenu du détail d'un indicateur (nom, énoncé, onglets Preuves / Écarts / Guide / version suivante),
// partagé par le carnet d'audit et le volet de la page Indicateurs.
import * as React from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CircleAlert,
  FileCheck2,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { Carnet, CarnetFiche } from '@/lib/gsms/carnet';
import { cn } from '@/lib/utils';
import { Badge, BadgeDot } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EVIDENCE_STATUS, Evolution, GuideBlock } from './fiche';

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function IndicatorBody({
  fiche,
  data,
  className,
}: {
  fiche: CarnetFiche;
  data: Carnet;
  className?: string;
}) {
  const upcoming = fiche.etat === 'A_VENIR';
  return (
    <div className={cn('space-y-4 p-4 lg:p-5', className)}>
      {fiche.titre && (
        <h2 className="text-base font-semibold text-foreground">
          {fiche.titre}
        </h2>
      )}
      {fiche.enonce && (
        <blockquote className="border-s-2 border-primary ps-3 text-sm text-foreground">
          {fiche.enonce}
        </blockquote>
      )}
      {(fiche.ponderation?.includes('majeure') ||
        fiche.nouvel_entrant_adapte) && (
        <div className="flex flex-wrap gap-1.5">
          {fiche.ponderation?.includes('majeure') && (
            <Badge size="sm" variant="destructive" appearance="light">
              NC majeure uniquement
            </Badge>
          )}
          {fiche.nouvel_entrant_adapte && (
            <Badge size="sm" variant="secondary" appearance="light">
              Adapté nouvel entrant
            </Badge>
          )}
        </div>
      )}

      <Tabs
        key={fiche.numero}
        defaultValue={upcoming ? 'evolution' : 'preuves'}
        className="space-y-4"
      >
        <TabsList
          variant="line"
          className="w-0 min-w-full overflow-x-auto [scrollbar-width:none] justify-start gap-4"
        >
          {!upcoming && (
            <>
              <TabsTrigger value="preuves">
                <FileCheck2 /> Preuves{' '}
                <span className="text-muted-foreground tabular-nums">
                  {fiche.preuves.total}
                </span>
              </TabsTrigger>
              <TabsTrigger value="ecarts">
                <CircleAlert /> Écarts{' '}
                <span className="text-muted-foreground tabular-nums">
                  {fiche.ecarts.length}
                </span>
              </TabsTrigger>
              {fiche.guide.length > 0 && (
                <TabsTrigger value="guide">Guide de lecture</TabsTrigger>
              )}
            </>
          )}
          {fiche.evolution && data.prochaine_version && (
            <TabsTrigger value="evolution">
              <Sparkles /> {data.prochaine_version.version}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="preuves" className="space-y-3">
          {fiche.preuves_attendues.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Attendues
              </div>
              <div className="flex flex-wrap gap-1.5">
                {fiche.preuves_attendues.map((p) => (
                  <Badge
                    key={p.type}
                    size="sm"
                    variant="outline"
                    className={cn(
                      p.disponibles === 0 &&
                        'border-red-300 text-red-700 dark:text-red-300',
                    )}
                  >
                    <BadgeDot
                      className={
                        p.disponibles ? 'bg-emerald-500' : 'bg-red-500'
                      }
                    />
                    {p.libelle} · {p.disponibles}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {fiche.preuves.liste.length ? (
            <div className="divide-y divide-border rounded-md border border-border">
              {fiche.preuves.liste.map((p) => (
                <div key={p.id} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 grow space-y-0.5">
                    <div className="text-sm text-foreground">{p.libelle}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.reference} · {p.type}
                      {p.produite_le ? ` · ${formatDate(p.produite_le)}` : ''}
                    </div>
                  </div>
                  <Badge
                    size="sm"
                    className={cn('shrink-0', EVIDENCE_STATUS[p.statut]?.color)}
                  >
                    {EVIDENCE_STATUS[p.statut]?.label ?? p.statut}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              {fiche.etat === 'NON_APPLICABLE'
                ? 'Indicateur sans objet ici.'
                : 'Aucune preuve reliée pour l’instant.'}
            </Empty>
          )}
          {fiche.preuves.total > fiche.preuves.liste.length && (
            <p className="text-xs text-muted-foreground">
              {fiche.preuves.total - fiche.preuves.liste.length} autres preuves
              dans la fiche indicateur.
            </p>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={`/qualiopi/referentiel/${fiche.numero}`}>
              Fiche indicateur complète <ArrowUpRight />
            </Link>
          </Button>
        </TabsContent>

        <TabsContent value="ecarts" className="space-y-2.5">
          {fiche.ecarts.length === 0 && <Empty>Aucun écart ouvert.</Empty>}
          {fiche.ecarts.map((e) => (
            <div
              key={e.id}
              className="rounded-md border border-border p-3 space-y-1.5"
            >
              <div className="flex items-start gap-2">
                <CircleAlert className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0 text-sm text-foreground">
                  {e.titre}
                  <div className="text-xs text-muted-foreground">
                    {e.reference} · gravité {e.gravite}
                  </div>
                </div>
              </div>
              {e.actions.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-1.5 ps-6 text-xs text-secondary-foreground"
                >
                  <Wrench className="size-3" /> {a.reference} ·{' '}
                  {a.statut_libelle} · échéance {formatDate(a.echeance)}
                </div>
              ))}
              {e.actions.length === 0 && (
                <div className="ps-6">
                  <Link
                    href="/qualiopi/capa?nouveau=1"
                    className="text-xs text-primary hover:underline"
                  >
                    Ouvrir une action corrective
                  </Link>
                </div>
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="guide" className="space-y-3">
          {fiche.guide.map((g) => (
            <GuideBlock key={g.section} {...g} />
          ))}
        </TabsContent>

        {data.prochaine_version && (
          <TabsContent value="evolution">
            <Evolution
              fiche={fiche}
              date={data.prochaine_version.en_vigueur_le}
              version={data.prochaine_version.version}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
