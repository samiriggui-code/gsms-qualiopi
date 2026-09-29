'use client';

import { use } from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { SESSION_STATUS, useSession } from '@/lib/formation/sessions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { SessionDetails } from './session-details';
import { SessionRecords } from './session-records';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session, error } = useSession(id);

  return (
    <>
      <ContentHeader>
        <div className="flex items-center gap-2.5 min-w-0">
          <Button variant="ghost" mode="icon" size="sm" asChild>
            <Link href="/formation/sessions" aria-label="Retour aux sessions">
              <CalendarDays className="text-primary" />
            </Link>
          </Button>
          {session ? (
            <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold min-w-0">
              <span>{session.reference}</span>
              <span className="text-muted-foreground font-normal truncate">
                {session.program.title}
              </span>
              <Badge className={SESSION_STATUS[session.status].color}>
                {SESSION_STATUS[session.status].label}
              </Badge>
            </h1>
          ) : (
            <Skeleton className="h-5 w-96" />
          )}
        </div>
      </ContentHeader>
      <Content className="grid py-0">
        {error ? (
          <div className="p-5 text-sm text-destructive">{error.message}</div>
        ) : (
          <div className="grow overflow-x-auto">
            <div className="p-0 flex grow">
              <div className="flex grow min-w-0 border-e border-border">
                <SessionRecords session={session} />
              </div>
              <div className="flex shrink-0 w-[400px]">
                <SessionDetails session={session} />
              </div>
            </div>
          </div>
        )}
      </Content>
    </>
  );
}
