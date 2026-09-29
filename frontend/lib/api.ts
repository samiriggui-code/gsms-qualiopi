// Client de l'API FastAPI, via le proxy Next /api/backend (cookie de session → Bearer).
// Usage : apiFetch<UserOut>('/v1/auth/me')

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (response.status === 401 && typeof window !== 'undefined') {
    const callbackUrl = window.location.pathname + window.location.search;
    window.location.href = `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = data?.detail;
    throw new ApiError(
      response.status,
      typeof detail === 'string' ? detail : 'Erreur inattendue.',
    );
  }
  return data as T;
}
