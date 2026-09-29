// Côté serveur uniquement : adresse de l'API GSMS et nom du cookie de session.
export const API_URL = process.env.GSMS_API_URL ?? "http://127.0.0.1:8000";
export const TOKEN_COOKIE = "gsms_session";
