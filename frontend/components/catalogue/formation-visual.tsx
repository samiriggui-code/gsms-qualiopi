import {
  BookOpen,
  Building2,
  Flame,
  HeartPulse,
  ShieldCheck,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { formationVisual } from '@/lib/gsms/catalogue';
import { cn } from '@/lib/utils';

const TRACK: Record<string, { icon: LucideIcon; tint: string }> = {
  SURETE: { icon: ShieldCheck, tint: 'from-blue-600 to-indigo-800' },
  INCENDIE: { icon: Flame, tint: 'from-orange-500 to-red-700' },
  HABILITATION: { icon: Zap, tint: 'from-amber-400 to-yellow-600' },
  SST: { icon: HeartPulse, tint: 'from-emerald-500 to-teal-700' },
  ENTREPRISE: { icon: Building2, tint: 'from-slate-500 to-slate-700' },
  AUTRES: { icon: BookOpen, tint: 'from-violet-500 to-purple-700' },
};

export const trackIcon = (track: string) => (TRACK[track] ?? TRACK.AUTRES).icon;

// Visuel de la formation : celui de la fiche vitrine GSMS School, sinon un aplat de la filière avec le code.
export function FormationVisual({
  slug,
  track,
  code,
  className,
  compact,
}: {
  slug: string | null;
  track: string;
  code: string;
  className?: string;
  compact?: boolean;
}) {
  const src = formationVisual(slug);
  const { icon: Icon, tint } = TRACK[track] ?? TRACK.AUTRES;
  return (
    <div
      className={cn(
        'relative overflow-hidden bg-muted shrink-0',
        !src && `bg-gradient-to-br ${tint}`,
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-white">
          <Icon className={compact ? 'size-5' : 'size-9 opacity-90'} />
          {!compact && (
            <span className="text-sm font-semibold tracking-wide">{code}</span>
          )}
        </div>
      )}
    </div>
  );
}
