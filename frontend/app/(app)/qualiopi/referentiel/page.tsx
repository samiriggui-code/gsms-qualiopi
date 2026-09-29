'use client';

import { Info, ListChecks } from 'lucide-react';
import { useActiveReferential } from '@/lib/qualiopi/referentiel';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { IndicatorList } from './indicator-list';

export default function ReferentielPage() {
  const { data: referential } = useActiveReferential();

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <ListChecks className="size-4 text-primary" />
          Indicateurs
          {referential && (
            <Badge variant="primary" appearance="light" size="sm">
              {referential.code} {referential.version}
            </Badge>
          )}
          {referential && (
            <Tooltip>
              <TooltipTrigger>
                <Info className="size-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-sm">
                {referential.source_label}
              </TooltipContent>
            </Tooltip>
          )}
        </h1>
      </ContentHeader>
      <Content className="block py-0">
        <IndicatorList />
      </Content>
    </>
  );
}
