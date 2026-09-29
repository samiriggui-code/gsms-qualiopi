"""Cycle de vie d'une session : table des transitions (modèle repris de `Workflow Transition` de Frappe).

Le statut ne se modifie jamais directement : uniquement par une de ces transitions, décidée par
`TrainingPolicy` (permission, état, conditions métier) et journalisée.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Transition:
    action: str
    label: str
    from_states: tuple[str, ...]
    to_state: str
    permission: str = "sessions.write"


TRANSITIONS: dict[str, Transition] = {t.action: t for t in (
    Transition("confirm", "Confirmer la session", ("PLANIFIEE",), "CONFIRMEE"),
    Transition("start", "Démarrer la session", ("CONFIRMEE",), "EN_COURS"),
    Transition("finish", "Terminer la session", ("EN_COURS",), "TERMINEE"),
    Transition("close", "Clôturer la session", ("TERMINEE",), "CLOTUREE"),
    Transition("cancel", "Annuler la session", ("PLANIFIEE", "CONFIRMEE"), "ANNULEE"),
)}

LOCKED_STATES = ("CLOTUREE", "ANNULEE")  # plus rien ne se modifie
STARTED_STATES = ("EN_COURS", "TERMINEE", "CLOTUREE")
ENROLLABLE_STATES = ("PLANIFIEE", "CONFIRMEE", "EN_COURS")
# Champs qui ne bougent plus une fois la session démarrée (le reste reste corrigeable).
FROZEN_ONCE_STARTED = ("program_id", "start_date")
