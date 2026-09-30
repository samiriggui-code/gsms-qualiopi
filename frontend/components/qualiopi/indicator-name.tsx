'use client';

import { indicatorNumber } from '@/lib/qualiopi/criteres';
import { useIndicators } from '@/lib/qualiopi/referentiel';

// Nom d'affichage d'un indicateur (nomenclature de l'organisme) à partir de son numéro ; « Indicateur n » en attendant.
export function IndicatorName({ number }: { number: number }) {
  const { data } = useIndicators();
  return (
    <>
      {data?.find((i) => i.number === number)?.short_title ??
        indicatorNumber(number)}
    </>
  );
}
