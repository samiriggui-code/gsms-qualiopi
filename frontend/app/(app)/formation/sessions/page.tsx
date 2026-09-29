'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Content } from '@/components/layout/components/content';
import { ContentHeader } from '@/components/layout/components/content-header';
import { NewSessionSheet } from './new-session-sheet';
import { SessionList } from './session-list';

export default function SessionsPage() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // ?nouveau=1 (bouton « Nouveau » de la barre du haut, raccourci de la sidebar) ouvre le formulaire
  useEffect(() => {
    if (searchParams.get('nouveau')) {
      setSheetOpen(true);
      router.replace(pathname);
    }
  }, [searchParams, router, pathname]);

  return (
    <>
      <ContentHeader>
        <h1 className="inline-flex items-center gap-2.5 text-sm font-semibold">
          <CalendarDays className="size-4 text-primary" />
          Sessions
        </h1>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          <Plus /> Nouvelle session
        </Button>
      </ContentHeader>
      <Content className="block py-0">
        <SessionList />
      </Content>
      <NewSessionSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </>
  );
}
