'use client';

import { indicatorNumber } from '@/lib/qualiopi/criteres';
import { useIndicators } from '@/lib/qualiopi/referentiel';

// Nom d'un indicateur à partir de son numéro (référentiel en vigueur) ; « Indicateur n » en attendant.
export function IndicatorName({ number }: { number: number }) {
  const { data } = useIndicators();
  return (
    <>
      {data?.find((i) => i.number === number)?.title ?? indicatorNumber(number)}
    </>
  );
}
