"""Décision motivée : ce que renvoient les politiques de domaine et le service de capacités."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.errors import DomainError


@dataclass(frozen=True)
class Decision:
    allowed: bool
    code: str | None = None  # ex. MISSING_ATTENDANCE, SELF_VALIDATION_FORBIDDEN
    message: str | None = None
    details: list = field(default_factory=list)

    def to_dict(self) -> dict:
        if self.allowed:
            return {"allowed": True}
        out = {"allowed": False, "code": self.code, "message": self.message}
        if self.details:
            out["details"] = self.details
        return out


ALLOW = Decision(True)


def deny(code: str, message: str, details: list | None = None) -> Decision:
    return Decision(False, code, message, details or [])


class PolicyDenied(DomainError):
    """Action refusée par une politique ou un état : le code et le détail vont jusqu'au client."""

    status_code = 409

    def __init__(self, decision: Decision):
        super().__init__(decision.message or decision.code or "Action refusée")
        self.code = decision.code or "policy_denied"
        self.details = decision.details


def enforce(decision: Decision) -> None:
    if not decision.allowed:
        raise PolicyDenied(decision)
