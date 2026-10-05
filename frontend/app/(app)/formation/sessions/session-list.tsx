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
import {
  BookOpen,
  CalendarClock,
  CalendarRange,
  CircleDot,
  DoorOpen,
  LayoutGrid,
  List,
  Search,
  Settings2,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { formatDateRange, percent } from '@/lib/format';
import { SESSION_STATUS } from '@/lib/gsms/labels';
import { useSessions } from '@/lib/gsms/sessions';
import type { SessionRow, SessionStatus } from '@/lib/gsms/types';
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
import { Progress } from '@/components/ui/progress';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { FacetFilter } from '@/components/facet-filter';
import type { KpiItem } from '@/components/page/kpi-row';
import { CountedTabs } from '@/components/resource/counted-tabs';
import { SessionCard } from './session-card';

const EMPTY: SessionRow[] = [];

// Onglets comptés par statut, comme la liste des commandes de la démo (store-inventory/order-list).
const TABS: { id: string; label: string; statuses: SessionStatus[] | null }[] =
  [
    { id: 'all', label: 'Toutes', statuses: null },
    { id: 'upcoming', label: 'À venir', statuses: ['PLANIFIEE', 'CONFIRMEE'] },
    { id: 'running', label: 'En cours', statuses: ['EN_COURS'] },
    { id: 'done', label: 'Terminées', statuses: ['TERMINEE', 'CLOTUREE'] },
    { id: 'cancelled', label: 'Annulées', statuses: ['ANNULEE'] },
  ];

function Ratio({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label?: string;
}) {
  if (!total) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Progress value={percent(value, total)} className="h-1.5 w-16 shrink-0" />
      <span className="text-xs text-secondary-foreground whitespace-nowrap">
        {value}/{total}
        {label ? ` ${label}` : ''}
      </span>
    </div>
  );
}

