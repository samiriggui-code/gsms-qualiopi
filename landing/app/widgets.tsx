"use client";
// Parties interactives de la vitrine : mots du hero, vidéo, parcours en étapes,
// équipes, catalogue par volets et formulaire de contact.
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { dictionaries, heroVideoUrl, type Lang } from "../content/i18n";
import { formationCatalog, type FormationCategory } from "../content/school";
import { pricingTabEvent } from "./interactive";
import { Icon } from "./ui";
import { homeAssets } from "../shared/header";
import fiches from "../content/fiches.json";
import { FormationSheet } from "./formation-sheet";
import { equipeFaqContent } from "../content/equipe-faq";
import s from "./home.module.css";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Hero : mot qui tourne (WordRotate) ---------- */
export function RotatingWords({ words }: { words: readonly { text: string }[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % words.length), 2500);
    return () => clearInterval(timer);
  }, [words.length]);
  return <span className={s.rotating} aria-live="polite">
    <span key={index} className={s.rotatingWord} data-tone={index % 3}>{words[index].text}</span>
  </span>;
}

/* ---------- Hero : visuels en fondu + vidéo à la demande (HeroVideoDialog) ---------- */
const heroSlides = ["sst-formation", "incendie-ssi", "securite-privee", "extincteur"];

export function HeroVideo({ lang }: { lang: Lang }) {
  const t = dictionaries[lang];
  const [slide, setSlide] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (reducedMotion()) return;
    const timer = setInterval(() => setSlide(i => (i + 1) % heroSlides.length), 4500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return <div className={s.heroVideo}>
    <button type="button" className={s.heroVideoCover} onClick={() => setOpen(true)} aria-label={t.ui.playVideo}>
      {heroSlides.map((name, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={name} src={`${homeAssets}/hero/${name}.jpg`} alt={t.hero.videoSlides[index]?.alt ?? t.hero.videoThumbnailAlt} data-active={index === slide} loading={index === 0 ? "eager" : "lazy"} />
      ))}
      <span className={s.heroPlay}><span><Icon name="play" /></span></span>
    </button>
    {open && <div className={s.videoModal} role="dialog" aria-modal="true" aria-label={t.ui.videoTitle} onClick={() => setOpen(false)}>
      <div className={s.videoModalInner} onClick={event => event.stopPropagation()}>
        <button type="button" className={s.videoClose} onClick={() => setOpen(false)} aria-label={t.ui.closeVideo}><Icon name="close" /></button>
        <iframe src={heroVideoUrl} title={t.ui.videoTitle} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    </div>}
  </div>;
}

/* ---------- Formateurs : 4 équipes en onglets ---------- */
type Volet = "direction" | "formateur" | "pedagogique" | "rh";
const volets: Volet[] = ["direction", "formateur", "pedagogique", "rh"];
// Répartition des fiches de i18n/landing-content/trainers.ts dans les équipes (la source les lit dans la base).
const teamByVolet: Record<Volet, string[]> = {
  direction: ["dir-direction", "dir-adjoint", "dir-raf"],
  formateur: ["laurent-dubois", "sandrine-moreau", "marc-perrin", "nadia-khelifi", "jean-claude-renard", "olivier-gauthier"],
  pedagogique: ["claire-fontaine", "thomas-leroy", "emilie-bernard"],
  rh: ["karim-benali", "julie-marchand", "philippe-garnier"],
};
// Photos des fiches équipe (avatars des comptes, /media/avatars de la source).
const trainerPhoto: Record<string, number> = Object.fromEntries(
  Object.values(teamByVolet).flat().map((id, index) => [id, 6 + index]),
);
const badgeIcons: Record<Volet, string[]> = {
  direction: ["award", "users", "shield"],
  formateur: ["shield", "flame", "heart"],
  pedagogique: ["graduation", "library", "clipboard"],
  rh: ["userCog", "handshake", "building"],
};
const voletFromHash = (hash: string): Volet | null => {
  const match = /^#trainers-(direction|formateur|pedagogique|rh)$/.exec(hash);
  return match ? (match[1] as Volet) : null;
};

export function TrainersTabs({ lang }: { lang: Lang }) {
  const tr = dictionaries[lang].trainers;
  const [volet, setVolet] = useState<Volet>("direction");
  useEffect(() => {
    const sync = () => {
      const next = voletFromHash(window.location.hash);
      if (next) {
        setVolet(next);
        document.getElementById("trainers")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
      }
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const cards = tr.cards as Record<string, { name: string; title: string; certifications: string; bio: string }>;
  const teams = equipeFaqContent[lang];
  const members = teamByVolet[volet];
  return <>
    {/* Même barre d'onglets que le catalogue des formations */}
    <div className={s.segmented} role="tablist" aria-label={tr.tabsAriaLabel}>
      {volets.map(id => <button key={id} type="button" role="tab" aria-selected={volet === id} onClick={() => setVolet(id)}><span>{tr.tabs[id]}</span></button>)}
    </div>
    <p className={s.teamRole}>{teams.teams[volet].role}</p>
    {members.length === 0
      ? <p className={s.empty}>{tr.dynamic.empty}</p>
      : <div className={s.trainerGrid}>{members.map((id, index) => {
        const member = cards[id];
        return <article key={id} className={s.trainerCard}>
          <div className={s.trainerHead}>
            <span className={s.trainerAvatar}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/media/avatars/300-${trainerPhoto[id] ?? 1}.png`} alt={member.name} loading="lazy" />
            </span>
            <div><h3>{member.name}</h3><p>{member.title}</p></div>
          </div>
          <ul className={s.trainerCerts}>{member.certifications.split("·").map(cert => cert.trim()).filter(Boolean).map(cert => <li key={cert}>{cert}</li>)}</ul>
          <p className={s.trainerBio}>{member.bio}</p>
          <p className={s.trainerTeam}><Icon name={badgeIcons[volet][index % 3]} />{teams.teams[volet].tab}</p>
        </article>;
      })}</div>}
  </>;
}

/* ---------- Catalogue des formations par volets ---------- */
const tabs: FormationCategory[] = ["surete", "incendie", "habilitation", "sst", "entreprise", "autres"];
// Identifiants de la vitrine qui diffèrent du slug de la fiche (seed du catalogue).
const ficheSlug: Record<string, string> = { "guide-file": "guide-file-serre-file", "intra-entreprise": "intra-entreprise-securite" };

export function Catalogue({ lang }: { lang: Lang }) {
  const p = dictionaries[lang].pricing;
  const [track, setTrack] = useState<FormationCategory>("surete");
  useEffect(() => {
    const onTab = (event: Event) => {
      const tab = (event as CustomEvent<FormationCategory>).detail;
      if (tabs.includes(tab)) setTrack(tab);
    };
    window.addEventListener(pricingTabEvent, onTab);
    return () => window.removeEventListener(pricingTabEvent, onTab);
  }, []);
  const items = formationCatalog.filter(entry => entry.category === track);
  const [sheet, setSheet] = useState<string | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  return <>
    <div className={s.toggleGroup} role="tablist">
      {tabs.map(tab => <button key={tab} type="button" role="tab" aria-selected={track === tab} onClick={() => setTrack(tab)}>{p.tabs[tab]}</button>)}
    </div>
    <div className={s.pricingGrid}>
      {items.map(({ id }) => {
        const f = p.formations[id];
        const slug = ficheSlug[id] ?? id;
        const logo = (fiches as Record<string, { logoUrl: string | null }>)[slug]?.logoUrl;
        return <article key={id} className={s.pricingCard}>
          {logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img className={s.cardImage} src={logo} alt="" loading="lazy" />
            : <span className={s.cardImage} data-empty="true"><Icon name="graduation" /></span>}
          <header>
            <span className={s.outlineBadge}>{f.tag}</span>
            <h3>{f.name}</h3>
            <p>{f.description}</p>
            <strong>{p.card.durationPrefix} {f.duration}</strong>
          </header>
          <p className={s.cardLabel}>{p.card.modulesLabel}</p>
          <ul className={s.moduleList}>{f.modules.map(module => <li key={module}><Icon name="check" />{module}</li>)}</ul>
          <p className={s.cardLabel}>{p.card.outcomesLabel}</p>
          <ul className={s.outcomes}>{f.outcomes.map(outcome => <li key={outcome}>{outcome}</li>)}</ul>
          <button type="button" className={s.cardCta} onClick={() => setSheet(slug)}>{p.card.cta}</button>
        </article>;
      })}
    </div>
    <FormationSheet slug={sheet} lang={lang} onClose={closeSheet} />
  </>;
}

/* ---------- Formulaire de contact (même champs et règles que la source) ---------- */
type Field = "name" | "email" | "subject" | "message";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactForm({ lang }: { lang: Lang }) {
  const c = dictionaries[lang].contact;
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const submit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBanner(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    if (value("_trap")) return;
    const next: Partial<Record<Field, string>> = {};
    if (value("name").length < 2) next.name = c.validation.nameMin;
    if (!EMAIL.test(value("email"))) next.email = c.validation.emailInvalid;
    if (value("subject").length < 5) next.subject = c.validation.subjectMin;
    if (value("message").length < 10) next.message = c.validation.messageMin;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSubmitting(true);
    try {
      // Route publique de l'API (backend/app/handler/contact.py), même origine : /api est publié tel quel.
      const res = await fetch("/api/v1/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value("name"), email: value("email"), subject: value("subject"), message: value("message"), _trap: "" }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: unknown };
      if (!res.ok) {
        setBanner({ type: "error", text: typeof body.message === "string" ? body.message : c.toasts.errorGeneric });
        return;
      }
      setBanner({ type: "success", text: c.toasts.success });
      form.reset();
    } catch {
      setBanner({ type: "error", text: c.toasts.errorNetwork });
    } finally {
      setSubmitting(false);
    }
  }, [c]);

  // suppressHydrationWarning : certains navigateurs mobiles (remplissage automatique) ajoutent des
  // attributs aux champs (ex. _grcuniqueid) avant l'hydratation ; on ne les signale pas comme un écart.
  const field = (name: Field) => ({ suppressHydrationWarning: true, id: `contact-${name}`, name, "aria-invalid": errors[name] ? true : undefined, "aria-describedby": errors[name] ? `contact-${name}-error` : undefined });
  const error = (name: Field) => errors[name] && <span id={`contact-${name}-error`} className={s.fieldError} role="alert">{errors[name]}</span>;
  const clear = (name: Field) => () => { if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined })); if (banner) setBanner(null); };

  return <form className={s.formCard} onSubmit={submit} noValidate autoComplete="on" suppressHydrationWarning>
    {banner && <p role="status" className={s.banner} data-type={banner.type}>{banner.text}</p>}
    <div className={s.formGrid}>
      <label htmlFor="contact-name">{c.form.name.label}<input {...field("name")} autoComplete="name" enterKeyHint="next" placeholder={c.form.name.placeholder} onChange={clear("name")} />{error("name")}</label>
      <label htmlFor="contact-email">{c.form.email.label}<input {...field("email")} type="email" inputMode="email" autoComplete="email" enterKeyHint="next" placeholder={c.form.email.placeholder} onChange={clear("email")} />{error("email")}</label>
      <label htmlFor="contact-subject" className={s.formWide}>{c.form.subject.label}<input {...field("subject")} autoComplete="off" enterKeyHint="next" placeholder={c.form.subject.placeholder} onChange={clear("subject")} />{error("subject")}</label>
      <label htmlFor="contact-message" className={s.formWide}>{c.form.message.label}<textarea {...field("message")} rows={5} placeholder={c.form.message.placeholder} onChange={clear("message")} />{error("message")}</label>
      <input name="_trap" type="text" tabIndex={-1} autoComplete="off" hidden aria-hidden="true" suppressHydrationWarning />
    </div>
    <button type="submit" className={s.primary} disabled={submitting} suppressHydrationWarning>{submitting ? c.form.submitting : c.form.submit}</button>
  </form>;
}
