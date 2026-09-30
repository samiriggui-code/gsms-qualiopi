'use client';

import { PanelRightClose } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useLayout } from './layout-context';

export function ContentHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { setSidebarCollapse } = useLayout();
  return (
    <div className="bg-background flex items-center border-b lg:fixed top-[var(--header-height)] start-(--sidebar-width) end-0 in-data-[sidebar-collapsed]:start-(--sidebar-width-collapsed) z-[10] min-h-(--content-header-height) py-2 lg:py-0 lg:h-(--content-header-height) pe-[var(--removed-body-scroll-bar-size,0px)]">
      <div className="container-fluid flex items-center min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="hidden in-data-[sidebar-collapsed]:inline-flex -ms-2.5 me-1"
          onClick={() => setSidebarCollapse(false)}
        >
          <PanelRightClose />
        </Button>
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 grow min-w-0',
            className,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
