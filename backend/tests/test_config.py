import pytest
from pydantic import ValidationError

from app.core.config import Settings

STRONG = "x" * 40
SAFE_DB = "postgresql+psycopg://gsms:un-vrai-mot-de-passe@db:5432/gsms"


def test_developpement_accepte_les_valeurs_de_demo() -> None:
    assert Settings(app_env="development").jwt_secret


@pytest.mark.parametrize(
    "overrides, message",
    [
        ({"jwt_secret": "change-me-in-production"}, "JWT_SECRET"),
        ({"jwt_secret": "court"}, "JWT_SECRET"),
        ({"cors_origins": "https://app.example.fr,*"}, "CORS_ORIGINS"),
        ({"database_url": "postgresql+psycopg://postgres:postgres@db/gsms"}, "DATABASE_URL"),
    ],
)
def test_production_refuse_les_secrets_faibles(overrides: dict, message: str) -> None:
    values = {"app_env": "production", "jwt_secret": STRONG, "database_url": SAFE_DB, **overrides}
    with pytest.raises(ValidationError, match=message):
        Settings(**values)


def test_production_valide() -> None:
    s = Settings(app_env="production", jwt_secret=STRONG, database_url=SAFE_DB, cors_origins="https://app.example.fr/")
    assert s.cors_origin_list == ["https://app.example.fr"]
