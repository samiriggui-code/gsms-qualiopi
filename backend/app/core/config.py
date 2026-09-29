from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/gsms_qualiopi"
    jwt_secret: str = "change-me-in-production"
    jwt_ttl_minutes: int = 12 * 60
    cors_origins: str = "http://localhost:3000"
    admin_email: str = "admin@gsms.local"
    admin_password: str = "admin-gsms"
    referentials_dir: Path = BACKEND_DIR / "referentials"
    documents_dir: Path = BACKEND_DIR / "var" / "documents"
    # Traitement synchrone des événements après chaque requête (dev / petites instances).
    # En production on peut le couper et laisser tourner `python -m app.worker`.
    process_events_inline: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
