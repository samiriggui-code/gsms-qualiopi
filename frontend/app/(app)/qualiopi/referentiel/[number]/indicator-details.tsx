'use client';

import { ReactNode, useState } from 'react';
import {
  Building2,
  ChevronRight,
  FileCheck2,
  Handshake,
  Layers,
  ListTree,
  Scale,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  applicabilityLabels,
  capitalize,
  evidenceTypeLabel,
  IndicatorDetail,
  SCOPE_LABELS,
  subcontractingLabel,
} from '@/lib/qualiopi/referentiel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Building2;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="col-span-2 pt-0.5">
        <div className="text-muted-foreground flex items-center gap-1.5">
          <Icon className="size-3.5 text-muted-foreground" />
          {label}
        </div>
      </div>
      <div className="col-span-3 text-mono">{children}</div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible className="space-y-2" open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="text-sm font-semibold [&:not(:hover)[data-state=open]]:bg-transparent hover:bg-accent ps-1.5 -ms-1.5"
        >
          <ChevronRight className="[[data-state=open]_&]:rotate-90" />
          {title}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

function Details({ indicator }: { indicator: IndicatorDetail }) {
  const scope = SCOPE_LABELS[indicator.scope];
  const applicability = applicabilityLabels(indicator.applicability);

  return (
    <div className="space-y-4">
      <Section title="Caractéristiques">
        <div className="grid grid-cols-5 gap-2.5">
          <Row icon={ListTree} label="Critère">
            <span className="font-medium">Critère {indicator.criterion_number}</span>
            <div className="text-muted-foreground text-xs mt-0.5">
              {indicator.criterion_title}
            </div>
          </Row>
          <Row icon={Layers} label="Périmètre">
            <Badge className={scope.color}>{scope.label}</Badge>
          </Row>
          <Row icon={Scale} label="Pondération">
            {capitalize(indicator.ponderation)}
          </Row>
          <Row icon={Target} label="Applicable à">
            {applicability.length ? applicability.join(', ') : 'Toutes les prestations'}
          </Row>
          <Row icon={Sparkles} label="Nouveaux entrants">
            {indicator.new_entrant_adapted ? (
              <Badge variant="warning" appearance="light">
                Adapté
              </Badge>
            ) : (
              'Non adapté'
            )}
          </Row>
          <Row icon={Handshake} label="Sous-traitance">
            {subcontractingLabel(indicator.subcontracting)}
          </Row>
        </div>
      </Section>

      <Separator />

      <Section title="Preuves attendues">
        {indicator.expected_evidence.length ? (
          <div className="flex flex-wrap gap-1.5">
            {indicator.expected_evidence.map((type) => (
              <Badge key={type} variant="outline">
                <FileCheck2 />
                {evidenceTypeLabel(type)}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Aucun type de preuve déclaré.</p>
        )}
      </Section>

      <Separator />

      <Section title="Revue humaine">
        <p className="text-secondary-foreground leading-relaxed">
          {indicator.human_review || 'Non renseignée.'}
        </p>
      </Section>

      {indicator.editorial_note && (
        <>
          <Separator />
          <Section title="Note éditoriale">
            <p className="text-muted-foreground leading-relaxed">
              {indicator.editorial_note}
            </p>
          </Section>
        </>
      )}
    </div>
  );
}

export function IndicatorDetails({
  indicator,
}: {
  indicator: IndicatorDetail | undefined;
}) {
  return (
    <Tabs defaultValue="details" className="grow text-sm">
      <TabsList
        variant="line"
        className="px-5 gap-6 bg-transparent max-lg:w-full max-lg:justify-start max-lg:overflow-x-auto max-lg:overflow-y-hidden max-lg:[scrollbar-width:none] [&_button]:border-b [&_button_svg]:size-3.5"
      >
        <TabsTrigger value="details">
          <Building2 /> Détails
        </TabsTrigger>
      </TabsList>
      <ScrollArea className="w-full lg:h-[calc(100vh-10rem)] [&_[data-radix-scroll-area-viewport]>div]:!block">
        <div className="px-5 py-2">
          <TabsContent value="details">
            {indicator ? (
              <Details indicator={indicator} />
            ) : (
              <div className="space-y-2.5 pt-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            )}
          </TabsContent>
        </div>
      </ScrollArea>
    </Tabs>
  );
}
