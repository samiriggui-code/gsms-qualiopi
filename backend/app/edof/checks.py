"""Contrôles des dossiers EDOF : chaque anomalie dit quoi corriger et où.

Une anomalie a un niveau :
  BLOQUANT    le dossier est incomplet tant qu'elle existe ;
  A_VERIFIER  une personne doit constater ou valider (pièce à valider, NDA à vérifier…) avant la
              validation interne ;
  INFO        renseignement utile, ne bloque rien.
et un mode : AUTO (calculé sur les données) ou HUMAIN (seule une personne peut le constater).
Aucun contrôle ne conclut à l'éligibilité ni à l'acceptation : c'est la Caisse des Dépôts qui décide.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.edof import fiche
from app.edof import models as m
from app.edof.requirements import STAGE_LABELS, Facts, PieceSpec, load
from app.training import models as t

CURRENT_CGU_VERSION = "15"  # en vigueur depuis le 5 mai 2026
QUALIOPI_CATEGORIES = {"AF": "Actions de formation", "BC": "Bilans de compétences", "VAE": "VAE",
                       "APPRENTISSAGE": "Actions de formation par apprentissage"}


@dataclass
class Anomaly:
    code: str
    niveau: str  # BLOQUANT | A_VERIFIER | INFO
    controle: str  # AUTO | HUMAIN
    message: str
    etape: str  # etablissement | programme | contenus | certification | pieces | suivi
    detail: str | None = None
    cible: dict = field(default_factory=dict)  # {"type": "champ" | "piece" | ..., "code": ...}

    def to_dict(self) -> dict:
        return asdict(self)


def fmt(d: date | None) -> str:
    return d.strftime("%d/%m/%Y") if d else "—"


def siret_is_valid(siret: str | None) -> bool:
    """14 chiffres, clé de Luhn correcte, et pas une valeur de démonstration faite de zéros."""
    if not siret:
        return False
    digits = siret.replace(" ", "")
    if len(digits) != 14 or not digits.isdigit() or set(digits) == {"0"}:
        return False
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch) * (2 if i % 2 else 1)
        total += n - 9 if n > 9 else n
    return total % 10 == 0


def same_siret(a: str | None, b: str | None) -> bool:
    return (a or "").replace(" ", "") == (b or "").replace(" ", "")


def reference_date(dossier: m.Dossier, today: date) -> date:
    """Date à laquelle les pièces sont jugées : celle du dépôt une fois déposé, sinon aujourd'hui."""
    return dossier.submitted_on or today


def current_pieces(dossier: m.Dossier) -> dict[str, m.Piece]:
    return {p.requirement: p for p in dossier.pieces if p.replaced_at is None}


def facts_for(establishment: m.Establishment | None, cert: t.ProgramCertification | None = None) -> Facts:
    return Facts(
        structure_type=establishment.structure_type if establishment else None,
        representative_kind=establishment.representative_kind if establishment else None,
        uses_subcontracting=establishment.uses_subcontracting if establishment else None,
        certification_basis=cert.basis if cert else None,
        habilitation=cert.habilitation if cert else None,
        has_job_authorization=bool(cert.other_requirements) if cert else False,
    )


# ── Pièces ───────────────────────────────────────────────────────────────────────


