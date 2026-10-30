/**
 * Client HTTP de l'API qualiopi (FastAPI).
 *
 * - Toutes les routes métier sont sous /api/v1 (GET /health hors préfixe), servies à la racine du domaine :
 *   l'interface vit sous /app/, mais l'API reste à /api/v1 (proxy Vite en dev, reverse proxy en production).
 *   VITE_API_BASE_URL permet de viser une autre origine (penser alors à CORS_ORIGINS côté API).
 * - Jeton JWT renvoyé par POST /api/v1/auth/login, transmis en « Authorization: Bearer ».
 *   L'API n'a ni rafraîchissement ni déconnexion : à 401, on oublie le jeton et on renvoie vers /login.
 */

const API_ORIGIN = (import.meta.env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ?? ''
export const API_PREFIX = `${API_ORIGIN}/api/v1`

const TOKEN_KEY = 'gsms_qualiopi_token'

export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* stockage indisponible : la session ne survivra pas au rechargement */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* rien à faire */
    }
  },
}

/** Erreur d'API : statut HTTP, code métier éventuel (`error`) et détails d'un refus de politique (409). */
export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly details?: unknown

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Message lisible à partir d'une réponse d'erreur de l'API :
 * `{"detail": "…"}` (HTTPException), `{"error", "detail", "details"}` (app/core/errors.py)
 * ou `{"detail": [{loc, msg}, …]}` (validation Pydantic, 422).
 */
export function apiErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const detail = (body as { detail?: unknown }).detail
    if (typeof detail === 'string' && detail.trim()) return detail
    if (Array.isArray(detail) && detail.length) {
      return detail
        .map((d) => {
          if (d && typeof d === 'object' && 'msg' in d) {
            const loc = Array.isArray((d as { loc?: unknown }).loc)
              ? ((d as { loc: unknown[] }).loc.filter((p) => p !== 'body').join('.'))
              : ''
            return loc ? `${loc} : ${(d as { msg: string }).msg}` : String((d as { msg: string }).msg)
          }
          return String(d)
        })
        .join(' ; ')
    }
  }
  if (status === 401) return 'Authentification requise'
  if (status === 403) return 'Accès refusé : droit manquant'
  if (status === 404) return 'Ressource introuvable'
  if (status >= 500) return `Erreur du serveur (${status})`
  return `Erreur ${status}`
}

let unauthorizedHandler: (() => void) | null = null

/** Appelé à chaque 401 sur une requête authentifiée (jeton absent, expiré ou compte désactivé). */
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler
}

type Query = Record<string, string | number | boolean | null | undefined>

export interface RequestOptions {
  body?: unknown
  query?: Query
  /** false : n'envoie pas le jeton et ne déclenche pas la redirection sur 401 (connexion). */
  auth?: boolean
  signal?: AbortSignal
}

function buildUrl(path: string, query?: Query): string {
  const url = path.startsWith('/health') ? `${API_ORIGIN}${path}` : `${API_PREFIX}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

export async function request<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, auth = true, signal } = options
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = tokenStorage.get()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new ApiError(0, "L'API ne répond pas : vérifiez la connexion ou que le serveur est démarré")
  }

  if (response.status === 204) return undefined as T
  const text = await response.text()
  let data: unknown = undefined
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    if (response.status === 401 && auth) {
      tokenStorage.clear()
      unauthorizedHandler?.()
    }
    const obj = (data && typeof data === 'object' ? data : {}) as { error?: string; details?: unknown }
    throw new ApiError(response.status, apiErrorMessage(response.status, data), obj.error, obj.details)
  }
  return data as T
}

export const http = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, { ...options, body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PUT', path, { ...options, body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('PATCH', path, { ...options, body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, options),
}
