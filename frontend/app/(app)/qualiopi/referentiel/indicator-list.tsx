'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Layers, ListFilter, Search, Settings2, X } from 'lucide-react';
import {
  applicabilityLabels,
  capitalize,
  evidenceTypeLabel,
  IndicatorSummary,
  SCOPE_LABELS,
  subcontractingLabel,
  useActiveReferential,
  useIndicators,
} from '@/lib/qualiopi/referentiel';
import { cn } from '@/lib/utils';
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
import { DataGridColumnHeader } from '@/components/ui/data-grid-column-header';
import { DataGridColumnVisibility } from '@/components/ui/data-grid-column-visibility';
import { DataGridPagination } from '@/components/ui/data-grid-pagination';
import { DataGridTable } from '@/components/ui/data-grid-table';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { FacetFilter } from '@/components/facet-filter';

const EMPTY: IndicatorSummary[] = [];

export function IndicatorList() {
  const { data: indicators = EMPTY, isLoading, error } = useIndicators();
  const { data: referential } = useActiveReferential();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'code', desc: false },
  ]);

  const criterionTitle = (n: number) =>
    referential?.criteria.find((c) => c.number === n)?.title ?? '';

  const columns = useMemo<ColumnDef<IndicatorSummary>[]>(
    () => [
      {
        accessorKey: 'number',
        id: 'code',
        header: ({ column }) => (
          <DataGridColumnHeader title="Code" visibility={true} column={column} />
        ),
        cell: ({ row }) => (
          <Link
            href={`/qualiopi/referentiel/${row.original.number}`}
            className="font-semibold text-foreground hover:text-primary"
          >
            {row.original.code}
          </Link>
        ),
        size: 80,
        meta: { headerClassName: 'ps-4', cellClassName: 'ps-4' },
        enableHiding: false,
      },
      {
        accessorKey: 'title',
        id: 'title',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Indicateur"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => (
          <Link
            href={`/qualiopi/referentiel/${row.original.number}`}
            className="font-medium text-foreground hover:text-primary truncate block"
            title={row.original.title}
          >
            {row.original.title}
          </Link>
        ),
        size: 380,
        enableHiding: false,
      },
      {
        accessorKey: 'criterion_number',
        id: 'criterion',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Critère"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => (
          <span title={criterionTitle(row.original.criterion_number)}>
            Critère {row.original.criterion_number}
          </span>
        ),
        size: 100,
      },
      {
        accessorKey: 'scope',
        id: 'scope',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Périmètre"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const scope = SCOPE_LABELS[row.original.scope];
          return <Badge className={cn('shrink-0', scope.color)}>{scope.label}</Badge>;
        },
        size: 110,
      },
      {
        accessorKey: 'ponderation',
        id: 'ponderation',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Pondération"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => capitalize(row.original.ponderation),
        size: 160,
      },
      {
        accessorKey: 'expected_evidence',
        id: 'evidence',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Preuves attendues"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => (
          <div className="flex truncate overflow-hidden gap-1.5">
            {row.original.expected_evidence.map((type) => (
              <Badge key={type} variant="outline" className="shrink-0">
                {evidenceTypeLabel(type)}
              </Badge>
            ))}
          </div>
        ),
        size: 260,
        enableSorting: false,
      },
      {
        accessorKey: 'controls_count',
        id: 'controls',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Contrôles"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => row.original.controls_count,
        size: 100,
      },
      {
        accessorKey: 'applicability',
        id: 'applicability',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Applicable à"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const labels = applicabilityLabels(row.original.applicability);
          return labels.length ? (
            labels.join(', ')
          ) : (
            <span className="text-muted-foreground">Toutes</span>
          );
        },
        size: 180,
        enableSorting: false,
      },
      {
        accessorKey: 'new_entrant_adapted',
        id: 'new_entrant',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Nouveaux entrants"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) =>
          row.original.new_entrant_adapted ? (
            <Badge variant="warning" appearance="light">
              Adapté
            </Badge>
          ) : (
            <span className="text-muted-foreground">Non</span>
          ),
        size: 150,
      },
      {
        accessorKey: 'subcontracting',
        id: 'subcontracting',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Sous-traitance"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => subcontractingLabel(row.original.subcontracting),
        size: 140,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [referential],
  );

  const [columnOrder, setColumnOrder] = useState<string[]>(
    columns.map((column) => column.id as string),
  );

  const filteredData = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    return indicators.filter((item) => {
      const matchesCriteria =
        !selectedCriteria.length ||
        selectedCriteria.includes(String(item.criterion_number));
      const matchesScope =
        !selectedScopes.length || selectedScopes.includes(item.scope);
      const matchesSearch =
        !search ||
        [
          item.code,
          item.title,
          ...item.expected_evidence.map(evidenceTypeLabel),
        ]
          .join(' ')
          .toLowerCase()
          .includes(search);
      return matchesCriteria && matchesScope && matchesSearch;
    });
  }, [indicators, searchQuery, selectedCriteria, selectedScopes]);

  const criterionOptions = useMemo(
    () =>
      (referential?.criteria ?? []).map((c) => ({
        value: String(c.number),
        label: (
          <span className="block truncate" title={c.title}>
            <span className="font-medium">Critère {c.number}</span>{' '}
            <span className="text-muted-foreground">{c.title}</span>
          </span>
        ),
        searchText: `critère ${c.number} ${c.title}`,
        count: indicators.filter((i) => i.criterion_number === c.number)
          .length,
      })),
    [referential, indicators],
  );

  const scopeOptions = useMemo(
    () =>
      (Object.keys(SCOPE_LABELS) as (keyof typeof SCOPE_LABELS)[]).map(
        (scope) => ({
          value: scope,
          label: (
            <Badge className={SCOPE_LABELS[scope].color}>
              {SCOPE_LABELS[scope].label}
            </Badge>
          ),
          searchText: SCOPE_LABELS[scope].label,
          count: indicators.filter((i) => i.scope === scope).length,
        }),
      ),
    [indicators],
  );

  const table = useReactTable({
    columns,
    data: filteredData,
    getRowId: (row) => String(row.number),
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
    <DataGrid
      table={table}
      recordCount={filteredData.length}
      isLoading={isLoading}
      emptyMessage={
        error
          ? `Impossible de charger le référentiel : ${error.message}`
          : 'Aucun indicateur ne correspond aux filtres.'
      }
      tableClassNames={{ bodyRow: 'group/row' }}
      tableLayout={{
        dense: true,
        columnsPinnable: true,
        columnsResizable: true,
        columnsMovable: true,
        columnsVisibility: true,
      }}
    >
      <Card className="border-none shadow-none">
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
              <FacetFilter
                title="Critère"
                icon={ListFilter}
                options={criterionOptions}
                selected={selectedCriteria}
                onChange={setSelectedCriteria}
              />
              <FacetFilter
                title="Périmètre"
                icon={Layers}
                options={scopeOptions}
                selected={selectedScopes}
                onChange={setSelectedScopes}
              />
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
          <DataGridPagination className="py-1" sizes={[10, 25, 50]} />
        </CardFooter>
      </Card>
    </DataGrid>
  );
}
