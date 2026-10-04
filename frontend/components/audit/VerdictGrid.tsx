import { STATUS_DOT, STATUS_LABEL, type AuditStatus } from './status';

export interface VerdictGridProps {
  criteres: { id: string; statuses: AuditStatus[] }[];
}

const ORDER: AuditStatus[] = ['ok', 'warn', 'ko'];

/** Verdict par indicateur, une colonne par critère, avec la légende et le décompte de chaque statut. */
export function VerdictGrid({ criteres }: VerdictGridProps) {
  const counts = ORDER.map((s) => ({
    status: s,
    count: criteres.reduce(
      (n, c) => n + c.statuses.filter((x) => x === s).length,
      0,
    ),
  }));

  return (
    <section className="rounded-xl border border-line bg-audit-surface p-5 font-inter-tight text-ink">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        {counts.map(({ status, count }) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              className={`size-2.5 rounded-full ${STATUS_DOT[status]}`}
              aria-hidden
            />
            {STATUS_LABEL[status]}{' '}
            <span className="font-jetbrains">{count}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-5 flex items-end gap-3">
        {criteres.map((c) => (
          <li key={c.id} className="flex flex-col items-center gap-2">
            <ul className="flex flex-col-reverse gap-1">
              {c.statuses.map((s, i) => (
                <li
                  key={i}
                  className={`size-3.5 rounded-[3px] ${STATUS_DOT[s]}`}
                  title={`${c.id} · indicateur ${i + 1} : ${STATUS_LABEL[s]}`}
                >
                  <span className="sr-only">{`${c.id} · indicateur ${i + 1} : ${STATUS_LABEL[s]}`}</span>
                </li>
              ))}
            </ul>
            <span className="font-jetbrains text-xs text-ink-soft">{c.id}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
