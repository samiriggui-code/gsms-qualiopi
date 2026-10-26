"""Importe tous les modèles pour que la métadonnée SQLAlchemy soit complète (Alembic, tests)."""

from app.common import journal as _journal  # noqa: F401
from app.database.db import Base
from app.types import auth as _auth  # noqa: F401
from app.types import documents as _documents  # noqa: F401
from app.types import editions as _editions  # noqa: F401
from app.types import edof as _edof  # noqa: F401
from app.types import event as _events  # noqa: F401
from app.types import funding as _funding  # noqa: F401
from app.types import hr as _hr  # noqa: F401
from app.types import ia as _ia  # noqa: F401
from app.types import invoicing as _invoicing  # noqa: F401
from app.types import platform as _platform  # noqa: F401
from app.types import preinscriptions as _preinscriptions  # noqa: F401
from app.types import qualiopi_audit as _audit  # noqa: F401
from app.types import qualiopi_capa as _capa  # noqa: F401
from app.types import qualiopi_cycle as _cycle  # noqa: F401
from app.types import qualiopi_evaluation as _evaluation  # noqa: F401
from app.types import qualiopi_evidence as _evidence  # noqa: F401
from app.types import qualiopi_referential as _referential  # noqa: F401
from app.types import qualiopi_review as _review  # noqa: F401
from app.types import qualiopi_schedule as _schedule  # noqa: F401
from app.types import questionnaires as _questionnaires  # noqa: F401
from app.types import relances as _relances  # noqa: F401
from app.types import training as _training  # noqa: F401

SCHEMAS = ("iam", "config", "formation", "qualite", "rh", "financement", "communication", "edof", "edition", "facturation")
metadata = Base.metadata
