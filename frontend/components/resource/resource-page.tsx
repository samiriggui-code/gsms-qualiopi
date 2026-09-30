'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Ellipsis, Eye, Pencil, Plus, Search, Settings2, Trash2, X } from 'lucide-react';
import { useCan } from '@/lib/permissions';
import { Row, useResourceList, useResourceMutations } from '@/lib/resource';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardFooter,
  CardHeader,
  CardHeading,
  CardTable,
  CardToolbar,
} from '@/components/ui/card';
import { DataGrid } from '@/components/ui/data-grid';
import { DataGridColumnVisibility } from '@/components/ui/data-grid-column-visibility';
import { DataGridPagination } from '@/components/ui/data-grid-pagination';
import { DataGridTable } from '@/components/ui/data-grid-table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { FacetFilter } from '@/components/facet-filter';
import { Content } from '@/components/layout/components/content';
import { CountedTabs } from './counted-tabs';
import { ContentHeader } from '@/components/layout/components/content-header';
import { ConfirmDialog } from './confirm-dialog';
import { ResourceFormSheet } from './resource-form-sheet';
import type { ResourceConfig } from './types';

// Page liste générique : en-tête, tableau (recherche, filtres, colonnes, pagination),
// actions par ligne, panneau de création/modification, confirmation de suppression.
export function ResourcePage<T extends Row>({ config }: { config: ResourceConfig<T> }) {
  const { data = [], isLoading, error } = useResourceList<T>(config.path);
  const { create, update, remove } = useResourceMutations<T>(config.path, config.labels);
  const can = useCan();
  const canWrite = can(config.permission);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleting, setDeleting] = useState<T | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState(config.tabs?.[0]?.id ?? '');
  const [facetValues, setFacetValues] = useState<Record<string, string[]>>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [sorting, setSorting] = useState<SortingState>(config.defaultSort ? [config.defaultSort] : []);

  // ?nouveau=1 (bouton « Nouveau » de la barre du haut) ouvre le formulaire
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (searchParams.get('nouveau') && canWrite) {
      setEditing(null);
      setSheetOpen(true);
      router.replace(pathname);
    }
  }, [searchParams, router, pathname, canWrite]);

  const openCreate = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (row: T) => {
    setEditing(row);
    setSheetOpen(true);
  };

  const columns = useMemo<ColumnDef<T>[]>(() => {
    const actions: ColumnDef<T> = {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div onClick={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" mode="icon" size="sm" aria-label="Actions">
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {config.detailHref && (
              <DropdownMenuItem asChild>
                <Link href={config.detailHref(row.original)}>
                  <Eye /> Voir la fiche
                </Link>
              </DropdownMenuItem>
            )}
            {canWrite && (
              <>
                <DropdownMenuItem onSelect={() => openEdit(row.original)}>
                  <Pencil /> Modifier
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row.original)}>
                  <Trash2 /> Supprimer
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      ),
      size: 56,
      enableSorting: false,
      enableHiding: false,
      enableResizing: false,
    };
    return config.detailHref || canWrite ? [...config.columns, actions] : config.columns;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, canWrite]);

  const [columnOrder, setColumnOrder] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    const tab = config.tabs?.find((t) => t.id === activeTab);
    return data.filter((row) => {
      if (tab && !tab.test(row)) return false;
      for (const facet of config.facets ?? []) {
        const selected = facetValues[facet.id];
        if (selected?.length && !selected.includes(String(facet.value(row) ?? ''))) return false;
      }
      return !search || config.search(row).toLowerCase().includes(search);
    });
  }, [data, activeTab, searchQuery, facetValues, config]);

  const table = useReactTable({
    columns,
    data: filtered,
    getRowId: (row) => row.id,
    state: { pagination, sorting, columnOrder },
    columnResizeMode: 'onChange',
    onColumnOrderChange: setColumnOrder,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <config.icon className="size-4 text-primary" />
          {config.title}
          {!isLoading && (
            <Badge variant="secondary" size="sm">
              {data.length}
            </Badge>
          )}
        </h1>
        {canWrite && (
          <Button size="sm" onClick={openCreate}>
            <Plus /> {config.newLabel}
          </Button>
        )}
      </ContentHeader>

      <Content className="block py-0">
        <DataGrid
          table={table}
          recordCount={filtered.length}
          isLoading={isLoading}
          emptyMessage={error ? `Chargement impossible : ${error.message}` : 'Aucun élément.'}
          onRowClick={(row) => (config.detailHref ? router.push(config.detailHref(row)) : canWrite && openEdit(row))}
          tableClassNames={{ bodyRow: 'group/row cursor-pointer' }}
          tableLayout={{
            dense: true,
            columnsPinnable: true,
            columnsResizable: true,
            columnsMovable: true,
            columnsVisibility: true,
          }}
        >
          <Card className="border-none shadow-none">
            {config.tabs && (
              <CountedTabs
                tabs={config.tabs.map((t) => ({ id: t.id, label: t.label, count: data.filter(t.test).length }))}
                value={activeTab}
                onChange={setActiveTab}
              />
            )}
            <CardHeader className="px-4 py-3">
              <CardHeading>
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <Search className="size-4 text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2" />
                    <Input
                      variant="sm"
                      placeholder="Rechercher..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="ps-9 w-52"
                    />
                    {searchQuery.length > 0 && (
                      <Button
                        mode="icon"
                        variant="ghost"
                        className="absolute end-1.5 top-1/2 -translate-y-1/2 h-6 w-6"
                        onClick={() => setSearchQuery('')}
                        aria-label="Effacer la recherche"
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                  {config.facets?.map((facet) => {
                    const values = Array.from(new Set(data.map((row) => String(facet.value(row) ?? ''))))
                      .filter(Boolean)
                      .sort();
                    return (
                      <FacetFilter
                        key={facet.id}
                        title={facet.title}
                        icon={facet.icon}
                        options={values.map((v) => {
                          const label = facet.options?.find((o) => o.value === v)?.label ?? v;
                          return {
                            value: v,
                            label,
                            searchText: label,
                            count: data.filter((row) => String(facet.value(row) ?? '') === v).length,
                          };
                        })}
                        selected={facetValues[facet.id] ?? []}
                        onChange={(selected) => setFacetValues((prev) => ({ ...prev, [facet.id]: selected }))}
                      />
                    );
                  })}
                </div>
              </CardHeading>
              <CardToolbar>
                <DataGridColumnVisibility
                  table={table}
                  trigger={
                    <Button size="sm" variant="outline">
                      <Settings2 />
                      Colonnes
                    </Button>
                  }
                />
              </CardToolbar>
            </CardHeader>
            <CardTable>
              <ScrollArea>
                <DataGridTable />
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardTable>
            <CardFooter className="px-4 py-0">
              <DataGridPagination className="py-1" sizes={[10, 25, 50, 100]} />
            </CardFooter>
          </Card>
        </DataGrid>
      </Content>

      <ResourceFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={editing ? `Modifier` : config.newLabel}
        icon={config.icon}
        fields={config.fields}
        row={editing}
        pending={create.isPending || update.isPending}
        onSubmit={(payload) =>
          editing ? update.mutateAsync({ id: editing.id, payload }) : create.mutateAsync(payload)
        }
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Confirmer la suppression"
        description={
          deleting
            ? (config.deleteMessage?.(deleting) ?? 'Cette suppression est définitive.')
            : ''
        }
        pending={remove.isPending}
        onConfirm={() =>
          deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
        }
      />
    </>
  );
}
