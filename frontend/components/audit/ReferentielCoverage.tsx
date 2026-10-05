export interface ReferentielCoverageProps {
  criteres: { id: string; count: number }[];
}

/** Couverture du référentiel : total des indicateurs et une colonne de carrés par critère. */
export function ReferentielCoverage({ criteres }: ReferentielCoverageProps) {
  const total = criteres.reduce((sum, c) => sum + c.count, 0);

  return (
    <section className="rounded-xl border border-line bg-audit-surface p-5 font-inter-tight text-ink">
      <p className="font-jetbrains text-xs tracking-widest text-ink-soft">
        COUVERTURE
      </p>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-4xl font-semibold tracking-tight">{total}</span>
        <span className="font-jetbrains text-xs tracking-widest text-ink-soft">
          INDICATEURS
        </span>
      </div>
      <ul className="mt-5 flex items-end gap-3">
        {criteres.map((c) => (
          <li
            key={c.id}
            className="flex flex-col items-center gap-2"
            aria-label={`${c.id} : ${c.count} indicateurs`}
          >
            <div className="flex flex-col-reverse gap-1">
              {Array.from({ length: c.count }, (_, i) => (
                <span key={i} className="size-3.5 rounded-[3px] bg-line" />
              ))}
            </div>
            <span className="font-jetbrains text-xs text-ink-soft">{c.id}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
