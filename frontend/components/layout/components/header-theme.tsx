import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export function HeaderTheme() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          mode="icon"
          className="text-white hover:text-white hover:bg-zinc-800"
          onClick={() => setTheme(dark ? 'light' : 'dark')}
          aria-label={dark ? 'Passer en mode clair' : 'Passer en mode sombre'}
        >
          {dark ? <Sun className="size-4 text-white" /> : <Moon className="size-4 text-white" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{dark ? 'Mode clair' : 'Mode sombre'}</TooltipContent>
    </Tooltip>
  );
}
