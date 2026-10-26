/**
 * Couleur de marque de l'interface : réglage daté `general.brand_color`, rendu par GET /bootstrap
 * (`organization.brand_color`). Présentation seulement : on dérive les nuances TDesign (--td-brand-color-1…10) de la
 * couleur choisie, en clair et en sombre, sans rien décider d'autre.
 *
 * Sans couleur choisie par l'organisme, le violet GSMS du thème (theme.css) reste en place. L'API renvoie la valeur
 * PAR DÉFAUT du réglage (#0369a1) quand l'organisme n'a rien saisi, sans les distinguer : une valeur égale à ce défaut
 * est donc traitée comme « non choisie » (DEFAULT_BRAND_COLOR, recopié de backend/…/platform/general.py).
 */

/** Valeur par défaut déclarée du réglage `general.brand_color` (backend/app/application/service/platform/general.py). */
export const DEFAULT_BRAND_COLOR = '#0369a1'

/** Contraste minimal (WCAG AA, texte normal). */
export const AA = 4.5

type Rgb = [number, number, number]

const STYLE_ID = 'gsms-brand-color'
const LIGHT_PAGE: Rgb = [255, 255, 255]
const DARK_PAGE: Rgb = [36, 36, 36] // --td-bg-color-container en sombre (#242424)
const DARK_BASE: Rgb = [24, 24, 24] // --td-bg-color-page en sombre (#181818)

export function parseHex(hex: string | null | undefined): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  if (!m) return null
  const n = parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
}

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Mélange `a` et `b` (t = part de `b`, 0 à 1). */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

/** Assombrit la couleur juste assez pour que le texte blanc atteigne le contraste AA. */
function darkenForWhite(c: Rgb): Rgb {
  if (contrast(c, WHITE) >= AA) return c
  for (let t = 0.02; t <= 1; t += 0.02) {
    const d = mix(c, BLACK, t)
    if (contrast(d, WHITE) >= AA) return d
  }
  return BLACK
}

/** Éclaircit la couleur juste assez pour être lisible (AA) en texte sur le fond sombre. */
function lightenForDark(c: Rgb): Rgb {
  if (contrast(c, DARK_PAGE) >= AA) return c
  for (let t = 0.04; t <= 1; t += 0.04) {
    const l = mix(c, WHITE, t)
    if (contrast(l, DARK_PAGE) >= AA) return l
  }
  return WHITE
}

export interface BrandPalette {
  /** Couleur saisie par l'organisme. */
  chosen: string
  /** Couleur des boutons (texte blanc) : la couleur saisie, assombrie si elle n'atteint pas AA. */
  button: string
  /** Vrai si la couleur des boutons a dû être assombrie pour le contraste AA. */
  adjusted: boolean
  light: Record<string, string>
  dark: Record<string, string>
}

/**
 * Nuances TDesign pour une couleur choisie, sur le modèle de theme.css : en clair, --td-brand-color = nuance 4 ;
 * en sombre, --td-brand-color = nuance 6. Dans les deux thèmes, la couleur des boutons garde un texte blanc lisible (AA).
 */
export function brandPalette(hex: string): BrandPalette | null {
  const chosen = parseHex(hex)
  if (!chosen) return null
  const button = darkenForWhite(chosen)
  const adjusted = toHex(button) !== toHex(chosen)
  const light = {
    '--td-brand-color-1': toHex(mix(button, LIGHT_PAGE, 0.92)),
    '--td-brand-color-2': toHex(mix(button, LIGHT_PAGE, 0.55)),
    '--td-brand-color-3': toHex(mix(button, LIGHT_PAGE, 0.18)),
    '--td-brand-color-4': toHex(button),
    '--td-brand-color-5': toHex(mix(button, BLACK, 0.18)),
    '--td-brand-color-6': toHex(mix(button, BLACK, 0.32)),
    '--td-brand-color-7': toHex(mix(button, BLACK, 0.46)),
    '--td-brand-color-8': toHex(mix(button, BLACK, 0.6)),
    '--td-brand-color-9': toHex(mix(button, BLACK, 0.72)),
    '--td-brand-color-10': toHex(mix(button, BLACK, 0.84)),
    '--td-brand-color-disabled': toHex(mix(button, LIGHT_PAGE, 0.55)),
  }
  // Survol en clair : la nuance 3 ne doit pas faire perdre le contraste du texte blanc.
  if (contrast(parseHex(light['--td-brand-color-3'])!, WHITE) < AA) light['--td-brand-color-3'] = toHex(mix(button, BLACK, 0.1))
  const link = lightenForDark(chosen)
  const dark = {
    '--td-brand-color-1': `${toHex(button)}26`,
    '--td-brand-color-2': toHex(mix(button, DARK_BASE, 0.78)),
    '--td-brand-color-3': toHex(mix(button, DARK_BASE, 0.66)),
    '--td-brand-color-4': toHex(mix(button, DARK_BASE, 0.5)),
    '--td-brand-color-5': toHex(mix(button, BLACK, 0.15)),
    '--td-brand-color-6': toHex(button),
    '--td-brand-color-7': toHex(darkenForWhite(mix(button, WHITE, 0.12))),
    '--td-brand-color-8': toHex(link),
    '--td-brand-color-9': toHex(mix(link, WHITE, 0.35)),
    '--td-brand-color-10': toHex(mix(link, WHITE, 0.7)),
    '--td-brand-color-disabled': toHex(mix(button, DARK_BASE, 0.55)),
    // Liens et texte de marque sur fond sombre : nuance éclaircie, lisible (AA).
    '--td-text-color-brand': toHex(link),
    '--td-text-color-link': toHex(link),
  }
  return { chosen: toHex(chosen), button: toHex(button), adjusted, light, dark }
}

/** Couleur choisie par l'organisme, ou null : la valeur par défaut renvoyée par l'API n'est pas un choix. */
export function chosenBrandColor(value: string | null | undefined): string | null {
  const rgb = parseHex(value)
  if (!rgb) return null
  const hex = toHex(rgb)
  return hex === DEFAULT_BRAND_COLOR ? null : hex
}

function block(selector: string, vars: Record<string, string>): string {
  return `${selector}{${Object.entries(vars).map(([k, v]) => `${k}:${v};`).join('')}}`
}

/**
 * Applique (ou retire, avec null) la couleur de marque : feuille de style dédiée, plus spécifique que theme.css
 * (`:root:root:root`), pour les deux thèmes. Renvoie la palette appliquée.
 */
export function applyBrandColor(value: string | null | undefined): BrandPalette | null {
  if (typeof document === 'undefined') return null
  const hex = chosenBrandColor(value)
  const palette = hex ? brandPalette(hex) : null
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!palette) {
    el?.remove()
    return null
  }
  if (!el) {
    el = document.createElement('style')
    el.id = STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = block(':root:root:root,:root:root:root[theme-mode="light"]', palette.light)
    + block(':root:root:root[theme-mode="dark"]', palette.dark)
  return palette
}
