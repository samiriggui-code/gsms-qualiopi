import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RecordCardContent } from './types';

// Carte de la vue en grille des pages liste (GSMS School : grille des collaborateurs, salles, inventaire) :
// pastille (initiales ou icône), titre, sous-titre, badges, puis métadonnées clé/valeur en pied de carte.
export function RecordCard({
  content,
  icon: Icon,
  onOpen,
}: {
  content: RecordCardContent;
  icon: LucideIcon;
  onOpen?: () => void;
}) {
  const { title, subtitle, monogram, badges, meta } = content;
  return (
    <div className="group flex h-full flex-col rounded-xl border border-border bg-background shadow-xs transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3 p-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-sm font-semibold text-secondary-foreground">
          {monogram ? (
            monogram.slice(0, 3).toUpperCase()
          ) : (
            <Icon className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          {onOpen ? (
            <button
              type="button"
              onClick={onOpen}
              className="block max-w-full truncate text-start text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
              title={title}
            >
              {title}
            </button>
          ) : (
            <p
              className="truncate text-sm font-semibold text-foreground"
              title={title}
            >
              {title}
            </p>
          )}
          {subtitle && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {subtitle}
            </p>
          )}
          {badges && (
            <div className="flex flex-wrap gap-1.5 pt-1">{badges}</div>
          )}
        </div>
      </div>
      {!!meta?.length && (
        <dl
          className={cn(
            'mt-auto grid gap-x-3 gap-y-2 border-t border-dashed border-border px-4 py-3 text-xs',
            meta.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
          {meta.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="text-muted-foreground">{m.label}</dt>
              <dd className="truncate font-medium text-foreground">
                {m.value ?? '—'}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// Initiales d'un nom (« Jean Dupont » → « JD »)
export function initials(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}
