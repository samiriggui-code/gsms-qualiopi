"use client";
// Fiche formation (panneau latéral) : reprise de CustomerDetailsSheet de gsms-school-aps,
// avec le contenu généré depuis le seed du catalogue (content/fiches.json).
import { useEffect, useState } from "react";
import fiches from "../content/fiches.json";
import type { Lang } from "../content/i18n";
import { Icon } from "./ui";
import { preinscriptionEvent } from "./preinscription";
import s from "./sheet.module.css";

type Fiche = (typeof fiches)["tfp-aps"] & { priceFrom?: number | null };
type Tab = "overview" | "program" | "prerequisites" | "financing" | "sessions" | "certification";

const labels = {
  fr: {
    details: "Détails de la formation", active: "Active", parcours: "Parcours", type: "Type", duration: "Durée", next: "Prochaine session",
    tabs: { overview: "Présentation", program: "Programme", prerequisites: "Prérequis", financing: "Financement", sessions: "Sessions", certification: "Certification" },
    tracks: { surete: "Sûreté", incendie: "Incendie", habilitation: "Habilitation électrique", sst: "Secourisme", entreprise: "Entreprise", autres: "Autres" },
    cpf: "Éligible CPF", qualiopi: "Certifié Qualiopi", delivery: "Modalité", audience: "Public", prereq: "Prérequis", outcome: "Débouché",
    units: "Unités", volume: "Volume", theory: "Théorie", practice: "Pratique", age: "Âge", french: "Français", auth: "Autorisation", record: "Casier",
    item: "Critère", detail: "Détail", importance: "Importance", price: "À partir de", quote: "Sur devis", primary: "Recommandé",
    noSession: "Les prochaines dates sont communiquées par l'organisme : contactez-nous.", exam: "Avec examen", initial: "Session initiale",
    request: "Demander ma préinscription", close: "Fermer", axes: "Axes de progression", alumni: "anciens stagiaires",
  },
  en: {
    details: "Course details", active: "Active", parcours: "Track", type: "Type", duration: "Duration", next: "Next session",
    tabs: { overview: "Overview", program: "Programme", prerequisites: "Prerequisites", financing: "Funding", sessions: "Sessions", certification: "Certification" },
    tracks: { surete: "Security", incendie: "Fire safety", habilitation: "Electrical clearance", sst: "First aid", entreprise: "Company", autres: "Other" },
    cpf: "CPF eligible", qualiopi: "Qualiopi certified", delivery: "Delivery", audience: "Audience", prereq: "Prerequisites", outcome: "Outcome",
    units: "Units", volume: "Volume", theory: "Theory", practice: "Practice", age: "Age", french: "French", auth: "Authorisation", record: "Record",
    item: "Criterion", detail: "Detail", importance: "Importance", price: "From", quote: "On quote", primary: "Recommended",
    noSession: "Upcoming dates are provided by the training centre: contact us.", exam: "With exam", initial: "Initial session",
    request: "Request pre-registration", close: "Close", axes: "Progress areas", alumni: "former trainees",
  },
} as const;

const tabOrder: Tab[] = ["overview", "program", "prerequisites", "financing", "sessions", "certification"];
const stepIcons: Record<string, string> = { "clipboard-check": "clipboard", "check-circle": "check", "graduation-cap": "graduation" };

export function FormationSheet({ slug, lang, onClose }: { slug: string | null; lang: Lang; onClose: () => void }) {
  const fiche = slug ? (fiches as unknown as Record<string, Fiche>)[slug] : undefined;
  // La clé remet l'onglet et l'accordéon à zéro à chaque nouvelle fiche.
  return fiche ? <SheetPanel key={slug} fiche={fiche} lang={lang} onClose={onClose} /> : null;
}

