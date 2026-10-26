/**
 * Base des appels WeKnora (moteur IA de l'app). Dans GSMS, les écrans WeKnora parlent au moteur IA sous
 * `/ia` (proxy de dev, Caddy/Traefik en production) ; `/api/v1` est réservé à l'API métier qualiopi.
 * Surcharge possible par VITE_WEKNORA_API_BASE.
 */
export function getApiBaseUrl(): string {
  return (import.meta.env.VITE_WEKNORA_API_BASE || '/ia').replace(/\/+$/, '');
}
