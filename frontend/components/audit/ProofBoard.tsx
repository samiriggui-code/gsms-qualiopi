import {
  STATUS_BORDER_LEFT,
  statusLabel,
  type AuditStatus,
  type StatusLabels,
} from './status';

export interface ProofBoardProps {
  columns: {
    critereId: string;
    items: { status: AuditStatus; title: string; detail: string }[];
  }[];
  /** Libellés des statuts lus par les lecteurs d'écran (par défaut ceux de la maquette). */
  labels?: StatusLabels;
}

/** Tableau des preuves : une colonne par critère, défilement horizontal. */
export function ProofBoard({ columns, labels }: ProofBoardProps) {
  return (
    <section className="font-inter-tight text-ink">
      <div
        className="relative flex gap-4 overflow-x-auto pb-2"
        tabIndex={0}
        aria-label="Preuves par critère"
      >
        {columns.map((col) => (
          <div
            key={col.critereId}
            className="w-64 shrink-0 rounded-xl bg-audit-bg p-3"
          >
            <h3 className="mb-3 flex items-center justify-between font-jetbrains text-xs text-ink-soft">
              <span>{col.critereId}</span>
              <span>{col.items.length}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {col.items.map((item, i) => (
                <li
                  key={i}
                  className={`rounded-md border border-line border-l-4 bg-audit-surface px-3 py-2 ${STATUS_BORDER_LEFT[item.status]}`}
                >
                  <span className="sr-only">
                    {statusLabel(item.status, labels)} :{' '}
                  </span>
                  <p className="text-sm font-semibold leading-snug">
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-xs wrap-anywhere text-ink-soft">
                    {item.detail}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
