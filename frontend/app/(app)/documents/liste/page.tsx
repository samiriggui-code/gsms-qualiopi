'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  CircleDot,
  FileCheck2,
  FilePen,
  FileSignature,
  FileText,
  LayoutGrid,
  List,
  Plus,
  Search,
  Send,
  X,
} from 'lucide-react';
import { formatDate } from '@/lib/format';
import {
  DOC_STATUS_TONE,
  useDocuments,
  type DocStatus,
  type DocSummary,
} from '@/lib/gsms/documents';
import { useCan } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardHeading,
  CardToolbar,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DocumentSheet } from '@/components/documents/document-sheet';
import { NewDocumentDialog } from '@/components/documents/new-document-dialog';
import { FacetFilter } from '@/components/facet-filter';
import { Refusal } from '@/components/gsms/refusal';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { KpiRow } from '@/components/page/kpi-row';
import { PageHero } from '@/components/page/page-hero';
import { SectionEmpty } from '@/components/page/section-card';

// Liste des documents (modèle « liste ») : bandeau, 5 chiffres, carte de filtres, grille ou tableau.
// La fiche s'ouvre en grand panneau ; ?id= permet d'y arriver directement depuis l'accueil.
export default function DocumentsListPage() {
  const can = useCan();
  const { data: docs = [], isLoading, error } = useDocuments();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const openId = params.get('id');
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [view, setView] = useState<'grid' | 'list'>('list');

  const open = (id: string | null) =>
    router.replace(id ? `${pathname}?id=${id}` : pathname, { scroll: false });

  const count = (s: DocStatus) => docs.filter((d) => d.statut === s).length;
  const statusOptions = useMemo(
    () =>
      Array.from(new Set(docs.map((d) => d.statut))).map((s) => ({
        value: s,
        label: docs.find((d) => d.statut === s)!.statut_libelle,
        searchText: s,
        count: docs.filter((d) => d.statut === s).length,
      })),
    [docs],
  );
  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    docs.forEach((d) => d.client && seen.set(d.client.id, d.client.nom));
    return Array.from(seen).map(([id, nom]) => ({
      value: id,
      label: nom,
      searchText: nom,
      count: docs.filter((d) => d.client?.id === id).length,
    }));
  }, [docs]);

  const rows = docs.filter((d) => {
    const q = query.trim().toLowerCase();
    if (
      q &&
      ![d.reference, d.titre, d.client?.nom, d.client?.code]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (statuses.length && !statuses.includes(d.statut)) return false;
    if (clients.length && !clients.includes(d.client?.id ?? '')) return false;
    return true;
  });

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <FileText className="size-4 text-primary" />
          Tous les documents
          {!isLoading && (
            <Badge variant="secondary" size="sm">
              {docs.length}
            </Badge>
          )}
        </h1>
      </ContentHeader>
      <Content className="block">
        <div className="container-fluid space-y-5">
          <PageHero
            eyebrow="Documents"
            icon={FileText}
            title="Tous les documents"
            description="Chaque devis porte le code de son client et sa propre suite de numéros. La fiche montre ce qui reste à corriger avant la validation."
            actions={
              can('write_documents') && (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Nouveau devis
                </Button>
              )
            }
          />
          <KpiRow
            loading={isLoading}
            items={[
              {
                label: 'Documents',
                value: docs.length,
                subtitle: 'enregistrés',
                icon: FileText,
              },
              {
                label: 'Brouillons',
                value: count('BROUILLON'),
                subtitle: 'en préparation',
                icon: FilePen,
              },
              {
                label: 'En relecture',
                value: count('EN_RELECTURE'),
                subtitle: 'à valider',
                icon: FileSignature,
              },
              {
                label: 'Validés',
                value: count('VALIDE'),
                subtitle: 'prêts à envoyer',
                icon: FileCheck2,
              },
              {
                label: 'Envoyés',
                value: count('ENVOYE'),
                subtitle: 'au client',
                icon: Send,
              },
            ]}
          />
          {error ? (
            <Refusal error={error} />
          ) : (
            <Card className="overflow-hidden shadow-none">
              <CardHeader className="px-4 py-3">
                <CardHeading>
                  <div className="flex items-center gap-2.5 max-lg:flex-wrap">
                    <div className="relative max-sm:w-full">
                      <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        variant="sm"
                        placeholder="Rechercher..."
                        aria-label="Rechercher un document"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="w-52 ps-9 max-sm:w-full"
                      />
                      {query && (
                        <Button
                          mode="icon"
                          variant="ghost"
                          className="absolute end-1.5 top-1/2 h-6 w-6 -translate-y-1/2"
                          onClick={() => setQuery('')}
                          aria-label="Effacer la recherche"
                        >
                          <X />
                        </Button>
                      )}
                    </div>
                    <FacetFilter
                      title="Statut"
                      icon={CircleDot}
                      options={statusOptions}
                      selected={statuses}
                      onChange={setStatuses}
                    />
                    <FacetFilter
                      title="Client"
                      icon={Building2}
                      options={clientOptions}
                      selected={clients}
                      onChange={setClients}
                    />
                  </div>
                </CardHeading>
                <CardToolbar>
                  <div className="flex h-8.5 items-center gap-1 rounded-lg border bg-muted/50 p-0.5">
                    {(
                      [
                        ['grid', LayoutGrid, 'Vue en grille'],
                        ['list', List, 'Vue en liste'],
                      ] as const
                    ).map(([v, Icon, label]) => (
                      <Button
                        key={v}
                        type="button"
                        size="sm"
                        mode="icon"
                        variant={view === v ? 'secondary' : 'ghost'}
                        aria-label={label}
                        aria-pressed={view === v}
                        className={cn(
                          'h-7 w-7',
                          view === v && 'bg-background shadow-xs',
                        )}
                        onClick={() => setView(v)}
                      >
                        <Icon />
                      </Button>
                    ))}
                  </div>
                </CardToolbar>
              </CardHeader>
              {rows.length === 0 ? (
                <div className="border-t">
                  <SectionEmpty icon={FileText}>
                    {isLoading
                      ? 'Chargement…'
                      : docs.length
                        ? 'Aucun document ne correspond aux filtres.'
                        : 'Aucun document pour l’instant.'}
                  </SectionEmpty>
                </div>
              ) : view === 'grid' ? (
                <div className="grid gap-4 border-t p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {rows.map((d) => (
                    <DocCard key={d.id} doc={d} onOpen={() => open(d.id)} />
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto border-t">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2.5 text-start font-medium">
                          Document
                        </th>
                        <th className="px-3 py-2.5 text-start font-medium max-md:hidden">
                          Client
                        </th>
                        <th className="px-3 py-2.5 text-start font-medium max-lg:hidden">
                          Valable jusqu’au
                        </th>
                        <th className="px-3 py-2.5 text-end font-medium max-sm:hidden">
                          Version
                        </th>
                        <th className="px-4 py-2.5 text-end font-medium">
                          Statut
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((d) => (
                        <tr
                          key={d.id}
                          className="border-b border-dashed last:border-0 hover:bg-muted/40"
                        >
                          <td className="max-w-72 px-4 py-2.5">
                            <button
                              type="button"
                              onClick={() => open(d.id)}
                              className="block max-w-full truncate text-start font-medium text-foreground hover:text-primary"
                            >
                              {d.titre}
                            </button>
                            <span className="text-xs text-muted-foreground">
                              {d.reference} · {d.type_libelle}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 max-md:hidden">
                            {d.client?.nom ?? '—'}
                          </td>
                          <td
                            className={cn(
                              'whitespace-nowrap px-3 py-2.5 max-lg:hidden',
                              d.expire && 'text-destructive',
                            )}
                          >
                            {d.valide_jusqu_au
                              ? formatDate(d.valide_jusqu_au)
                              : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-end tabular-nums max-sm:hidden">
                            {d.version ? `v${d.version}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-end">
                            <Badge
                              size="sm"
                              className={DOC_STATUS_TONE[d.statut]}
                            >
                              {d.statut_libelle}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
          <p className="text-xs text-muted-foreground">
            Les clients et leur code se gèrent dans{' '}
            <Link
              href="/commercial/entreprises"
              className="text-primary hover:underline"
            >
              Entreprises clientes
            </Link>
            .
          </p>
        </div>
      </Content>
      <DocumentSheet id={openId} onClose={() => open(null)} />
      <NewDocumentDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function DocCard({ doc, onOpen }: { doc: DocSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-col gap-3 rounded-xl border bg-background p-4 text-start transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {doc.reference}
        </span>
        <Badge size="sm" className={DOC_STATUS_TONE[doc.statut]}>
          {doc.statut_libelle}
        </Badge>
      </div>
      <span className="line-clamp-2 font-semibold text-foreground">
        {doc.titre}
      </span>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Client</dt>
        <dd className="truncate text-foreground">{doc.client?.nom ?? '—'}</dd>
        <dt className="text-muted-foreground">Valable jusqu’au</dt>
        <dd className={cn('text-foreground', doc.expire && 'text-destructive')}>
          {doc.valide_jusqu_au ? formatDate(doc.valide_jusqu_au) : '—'}
        </dd>
        <dt className="text-muted-foreground">Version</dt>
        <dd className="text-foreground">
          {doc.version ? `v${doc.version}` : 'non validé'}
        </dd>
      </dl>
    </button>
  );
}