def check_piece(spec: PieceSpec, piece: m.Piece, ref: date, org_siret: str | None, etape: str) -> list[Anomaly]:
    out: list[Anomaly] = []
    target = {"type": "piece", "code": spec.code, "piece_id": piece.id}
    if piece.status == "REJETEE":
        out.append(Anomaly("PIECE_REJETEE", "BLOQUANT", "HUMAIN", f"Pièce rejetée : {spec.label}", etape,
                           piece.rejection_reason, target))
    if spec.max_age_days:
        if piece.issued_on is None:
            out.append(Anomaly("DATE_DOCUMENT_MANQUANTE", "BLOQUANT", "AUTO", f"Date du document à saisir : {spec.label}",
                               etape, f"Le document doit dater de moins de {spec.max_age_days} jours.", target))
        elif piece.issued_on + timedelta(days=spec.max_age_days) < ref:
            out.append(Anomaly("JUSTIFICATIF_EXPIRE", "BLOQUANT", "AUTO", "Justificatif expiré", etape,
                               f"{spec.label} : daté du {fmt(piece.issued_on)}, plus de {spec.max_age_days} jours "
                               f"au {fmt(ref)}. Demandez un document récent.", target))
    if spec.expires:
        if piece.valid_until is None:
            out.append(Anomaly("FIN_VALIDITE_MANQUANTE", "BLOQUANT", "AUTO", f"Fin de validité à saisir : {spec.label}",
                               etape, None, target))
        elif piece.valid_until < ref:
            out.append(Anomaly("JUSTIFICATIF_EXPIRE", "BLOQUANT", "AUTO", "Justificatif expiré", etape,
                               f"{spec.label} : valable jusqu'au {fmt(piece.valid_until)}.", target))
    if spec.siret:
        if not piece.siret_on_document:
            out.append(Anomaly("SIRET_DOCUMENT_A_VERIFIER", "A_VERIFIER", "HUMAIN",
                               f"SIRET porté par le document à relever : {spec.label}", etape, None, target))
        elif not same_siret(piece.siret_on_document, org_siret):
            out.append(Anomaly("SIRET_DIFFERENT", "BLOQUANT", "AUTO", "SIRET différent de celui de l'établissement", etape,
                               f"{spec.label} : {piece.siret_on_document} ; établissement : {org_siret or 'non renseigné'}.",
                               target))
    if piece.status == "A_VALIDER":
        out.append(Anomaly("PIECE_A_VALIDER", "A_VERIFIER", "HUMAIN", f"Pièce à valider : {spec.label}", etape,
                           "Une personne habilitée doit la relire et la valider.", target))
    return out


def check_pieces(specs: list[PieceSpec], dossier: m.Dossier, facts: Facts, ref: date, org_siret: str | None,
                 etape: str = "pieces") -> list[Anomaly]:
    out: list[Anomaly] = []
    pieces = current_pieces(dossier)
    requested = {c.requirement for c in dossier.complements if c.status == "DEMANDEE" and c.requirement}
    groups_done = {s.group for s in specs if s.group and s.code in pieces}
    group_labels: dict[str, list[str]] = {}
    for s in specs:
        if s.group and s.applies(facts) is not False:
            group_labels.setdefault(s.group, []).append(s.label)
    groups_reported: set[str] = set()
    for spec in specs:
        if spec.generated or spec.stage == "SUIVI":
            continue  # programme : contrôlé par la version validée ; suivi : courrier reçu après le dépôt
        if spec.stage == "COMPLEMENT" and spec.code not in pieces and spec.code not in requested:
            continue  # à préparer, demandée seulement si la Caisse des Dépôts la réclame
        applies = spec.applies(facts)
        if applies is False and spec.code not in requested:
            continue
        piece = pieces.get(spec.code)
        if piece is None:
            if spec.group and (spec.group in groups_done or spec.group in groups_reported):
                continue
            if spec.group and applies is not None and len(group_labels.get(spec.group, [])) > 1:
                groups_reported.add(spec.group)
                out.append(Anomaly("PIECE_MANQUANTE", "BLOQUANT", "AUTO",
                                   "Pièce manquante : " + " ou ".join(group_labels[spec.group]), etape,
                                   f"Une seule suffit. {STAGE_LABELS[spec.stage]}. À fournir par : {spec.provided_by}.",
                                   {"type": "piece", "code": spec.code}))
                continue
            if applies is None:
                out.append(Anomaly("APPLICABILITE_A_DETERMINER", "A_VERIFIER", "AUTO",
                                   f"Pièce peut-être requise : {spec.label}", etape,
                                   "Complétez d'abord : " + ", ".join(spec.conditions_text()),
                                   {"type": "piece", "code": spec.code}))
                continue
            out.append(Anomaly("PIECE_MANQUANTE", "BLOQUANT", "AUTO", f"Pièce manquante : {spec.label}", etape,
                               f"{STAGE_LABELS[spec.stage]}. À fournir par : {spec.provided_by}.",
                               {"type": "piece", "code": spec.code}))
            continue
        out.extend(check_piece(spec, piece, ref, org_siret, etape))
    return out


