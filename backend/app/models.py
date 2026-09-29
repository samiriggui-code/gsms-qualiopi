"""Importe tous les modèles pour que la métadonnée SQLAlchemy soit complète (Alembic, tests)."""

from app.auth import models as _auth  # noqa: F401
from app.core.db import Base
from app.events import models as _events  # noqa: F401
from app.qualiopi.audit import models as _audit  # noqa: F401
from app.qualiopi.capa import models as _capa  # noqa: F401
from app.qualiopi.evaluation import models as _evaluation  # noqa: F401
from app.qualiopi.evidence import models as _evidence  # noqa: F401
from app.qualiopi.referential import models as _referential  # noqa: F401
from app.training import models as _training  # noqa: F401

SCHEMAS = ("iam", "formation", "qualite")
metadata = Base.metadata
