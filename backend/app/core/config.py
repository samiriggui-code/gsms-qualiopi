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
