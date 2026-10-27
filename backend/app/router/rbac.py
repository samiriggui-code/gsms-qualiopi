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
    Permission("programs.validate", "Valider une version de fiche formation (programme figé)", "training"),
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
    Permission("edof.read", "Consulter les dossiers de référencement CPF (EDOF)", "edof"),
    Permission("edof.write", "Préparer les dossiers EDOF : situation, pièces, dépôt, compléments, décision", "edof"),
    Permission("edof.validate", "Valider les pièces et les dossiers EDOF, attester les vérifications", "edof"),
    Permission("edof.sensitive", "Voir et déposer les pièces sensibles EDOF (identité, honorabilité)", "edof"),
    Permission("documents.read", "Consulter les documents professionnels (devis, propositions, rapports)", "documents"),
    Permission("documents.write", "Préparer les documents professionnels et les envoyer en relecture", "documents"),
    Permission("documents.validate", "Valider, renvoyer en préparation et archiver les documents professionnels", "documents"),
    Permission("invoices.read", "Consulter les factures, les avoirs et les encaissements", "invoicing"),
    Permission("invoices.write", "Préparer les factures en brouillon (client, lignes, dates)", "invoicing"),
    Permission("invoices.issue", "Émettre les factures (numéro définitif, pièce figée) et les avoirs", "invoicing"),
    Permission("payments.write", "Enregistrer et annuler les encaissements", "invoicing"),
    Permission("leads.read", "Consulter les demandes de préinscription reçues du site", "training"),
    Permission("leads.write", "Traiter les demandes de préinscription : prise en charge, refus, conversion", "training"),
    Permission("ia.use", "Utiliser l'assistant IA : session du moteur IA et ses outils de lecture Qualiopi", "core"),
    Permission("journal.read", "Consulter le journal des modifications", "core"),
    Permission("users.manage", "Gérer les comptes et attribuer les rôles", "core"),
    Permission("settings.manage", "Modifier les réglages et activer les fonctionnalités", "core"),
)
CODES = frozenset(p.code for p in CATALOGUE)

# Rôles proposés à tout organisme. Un organisme peut en créer d'autres (table iam.role).
SYSTEM_ROLES: dict[str, tuple[str, frozenset[str]]] = {
    "admin": ("Direction : tous les droits", CODES),
    "qualite": ("Responsable qualité : dépose, valide, gère le référentiel, l'équipe et les réglages", frozenset({
        "sessions.read", "quality.read", "quality.write", "evidence.validate", "referential.manage", "ia.use",
        "journal.read", "users.manage", "settings.manage", "communications.manage",
        "programs.validate", "edof.read", "edof.write", "edof.validate",
        "documents.read", "documents.write", "documents.validate",
    })),
    "assistant_qualite": ("Assistant qualité : dépose les pièces et coche leur grille, ne valide pas", frozenset({
        "sessions.read", "quality.read", "quality.write", "journal.read", "edof.read", "edof.write", "ia.use",
    })),
    "gestion": ("Gestion des formations : sessions, inscriptions, formateurs", frozenset({
        "sessions.read", "sessions.write", "enrollments.write", "learners.assess", "trainers.write", "attendance.write", "funding.read", "quality.read", "journal.read", "communications.manage", "edof.read", "ia.use",
        "documents.read", "documents.write", "leads.read", "leads.write", "invoices.read", "invoices.write",
    })),
    "financement": ("Financement : dossiers CPF, OPCO, France Travail, entreprises", frozenset({
        "sessions.read", "funding.read", "funding.write", "journal.read", "documents.read", "documents.write",
        "leads.read", "invoices.read", "invoices.write", "invoices.issue", "payments.write",
    })),
    "formateur": ("Formateur : ses propres sessions, émargement, positionnement, évaluations, satisfaction à chaud",
                  frozenset({"sessions.read_own", "attendance.write", "learners.assess"})),
    "rh": ("Ressources humaines : personnel, contrats, absences, titres des formateurs", frozenset({
        "sessions.read", "trainers.write", "staff.read", "staff.write", "journal.read",
    })),
    # Compte technique de l'assistant IA (serveur MCP, son jeton n'ouvre aucune autre route) : toutes les lectures,
    # aucune écriture. Chaque outil répond avec les seuls droits communs à ce compte et à la personne pour qui
    # l'assistant travaille (handler/mcp.py) : il ne montre jamais à quelqu'un ce que GSMS lui ferme.
    "assistant_ia": ("Assistant IA : lecture de toute l'application par le serveur MCP, avec les droits de la personne "
                     "qui pose la question (compte technique)",
                     frozenset({"quality.read", "sessions.read", "sessions.read_own", "funding.read", "staff.read", "edof.read",
                                "documents.read", "invoices.read", "leads.read", "journal.read"})),
    "lecture": ("Lecture seule", frozenset({"sessions.read", "quality.read", "journal.read", "edof.read",
                                           "documents.read", "ia.use"})),
}


def check_codes(codes: set[str] | frozenset[str]) -> None:
    from app.errors.errors import InvalidStateError

    unknown = set(codes) - CODES
    if unknown:
        raise InvalidStateError(f"Permissions inconnues : {', '.join(sorted(unknown))}")
