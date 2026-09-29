"""Catalogue des permissions et rôles système.

Le catalogue est défini par le code : c'est la seule liste qu'un développeur fait évoluer.
Les rôles, eux, appartiennent à l'organisme : rôles système proposés ici (non modifiables) et
rôles personnalisés créés en base en cochant des permissions du catalogue.

Une permission répond à « cette personne peut-elle faire ce type d'action ? ». Le contexte
(état de l'objet, réglages, auteur de la pièce…) relève des politiques de chaque domaine.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Permission:
    code: str
    label: str
    feature: str  # fonctionnalité qui apporte la permission (registre des fonctionnalités)


CATALOGUE: tuple[Permission, ...] = (
    Permission("sessions.read", "Consulter toutes les formations, sessions et inscriptions", "training"),
    Permission("sessions.read_own", "Consulter ses propres sessions (formateur relié à son compte)", "training"),
    Permission("sessions.write", "Créer et modifier formations, sessions et inscriptions", "training"),
    Permission("enrollments.write", "Mener le parcours des stagiaires : convention, convocation, statut, attestation", "training"),
    Permission("learners.assess", "Positionner et évaluer les stagiaires, recueillir leur satisfaction", "training"),
    Permission("trainers.write", "Gérer les formateurs et déposer leurs pièces", "training"),
    Permission("attendance.write", "Organiser l'émargement, constater présences et absences, contre-valider", "attendance"),
    Permission("quality.read", "Consulter l'état Qualiopi, les dossiers de pièces et les audits", "qualiopi"),
    Permission("quality.write", "Déposer les pièces de l'organisme, réévaluer, gérer les cycles", "qualiopi"),
    Permission("evidence.validate", "Valider ou rejeter des preuves, attester les revues d'indicateurs", "qualiopi"),
    Permission("referential.manage", "Importer une version du référentiel", "qualiopi"),
    Permission("funding.read", "Consulter les dossiers de financement et leurs échéances", "funding"),
    Permission("funding.write", "Gérer les dossiers de financement (sources, actions, montants)", "funding"),
    Permission("staff.read", "Consulter le personnel, les contrats et les absences", "hr"),
    Permission("staff.write", "Gérer le personnel, les contrats et les absences", "hr"),
    Permission("communications.manage", "Valider, annuler et suivre les relances et e-mails envoyés", "relances"),
    Permission("journal.read", "Consulter le journal des modifications", "core"),
    Permission("users.manage", "Gérer les comptes et attribuer les rôles", "core"),
    Permission("settings.manage", "Modifier les réglages et activer les fonctionnalités", "core"),
)
CODES = frozenset(p.code for p in CATALOGUE)

# Rôles proposés à tout organisme. Un organisme peut en créer d'autres (table iam.role).
SYSTEM_ROLES: dict[str, tuple[str, frozenset[str]]] = {
    "admin": ("Direction : tous les droits", CODES),
    "qualite": ("Responsable qualité : dépose, valide, gère le référentiel, l'équipe et les réglages", frozenset({
        "sessions.read", "quality.read", "quality.write", "evidence.validate", "referential.manage",
        "journal.read", "users.manage", "settings.manage", "communications.manage",
    })),
    "assistant_qualite": ("Assistant qualité : dépose les pièces et coche leur grille, ne valide pas", frozenset({
        "sessions.read", "quality.read", "quality.write", "journal.read",
    })),
    "gestion": ("Gestion des formations : sessions, inscriptions, formateurs", frozenset({
        "sessions.read", "sessions.write", "enrollments.write", "learners.assess", "trainers.write", "attendance.write", "funding.read", "quality.read", "journal.read", "communications.manage",
    })),
    "financement": ("Financement : dossiers CPF, OPCO, France Travail, entreprises", frozenset({
        "sessions.read", "funding.read", "funding.write", "journal.read",
    })),
    "formateur": ("Formateur : ses propres sessions, émargement, positionnement, évaluations, satisfaction à chaud",
                  frozenset({"sessions.read_own", "attendance.write", "learners.assess"})),
    "rh": ("Ressources humaines : personnel, contrats, absences, titres des formateurs", frozenset({
        "sessions.read", "trainers.write", "staff.read", "staff.write", "journal.read",
    })),
    "lecture": ("Lecture seule", frozenset({"sessions.read", "quality.read", "journal.read"})),
}


def check_codes(codes: set[str] | frozenset[str]) -> None:
    from app.core.errors import InvalidStateError

    unknown = set(codes) - CODES
    if unknown:
        raise InvalidStateError(f"Permissions inconnues : {', '.join(sorted(unknown))}")
