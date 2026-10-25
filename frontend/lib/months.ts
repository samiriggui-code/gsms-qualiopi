import { addMonths, format, startOfMonth } from 'date-fns';
import { fr } from 'date-fns/locale';

// Fenêtre de mois pour les courbes « par mois » : `from` mois avant (négatif) ou après le mois en cours,
// `count` mois. `key` (aaaa-mm) sert à ranger une date ISO, `period` est le libellé de l'axe.
export function monthWindow(from: number, count: number) {
  const first = addMonths(startOfMonth(new Date()), from);
  return Array.from({ length: count }, (_, i) => {
    const m = addMonths(first, i);
    return {
      key: format(m, 'yyyy-MM'),
      period: format(m, 'MMM yy', { locale: fr }),
    };
  });
}

// Nombre de dates ISO tombant dans le mois `key`.
export const countIn = (dates: (string | null | undefined)[], key: string) =>
  dates.filter((d) => d?.startsWith(key)).length;
