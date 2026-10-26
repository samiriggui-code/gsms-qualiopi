"use client";
// Formulaire de préinscription (panneau) : repris de CentralPreinscriptionSheet de gsms-school-aps.
// S'ouvre par tout lien « #preinscription » ou par l'événement preinscriptionEvent (formation présélectionnée).
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import fiches from "../content/fiches.json";
import type { Lang } from "../content/i18n";
import { preinscriptionMessages } from "../content/preinscription";
import { Icon } from "./ui";
import s from "./sheet.module.css";

export const preinscriptionEvent = "landing:preinscription";
const FLEXIBLE = "__session_flexible__";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Form = {
  civility: string; firstName: string; lastName: string; usageName: string; email: string; phone: string;
  birthDate: string; birthCity: string; birthDepartment: string; birthCountry: string; nationality: string;
  address: string; postalCode: string; city: string; formationSlug: string; fundingMode: string;
  sessionChoice: string; sessionLabel: string; currentSituation: string; experience: string; motivation: string;
};
const EMPTY: Form = {
  civility: "", firstName: "", lastName: "", usageName: "", email: "", phone: "", birthDate: "", birthCity: "",
  birthDepartment: "", birthCountry: "France", nationality: "", address: "", postalCode: "", city: "",
  formationSlug: "", fundingMode: "", sessionChoice: "", sessionLabel: "", currentSituation: "", experience: "", motivation: "",
};
const COMPLIANCE = ["hasValidIdentityDocument", "hasNoIncompatibleConviction", "meetsFormationPrerequisites", "acceptsInternalRules", "acknowledgesCnapsHandledBySchool", "certifiesInformationAccuracy"] as const;
type Compliance = Record<(typeof COMPLIANCE)[number], boolean>;
const FUNDING = ["cpf", "transition", "opco", "franceTravail", "selfFunded", "apprenticeship", "discuss"] as const;

type Fiche = { name: string; sessions: { dateDisplayLabel: string; location: string; sessionSubtitle: string }[] };
const catalogue = Object.entries(fiches as unknown as Record<string, Fiche>);

export function Preinscription({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState<{ slug: string; n: number } | null>(null);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href="#preinscription"]');
      if (!link) return;
      event.preventDefault();
      setOpen(prev => ({ slug: "", n: (prev?.n ?? 0) + 1 }));
    };
    const onEvent = (event: Event) => setOpen(prev => ({ slug: (event as CustomEvent<string>).detail ?? "", n: (prev?.n ?? 0) + 1 }));
    document.addEventListener("click", onClick);
    window.addEventListener(preinscriptionEvent, onEvent);
    return () => { document.removeEventListener("click", onClick); window.removeEventListener(preinscriptionEvent, onEvent); };
  }, []);
  const close = useCallback(() => setOpen(null), []);
  // La clé repart d'un formulaire vide à chaque ouverture.
  return open ? <PreinscriptionPanel key={`${open.slug}-${open.n}`} lang={lang} initialSlug={open.slug} onClose={close} /> : null;
}

