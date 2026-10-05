'use client';

// Preuves : tout ce que le moteur a reconnu comme preuve, avec son cycle de vie (détectée → exploitable →
// validée ou rejetée). La fiche s'ouvre dans un volet ; valider ou rejeter suit la décision de l'API.
import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileCheck2, Search } from 'lucide-react';
import { formatDate } from '@/lib/format';
import {
  EVIDENCE_TONE,
  useEvidenceList,
  type EvidenceRow,
  type EvidenceStatus,
} from '@/lib/gsms/preuves';
import { useIndicators } from '@/lib/qualiopi/referentiel';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { IndicatorName } from '@/components/qualiopi/indicator-name';
import { PreuveSheet } from './preuve-sheet';

const ALL = 'tous';

function EvidenceLine({
  row,
  onOpen,
}: {
  row: EvidenceRow;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-start grid grid-cols-1 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_11.5rem] gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-muted/40 focus-visible:bg-muted/40 outline-none"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {row.reference}
            </span>
            <span className="text-sm font-medium text-foreground truncate">
              {row.libelle}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {row.type_libelle}
            {row.problemes.length > 0 && (
              <span className="text-destructive">
                {' '}
                · {row.problemes.length} point
                {row.problemes.length > 1 ? 's' : ''} de forme
              </span>
            )}
          </p>
        </div>
        <div className="min-w-0 text-xs text-muted-foreground md:text-sm md:text-foreground truncate">
          {row.cible}
        </div>
        <div className="min-w-0 text-xs text-muted-foreground truncate">
          {row.indicateurs.length === 0 ? (
            'Aucun indicateur'
          ) : (
            <>
              <IndicatorName number={row.indicateurs[0]} />
              {row.indicateurs.length > 1 && ` + ${row.indicateurs.length - 1}`}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 md:justify-end">
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            {formatDate(row.produite_le)}
          </span>
          <Badge className={cn('shrink-0', EVIDENCE_TONE[row.statut])}>
            {row.statut_libelle}
          </Badge>
        </div>
      </button>
    </li>
  );
}

export default function PreuvesPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [statut, setStatut] = useState<EvidenceStatus | null>(
    (params.get('statut') as EvidenceStatus) || null,
  );
  const [type, setType] = useState<string>(ALL);
  const [indicateur, setIndicateur] = useState<string>(
    params.get('indicateur') ?? ALL,
  );
  const [recherche, setRecherche] = useState('');
  const openId = params.get('p');
  const open = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set('p', id);
    else next.delete('p');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const filters = useMemo(
    () => ({
      statut: statut ? [statut] : [],
      type: type === ALL ? undefined : type,
      indicateur: indicateur === ALL ? undefined : Number(indicateur),
      recherche,
    }),
    [statut, type, indicateur, recherche],
  );
  const { data, isLoading, error, isFetching } = useEvidenceList(filters);
  const indicators = useIndicators();
  const counts = data?.par_statut ?? [];
  const total = counts
    .filter((c) => c.statut !== 'RETIREE')
    .reduce((n, c) => n + c.nombre, 0);
  const toReview = counts.find((c) => c.statut === 'EXPLOITABLE')?.nombre ?? 0;

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <FileCheck2 className="size-4 text-primary" />
          Preuves
          {data && (
            <span className="text-xs font-normal text-muted-foreground">
              {total} en tout · {toReview} à relire
            </span>
          )}
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <p className="text-sm text-muted-foreground max-w-3xl">
            Le moteur reconnaît une preuve dans chaque donnée utile (analyse du
            besoin, émargement, qualification…). Une preuve exploitable compte
            déjà pour l’indicateur ; la relecture humaine la fait passer à «
            validée » ou la rejette avec un motif.
          </p>

          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filtrer par statut"
          >
            <Button
              size="sm"
              variant={statut === null ? 'primary' : 'outline'}
              onClick={() => setStatut(null)}
            >
              Toutes <span className="tabular-nums">{total}</span>
            </Button>
            {counts.map((c) => (
              <Button
                key={c.statut}
                size="sm"
                variant={statut === c.statut ? 'primary' : 'outline'}
                onClick={() => setStatut(statut === c.statut ? null : c.statut)}
                aria-pressed={statut === c.statut}
              >
                {c.libelle} <span className="tabular-nums">{c.nombre}</span>
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,20rem)_minmax(0,16rem)_minmax(0,18rem)] gap-3">
            <div className="relative">
              <Search className="size-4 text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2" />
              <Input
                variant="sm"
                placeholder="Référence, libellé, session…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                className="ps-9"
                aria-label="Rechercher une preuve"
              />
            </div>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger size="sm" aria-label="Type de preuve">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous les types</SelectItem>
                {data?.types.map((t) => (
                  <SelectItem key={t.type} value={t.type}>
                    {t.libelle}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={indicateur} onValueChange={setIndicateur}>
              <SelectTrigger size="sm" aria-label="Indicateur">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous les indicateurs</SelectItem>
                {indicators.data?.map((i) => (
                  <SelectItem key={i.number} value={String(i.number)}>
                    {i.number}. {i.short_title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Refusal error={error} />

          <Card>
            <CardContent className="p-0">
              <div className="hidden md:grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_11.5rem] gap-x-4 px-4 py-2.5 border-b border-border text-xs font-medium text-muted-foreground">
                <span>Preuve</span>
                <span>Pour</span>
                <span>Indicateurs</span>
                <span className="text-end">Produite le · statut</span>
              </div>
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : (
                <ul
                  className={cn(
                    'divide-y divide-border',
                    isFetching && 'opacity-70',
                  )}
                >
                  {data?.preuves.map((row) => (
                    <EvidenceLine
                      key={row.id}
                      row={row}
                      onOpen={() => open(row.id)}
                    />
                  ))}
                </ul>
              )}
              {data && data.preuves.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Aucune preuve ne correspond à ces filtres.
                </p>
              )}
              {data && data.affichees < data.total && (
                <p className="text-xs text-muted-foreground text-center py-3 border-t border-border">
                  {data.affichees} preuves affichées sur {data.total} : précisez
                  la recherche pour voir les autres.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </Content>

      <PreuveSheet id={openId} onClose={() => open(null)} />
    </>
  );
}
