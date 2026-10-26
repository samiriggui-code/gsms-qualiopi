/**
 * Médiathèque reprise de GSMS School (CDC §3 « Images reprises de GSMS School »), publiée dans `app/public/media/`
 * et servie sous `${BASE_URL}media/…`. Rien n'est copié dans `src/assets` : on ne fait que composer l'adresse.
 */

/** Adresse publique d'un fichier de la médiathèque (`file-types/pdf.svg` → `/app/media/file-types/pdf.svg`). */
export function mediaUrl(path: string): string {
  return `${import.meta.env.BASE_URL}media/${path.replace(/^\/+/, '')}`
}

/** Illustration et sa variante pour le thème sombre (`N.svg` / `N-dark.svg`). */
export function illustration(n: number): { light: string; dark: string } {
  return { light: mediaUrl(`illustrations/${n}.svg`), dark: mediaUrl(`illustrations/${n}-dark.svg`) }
}

const EXTENSIONS: Record<string, string> = {
  pdf: 'pdf', doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc',
  xls: 'excel', xlsx: 'excel', ods: 'excel', csv: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', odp: 'powerpoint',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', heic: 'image', svg: 'image',
  txt: 'text', md: 'text', html: 'text', zip: 'zip', rar: 'zip', '7z': 'zip',
  mp3: 'mp3', wav: 'mp3', m4a: 'mp3', mp4: 'video', mov: 'video', webm: 'video', eml: 'mail', msg: 'mail',
}

const MIMES: [RegExp, string][] = [
  [/pdf/, 'pdf'], [/word|opendocument\.text|rtf/, 'doc'], [/sheet|excel|csv/, 'excel'],
  [/presentation|powerpoint/, 'powerpoint'], [/^image\//, 'image'], [/^video\//, 'video'], [/^audio\//, 'mp3'],
  [/zip|compressed/, 'zip'], [/^text\//, 'text'], [/message\/rfc822/, 'mail'],
]

/**
 * Icône du type d'un fichier (nom ou type MIME). Présentation seulement : renvoie `null` si le type est inconnu,
 * la page garde alors son icône par défaut.
 */
export function fileTypeIcon(name?: string | null, mime?: string | null): string | null {
  const ext = (name ?? '').toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1]
  let key = ext ? EXTENSIONS[ext] : undefined
  if (!key && mime) key = MIMES.find(([re]) => re.test(mime.toLowerCase()))?.[1]
  return key ? mediaUrl(`file-types/${key}.svg`) : null
}

/**
 * Adresse d'une photo ou d'une vignette enregistrée en base (`photo_url`, `image_url`…) : l'API rend un chemin relatif
 * à la médiathèque du back-office (`media/avatars/300-1.png`), jamais une adresse externe. Le front ne devine rien :
 * sans chemin, `null` (la page garde les initiales ou son icône).
 */
export function mediaSrc(path?: string | null): string | null {
  const p = (path ?? '').trim().replace(/^\/+/, '')
  if (!p || p.includes('..') || /^[a-z][a-z0-9+.-]*:/i.test(p)) return null
  return `${import.meta.env.BASE_URL}${p}`
}

/** Drapeau d'une langue de l'interface (sélecteur de langue). */
export function languageFlag(locale: string): string {
  return mediaUrl(`flags/${locale.startsWith('en') ? 'united-kingdom' : 'france'}.svg`)
}

/** Nationalités courantes (adjectif masculin ou féminin, ou nom du pays) → fichier du drapeau. */
const NATIONALITIES: Record<string, string> = {
  france: 'france', francais: 'france', francaise: 'france',
  algerie: 'algeria', algerien: 'algeria', algerienne: 'algeria',
  maroc: 'morocco', marocain: 'morocco', marocaine: 'morocco',
  tunisie: 'tunisia', tunisien: 'tunisia', tunisienne: 'tunisia',
  senegal: 'senegal', senegalais: 'senegal', senegalaise: 'senegal',
  mali: 'mali', malien: 'mali', malienne: 'mali',
  'cote d ivoire': 'ivory-coast', ivoirien: 'ivory-coast', ivoirienne: 'ivory-coast',
  cameroun: 'cameroon', camerounais: 'cameroon', camerounaise: 'cameroon',
  portugal: 'portugal', portugais: 'portugal', portugaise: 'portugal',
  espagne: 'spain', espagnol: 'spain', espagnole: 'spain',
  italie: 'italy', italien: 'italy', italienne: 'italy',
  allemagne: 'germany', allemand: 'germany', allemande: 'germany',
  belgique: 'belgium', belge: 'belgium', suisse: 'switzerland',
  roumanie: 'romania', roumain: 'romania', roumaine: 'romania',
  pologne: 'poland', polonais: 'poland', polonaise: 'poland',
  turquie: 'turkey', turc: 'turkey', turque: 'turkey',
  ukraine: 'ukraine', ukrainien: 'ukraine', ukrainienne: 'ukraine',
  'royaume uni': 'united-kingdom', britannique: 'united-kingdom',
  'etats unis': 'united-states', americain: 'united-states', americaine: 'united-states',
  bresil: 'brazil', bresilien: 'brazil', bresilienne: 'brazil',
  chine: 'china', chinois: 'china', chinoise: 'china',
  'pays bas': 'netherlands', neerlandais: 'netherlands', neerlandaise: 'netherlands',
}

/** Drapeau de la nationalité saisie (texte libre de l'API), ou `null` si elle n'est pas reconnue. */
export function nationalityFlag(nationality?: string | null): string | null {
  if (!nationality) return null
  const key = nationality.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()
  const file = NATIONALITIES[key]
  return file ? mediaUrl(`flags/${file}.svg`) : null
}
