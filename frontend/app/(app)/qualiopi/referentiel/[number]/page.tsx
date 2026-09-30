'use client';

import { use } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import { useIndicator, useIndicators } from '@/lib/qualiopi/referentiel';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { IndicatorDetails } from './indicator-details';
import { IndicatorRecords } from './indicator-records';

export default function IndicatorPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const number = Number(use(params).number);
  const { data: indicator, error } = useIndicator(number);
  const { data: all = [] } = useIndicators();

  const numbers = all.map((i) => i.number).sort((a, b) => a - b);
  const index = numbers.indexOf(number);
  const prev = index > 0 ? numbers[index - 1] : undefined;
  const next = index >= 0 && index < numbers.length - 1 ? numbers[index + 1] : undefined;

  return (
    <>
      <ContentHeader>
        <div className="flex items-center gap-2.5 min-w-0">
          <Button variant="ghost" mode="icon" size="sm" asChild>
            <Link href="/qualiopi/referentiel" aria-label="Retour aux indicateurs">
              <ListChecks className="text-primary" />
            </Link>
          </Button>
          {indicator ? (
            <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold min-w-0">
              <span className="truncate">{indicator.title}</span>
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                Indicateur {indicator.number}
              </span>
            </h1>
          ) : (
            <Skeleton className="h-5 w-80" />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            mode="icon"
            disabled={prev === undefined}
            asChild={prev !== undefined}
            aria-label="Indicateur précédent"
          >
            {prev !== undefined ? (
              <Link href={`/qualiopi/referentiel/${prev}`}>
                <ChevronLeft />
              </Link>
            ) : (
              <ChevronLeft />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            mode="icon"
            disabled={next === undefined}
            asChild={next !== undefined}
            aria-label="Indicateur suivant"
          >
            {next !== undefined ? (
              <Link href={`/qualiopi/referentiel/${next}`}>
                <ChevronRight />
              </Link>
            ) : (
              <ChevronRight />
            )}
          </Button>
        </div>
      </ContentHeader>
      <Content className="grid py-0">
        {error ? (
          <div className="p-5 text-sm text-destructive">{error.message}</div>
        ) : (
          <div className="grow min-w-0">
            <div className="p-0 flex flex-col lg:flex-row grow">
              <div className="flex lg:grow min-w-0 border-b lg:border-b-0 lg:border-e border-border">
                <IndicatorRecords indicator={indicator} />
              </div>
              <div className="flex min-w-0 lg:shrink-0 lg:w-[420px]">
                <IndicatorDetails indicator={indicator} />
              </div>
            </div>
          </div>
        )}
      </Content>
    </>
  );
}