def check_complements(dossier: m.Dossier, today: date) -> list[Anomaly]:
    out = []
    for c in dossier.complements:
        if c.status != "DEMANDEE":
            continue
        late = c.due_on is not None and c.due_on < today
        out.append(Anomaly("COMPLEMENT_NON_FOURNI", "BLOQUANT", "AUTO", "Pièce demandée par la CDC non fournie", "suivi",
                           f"{c.label} — demandée le {fmt(c.requested_on)}"
                           + (f", à fournir avant le {fmt(c.due_on)}" if c.due_on else "")
                           + (" (délai dépassé)" if late else ""),
                           {"type": "complement", "id": c.id, "code": c.requirement}))
    return out


# ── Établissement ───────────────────────────────────────────────────────────────


def _missing(field_name: str, label: str) -> Anomaly:
    return Anomaly("INFORMATION_MANQUANTE", "BLOQUANT", "AUTO", f"Information manquante : {label}", "etablissement",
                   None, {"type": "champ", "champ": field_name})


def establishment_anomalies(db: Session, dossier: m.Dossier, today: date) -> list[Anomaly]:
    org = db.get(t.Organization, dossier.organization_id)
    est = db.scalar(select(m.Establishment).where(m.Establishment.organization_id == dossier.organization_id))
    ref = reference_date(dossier, today)
    out: list[Anomaly] = []
    if not org.siret:
        out.append(_missing("siret", "SIRET de l'établissement"))
    elif not siret_is_valid(org.siret):
        out.append(Anomaly("SIRET_INVALIDE", "BLOQUANT", "AUTO", "SIRET invalide", "etablissement",
                           f"« {org.siret} » n'est pas un SIRET valide (14 chiffres, clé de contrôle).",
                           {"type": "champ", "champ": "siret"}))
    for name, label in (("legal_name", "dénomination"), ("legal_form", "forme juridique"),
                        ("structure_type", "type de structure"), ("address", "adresse de l'établissement"),
                        ("representative_kind", "nature du représentant légal"),
                        ("representative_name", "représentant légal")):
        if est is None or not getattr(est, name):
            out.append(_missing(name, label))
    if est is not None and est.identity_checked_on is None:
        out.append(Anomaly("IDENTITE_A_VERIFIER", "A_VERIFIER", "HUMAIN", "Identité légale à vérifier", "etablissement",
                           "Comparer dénomination, SIRET et adresse avec l'Annuaire des entreprises ou le Kbis.",
                           {"type": "champ", "champ": "identity_checked_on"}))
    # NDA
    if not org.nda_number:
        out.append(Anomaly("NDA_MANQUANT", "BLOQUANT", "AUTO", "NDA non renseigné", "etablissement",
                           "Un numéro de déclaration d'activité actif est exigé.", {"type": "champ", "champ": "nda_number"}))
    elif est is None or est.nda_checked_on is None:
        out.append(Anomaly("NDA_A_VERIFIER", "A_VERIFIER", "HUMAIN", "NDA actif à vérifier", "etablissement",
                           "Vérifier sur Mon Activité Formation que la déclaration est active.",
                           {"type": "champ", "champ": "nda_checked_on"}))
    # Qualiopi
    categories = set(est.qualiopi_categories or []) if est else set()
    if est is None or not est.qualiopi_certificate:
        out.append(Anomaly("QUALIOPI_MANQUANT", "BLOQUANT", "AUTO", "Certification Qualiopi non renseignée", "etablissement",
                           "Numéro du certificat, certificateur, date de fin de validité et catégories couvertes.",
                           {"type": "champ", "champ": "qualiopi_certificate"}))
    elif est.qualiopi_valid_until is None:
        out.append(_missing("qualiopi_valid_until", "fin de validité du certificat Qualiopi"))
    elif est.qualiopi_valid_until < ref:
        out.append(Anomaly("QUALIOPI_EXPIRE", "BLOQUANT", "AUTO", "Justificatif expiré", "etablissement",
                           f"Certificat Qualiopi échu le {fmt(est.qualiopi_valid_until)}.",
                           {"type": "champ", "champ": "qualiopi_valid_until"}))
    offered = {p.action_category or "AF" for p in db.scalars(
        select(t.Program).join(m.Dossier, m.Dossier.program_id == t.Program.id)
        .where(m.Dossier.parent_id == dossier.id))} or {"AF"}
    for cat in sorted(offered - categories):
        out.append(Anomaly("QUALIOPI_CATEGORIE", "BLOQUANT", "AUTO",
                           f"Qualiopi ne couvre pas la catégorie : {QUALIOPI_CATEGORIES.get(cat, cat)}", "etablissement",
                           "Chaque type d'action proposé sur EDOF doit être couvert par la certification.",
                           {"type": "champ", "champ": "qualiopi_categories"}))
    if est is not None and est.qualiopi_certificate and est.qualiopi_checked_on is None:
        out.append(Anomaly("QUALIOPI_A_VERIFIER", "A_VERIFIER", "HUMAIN", "Certificat Qualiopi à vérifier", "etablissement",
                           "Comparer avec le certificat et la liste publique des organismes certifiés.",
                           {"type": "champ", "champ": "qualiopi_checked_on"}))
    # Obligations, CGU, sous-traitance, accès
    if est is None or est.obligations_checked_on is None:
        out.append(Anomaly("OBLIGATIONS_A_VERIFIER", "A_VERIFIER", "HUMAIN",
                           "Obligations légales, fiscales et sociales à vérifier", "etablissement",
                           "Dont la transmission du bilan pédagogique et financier (BPF) et les obligations comptables.",
                           {"type": "champ", "champ": "obligations_checked_on"}))
    if est is None or est.bpf_last_year is None or est.bpf_last_year < today.year - 1:
        out.append(Anomaly("BPF_A_CONFIRMER", "A_VERIFIER", "HUMAIN", "Dernier bilan pédagogique et financier à confirmer",
                           "etablissement", f"Indiquer l'exercice du dernier BPF transmis (attendu : {today.year - 1}).",
                           {"type": "champ", "champ": "bpf_last_year"}))
    if est is None or est.cgu_read_on is None or est.cgu_version_read != CURRENT_CGU_VERSION:
        out.append(Anomaly("CGU_A_LIRE", "A_VERIFIER", "HUMAIN",
                           f"Prise de connaissance des CGU Mon Compte Formation (version {CURRENT_CGU_VERSION}) à confirmer",
                           "etablissement", None, {"type": "champ", "champ": "cgu_read_on"}))
    if est is None or est.uses_subcontracting is None:
        out.append(Anomaly("SOUS_TRAITANCE_A_DECLARER", "A_VERIFIER", "HUMAIN", "Recours à la sous-traitance à déclarer",
                           "etablissement", "Détermine les pièces sur les sous-traitants.",
                           {"type": "champ", "champ": "uses_subcontracting"}))
    if est is None or est.efp_connect_status != "HABILITE":
        out.append(Anomaly("EFP_CONNECT", "BLOQUANT", "HUMAIN", "Accès EFP Connect habilité à EDOF manquant", "etablissement",
                           "Compte EFP Connect habilité pour ce SIRET (demande à la Caisse des Dépôts par e-mail, "
                           "code d'accès « Responsable des accès EDOF »).",
                           {"type": "champ", "champ": "efp_connect_status"}))
    ref_pieces = load().for_scope("ETABLISSEMENT")
    out.extend(check_pieces(ref_pieces, dossier, facts_for(est), ref, org.siret))
    out.extend(check_complements(dossier, today))
    if dossier.status in ("DEPOSE", "COMPLEMENTS_DEMANDES", "DECISION_RECUE") and not any(
            a.done_on for a in dossier.accompaniments):
        out.append(Anomaly("ACCOMPAGNEMENT_CDC", "A_VERIFIER", "HUMAIN",
                           "Accompagnement obligatoire de la CDC : aucun suivi enregistré", "suivi",
                           "Les conditions particulières (art. 2) engagent l'organisme à suivre l'accompagnement "
                           "proposé (webinaire, parcours, documentation).", {"type": "accompagnement"}))
    return out


