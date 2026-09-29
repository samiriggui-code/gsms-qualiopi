'use client';

import { useState } from 'react';
import { BookOpenText, ChevronRight, ShieldCheck } from 'lucide-react';
import { IndicatorDetail, SCOPE_LABELS } from '@/lib/qualiopi/referentiel';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GuideText } from '@/components/guide-text';

function GuideSection({ title, body }: { title: string; body: string }) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
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
      <CollapsibleContent>
        <Card>
          <CardContent className="p-4">
            <GuideText body={body} />
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Controls({ indicator }: { indicator: IndicatorDetail }) {
  if (!indicator.controls.length) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Aucun contrôle automatisé : cet indicateur s&apos;évalue uniquement par
        revue humaine.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {indicator.controls.map((control) => (
        <Card key={control.key}>
          <CardContent className="p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="font-medium text-foreground">{control.label}</div>
              <Badge
                variant={control.severity === 'majeure' ? 'destructive' : 'warning'}
                appearance="light"
                className="shrink-0"
              >
                {control.severity === 'majeure' ? 'Majeure' : 'Mineure'}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <code className="rounded bg-muted px-1.5 py-0.5">{control.key}</code>
              <Badge className={cn(SCOPE_LABELS[control.scope].color)} size="sm">
                {SCOPE_LABELS[control.scope].label}
              </Badge>
              {control.new_entrant_mode === 'only' && (
                <Badge variant="warning" appearance="light" size="sm">
                  Nouveaux entrants uniquement
                </Badge>
              )}
              {control.guide_section && <span>Guide : {control.guide_section}</span>}
            </div>
            {control.remediation && (
              <div className="text-sm text-secondary-foreground">
                <span className="font-medium text-foreground">Remédiation : </span>
                {control.remediation}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function IndicatorRecords({
  indicator,
}: {
  indicator: IndicatorDetail | undefined;
}) {
  return (
    <Tabs defaultValue="guide" className="grow text-sm">
      <TabsList
        variant="line"
        className="px-5 gap-6 bg-transparent [&_button]:border-b [&_button_svg]:size-4 [&_button]:text-secondary-foreground"
      >
        <TabsTrigger value="guide">
          <BookOpenText /> Guide de lecture
        </TabsTrigger>
        <TabsTrigger value="controls">
          <ShieldCheck /> Contrôles
          {indicator && (
            <Badge variant="primary" size="xs">
              {indicator.controls.length}
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>

      <ScrollArea className="w-full h-[calc(100vh-10rem)]">
        <div className="px-5 py-4">
          {!indicator ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <TabsContent value="guide" className="space-y-4">
                {indicator.texts.map((text) => (
                  <GuideSection key={text.section} title={text.section} body={text.body} />
                ))}
              </TabsContent>
              <TabsContent value="controls">
                <Controls indicator={indicator} />
              </TabsContent>
            </>
          )}
        </div>
      </ScrollArea>
    </Tabs>
  );
}