export function SessionList() {
  const { data: sessions = EMPTY, isLoading, error } = useSessions();

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'dates', desc: true },
  ]);
  const [track, setTrack] = useState('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  // Filières présentes dans les sessions (libellés fournis par l'API)
  const tracks = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of sessions)
      if (x.program_track)
        m.set(x.program_track, x.program_track_label ?? x.program_track);
    return Array.from(m, ([value, label]) => ({
      value,
      label,
      count: sessions.filter((x) => x.program_track === value).length,
    }));
  }, [sessions]);

  const columns = useMemo<ColumnDef<SessionRow>[]>(
    () => [
      {
        accessorKey: 'reference',
        id: 'reference',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Référence"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => (
          <Link
            href={`/formation/sessions/${row.original.id}`}
            className="font-semibold text-foreground hover:text-primary"
          >
            {row.original.reference}
          </Link>
        ),
        size: 170,
        meta: { headerClassName: 'ps-4', cellClassName: 'ps-4' },
        enableHiding: false,
      },
      {
        accessorFn: (row) => row.program_title ?? '',
        id: 'program',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Formation"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => (
          <Link
            href={`/formation/sessions/${row.original.id}`}
            className="flex items-center gap-2 min-w-0 hover:text-primary"
            title={row.original.program_title ?? ''}
          >
            <Badge variant="outline" className="shrink-0">
              {row.original.program_code}
            </Badge>
            <span className="truncate">{row.original.program_title}</span>
          </Link>
        ),
        size: 320,
        enableHiding: false,
      },
      {
        accessorKey: 'start_date',
        id: 'dates',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Dates"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {formatDateRange(row.original.start_date, row.original.end_date)}
          </span>
        ),
        size: 190,
      },
      {
        accessorKey: 'status',
        id: 'status',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Statut"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => {
          const status = SESSION_STATUS[row.original.status];
          return (
            <Badge className={cn('shrink-0', status.color)}>
              {status.label}
            </Badge>
          );
        },
        size: 120,
      },
      {
        accessorFn: (row) => row.trainer_name ?? '',
        id: 'trainer',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Formateur"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) =>
          row.original.trainer_name ? (
            <span className="whitespace-nowrap">
              {row.original.trainer_name}
            </span>
          ) : (
            <span className="text-destructive">À affecter</span>
          ),
        size: 180,
      },
      {
        accessorKey: 'learners_count',
        id: 'enrolled',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Inscrits"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) =>
          row.original.capacity ? (
            <Ratio
              value={row.original.learners_count}
              total={row.original.capacity}
            />
          ) : (
            row.original.learners_count
          ),
        size: 140,
      },
      {
        accessorKey: 'location',
        id: 'location',
        header: ({ column }) => (
          <DataGridColumnHeader
            title="Lieu"
            visibility={true}
            column={column}
          />
        ),
        cell: ({ row }) => (
          <span className="truncate block" title={row.original.location ?? ''}>
            {row.original.location}
            {row.original.room ? ` · ${row.original.room}` : ''}
          </span>
        ),
        size: 260,
      },
    ],
    [],
  );

  const [columnOrder, setColumnOrder] = useState<string[]>(
    columns.map((column) => column.id as string),
  );

  const filteredData = useMemo(() => {
    const search = searchQuery.trim().toLowerCase();
    const tabStatuses = TABS.find((t) => t.id === activeTab)?.statuses;
    return sessions.filter((item) => {
      if (tabStatuses && !tabStatuses.includes(item.status)) return false;
      if (track !== 'all' && item.program_track !== track) return false;
      const matchesStatus =
        !selectedStatuses.length || selectedStatuses.includes(item.status);
      const matchesProgram =
        !selectedPrograms.length || selectedPrograms.includes(item.program_id);
      const matchesSearch =
        !search ||
        [
          item.reference,
          item.program_title,
          item.program_code,
          item.trainer_name,
          item.location,
        ]
          .join(' ')
          .toLowerCase()
          .includes(search);
      return matchesStatus && matchesProgram && matchesSearch;
    });
  }, [
    sessions,
    activeTab,
    track,
    searchQuery,
    selectedStatuses,
    selectedPrograms,
  ]);

  const statusOptions = useMemo(
    () =>
      (Object.keys(SESSION_STATUS) as SessionStatus[]).map((status) => ({
        value: status,
        label: (
          <Badge className={SESSION_STATUS[status].color}>
            {SESSION_STATUS[status].label}
          </Badge>
        ),
        searchText: SESSION_STATUS[status].label,
        count: sessions.filter((s) => s.status === status).length,
      })),
    [sessions],
  );

  const programOptions = useMemo(() => {
    const programs = new Map(
      sessions.map((s) => [
        s.program_id,
        { code: s.program_code ?? '', title: s.program_title ?? '' },
      ]),
    );
    return Array.from(programs.entries())
      .sort((a, b) => a[1].title.localeCompare(b[1].title))
      .map(([id, p]) => ({
        value: id,
        label: <span className="block truncate">{p.title}</span>,
        searchText: `${p.code} ${p.title}`,
        count: sessions.filter((s) => s.program_id === id).length,
      }));
  }, [sessions]);

  const table = useReactTable({
    columns,
    data: filteredData,
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
    <DataGrid
      table={table}
      recordCount={filteredData.length}
      isLoading={isLoading}
      emptyMessage={
        error
          ? `Impossible de charger les sessions : ${error.message}`
          : 'Aucune session ne correspond aux filtres.'
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
      <Card className="overflow-hidden shadow-none">
        <CountedTabs
          tabs={TABS.map((tab) => ({
            id: tab.id,
            label: tab.label,
            count: tab.statuses
              ? sessions.filter((x) => tab.statuses!.includes(x.status)).length
              : sessions.length,
          }))}
          value={activeTab}
          onChange={(v) => {
            setActiveTab(v);
            setPagination((p) => ({ ...p, pageIndex: 0 }));
          }}
        />
        <CardHeader className="px-4 py-3">
          <CardHeading>
            <div className="flex items-center gap-2.5 max-lg:flex-wrap">
              <div className="relative max-sm:w-full">
                <Search className="size-4 text-muted-foreground absolute start-3 top-1/2 -translate-y-1/2" />
                <Input
                  variant="sm"
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ps-9 w-52 max-sm:w-full"
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
                title="Statut"
                icon={CircleDot}
                options={statusOptions}
                selected={selectedStatuses}
                onChange={setSelectedStatuses}
              />
              <FacetFilter
                title="Formation"
                icon={BookOpen}
                options={programOptions}
                selected={selectedPrograms}
                onChange={setSelectedPrograms}
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
            {view === 'list' && (
              <DataGridColumnVisibility
                table={table}
                trigger={
                  <Button size="sm" variant="outline">
                    <Settings2 />
                    Colonnes
                  </Button>
                }
              />
            )}
          </CardToolbar>
        </CardHeader>
        {tracks.length > 1 && (
          <div className="border-t border-border px-4 py-3">
            <div
              role="group"
              aria-label="Filtrer par filière"
              className="flex flex-wrap gap-1 rounded-lg border border-border bg-accent p-1 sm:inline-flex"
            >
              {[
                {
                  value: 'all',
                  label: 'Toutes filières',
                  count: sessions.length,
                },
                ...tracks,
              ].map((t) => (
                <Button
                  key={t.value}
                  type="button"
                  size="sm"
                  variant={track === t.value ? 'outline' : 'ghost'}
                  aria-pressed={track === t.value}
                  className={cn(
                    'h-8 gap-1.5',
                    track === t.value && 'bg-background shadow-xs',
                  )}
                  onClick={() => {
                    setTrack(t.value);
                    setPagination((p) => ({ ...p, pageIndex: 0 }));
                  }}
                >
                  {t.label}
                  <span className="text-xs text-secondary-foreground tabular-nums">
                    {t.count}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        )}

        {view === 'grid' ? (
          <div className="border-t border-border bg-muted/20 p-4">
            {table.getSortedRowModel().rows.length ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {table.getSortedRowModel().rows.map((r) => (
                  <SessionCard key={r.id} s={r.original} />
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {isLoading
                  ? 'Chargement…'
                  : error
                    ? `Impossible de charger les sessions : ${error.message}`
                    : 'Aucune session ne correspond aux filtres.'}
              </p>
            )}
          </div>
        ) : (
          <>
            <CardTable>
              <ScrollArea>
                <DataGridTable />
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardTable>

            <CardFooter className="px-4 py-0">
              <DataGridPagination className="py-1" sizes={[10, 25, 50, 100]} />
            </CardFooter>
          </>
        )}
      </Card>
    </DataGrid>
  );
}

const ACTIVE: SessionStatus[] = ['PLANIFIEE', 'CONFIRMEE', 'EN_COURS'];

// Cartes KPI de la page Sessions (GSMS School : SessionsSummary), comptées sur la liste de l'API.
export function sessionKpis(sessions: SessionRow[]): KpiItem[] {
  const active = sessions.filter((s) => ACTIVE.includes(s.status));
  const upcoming = sessions.filter(
    (s) => s.status === 'PLANIFIEE' || s.status === 'CONFIRMEE',
  );
  const seats = active.reduce((n, s) => n + (s.capacity ?? 0), 0);
  const noTrainer = active.filter((s) => !s.trainer_id).length;
  const noRoom = active.filter((s) => !s.room).length;
  return [
    {
      label: 'À venir',
      value: upcoming.length,
      subtitle: `dont ${upcoming.filter((s) => s.status === 'CONFIRMEE').length} confirmée(s)`,
      icon: CalendarRange,
    },
    {
      label: 'En cours',
      value: sessions.filter((s) => s.status === 'EN_COURS').length,
      subtitle: 'sessions démarrées',
      icon: CalendarClock,
    },
    {
      label: 'Inscrits',
      value: active.reduce((n, s) => n + s.learners_count, 0),
      subtitle: seats
        ? `sur ${seats} places (à venir et en cours)`
        : 'à venir et en cours',
      icon: Users,
    },
    {
      label: 'Sans formateur',
      value: noTrainer,
      subtitle: noTrainer
        ? 'à affecter (à venir et en cours)'
        : 'toutes les sessions sont couvertes',
      icon: UserX,
    },
    {
      label: 'Sans salle',
      value: noRoom,
      subtitle: noRoom
        ? 'salle non renseignée'
        : 'toutes les sessions ont une salle',
      icon: DoorOpen,
    },
  ];
}
