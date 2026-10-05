import {
  STATUS_DOT,
  STATUS_SOFT_BG,
  STATUS_TEXT,
  statusLabel,
  type AuditStatus,
  type StatusLabels,
} from './status';

export interface IndicatorVerdictProps {
  status: AuditStatus;
  indicatorLabel: string;
  note?: string;
  citation?: string;
  /** Libellés des statuts (par défaut ceux de la maquette). */
  labels?: StatusLabels;
}

/** Verdict d'un indicateur : statut, libellé, remarque éventuelle et preuve citée. */
export function IndicatorVerdict({
  status,
  indicatorLabel,
  note,
  citation,
  labels,
}: IndicatorVerdictProps) {
  return (
    <article className="rounded-xl border border-line bg-audit-surface p-5 font-inter-tight text-ink">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_SOFT_BG[status]} ${STATUS_TEXT[status]}`}
      >
        <span
          className={`size-2 rounded-full ${STATUS_DOT[status]}`}
          aria-hidden
        />
        {statusLabel(status, labels)}
      </span>
      <h3 className="mt-3 text-base font-semibold leading-snug">
        {indicatorLabel}
      </h3>
      {note && status !== 'ok' && (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${STATUS_SOFT_BG[status]} ${STATUS_TEXT[status]}`}
        >
          {note}
        </p>
      )}
      {note && status === 'ok' && (
        <p className="mt-3 text-sm text-ink-soft">{note}</p>
      )}
      {citation && (
        <p className="mt-4 border-t border-line pt-3 font-jetbrains text-xs text-ink-soft break-all">
          <span className="text-ink-soft">Preuve citée · </span>
          {citation}
        </p>
      )}
    </article>
  );
}
