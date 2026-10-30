import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { BrandLogo } from "../brand-logo";
import { Icon, initials } from "../ui";
import { Header } from "../interactive";
import { Preinscription } from "../preinscription";
import { Catalogue, ContactForm, HeroVideo, RotatingWords, TrainersTabs } from "../widgets";
import { dictionaries, isLang, languages, contactEmail, phoneHref, type Lang } from "../../content/i18n";
import { homeAssets } from "../../shared/header";
import { qualiopiContent } from "../../content/qualiopi";
import { parcoursContent } from "../../content/parcours";
import { atoutsContent } from "../../content/atouts";
import { equipeFaqContent } from "../../content/equipe-faq";
import s from "../home.module.css";

// Vitrine d'organisme de formation, dans l'ordre de lecture d'un futur stagiaire :
// hero, certifications et financeurs, formations, déroulé du parcours, atouts,
// engagement qualité (moteur GSMS Qualiopi), équipe, témoignages, FAQ, appel à action, contact.

export function generateStaticParams() {
  return languages.map(lang => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = dictionaries[lang];
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: { languages: Object.fromEntries(languages.map(code => [code, `/${code}/`])) },
  };
}

const partnerLogos = [
  ["Qualiopi", "qualiopi"], ["CNAPS", "cnaps"], ["Mon Compte Formation", "mon-compte-formation"], ["France Travail", "france-travail"],
  ["OPCO", "opco"], ["SSIAP 1", "ssiap-1"], ["SSIAP 2", "ssiap-2"], ["SST", "sst"], ["Titre APS", "titre-aps"], ["MAC APS", "mac-aps"],
] as const;

