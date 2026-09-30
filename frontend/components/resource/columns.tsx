import { ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { formatDate } from '@/lib/format';
import type { Row } from '@/lib/resource';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { DataGridColumnHeader } from '@/components/ui/data-grid-column-header';
import type { Option } from './types';

type Accessor<T> = (row: T) => unknown;

// Colonne générique : titre, accès à la valeur, rendu optionnel.
export function col<T extends Row>(
  id: string,
  title: string,
  opts: {
    value?: Accessor<T>;
    cell?: (row: T) => ReactNode;
    size?: number;
    first?: boolean;
    hideable?: boolean;
  } = {},
): ColumnDef<T> {
  const value = opts.value ?? ((row: T) => row[id]);
  return {
    id,
    accessorFn: (row) => value(row) as string,
    header: ({ column }) => <DataGridColumnHeader title={title} visibility={true} column={column} />,
    cell: ({ row }) => {
      if (opts.cell) return opts.cell(row.original);
      const v = value(row.original);
      return v == null || v === '' ? <span className="text-muted-foreground">—</span> : <span className="truncate block">{String(v)}</span>;
    },
    size: opts.size ?? 180,
    meta: opts.first ? { headerClassName: 'ps-4', cellClassName: 'ps-4' } : undefined,
    enableHiding: opts.hideable ?? !opts.first,
  };
}

// Colonne principale en gras (nom, titre…)
export function titleCol<T extends Row>(id: string, title: string, value?: Accessor<T>, size = 240): ColumnDef<T> {
  return col<T>(id, title, {
    value,
    first: true,
    size,
    cell: (row) => <span className="font-medium text-foreground truncate block">{String((value ?? ((r: T) => r[id]))(row) ?? '')}</span>,
  });
}

export function dateCol<T extends Row>(id: string, title: string, opts: { late?: (row: T) => boolean } = {}): ColumnDef<T> {
  return col<T>(id, title, {
    size: 130,
    cell: (row) => {
      const v = row[id] as string | null;
      if (!v) return <span className="text-muted-foreground">—</span>;
      return <span className={cn('whitespace-nowrap', opts.late?.(row) && 'text-destructive font-medium')}>{formatDate(v)}</span>;
    },
  });
}

export function badgeCol<T extends Row>(
  id: string,
  title: string,
  options: (Option & { color?: string })[],
  value?: Accessor<T>,
): ColumnDef<T> {
  return col<T>(id, title, {
    value,
    size: 150,
    cell: (row) => {
      const v = String((value ?? ((r: T) => r[id]))(row) ?? '');
      if (!v) return <span className="text-muted-foreground">—</span>;
      const opt = options.find((o) => o.value === v);
      return <Badge className={cn('shrink-0', opt?.color)} variant={opt?.color ? undefined : 'outline'}>{opt?.label ?? v}</Badge>;
    },
  });
}

export function boolCol<T extends Row>(id: string, title: string, yes = 'Oui', no = 'Non'): ColumnDef<T> {
  return col<T>(id, title, {
    size: 120,
    cell: (row) =>
      row[id] ? (
        <Badge variant="success" appearance="light">{yes}</Badge>
      ) : (
        <span className="text-muted-foreground">{no}</span>
      ),
  });
}

export function countCol<T extends Row>(id: string, title: string): ColumnDef<T> {
  return col<T>(id, title, { size: 110, cell: (row) => <span className="tabular-nums">{Number(row[id] ?? 0)}</span> });
}

// Couleurs de badge réutilisées
export const TONE = {
  gray: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  blue: 'bg-secondary dark:bg-secondary/50 text-secondary-foreground',
  amber: 'text-[var(--color-warning-accent,var(--color-yellow-700))] bg-[var(--color-warning-soft,var(--color-yellow-100))] dark:bg-[var(--color-warning-soft,var(--color-yellow-950))] dark:text-[var(--color-warning-soft,var(--color-yellow-600))]',
  green: 'text-[var(--color-success-accent,var(--color-green-800))] bg-[var(--color-success-soft,var(--color-green-100))] dark:bg-[var(--color-success-soft,var(--color-green-950))] dark:text-[var(--color-success-soft,var(--color-green-600))]',
  violet: 'bg-secondary dark:bg-secondary/50 text-secondary-foreground',
  red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};
