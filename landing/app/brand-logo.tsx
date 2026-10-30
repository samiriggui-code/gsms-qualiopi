/** Logo GSMS : texte foncé sur fond clair, texte blanc en mode sombre (public/brand/). */
export function BrandLogo() {
  return <span className="wk-logo">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="wk-logo-light" src="/brand/gsms-logo-light.svg" alt="GSMS — Global Security Management System" width={425} height={166} />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="wk-logo-dark" src="/brand/gsms-logo-dark.svg" alt="" aria-hidden="true" width={425} height={166} />
  </span>;
}
