import Link from 'next/link';
import { Landmark, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLayout } from './layout-context';

const LINKS = [
  { title: 'Utilisateurs', icon: UserRound, path: '/administration/utilisateurs' },
  { title: 'Organisme', icon: Landmark, path: '/administration/organisme' },
];

function DefaultContent() {
  return (
    <div className="shrink-0 border-t border-border flex items-center justify-between h-(--sidebar-footer-height) gap-(--sidebar-space-x) px-(--sidebar-space-x) overflow-hidden">
      {LINKS.map((link, index) => (
        <div key={link.path} className="contents">
          {index > 0 && <Separator orientation="vertical" />}
          <Button variant="ghost" className="grow shrink-0" asChild>
            <Link href={link.path}>
              <link.icon />
              <span>{link.title}</span>
            </Link>
          </Button>
        </div>
      ))}
    </div>
  );
}

function CollapsedContent() {
  return (
    <div className="shrink-0 border-t border-border flex flex-col items-center justify-center gap-(--sidebar-space-x) h-(--sidebar-footer-collapsed-height)">
      {LINKS.map((link) => (
        <Tooltip key={link.path} delayDuration={500}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 shrink-0" asChild>
              <Link href={link.path}>
                <link.icon />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent align="center" side="right" sideOffset={20}>
            {link.title}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function SidebarDefaultFooter() {
  const { sidebarCollapse } = useLayout();

  return <>{sidebarCollapse ? <CollapsedContent /> : <DefaultContent />}</>;
}
