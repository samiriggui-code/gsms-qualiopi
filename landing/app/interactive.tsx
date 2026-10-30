"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { BrandLogo } from "./brand-logo";
import { Icon } from "./ui";
import { getThemeSnapshot, subscribeToTheme, toggleTheme } from "./theme";
import { headerIcons } from "../shared/header";
import { dictionaries, languages, appLoginUrl, phoneHref, type Lang } from "../content/i18n";
import type { FormationCategory } from "../content/school";

/** Événement envoyé par le menu « Formations » pour ouvrir un volet du catalogue. */
export const pricingTabEvent = "landing:pricing-tab";

function HeaderIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={headerIcons[name]} /></svg>;
}

function ThemeToggle({ lang }: { lang: Lang }) {
  const dark = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => false);
  const ui = dictionaries[lang].ui;
  const label = dark ? ui.toLight : ui.toDark;
  return <button className="wk-theme-toggle" type="button" role="switch" aria-checked={dark} aria-label={label} title={label} onClick={toggleTheme}><HeaderIcon name={dark ? "moon" : "sun"} /></button>;
}

type SubItem = { id: string; href: string; tab?: FormationCategory };
const trainingTabs: FormationCategory[] = ["surete", "incendie", "habilitation", "sst", "entreprise", "autres"];

// Même structure que le header de gsms-school-aps (NAV_IDS + SIDEBAR_SECTIONS).
const sections: { id: "training" | "trainers" | "school" | "help"; href: string; items: SubItem[] }[] = [
  { id: "training", href: "#pricing", items: trainingTabs.map(tab => ({ id: tab, href: "#pricing", tab })) },
  { id: "trainers", href: "#trainers", items: [{ id: "experts", href: "#trainers-formateur" }, { id: "pedagogical", href: "#trainers-pedagogique" }, { id: "hr", href: "#trainers-rh" }] },
  { id: "school", href: "#features", items: [{ id: "about", href: "#features" }, { id: "qualiopi", href: "#qualiopi" }, { id: "method", href: "#how-it-works" }, { id: "partners", href: "#trusted-brands" }, { id: "contact", href: "#contact" }] },
  { id: "help", href: "#faq", items: [{ id: "faq", href: "#faq" }, { id: "funding", href: "#pricing" }] },
];

export function Header({ lang }: { lang: Lang }) {
  const t = dictionaries[lang];
  const shell = t.shell;
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const label = (sectionId: string, itemId: string) => (shell.sidebar as Record<string, Record<string, string>>)[sectionId][itemId];

  return <header className="wk-header" onKeyDown={event => { if (event.key === "Escape" && open) { setOpen(false); menu.current?.focus(); } }}>
    <div className="wk-header-inner">
      <a className="wk-brand" href={`/${lang}/`} target="_self" aria-label={t.ui.home}><BrandLogo /></a>
      <nav id="main-navigation" className={`wk-navigation ${open ? "is-open" : ""}`} aria-label={shell.a11y.navTitle}>
        <a href="#main" onClick={() => setOpen(false)}>{shell.nav.home}</a>
        {sections.map(section => <div className="wk-nav-menu" key={section.id}>
          <a href={section.href} onClick={() => setOpen(false)}>{shell.nav[section.id]}</a>
          <span className="wk-nav-caret" aria-hidden="true"><HeaderIcon name="chevron" /></span>
          <div className="wk-nav-dropdown">
            {section.items.map(item => <a key={item.id} href={item.href} onClick={() => {
              if (item.tab) window.dispatchEvent(new CustomEvent(pricingTabEvent, { detail: item.tab }));
              setOpen(false);
            }}>{label(section.id, item.id)}</a>)}
          </div>
        </div>)}
        <div className="wk-mobile-actions">
          <a className="wk-pill" href={phoneHref} aria-label={shell.header.phoneAria}><Icon name="phone" /> {shell.header.phoneDisplay}</a>
          <a className="wk-pill" href={appLoginUrl}>{shell.header.signIn}</a>
          <a className="wk-pill wk-pill-primary" href="#preinscription" onClick={() => setOpen(false)}>{shell.cta.signup}</a>
        </div>
      </nav>
      <div className="wk-lang-switch" role="group" aria-label={t.ui.language}>{languages.map(code => <a key={code} href={`/${code}/`} hrefLang={code} aria-current={code === lang ? "true" : undefined}>{code.toUpperCase()}</a>)}</div>
      <ThemeToggle lang={lang} />
      <a className="wk-pill wk-header-phone" href={phoneHref} aria-label={shell.header.phoneAria}><Icon name="phone" /> {shell.header.phoneDisplay}</a>
      <a className="wk-pill wk-header-login" href={appLoginUrl}>{shell.header.signIn}</a>
      <a className="wk-pill wk-pill-primary wk-header-signup" href="#preinscription">{shell.cta.signup}</a>
      <button ref={menu} type="button" className="wk-menu-toggle" aria-label={open ? t.ui.closeNav : shell.a11y.openMenu} aria-expanded={open} aria-controls="main-navigation" onClick={() => setOpen(!open)}><HeaderIcon name={open ? "close" : "menu"} /></button>
    </div>
  </header>;
}
