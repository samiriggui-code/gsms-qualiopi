"""Libellés français des types de preuve (ce que l'écran affiche à la place du code)."""

EVIDENCE_TYPES: dict[str, str] = {
    "ADAPTATION": "Adaptation au bénéficiaire",
    "AGREEMENT": "Convention ou contrat signé",
    "ASSESSMENT": "Évaluation des acquis",
    "ATTENDANCE": "Émargement",
    "CERTIFICATE": "Attestation ou certificat",
    "CERTIFICATION_ALIGNMENT": "Correspondance avec le référentiel de certification",
    "CERTIFICATION_RESULTS": "Taux d'obtention de la certification",
    "COMPLAINT_HANDLING": "Traitement d'une réclamation",
    "CONTENT": "Contenu et modalités de la formation",
    "CONVOCATION": "Convocation",
    "DISABILITY_REFERENT": "Référent handicap",
    "DOCUMENT": "Document de l'organisme",
    "DROPOUT_FOLLOWUP": "Suivi d'abandon",
    "EXAM_PRESENTATION": "Présentation à l'examen",
    "HANDICAP_PARTNER": "Réseau handicap",
    "IMPROVEMENT_ACTION": "Action d'amélioration clôturée",
    "NEEDS_ANALYSIS": "Analyse du besoin",
    "OBJECTIVES": "Objectifs opérationnels et évaluables",
    "ORG_DOCUMENT": "Pièce du dossier de l'organisme",
    "POSITIONING": "Positionnement à l'entrée",
    "PROCEDURE": "Procédure",
    "PUBLIC_INFO": "Information publique",
    "RESULTS_PUBLISHED": "Indicateurs de résultats publiés",
    "SESSION_RESOURCES": "Moyens affectés à la session",
    "SOCIO_PARTNER": "Partenaire socio-économique",
    "STAFF_DEVELOPMENT": "Développement des compétences",
    "SUBCONTRACTOR": "Sous-traitance",
    "SURVEY_RESPONSE": "Appréciation recueillie",
    "TRAINER_DOCUMENT": "Pièce du dossier d'un formateur",
    "TRAINER_QUALIFICATION": "Qualification d'un intervenant",
    "WATCH": "Veille",
}


def evidence_label(code: str) -> str:
    return EVIDENCE_TYPES.get(code, code.replace("_", " ").capitalize())
