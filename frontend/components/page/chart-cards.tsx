'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, PieChart as PieIcon } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionCard, SectionEmpty } from './section-card';

// Graphiques des accueils de module (GSMS School : « Répartition » en donut, « Évolution » en aire).
// Ils ne calculent rien : ils dessinent les chiffres qu'on leur donne, et disent quand il n'y en a pas.

// Couleurs de série, dans l'ordre (mêmes teintes que le bandeau de cartes KPI).
export const SERIES_COLORS = [
  'var(--color-sky-500)',
  'var(--color-emerald-500)',
  'var(--color-amber-500)',
  'var(--color-violet-500)',
  'var(--color-rose-500)',
  'var(--color-slate-400)',
];

export interface Slice {
  key: string;
  label: string;
  value: number;
  color?: string;
}

export function DonutCard({
  title,
  subtitle,
  icon,
  totalLabel,
  slices,
  loading,
  empty = 'Aucune donnée à répartir pour l’instant.',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  totalLabel: string;
  slices: Slice[];
  loading?: boolean;
  empty?: string;
}) {
  const data = slices
    .filter((s) => s.value > 0)
    .map((s, i) => ({
      ...s,
      color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length],
    }));
  const total = data.reduce((sum, s) => sum + s.value, 0);
  const config = Object.fromEntries(
    data.map((s) => [s.key, { label: s.label, color: s.color }]),
  ) satisfies ChartConfig;

  return (
    <SectionCard
      title={title}
      subtitle={subtitle}
      icon={icon ?? PieIcon}
      contentClassName="flex flex-1 items-center justify-center"
      footer={
        data.length > 0 &&
        data.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-2 text-2xs font-bold uppercase tracking-tight text-muted-foreground"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
            <span className="rounded border border-border bg-background px-1.5 py-0.5 text-foreground shadow-xs tabular-nums">
              {s.value}
            </span>
          </span>
        ))
      }
    >
      {loading ? (
        <Skeleton className="size-52 rounded-full" />
      ) : total === 0 ? (
        <SectionEmpty icon={PieIcon}>{empty}</SectionEmpty>
      ) : (
        <div
          role="img"
          aria-label={`${total} ${totalLabel} : ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}
          className="flex w-full justify-center"
        >
          <ChartContainer
            aria-hidden
            config={config}
            className="aspect-square w-full max-w-60"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent nameKey="key" hideLabel />}
              />
              <Pie
                rootTabIndex={-1}
                data={data}
                dataKey="value"
                nameKey="key"
                innerRadius="68%"
                outerRadius="100%"
                strokeWidth={0}
                paddingAngle={data.length > 1 ? 2 : 0}
              >
                {data.map((s) => (
                  <Cell key={s.key} fill={s.color} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !('cx' in viewBox)) return null;
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) - 6}
                          className="fill-foreground text-2xl font-bold"
                        >
                          {total}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 16}
                          className="fill-muted-foreground text-xs"
                        >
                          {totalLabel}
                        </tspan>
                      </text>
                    );
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        </div>
      )}
    </SectionCard>
  );
}

export interface Serie {
  key: string;
  label: string;
  color?: string;
}

// Courbe par période (mois en général) : une ou plusieurs séries, valeurs entières.
export function EvolutionCard({
  title,
  subtitle,
  icon,
  toolbar,
  series,
  points,
  loading,
  empty = 'Pas encore de données sur la période.',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  toolbar?: ReactNode;
  series: Serie[];
  points: ({ period: string } & Record<string, number | string>)[];
  loading?: boolean;
  empty?: string;
}) {
  const colored = series.map((s, i) => ({
    ...s,
    color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length],
  }));
  const config = Object.fromEntries(
    colored.map((s) => [s.key, { label: s.label, color: s.color }]),
  ) satisfies ChartConfig;
  const hasData = points.some((p) => colored.some((s) => Number(p[s.key]) > 0));

  return (
    <SectionCard
      title={title}
      subtitle={subtitle}
      icon={icon ?? BarChart3}
      toolbar={toolbar}
      footer={
        hasData &&
        colored.length > 1 &&
        colored.map((s) => (
          <span
            key={s.key}
            className="flex items-center gap-2 text-2xs font-bold uppercase tracking-tight text-muted-foreground"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        ))
      }
    >
      {loading ? (
        <Skeleton className="h-[280px] w-full" />
      ) : !hasData ? (
        <SectionEmpty icon={BarChart3}>{empty}</SectionEmpty>
      ) : (
        <div
          role="img"
          aria-label={points
            .map(
              (p) =>
                `${p.period} : ${colored.map((c) => `${c.label} ${p[c.key]}`).join(', ')}`,
            )
            .join(' ; ')}
        >
          <ChartContainer
            aria-hidden
            config={config}
            className="aspect-auto h-[280px] w-full"
          >
            <AreaChart
              data={points}
              margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
            >
              <defs>
                {colored.map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`fill-${s.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="10%" stopColor={s.color} stopOpacity={0.4} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0.04} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid
                vertical={false}
                strokeDasharray="5 5"
                className="stroke-border"
              />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" />}
              />
              {colored.map((s) => (
                <Area
                  key={s.key}
                  dataKey={s.key}
                  type="monotone"
                  stroke={s.color}
                  strokeWidth={2.5}
                  fill={`url(#fill-${s.key})`}
                />
              ))}
            </AreaChart>
          </ChartContainer>
        </div>
      )}
    </SectionCard>
  );
}
