/**
 * Téléchargements et dépôts de fichiers authentifiés (docs/API.md §4, point 9) :
 * un simple <a href> n'envoie pas le jeton, on passe donc par fetch + blob, et par FormData pour les dépôts.
 */
import { API_PREFIX, ApiError, apiErrorMessage, tokenStorage } from './http'

async function failure(response: Response): Promise<never> {
  const text = await response.text()
  let data: unknown = text
  try {
    data = text ? JSON.parse(text) : undefined
  } catch {
    /* corps non JSON */
  }
  const obj = (data && typeof data === 'object' ? data : {}) as { error?: string; details?: unknown }
  throw new ApiError(response.status, apiErrorMessage(response.status, data), obj.error, obj.details)
}

function authHeaders(): Record<string, string> {
  const token = tokenStorage.get()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** Télécharge un fichier de l'API et le propose à l'enregistrement sous `fallbackName`. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${API_PREFIX}${path}`, { headers: authHeaders() })
  } catch {
    throw new ApiError(0, "L'API ne répond pas : vérifiez la connexion ou que le serveur est démarré")
  }
  if (!response.ok) await failure(response)
  const disposition = response.headers.get('Content-Disposition') || ''
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition)
  const name = match ? decodeURIComponent(match[1] || match[2]) : fallbackName
  const url = URL.createObjectURL(await response.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Envoie un formulaire multipart (dépôt de pièce). */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_PREFIX}${path}`, { method: 'POST', headers: authHeaders(), body: form })
  } catch {
    throw new ApiError(0, "L'API ne répond pas : vérifiez la connexion ou que le serveur est démarré")
  }
  if (!response.ok) await failure(response)
  return (await response.json()) as T
}
