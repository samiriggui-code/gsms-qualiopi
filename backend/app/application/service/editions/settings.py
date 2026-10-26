"""Réglages des documents professionnels : coordonnées et mentions de l'organisme, TVA, devis.

Aucune valeur fiscale n'est supposée : tant que le régime de TVA n'est pas renseigné, aucun devis n'est validé.
"""

from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.application.service.platform.settings import SettingDef

Text = Annotated[str, StringConstraints(max_length=300)]
LongText = Annotated[str, StringConstraints(max_length=2000)]

SETTINGS = (
    SettingDef("documents.adresse", "Adresse postale de l'organisme (en-tête des documents)", Text, "", "documents",
               help="Numéro, rue, code postal et ville, sur une ligne."),
    SettingDef("documents.telephone", "Téléphone de l'organisme", Annotated[str, StringConstraints(max_length=40)], "",
               "documents"),
    SettingDef("documents.email", "E-mail de contact commercial", Annotated[str, StringConstraints(max_length=200)], "",
               "documents"),
    SettingDef("documents.site_web", "Site internet", Annotated[str, StringConstraints(max_length=200)], "", "documents"),
    SettingDef("documents.tva_regime", "Régime de TVA des formations",
               Literal["NON_RENSEIGNE", "EXONERE", "ASSUJETTI"], "NON_RENSEIGNE", "documents", regulatory=True,
               help="« Exonéré » seulement si l'organisme bénéficie de l'exonération de la formation professionnelle "
                    "continue (CGI, art. 261, 4, 4° a). Tant que ce n'est pas renseigné, un devis ne peut pas être validé."),
    SettingDef("documents.tva_taux", "Taux de TVA appliqué si l'organisme y est assujetti (%)",
               Annotated[float, Field(ge=0, le=100)], 20.0, "documents"),
    SettingDef("documents.devis_validite_jours", "Durée de validité d'un devis (jours)",
               Annotated[int, Field(ge=1, le=365)], 30, "documents", help="Valeur par défaut, modifiable sur chaque devis."),
    SettingDef("documents.conditions_paiement", "Conditions de paiement imprimées sur les devis", LongText, "", "documents",
               help="Exemple : délai, acompte, moyens de paiement. Vide : la rubrique n'est pas imprimée."),
    SettingDef("documents.mentions", "Mentions complémentaires en bas des devis", LongText, "", "documents"),
)
