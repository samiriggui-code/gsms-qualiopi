/**
 * Shared access-token refresh used by both axios and the chat SSE client.
 *
 * GSMS : le navigateur ne détient aucun jeton de renouvellement WeKnora. Un nouveau jeton s'obtient en rappelant
 * POST /api/v1/ia/session (API Qualiopi), qui revérifie le compte GSMS (actif, permission « ia.use ») : désactiver
 * un compte GSMS coupe donc aussi l'assistant. Les 401 simultanés attendent un seul renouvellement en cours.
 * The SSE handshake runs on raw fetch and cannot use the axios interceptor; both planes call
 * {@link refreshAccessTokenShared}.
 */

const AUTH_STORAGE_KEYS = [
  'weknora_token',
  'weknora_refresh_token',
  'weknora_user',
  'weknora_tenant',
  'weknora_knowledge_bases',
  'weknora_current_kb',
  'weknora_selected_tenant_id',
  'weknora_selected_tenant_name',
  'weknora_memberships',
] as const

let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

export type TokenRefreshResult = {
  success: boolean
  data?: { token: string }
  message?: string
}

export type RefreshAccessTokenOptions = {
  refresh?: () => Promise<TokenRefreshResult>
  messages?: {
    pleaseRelogin: string
    tokenRefreshFailed: string
  }
}

const defaultMessages = {
  pleaseRelogin: 'Please log in again',
  tokenRefreshFailed: 'Token refresh failed',
}

export class StreamAuthError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
    this.name = 'StreamAuthError'
  }
}

export function isStreamAuthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  if (err instanceof StreamAuthError) return true
  return (err as { name?: string }).name === 'StreamAuthError'
}

export function isEmbedPage(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.startsWith('/embed/')
}

/** Page de connexion sous le sous-chemin de l'interface (/app/login derrière la landing, /login sinon). */
export const LOGIN_URL = `${import.meta.env?.BASE_URL ?? '/'}login`

export function redirectToLogin() {
  if (typeof window === 'undefined') return
  if (window.location.pathname === LOGIN_URL) return
  if (isEmbedPage()) return
  window.location.href = LOGIN_URL
}

export function clearAuthStorage() {
  for (const key of AUTH_STORAGE_KEYS) {
    localStorage.removeItem(key)
  }
}

export function forceReloginRedirect() {
  clearAuthStorage()
  redirectToLogin()
}

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token as string)
    }
  })
  failedQueue = []
}

async function defaultRefresh(): Promise<TokenRefreshResult> {
  const { openIaSession } = await import('../api/gsms/auth')
  const body = await openIaSession()
  return body?.token ? { success: true, data: { token: String(body.token) } } : { success: false }
}

/**
 * Refresh the access token, de-duplicated across all callers.
 *
 * Resolves with the new access token. On failure it has already cleared
 * credentials and redirected to /login.
 */
export async function refreshAccessTokenShared(
  options: RefreshAccessTokenOptions = {},
): Promise<string> {
  const messages = { ...defaultMessages, ...options.messages }
  const refresh = options.refresh ?? defaultRefresh

  if (isRefreshing) {
    return new Promise<string>((resolve, reject) => {
      failedQueue.push({ resolve, reject })
    })
  }

  isRefreshing = true
  // Reliquat d'une session antérieure : plus aucun jeton de renouvellement n'est conservé.
  localStorage.removeItem('weknora_refresh_token')

  try {
    const response = await refresh()

    if (!response.success || !response.data?.token) {
      throw new Error(response.message || messages.tokenRefreshFailed)
    }

    const { token } = response.data
    localStorage.setItem('weknora_token', token)
    processQueue(null, token)
    return token
  } catch (refreshError) {
    clearAuthStorage()
    processQueue(refreshError, null)
    redirectToLogin()
    throw refreshError
  } finally {
    isRefreshing = false
  }
}

/**
 * Replay an SSE handshake once after a 401. Refresh failure already
 * redirected; a second 401 after a successful refresh is surfaced to the
 * caller without wiping the newly minted session (axios does the same).
 *
 * Returns undefined when a newer send or an abort superseded the replay.
 */
export async function runStreamWithAuthRetry<T>(options: {
  run: (token: string) => Promise<T>
  initialToken: string
  isEmbed: boolean
  isCurrent: () => boolean
  refreshAccessToken: () => Promise<string>
  reloginMessage: string
}): Promise<T | undefined> {
  try {
    return await options.run(options.initialToken)
  } catch (err) {
    if (!isStreamAuthError(err) || options.isEmbed) throw err

    let refreshedToken: string
    try {
      refreshedToken = await options.refreshAccessToken()
    } catch {
      throw new Error(options.reloginMessage)
    }

    if (!options.isCurrent()) return undefined

    try {
      return await options.run(refreshedToken)
    } catch (retryErr) {
      if (isStreamAuthError(retryErr)) {
        throw new Error(options.reloginMessage)
      }
      throw retryErr
    }
  }
}

/** Reset module locks between unit tests. */
export function resetAuthRefreshStateForTests() {
  isRefreshing = false
  failedQueue = []
}
