import { ScrollArea } from '@/components/ui/scroll-area';
import { SidebarDefaultNav } from './sidebar-default-nav';

// Hauteur prise sur le conteneur (barre latérale fixe ou volet mobile) : la zone défile de haut en bas
// dans les deux cas, avec une barre de défilement toujours visible.
export function SidebarDefaultContent() {
  return (
    <div className="grow min-h-0 flex flex-col">
      <ScrollArea type="always" className="grow min-h-0 h-full">
        <div className="py-3.5">
          <SidebarDefaultNav />
        </div>
      </ScrollArea>
    </div>
  );
}
