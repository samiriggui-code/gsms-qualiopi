// Client de l'API GSMS, via le proxy Next /api/backend (cookie de session → Bearer).
// Usage : apiFetch<SessionRow[]>('/v1/sessions')
// Toute erreur devient une ApiError lisible ; un refus du moteur (409) garde son code et ses détails.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown>[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isRefusal() {
    return this.status === 409;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/backend${path}`, {
      cache: 'no-store',
      ...init,
      headers: {
        // Un FormData (dépôt de fichier) fixe lui-même son type multipart
        ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'network', 'Connexion impossible : vérifiez le réseau.');
  }

  if (response.status === 401 && typeof window !== 'undefined') {
    const callbackUrl = window.location.pathname + window.location.search;
    window.location.href = `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    const message = Array.isArray(detail)
      ? detail.map((d: { msg?: string }) => d.msg).join(' ; ')
      : typeof detail === 'string'
        ? detail
        : `Erreur ${response.status}`;
    throw new ApiError(response.status, data?.error ?? `http_${response.status}`, message, data?.details ?? []);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(`/v1/${path}`),
  post: <T>(path: string, body: unknown = {}) =>
    apiFetch<T>(`/v1/${path}`, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => apiFetch<T>(`/v1/${path}`, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(`/v1/${path}`, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(`/v1/${path}`, { method: 'DELETE' }),
};

// Document émis (convocation, attestation) servi par l'API, à ouvrir dans un nouvel onglet
export const documentUrl = (enrollmentId: string, documentId: string) =>
  `/api/backend/v1/inscriptions/${enrollmentId}/documents/${documentId}`;