const heroPeople = ["Sophie M.", "Karim B.", "Nadia L.", "Thomas R.", "Amina K."];
const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?w=100&h=100&fit=crop&crop=face`;
// Photos des témoignages : mêmes visuels que la source (components/testimonials.tsx).
const testimonialPhotos: Record<string, string> = {
  "sarah-chen": unsplash("1649972904349-6e44c42644a7"), "marcus-johnson": unsplash("1581091226825-a6a2a5aee158"),
  "emily-rodriguez": unsplash("1581092795360-fd1ca04f0952"), "david-kim": unsplash("1507003211169-0a1dd7228f2d"),
  "lisa-thompson": unsplash("1544725176-7c40e5a71c5e"), "alex-martinez": unsplash("1472099645785-5658abf4ff4e"),
  "jennifer-park": unsplash("1438761681033-6461ffad8d80"), "michael-brown": unsplash("1500648767791-00dcc994a43e"),
  "rachel-green": unsplash("1544725176-7c40e5a71c5e"), "john-doe": unsplash("1544725176-7c40e5a71c5e"),
};
const footerHref: Record<string, string> = {
  privateSecurity: "#pricing", fireSafety: "#pricing", recycling: "#pricing", certification: "#how-it-works",
  about: "#features", trainers: "#trainers", partners: "#trusted-brands", contact: "#contact",
  faq: "#faq", funding: "#faq", calendar: "#contact", regulations: "#faq",
};
const socials = [["facebook", "Facebook"], ["x", "X (Twitter)"], ["github", "GitHub"], ["linkedin", "LinkedIn"], ["mail", "Email"]] as const;

function SectionHeading({ id, badge, title, subtitle }: { id: string; badge: string; title: string; subtitle: string }) {
  return <div className={s.heading}>
    <span className={s.badge}>{badge}</span>
    <h2 id={id}>{title}</h2>
    <p>{subtitle}</p>
  </div>;
}

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: code } = await params;
  if (!isLang(code)) notFound();
  const lang: Lang = code;
  const t = dictionaries[lang];
  const shell = t.shell;
  const q = qualiopiContent[lang];
  const pc = parcoursContent[lang];
  const at = atoutsContent[lang];
  const ef = equipeFaqContent[lang];
  const testimonials = Object.entries(t.testimonials.items);
  const rows = [testimonials.slice(0, 5), testimonials.slice(5, 10)];

  return <div className={s.site}>
    <a className={s.skipLink} href="#main">{t.ui.skipToContent}</a>
    <Header lang={lang} />
    <main id="main">
      {/* Hero */}
      <section className={s.hero} aria-labelledby="hero-title">
        <div className={s.shell}>
          <a className={s.heroChip} href="#qualiopi"><span aria-hidden="true" />{q.heroChip}<Icon name="arrow" /></a>
          <h1 id="hero-title"><span>{t.hero.titlePrefix}</span> <RotatingWords words={t.hero.rotatingWords} /></h1>
          <p className={s.heroDescription}>{t.hero.description}</p>
          <div className={s.actions}>
            <a className={s.primary} href="#preinscription">{t.hero.primaryCta} <Icon name="arrow" /></a>
            <a className={s.secondary} href="#how-it-works"><Icon name="graduation" /> {t.hero.secondaryCta}</a>
          </div>
          <div className={s.heroTrust}>
            <div className={s.heroTrustRow}>
              <ul className={s.avatars}>{heroPeople.map((name, index) => <li key={name} title={`${name} — ${t.hero.people[String(index + 1) as "1"]}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/media/avatars/300-${index + 1}.png`} alt={name} />
              </li>)}</ul>
              <span className={s.stars} aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <Icon key={index} name="star" />)}</span>
            </div>
            <p>{t.hero.trustText}</p>
          </div>
          <HeroVideo lang={lang} />
        </div>
      </section>

      {/* Marques de confiance */}
      <section id="trusted-brands" className={s.brands} aria-label={t.trustedBrands.title}>
        <div className={s.shell}>
          <p className={s.brandsTitle}>{t.trustedBrands.title}</p>
          <div className={s.marquee} data-speed="slow">
            <div className={s.marqueeTrack}>
              {[0, 1].map(copy => partnerLogos.map(([name, file]) => <span key={`${copy}-${file}`} className={s.logoTile} aria-hidden={copy === 1 ? true : undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${homeAssets}/certifications/logo-${file}.png`} alt={copy === 0 ? name : ""} loading="lazy" />
              </span>))}
            </div>
          </div>
        </div>
      </section>

      {/* Formations : le cœur de l'offre, juste après la crédibilité (certifications, financeurs) */}
      <section id="pricing" className={`${s.section} ${s.tint}`} aria-labelledby="pricing-title">
        <div className={s.shell}>
          <SectionHeading id="pricing-title" badge={t.pricing.badge} title={t.pricing.title} subtitle={t.pricing.subtitle} />
          <Catalogue lang={lang} />
        </div>
      </section>

      {/* Comment ça fonctionne : le parcours du stagiaire en trois temps */}
      <section id="how-it-works" className={s.section} aria-labelledby="how-title">
        <div className={s.shell}>
          <SectionHeading id="how-title" badge={pc.badge} title={pc.title} subtitle={pc.subtitle} />
          <ol className={s.journey}>{pc.phases.reduce<{ items: ReactNode[]; n: number }>((acc, phase) => {
            acc.items.push(<li key={phase.label} className={s.phase}>
              <div className={s.phaseHead}><span>{phase.label}</span><h3>{phase.title}</h3></div>
              <ol className={s.phaseSteps}>{phase.steps.map(step => {
                acc.n += 1;
                return <li key={step.title} className={s.journeyStep}>
                  <span className={s.journeyNum}>{acc.n}</span>
                  <div className={s.journeyCard}>
                    <div className={s.journeyTop}><span className={s.journeyIcon}><Icon name={step.icon} /></span><h4>{step.title}</h4></div>
                    <p>{step.text}</p>
                    <span className={s.deliverable}><Icon name="check" />{step.deliverable}</span>
                  </div>
                </li>;
              })}</ol>
            </li>);
            return acc;
          }, { items: [], n: 0 }).items}</ol>
          <div className={s.journeyFoot}>
            <p><Icon name="shieldCheck" />{pc.footnote}</p>
            <a className={s.primary} href="#preinscription">{pc.cta} <Icon name="arrow" /></a>
          </div>
        </div>
      </section>

      {/* Atouts : une carte illustrée « terrain », cinq points forts, chiffres du catalogue */}
      <section id="features" className={`${s.section} ${s.tint}`} aria-labelledby="features-title">
        <div className={s.shell}>
          <SectionHeading id="features-title" badge={at.badge} title={at.title} subtitle={at.subtitle} />
          <div className={s.bento}>
            <article className={s.highlight}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/hero/securite-privee.jpg" alt={at.highlight.imageAlt} loading="lazy" />
              <div className={s.highlightBody}>
                <span className={s.highlightTag}>{at.highlight.tag}</span>
                <h3>{at.highlight.title}</h3>
                <p>{at.highlight.text}</p>
                <ul>{at.highlight.bullets.map(item => <li key={item}><Icon name="check" />{item}</li>)}</ul>
              </div>
            </article>
            {at.points.map((point, index) => <article key={point.title} className={s.point} data-tone={index % 3}>
              <span className={s.pointIcon}><Icon name={point.icon} /></span>
              <h3>{point.title}</h3>
              <p>{point.text}</p>
            </article>)}
          </div>
          <div className={s.atoutStats}>{at.stats.map(stat => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
        </div>
      </section>

      {/* Engagement qualité : la preuve derrière les atouts (moteur GSMS Qualiopi) */}
      <section id="qualiopi" className={s.engine} aria-labelledby="qualiopi-title">
        <div className={s.shell}>
          <SectionHeading id="qualiopi-title" badge={q.badge} title={q.title} subtitle={q.subtitle} />
          <ol className={s.chain}>{q.chain.map((step, index) => <li key={step.title}>
            <span className={s.chainIcon}><Icon name={step.icon} /></span>
            <span className={s.chainNum}>{String(index + 1).padStart(2, "0")}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>)}</ol>
          <div className={s.engineStats}>{q.stats.map(stat => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}</div>
          <h3 className={s.engineSubtitle}>{q.advantagesTitle}</h3>
          <div className={s.advantages}>{q.advantages.map(item => <article key={item.title}>
            <span className={s.advIcon}><Icon name={item.icon} /></span>
            <div><h4>{item.title}</h4><p>{item.text}</p></div>
          </article>)}</div>
          <p className={s.disclaimer}><Icon name="shieldCheck" />{q.disclaimer}</p>
          <div className={s.engineCta}><a className={s.primary} href="#preinscription">{q.cta} <Icon name="arrow" /></a></div>
        </div>
      </section>

      {/* Formateurs */}
      <section id="trainers" className={s.section} aria-labelledby="trainers-title">
        <div className={s.shell}>
          <SectionHeading id="trainers-title" badge={t.trainers.badge} title={t.trainers.title} subtitle={t.trainers.subtitle} />
          <TrainersTabs lang={lang} />
        </div>
      </section>

      {/* Témoignages */}
      <section id="testimonials" className={`${s.section} ${s.tint}`} aria-labelledby="testimonials-title">
        <div className={s.shell}>
          <SectionHeading id="testimonials-title" badge={t.testimonials.badge} title={t.testimonials.title} subtitle={t.testimonials.subtitle} />
        </div>
        <div className={s.testimonialRows}>
          {rows.map((row, rowIndex) => <div key={rowIndex} className={s.marquee} data-reverse={rowIndex === 1}>
            <div className={s.marqueeTrack}>
              {[0, 1].map(copy => row.map(([id, item]) => <figure key={`${copy}-${id}`} className={s.testimonial} aria-hidden={copy === 1 ? true : undefined}>
                <blockquote>{item.content}</blockquote>
                <figcaption><span className={s.testimonialAvatar}>{testimonialPhotos[id]
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={testimonialPhotos[id]} alt="" loading="lazy" />
                  : initials(item.name)}</span><span><strong>{item.name}</strong><span>{item.role}</span></span></figcaption>
              </figure>))}
            </div>
          </div>)}
        </div>
      </section>

      {/* FAQ : encadré de contact à gauche, questions classées par thème à droite */}
      <section id="faq" className={s.section} aria-labelledby="faq-title">
        <div className={s.shell}>
          <SectionHeading id="faq-title" badge={t.faq.badge} title={t.faq.title} subtitle={t.faq.subtitle} />
          <div className={s.faqLayout}>
            <aside className={s.faqAside}>
              <span className={s.faqAsideIcon}><Icon name="mail" /></span>
              <h3>{ef.faqAside.title}</h3>
              <p>{ef.faqAside.text}</p>
              <div className={s.faqActions}>
                <a className={s.primary} href="#contact">{ef.faqAside.write} <Icon name="arrow" /></a>
                <a className={s.secondary} href={phoneHref}><Icon name="phone" /> {ef.faqAside.call}</a>
                <a className={s.faqRegister} href="#preinscription">{ef.faqAside.register}</a>
              </div>
            </aside>
            <div className={s.faqGroups}>{ef.faqGroups.map(group => <div key={group.title} className={s.faqGroup}>
              <h3><span><Icon name={group.icon} /></span>{group.title}</h3>
              <div className={s.faqList}>{group.ids.map(id => {
                const item = t.faq.items[id as keyof typeof t.faq.items];
                return <details key={id} name="faq" className={s.faqItem}>
                  <summary>{item.question}<span aria-hidden="true" /></summary>
                  <p>{item.answer}</p>
                </details>;
              })}</div>
            </div>)}</div>
          </div>
        </div>
      </section>

      {/* Appel à action */}
      <section id="call-to-action" className={s.cta} aria-labelledby="cta-title">
        <div className={s.ctaGrid} aria-hidden="true" />
        <div className={s.shell}>
          <p className={s.ctaBadge}>{t.ctaBanner.badge}</p>
          <h2 id="cta-title">{t.ctaBanner.title}</h2>
          <a className={s.ctaButton} href="#pricing">{t.ctaBanner.cta}</a>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className={`${s.section} ${s.tint}`} aria-labelledby="contact-title">
        <div className={s.shell}>
          <SectionHeading id="contact-title" badge={t.contact.badge} title={t.contact.title} subtitle={t.contact.subtitle} />
          <div className={s.contactLayout}>
            <div className={s.contactSide}>
              <h3>{t.contact.sideTitle}</h3>
              <p>{t.contact.sideDescription}</p>
              <ul>
                <li><Icon name="mail" /><div><strong>{t.contact.info.email.title}</strong><a href={`mailto:${contactEmail}`}>{t.contact.info.email.content}</a></div></li>
                <li><Icon name="phone" /><div><strong>{t.contact.info.phone.title}</strong><a href={phoneHref}>{t.contact.info.phone.content}</a></div></li>
                <li><Icon name="pin" /><div><strong>{t.contact.info.address.title}</strong><span>{t.contact.info.address.content}</span></div></li>
              </ul>
            </div>
            <ContactForm lang={lang} />
          </div>
        </div>
      </section>
    </main>

    {/* Pied de page */}
    <footer className={s.footer}>
      <div className={s.shell}>
        <div className={s.footerTop}>
          <div className={s.footerBrand}>
            <a className={s.brand} href={`/${lang}/`} aria-label={t.ui.home}><BrandLogo /></a>
            <p>{shell.footer.description}</p>
            <ul className={s.socials}>{socials.map(([icon, label]) => <li key={icon}><a href={icon === "mail" ? `mailto:${contactEmail}` : "#"} aria-label={label}><Icon name={icon} /></a></li>)}</ul>
          </div>
          <nav className={s.footerColumns} aria-label={t.ui.footerNav}>
            {Object.entries(shell.footer.columns).map(([id, column]) => <div key={id}>
              <h3>{column.title}</h3>
              <ul>{Object.entries(column).filter(([key]) => key !== "title").map(([key, label]) => <li key={key}><a href={footerHref[key] ?? "#"}>{label}</a></li>)}</ul>
            </div>)}
          </nav>
        </div>
        <div className={s.footerBottom}>
          <p>{shell.footer.copyright}</p>
          <p><span>{shell.footer.cgv}</span><span className={s.footerSep}>|</span><span>{shell.footer.tagline}</span></p>
        </div>
      </div>
    </footer>
    <Preinscription lang={lang} />
  </div>;
}
