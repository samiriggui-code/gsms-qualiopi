/**
 * Programme saisi en texte dans « Compléter la fiche » : une ligne par module (`UV1 | Intitulé | 14`, heures
 * facultatives), puis ses points de contenu sur des lignes commençant par « - ». L'API valide les modules reçus.
 */
import type { ProgramModule } from '@/api/gsms/training'

export function modulesToText(modules: ProgramModule[]): string {
  return modules.map((m) => [
    [m.code, m.title, m.hours != null && m.hours !== '' ? String(Number(m.hours)) : null].filter((x) => x != null && x !== '').join(' | '),
    ...(m.details ?? []).map((d) => `- ${d}`),
  ].join('\n')).join('\n\n')
}

export function textToModules(text: string): ProgramModule[] {
  const modules: ProgramModule[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (/^[-•]/.test(line)) {
      const detail = line.replace(/^[-•]\s*/, '')
      if (detail && modules.length) modules[modules.length - 1].details!.push(detail)
      continue
    }
    const parts = line.split('|').map((p) => p.trim())
    const [code, title] = parts.length > 1 ? parts : [`M${modules.length + 1}`, parts[0]]
    const hours = parts.length > 2 ? Number(parts[2].replace(',', '.').replace(/\s*h$/i, '')) : NaN
    modules.push({ code, title, details: [], ...(Number.isFinite(hours) ? { hours } : {}) })
  }
  return modules
}
