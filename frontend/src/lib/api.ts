// Client de l'API GSMS (via le relais /api/gsms). Toute erreur devient une ApiError lisible :
// un refus du moteur (409) garde son code et son détail pour être affiché tel quel.

export type DecisionDetail = Record<string, unknown>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: DecisionDetail[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isRefusal() {
    return this.status === 409;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/gsms/${path.replace(/^\//, "")}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "Connexion impossible : vérifiez le réseau");
  }
  if (res.status === 401 && typeof window !== "undefined") {
    // Session expirée : rechargement complet vers la connexion (le cookie a disparu côté serveur).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/connexion?suite=${encodeURIComponent(window.location.pathname)}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((d: { msg?: string }) => d.msg).join(" ; ")
      : (data.detail ?? `Erreur ${res.status}`);
    throw new ApiError(res.status, data.error ?? `http_${res.status}`, detail, data.details ?? []);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown = {}) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
};

export const documentUrl = (enrollmentId: string, documentId: string) =>
  `/api/gsms/inscriptions/${enrollmentId}/documents/${documentId}`;