function PreinscriptionPanel({ lang, initialSlug, onClose }: { lang: Lang; initialSlug: string; onClose: () => void }) {
  const p = preinscriptionMessages[lang].landing.preinscription;
  const f = p.fields;
  const [tab, setTab] = useState<"profile" | "compliance" | "project">("profile");
  const [form, setForm] = useState<Form>({ ...EMPTY, formationSlug: initialSlug });
  const [compliance, setCompliance] = useState<Compliance>(Object.fromEntries(COMPLIANCE.map(k => [k, false])) as Compliance);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.documentElement.style.overflow = ""; };
  }, [onClose]);

  const set = (key: keyof Form) => (event: { target: { value: string } }) => setForm(prev => ({ ...prev, [key]: event.target.value }));
  const bornInFrance = !form.birthCountry.trim() || /^france$/i.test(form.birthCountry.trim());
  const sessions = (fiches as unknown as Record<string, Fiche>)[form.formationSlug]?.sessions ?? [];

  const identityComplete = useMemo(() => Boolean(
    form.civility && form.firstName.trim() && form.lastName.trim() && EMAIL.test(form.email.trim()) && form.phone.trim().length >= 10
    && form.birthDate && form.birthCity.trim() && (bornInFrance ? form.birthDepartment.trim() : form.birthCountry.trim())
    && form.nationality.trim() && form.address.trim() && /^\d{5}$/.test(form.postalCode.trim()) && form.city.trim(),
  ), [form, bornInFrance]);
  const canSubmit = identityComplete && form.formationSlug && form.fundingMode && form.currentSituation.trim() && Object.values(compliance).every(Boolean);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setBanner(null);
    try {
      // Route publique de l'API (même origine : /api est relayé vers l'API en dev comme en production).
      const res = await fetch("/api/v1/public/preinscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          usageName: form.usageName || undefined,
          birthDepartment: bornInFrance ? form.birthDepartment : undefined,
          birthCountry: bornInFrance ? "France" : form.birthCountry,
          formationName: (fiches as unknown as Record<string, Fiche>)[form.formationSlug]?.name ?? form.formationSlug,
          sessionLabel: form.sessionChoice === FLEXIBLE ? form.sessionLabel.trim() || undefined : form.sessionChoice || undefined,
          ...compliance,
          sourceContext: "central-landing-cta",
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(json.message ?? p.toasts.saveFailed);
      setBanner({ type: "success", text: p.toasts.success });
    } catch (error) {
      setBanner({ type: "error", text: error instanceof Error ? error.message : p.toasts.errorGeneric });
    } finally {
      setSubmitting(false);
    }
  };

  const field = (key: keyof Form, label: string, props: Record<string, unknown> = {}) =>
    <label className={s.field}>{label}<input value={form[key]} onChange={set(key)} {...props} /></label>;

  return <div className={s.overlay} onClick={onClose}>
    <form className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="preinscription-title" onClick={event => event.stopPropagation()} onSubmit={submit} noValidate>
      <header className={s.top}>
        <div><h2 id="preinscription-title">{p.sheetTitle}</h2><p className={s.subtitle}>{p.sheetDescription}</p></div>
        <button type="button" className={s.close} onClick={onClose} aria-label={p.actions.cancel}><Icon name="close" /></button>
      </header>

      <div className={s.body}>
        <div className={s.main}>
          <div className={s.tabs} role="tablist">
            {(["profile", "compliance", "project"] as const).map(id => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{p.tabs[id]}</button>)}
          </div>
          <div className={s.panel}>
            {banner && <p role="status" className={s.banner} data-type={banner.type}>{banner.text}</p>}

            {tab === "profile" && <div className={s.formGrid}>
              <label className={s.field}>{f.civility.label}
                <select value={form.civility} onChange={set("civility")}>
                  <option value="">{f.civility.placeholder}</option>
                  <option value="M">{f.civility.monsieur}</option>
                  <option value="MME">{f.civility.madame}</option>
                </select>
              </label>
              {field("firstName", f.firstName.label, { placeholder: f.firstName.placeholder, autoComplete: "given-name" })}
              {field("lastName", f.lastName.label, { placeholder: f.lastName.placeholder, autoComplete: "family-name" })}
              {field("usageName", f.usageName.label, { placeholder: f.usageName.placeholder })}
              {field("email", f.email.label, { placeholder: f.email.placeholder, type: "email", inputMode: "email", autoComplete: "email" })}
              {field("phone", f.phone.label, { placeholder: f.phone.placeholder, type: "tel", inputMode: "tel", autoComplete: "tel" })}
              {field("birthDate", f.birthDate.label, { type: "date", autoComplete: "bday" })}
              {field("birthCity", f.birthCity.label, { placeholder: f.birthCity.placeholder })}
              {bornInFrance
                ? field("birthDepartment", f.birthDepartment.label, { placeholder: f.birthDepartment.placeholder })
                : field("birthCountry", f.birthCountry.label, { placeholder: f.birthCountry.placeholder })}
              {bornInFrance && field("birthCountry", f.birthCountry.label, { placeholder: f.birthCountry.placeholder })}
              {field("nationality", f.nationality.label, { placeholder: f.nationality.placeholder })}
              <label className={`${s.field} ${s.wide}`}>{f.address.label}<input value={form.address} onChange={set("address")} placeholder={f.address.placeholder} autoComplete="street-address" /></label>
              {field("postalCode", f.postalCode.label, { placeholder: f.postalCode.placeholder, inputMode: "numeric", autoComplete: "postal-code" })}
              {field("city", f.city.label, { placeholder: f.city.placeholder, autoComplete: "address-level2" })}
            </div>}

            {tab === "compliance" && <div className={s.checks}>
              {COMPLIANCE.map(key => <label key={key} className={s.check}>
                <input type="checkbox" checked={compliance[key]} onChange={event => setCompliance(prev => ({ ...prev, [key]: event.target.checked }))} />
                <span>{p.compliance[key]}</span>
              </label>)}
            </div>}

            {tab === "project" && <div className={s.formGrid}>
              <label className={`${s.field} ${s.wide}`}>{f.formation.label}
                <select value={form.formationSlug} onChange={event => setForm(prev => ({ ...prev, formationSlug: event.target.value, sessionChoice: "", sessionLabel: "" }))}>
                  <option value="">{f.formation.placeholder}</option>
                  {catalogue.map(([slug, fiche]) => <option key={slug} value={slug}>{fiche.name}</option>)}
                </select>
              </label>
              <label className={s.field}>{f.funding.label}
                <select value={form.fundingMode} onChange={set("fundingMode")}>
                  <option value="">{f.funding.placeholder}</option>
                  {FUNDING.map(key => <option key={key} value={p.funding[key]}>{p.funding[key]}</option>)}
                </select>
              </label>
              {field("currentSituation", f.currentSituation.label, { placeholder: f.currentSituation.placeholder })}
              {form.formationSlug && <label className={`${s.field} ${s.wide}`}>{f.session.label}
                <select value={form.sessionChoice} onChange={set("sessionChoice")}>
                  <option value="">{f.session.placeholder}</option>
                  <option value={FLEXIBLE}>{f.session.flexibleOption}</option>
                  {sessions.map(se => { const label = [se.dateDisplayLabel, se.location, se.sessionSubtitle].filter(Boolean).join(" · "); return <option key={label} value={label}>{label}</option>; })}
                </select>
              </label>}
              {form.sessionChoice === FLEXIBLE && <label className={`${s.field} ${s.wide}`}>{f.session.flexibleOption}<input value={form.sessionLabel} onChange={set("sessionLabel")} placeholder={f.session.flexiblePlaceholder} /></label>}
              <label className={`${s.field} ${s.wide}`}>{f.experience.label}<textarea rows={3} value={form.experience} onChange={set("experience")} placeholder={f.experience.placeholder} /></label>
              <label className={`${s.field} ${s.wide}`}>{f.motivation.label}<textarea rows={3} value={form.motivation} onChange={set("motivation")} placeholder={f.motivation.placeholder} /></label>
            </div>}
          </div>
        </div>
      </div>

      <footer className={s.footer}>
        <button type="button" className={s.secondary} onClick={onClose}>{p.actions.cancel}</button>
        <button type="submit" className={s.primary} disabled={!canSubmit || submitting}>{submitting ? p.actions.submitting : p.actions.submit}</button>
      </footer>
    </form>
  </div>;
}
