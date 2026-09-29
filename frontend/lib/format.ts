import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

// Dates ISO (« 2026-09-29 » ou horodatage) → affichage français.
export function formatDate(value: string | null | undefined, pattern = 'd MMM yyyy') {
  if (!value) return '';
  return format(parseISO(value), pattern, { locale: fr });
}

export function formatDateRange(start: string, end: string) {
  if (start === end) return formatDate(start);
  const s = parseISO(start);
  const e = parseISO(end);
  const sameYear = s.getFullYear() === e.getFullYear();
  return `${format(s, sameYear ? 'd MMM' : 'd MMM yyyy', { locale: fr })} → ${format(e, 'd MMM yyyy', { locale: fr })}`;
}

export function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}