function SheetPanel({ fiche, lang, onClose }: { fiche: Fiche; lang: Lang; onClose: () => void }) {
  const l = labels[lang];
  const [tab, setTab] = useState<Tab>("overview");
  const [openModule, setOpenModule] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.documentElement.style.overflow = ""; };
  }, [onClose]);

  const c = fiche.complementaryDetails as Fiche["complementaryDetails"] & { portalDisplay?: { ratingScore: number; ratingCount: number; alumniCount: number } };
  const track = l.tracks[fiche.track as keyof typeof l.tracks] ?? fiche.track;

  return <div className={s.overlay} onClick={onClose}>
    <aside className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={event => event.stopPropagation()}>
      <header className={s.top}>
        <h2 id="sheet-title">{l.details} — {fiche.name}</h2>
        <button type="button" className={s.close} onClick={onClose} aria-label={l.close}><Icon name="close" /></button>
      </header>

      <div className={s.summary}>
        <div className={s.titleRow}><strong>{fiche.name}</strong><span className={s.success}>{l.active}</span></div>
        <p className={s.meta}>
          <span>{l.parcours} <b>{track}</b></span>
          <span>{l.type} <b>{fiche.tag}</b></span>
          <span>{l.duration} <b>{fiche.duration}</b></span>
          {fiche.nextSessionLabel && <span>{l.next} <b>{fiche.nextSessionLabel}</b></span>}
        </p>
      </div>

      <div className={s.body}>
        <div className={s.side}>
          {fiche.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={s.logo} src={fiche.logoUrl} alt={`${fiche.name} logo`} />
          )}
          <ul className={s.facts}>
            {fiche.cpfEligible && <li><Icon name="check" />{l.cpf}</li>}
            {fiche.qualiopiCertified && <li><Icon name="shieldCheck" />{l.qualiopi}</li>}
            <li><Icon name="building" />{l.delivery} : {c.deliveryModeLabel}</li>
            <li><Icon name="users" />{l.audience} : {c.targetAudience.value}</li>
            <li><Icon name="award" />{l.outcome} : {c.certificationSummary.outcomeLabel}</li>
          </ul>
          {c.portalDisplay && <p className={s.rating}><Icon name="star" /> {c.portalDisplay.ratingScore} ({c.portalDisplay.ratingCount}) · {c.portalDisplay.alumniCount} {l.alumni}</p>}
        </div>

        <div className={s.main}>
          <div className={s.tabs} role="tablist">
            {tabOrder.map(id => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{l.tabs[id]}</button>)}
          </div>

          {tab === "overview" && <div className={s.panel}>
            <div className={s.metrics}>{fiche.overviewMetrics.map(m => <div key={m.label} className={s.metric}>
              <span className={s.metricBadge} data-color={m.badgeColor}>{m.badgeLabel}</span>
              <strong>{m.total}</strong><span>{m.label}</span><small>{m.text}</small>
            </div>)}</div>
            <h3>{fiche.presentationTitle}</h3>
            {fiche.longDescription.split("\n\n").map(p => <p key={p}>{p}</p>)}
            <ul className={s.bullets}>{fiche.presentationBullets.map(b => <li key={b}><Icon name="check" />{b.replace(/^- /, "")}</li>)}</ul>
            <h4>{l.axes}</h4>
            <div className={s.chips}>{c.progressAxisLabels.map(a => <span key={a}>{a}</span>)}</div>
          </div>}

          {tab === "program" && <div className={s.panel}>
            <div className={s.strip}>
              <div><span>{l.units}</span><b>{fiche.unitsCount}</b></div>
              <div><span>{l.volume}</span><b>{fiche.volumeHoursLabel}</b></div>
              <div><span>{l.theory}</span><b>{fiche.theoryPercent}%</b></div>
              <div><span>{l.practice}</span><b>{fiche.practicePercent}%</b></div>
            </div>
            <div className={s.accordion}>{fiche.programModules.map(m => <div key={m.id} className={s.module} data-open={openModule === m.id}>
              <button type="button" aria-expanded={openModule === m.id} onClick={() => setOpenModule(openModule === m.id ? null : m.id)}>
                <span className={s.uv}>{m.id}</span><span>{m.title}</span><i aria-hidden="true" />
              </button>
              {openModule === m.id && <ul>{m.details.map(d => <li key={d}>{d}</li>)}</ul>}
            </div>)}</div>
          </div>}

          {tab === "prerequisites" && <div className={s.panel}>
            <div className={s.strip}>
              <div><span>{l.age}</span><b>{fiche.minAgeLabel}</b></div>
              <div><span>{l.french}</span><b>{fiche.frenchLevel}</b></div>
              <div><span>{l.auth}</span><b>{fiche.authorizationSummary}</b></div>
              <div><span>{l.record}</span><b>{fiche.criminalRecordRequirement}</b></div>
            </div>
            <div className={s.tableWrap}><table className={s.table}>
              <thead><tr><th>{l.item}</th><th>{l.detail}</th><th>{l.importance}</th></tr></thead>
              <tbody>{fiche.prerequisitesTable.map(r => <tr key={r.item}><td><b>{r.item}</b></td><td>{r.detail}</td><td><span className={s.pill}>{r.importance}</span></td></tr>)}</tbody>
            </table></div>
          </div>}

          {tab === "financing" && <div className={s.panel}>
            <div className={s.strip}>
              <div><span>{l.price}</span><b>{fiche.priceFrom ? `${fiche.priceFrom} €` : l.quote}</b></div>
              <div><span>CPF</span><b>{fiche.cpfEligible ? "✓" : "—"}</b></div>
              <div><span>Qualiopi</span><b>{fiche.qualiopiCertified ? "✓" : "—"}</b></div>
              <div><span>{l.tabs.financing}</span><b>{fiche.fundingBlocks.length}</b></div>
            </div>
            <div className={s.channels}>{fiche.fundingChannels.map(ch => <div key={ch.name} className={s.channel} data-primary={ch.isPrimary}>
              {ch.logo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={ch.logo} alt="" />
                : <span className={s.channelIcon}><Icon name="handshake" /></span>}
              <div><strong>{ch.name}</strong><span>{ch.details}</span></div>
              {ch.isPrimary && <em>{l.primary}</em>}
            </div>)}</div>
            <div className={s.blocks}>{fiche.fundingBlocks.map(b => <div key={b.label}><strong>{b.label}</strong><p>{b.info}</p></div>)}</div>
          </div>}

          {tab === "sessions" && <div className={s.panel}>
            {fiche.sessions.length === 0
              ? <p className={s.empty}>{l.noSession}</p>
              : <ul className={s.sessions}>{fiche.sessions.map(se => <li key={se.dateDisplayLabel}>
                <span className={s.sessionIcon}><Icon name="clipboard" /></span>
                <div><strong>{se.dateDisplayLabel}</strong><span>{se.venueBrandPrefix} · {se.location}</span></div>
                <span className={s.pill}>{se.sessionKind === "WITH_EXAM" ? l.exam : l.initial}</span>
              </li>)}</ul>}
          </div>}

          {tab === "certification" && <div className={s.panel}>
            <ol className={s.timeline}>{fiche.certificationSteps.map(st => <li key={st.title}>
              <span className={s.stepDot}><Icon name={stepIcons[st.iconKey ?? ""] ?? "check"} /></span>
              <div><div className={s.stepHead}><strong>{st.title}</strong><span className={s.pill}>{st.badge}</span></div><p>{st.description}</p></div>
            </li>)}</ol>
          </div>}
        </div>
      </div>

      <footer className={s.footer}>
        <button type="button" className={s.primary} onClick={() => { onClose(); window.dispatchEvent(new CustomEvent(preinscriptionEvent, { detail: fiche.slug })); }}>{l.request}</button>
        <button type="button" className={s.secondary} onClick={onClose}>{l.close}</button>
      </footer>
    </aside>
  </div>;
}