# ── Formation ───────────────────────────────────────────────────────────────────


def formation_anomalies(db: Session, dossier: m.Dossier, today: date) -> list[Anomaly]:
    p = db.get(t.Program, dossier.program_id)
    org = db.get(t.Organization, dossier.organization_id)
    est = db.scalar(select(m.Establishment).where(m.Establishment.organization_id == dossier.organization_id))
    cert = fiche.certification_of(db, p.id)
    ref = reference_date(dossier, today)
    out: list[Anomaly] = []

    # Programme
    for name, _label, message in fiche.missing_fields(p):
        out.append(Anomaly("RUBRIQUE_MANQUANTE", "BLOQUANT", "AUTO", message, "programme", None,
                           {"type": "champ", "champ": name}))
    state = fiche.version_state(db, p)
    if state["state"] == "JAMAIS_VALIDEE":
        out.append(Anomaly("PROGRAMME_NON_VALIDE", "BLOQUANT", "HUMAIN", "Programme non validé", "programme",
                           "Faites valider la fiche : le programme et le dossier seront tirés de cette version.",
                           {"type": "version"}))
    elif state["state"] == "MODIFIEE" and dossier.status in ("EN_PREPARATION", "VALIDE_INTERNE"):
        out.append(Anomaly("PROGRAMME_NON_VALIDE", "BLOQUANT", "HUMAIN", "Programme non validé", "programme",
                           f"La fiche a changé depuis la version {state['version']} : validez une nouvelle version.",
                           {"type": "version"}))

    # Certification et habilitations
    if cert is None or cert.basis == "A_DETERMINER":
        out.append(Anomaly("FONDEMENT_CPF_INCONNU", "BLOQUANT", "HUMAIN", "Fondement d'éligibilité CPF non identifié",
                           "certification", "Identifier la certification (RNCP ou RS) ou l'autre fondement prévu à "
                           "L. 6323-6 du code du travail.", {"type": "champ", "champ": "basis"}))
    elif cert.basis == "NON_CERTIFIANTE":
        out.append(Anomaly("NON_ELIGIBLE", "BLOQUANT", "AUTO", "Formation non éligible au CPF en l'état", "certification",
                           "Une formation qui ne vise pas une certification enregistrée n'est pas éligible à ce titre.",
                           {"type": "champ", "champ": "basis"}))
    if cert is not None and cert.basis in ("RNCP", "RS"):
        if not cert.code:
            out.append(Anomaly("CERTIFICATION_CODE", "BLOQUANT", "AUTO", "Code de la certification manquant",
                               "certification", f"Code {cert.basis} de la fiche France compétences.",
                               {"type": "champ", "champ": "code"}))
        if cert.registration_end is None:
            out.append(Anomaly("CERTIFICATION_ECHEANCE", "BLOQUANT", "AUTO", "Échéance de l'enregistrement à saisir",
                               "certification", None, {"type": "champ", "champ": "registration_end"}))
        elif cert.registration_end < ref:
            out.append(Anomaly("CERTIFICATION_EXPIREE", "BLOQUANT", "AUTO", "Justificatif expiré", "certification",
                               f"Enregistrement de {cert.code} échu le {fmt(cert.registration_end)}.",
                               {"type": "champ", "champ": "registration_end"}))
        if cert.checked_on is None:
            out.append(Anomaly("CERTIFICATION_A_VERIFIER", "A_VERIFIER", "HUMAIN",
                               "Validité et périmètre de la certification à vérifier", "certification",
                               "Relire la fiche sur France compétences (état, échéance, certificateur).",
                               {"type": "verification", "quoi": "certification"}))
        if cert.habilitation in (None, "A_VERIFIER") or cert.habilitation_checked_on is None:
            out.append(Anomaly("HABILITATION_A_VERIFIER", "A_VERIFIER" if cert.habilitation not in (None, "A_VERIFIER")
                               else "BLOQUANT", "HUMAIN", "Habilitation à vérifier", "certification",
                               "Le SIRET doit figurer parmi les organismes préparant à la certification "
                               "(fiche France compétences) ou être attesté par le certificateur.",
                               {"type": "verification", "quoi": "habilitation"}))
        if cert.habilitation == "AUCUNE":
            out.append(Anomaly("SANS_HABILITATION", "BLOQUANT", "AUTO",
                               "L'établissement n'est pas habilité pour cette certification", "certification",
                               "Un contenu acheté ou repris n'accorde pas d'habilitation : seule celle du certificateur compte.",
                               {"type": "champ", "champ": "habilitation"}))
        if cert.partner_siret and not same_siret(cert.partner_siret, org.siret):
            out.append(Anomaly("SIRET_DIFFERENT", "BLOQUANT", "AUTO", "SIRET différent de celui de l'établissement",
                               "certification", f"SIRET référencé chez le certificateur : {cert.partner_siret} ; "
                               f"établissement : {org.siret or 'non renseigné'}.", {"type": "champ", "champ": "partner_siret"}))
        elif not cert.partner_siret:
            out.append(Anomaly("SIRET_PARTENAIRE", "A_VERIFIER", "AUTO", "SIRET référencé chez le certificateur à saisir",
                               "certification", None, {"type": "champ", "champ": "partner_siret"}))
        if cert.habilitation == "FORMER" and not cert.evaluator_name:
            out.append(Anomaly("EVALUATEUR_MANQUANT", "BLOQUANT", "AUTO", "Partenaire évaluateur à identifier",
                               "certification", "Habilité à former seulement : l'évaluation est organisée par un "
                               "organisme habilité, avec une convention.", {"type": "champ", "champ": "evaluator_name"}))
        mapping = cert.competence_mapping or []
        if not mapping:
            out.append(Anomaly("CORRESPONDANCE_MANQUANTE", "A_VERIFIER", "HUMAIN",
                               "Correspondance compétences, programme et évaluation à établir", "certification",
                               "Pour chaque compétence ou bloc du référentiel : modules qui la travaillent et modalité "
                               "d'évaluation.", {"type": "champ", "champ": "competence_mapping"}))
        module_codes = {mod.get("code") for mod in (p.modules or [])}
        for row in mapping:
            comp = row.get("competence") or "?"
            if not (row.get("evaluation") or "").strip():
                out.append(Anomaly("EVALUATION_MANQUANTE", "BLOQUANT", "AUTO", "Modalités d'évaluation manquantes",
                                   "certification", f"Compétence « {comp} » : aucune modalité d'évaluation.",
                                   {"type": "champ", "champ": "competence_mapping"}))
            unknown = [c for c in row.get("modules") or [] if c not in module_codes]
            if not row.get("modules"):
                out.append(Anomaly("COMPETENCE_SANS_MODULE", "A_VERIFIER", "AUTO", "Compétence sans module associé",
                                   "certification", f"Compétence « {comp} ».", {"type": "champ", "champ": "competence_mapping"}))
            elif unknown:
                out.append(Anomaly("MODULE_INCONNU", "BLOQUANT", "AUTO", "Module inconnu dans la correspondance",
                                   "certification", f"Compétence « {comp} » : {', '.join(unknown)} absent(s) du programme.",
                                   {"type": "champ", "champ": "competence_mapping"}))
    for req in (cert.other_requirements if cert else None) or []:
        if not req.get("verified_on"):
            out.append(Anomaly("AUTORISATION_A_VERIFIER", "A_VERIFIER", "HUMAIN",
                               f"Autorisation à vérifier : {req.get('label') or 'autorisation d’exercice'}", "certification",
                               req.get("reference"), {"type": "champ", "champ": "other_requirements"}))

    # Intervenants
    trainers = fiche.trainers_of(db, p.id)
    if not trainers:
        out.append(Anomaly("SANS_INTERVENANT", "BLOQUANT", "AUTO", "Aucun intervenant associé", "contenus", None,
                           {"type": "intervenants"}))
    for _pt, tr in trainers:
        quals = list(db.scalars(select(t.TrainerQualification).where(t.TrainerQualification.trainer_id == tr.id)))
        if not quals:
            out.append(Anomaly("TITRES_INTERVENANT", "A_VERIFIER", "AUTO", f"Titres de {tr.full_name} non renseignés",
                               "contenus", "Diplômes, cartes et habilitations dans la fiche du formateur.",
                               {"type": "intervenant", "id": tr.id}))
        for q in quals:
            if q.valid_until and q.valid_until < ref:
                out.append(Anomaly("JUSTIFICATIF_EXPIRE", "BLOQUANT", "AUTO", "Justificatif expiré", "contenus",
                                   f"{q.label} de {tr.full_name} : valable jusqu'au {fmt(q.valid_until)}.",
                                   {"type": "intervenant", "id": tr.id}))

    # Contenus pédagogiques
    resources = fiche.resources_of(db, p.id)
    if not resources:
        out.append(Anomaly("SANS_CONTENU", "A_VERIFIER", "AUTO", "Aucun contenu pédagogique associé", "contenus",
                           "Supports, quiz, cas pratiques, évaluations.", {"type": "ressources"}))
    for r in resources:
        target = {"type": "ressource", "id": r.id}
        if r.rights == "INTERDIT":
            out.append(Anomaly("CONTENU_NON_REUTILISABLE", "BLOQUANT", "AUTO", f"Contenu non réutilisable : {r.title}",
                               "contenus", r.rights_note, target))
        elif r.rights == "A_VERIFIER":
            out.append(Anomaly("DROITS_A_VERIFIER", "A_VERIFIER", "HUMAIN", f"Droits de réutilisation à vérifier : {r.title}",
                               "contenus", "Origine : " + r.origin + (f" ({r.source_ref})" if r.source_ref else ""), target))
        if r.status == "A_REDIGER":
            out.append(Anomaly("CONTENU_A_REDIGER", "A_VERIFIER", "AUTO", f"Contenu à rédiger : {r.title}", "contenus",
                               r.note, target))

    # Pièces de la formation
    specs = load().for_scope("FORMATION")
    out.extend(check_pieces(specs, dossier, facts_for(est, cert), ref, org.siret))
    out.extend(check_complements(dossier, today))

    # Dossier de l'établissement
    parent = db.get(m.Dossier, dossier.parent_id) if dossier.parent_id else None
    if parent is not None:
        blocking = [a for a in establishment_anomalies(db, parent, today) if a.niveau == "BLOQUANT"]
        if blocking:
            out.append(Anomaly("ETABLISSEMENT_INCOMPLET", "BLOQUANT", "AUTO", "Dossier de l'établissement incomplet",
                               "etablissement", f"{len(blocking)} point(s) bloquant(s) dans le dossier commun.",
                               {"type": "dossier", "id": parent.id}))
    return out


def anomalies(db: Session, dossier: m.Dossier, today: date | None = None) -> list[Anomaly]:
    today = today or date.today()
    if dossier.kind == "ETABLISSEMENT":
        return establishment_anomalies(db, dossier, today)
    return formation_anomalies(db, dossier, today)
