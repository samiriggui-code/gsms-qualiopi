from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

DEFAULT_JWT_SECRET = "change-me-in-production"
# Valeurs faibles refusées en production (liste reprise de Mizan, licence MIT, voir THIRD_PARTY_NOTICES.md).
WEAK_SECRETS = {DEFAULT_JWT_SECRET, "change-me", "secret", "your-secret-key", "changeme"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"  # development | test | production
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/gsms_qualiopi"
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_ttl_minutes: int = 12 * 60
    cors_origins: str = "http://localhost:3000"
    referentials_dir: Path = BACKEND_DIR / "referentials"
    documents_dir: Path = BACKEND_DIR / "var" / "documents"
    # Fonctionnalités rendues disponibles par le déploiement ou l'abonnement (« * » = toutes).
    features_available: str = "*"
    # Envoi des e-mails (Mailpit en local : hôte localhost, port 1025, sans TLS ni identifiants).
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    smtp_ssl: bool = False
    smtp_from: str = "no-reply@gsms.local"
    # Adresse publique du front : liens dans les e-mails (questionnaires, documents).
    public_url: str = "http://localhost:3000"
    # Moteur IA (fork WeKnora) : vide = écrans IA désactivés. Compte de service créé au premier appel.
    weknora_url: str = ""
    weknora_service_email: str = ""
    weknora_service_password: str = ""
    weknora_service_name: str = "GSMS Qualiopi"
    # Compte WeKnora remis au navigateur (contributeur de l'espace) ; vide = <service>+navigateur@<domaine>.
    weknora_browser_email: str = ""
    # Serveur MCP de l'API, tel que le moteur IA le joint (même réseau compose : service « api »).
    ia_mcp_url: str = "http://api:8000/api/v1/mcp"
    # Compte technique GSMS au nom duquel l'assistant IA lit le moteur Qualiopi (rôle « assistant_ia »).
    ia_compte_technique_email: str = "assistant-ia@gsms.local"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @model_validator(mode="after")
    def refuse_unsafe_production(self) -> "Settings":
        """En production, on refuse de démarrer plutôt que de tourner avec des secrets de démo."""
        if self.app_env != "production":
            return self
        problems = []
        if self.jwt_secret.strip() in WEAK_SECRETS or len(self.jwt_secret.strip()) < 32:
            problems.append("JWT_SECRET doit faire au moins 32 caractères et ne pas être une valeur par défaut")
        if "*" in self.cors_origin_list:
            problems.append("CORS_ORIGINS ne peut pas contenir '*'")
        if ":postgres@" in self.database_url:
            problems.append("DATABASE_URL ne doit pas utiliser le mot de passe postgres par défaut")
        if problems:
            raise ValueError("Configuration refusée en production : " + " ; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
