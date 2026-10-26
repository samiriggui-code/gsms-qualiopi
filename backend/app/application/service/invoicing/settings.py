"""Réglages de la facturation. Coordonnées, régime et taux de TVA, conditions de paiement et mentions sont ceux
des documents professionnels (`documents.*`) : ils ne sont pas dupliqués ici.

Les valeurs par défaut reprennent le droit supplétif quand il existe (délai de 30 jours et taux de pénalités de
l'art. L441-10 du code de commerce) ; elles restent des réglages que l'organisme ajuste à ses conditions de vente.
"""

from typing import Annotated

from pydantic import Field, StringConstraints

from app.application.service.platform.settings import SettingDef

Text = Annotated[str, StringConstraints(max_length=300)]

SETTINGS = (
    SettingDef("facturation.delai_paiement_jours", "Délai de paiement d'une facture (jours après l'émission)",
               Annotated[int, Field(ge=0, le=60)], 30, "invoicing",
               help="Valeur par défaut : 30 jours, délai prévu par le code de commerce (art. L441-10) quand rien "
                    "d'autre n'est convenu. Le délai convenu entre professionnels ne peut pas dépasser 60 jours."),
    SettingDef("facturation.taux_penalites", "Taux des pénalités de retard (clients professionnels)", Text,
               "Taux de refinancement de la Banque centrale européenne majoré de 10 points", "invoicing",
               help="Mention exigée par l'art. L441-9 du code de commerce. Défaut : taux supplétif de l'art. L441-10 ; "
                    "un taux convenu ne peut pas être inférieur à trois fois le taux d'intérêt légal."),
    SettingDef("facturation.escompte", "Conditions d'escompte pour paiement anticipé", Text,
               "Escompte pour paiement anticipé : néant", "invoicing",
               help="Mention exigée par l'art. L441-9 du code de commerce."),
    SettingDef("facturation.forme_juridique", "Forme juridique et capital de l'organisme", Text, "", "invoicing",
               help="Exemple : « SAS au capital de 10 000 € ». À renseigner si l'organisme est une société."),
    SettingDef("facturation.numero_tva", "Numéro de TVA intracommunautaire de l'organisme",
               Annotated[str, StringConstraints(max_length=20)], "", "invoicing",
               help="Exigé sur les factures soumises à la TVA (CGI, annexe II, art. 242 nonies A, 2°)."),
    SettingDef("facturation.coordonnees_bancaires", "Coordonnées bancaires imprimées (IBAN, BIC)", Text, "",
               "invoicing", help="Facultatif. Vide : la rubrique n'est pas imprimée."),
)
