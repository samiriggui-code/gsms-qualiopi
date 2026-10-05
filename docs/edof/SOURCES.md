# Exigences EDOF : sources officielles relues le 02/10/2026

Le référentiel des pièces (`backend/config/edof/referencement.yaml`, version `2026-10-02`) est tiré de
ces sources. Une nouvelle lecture des sources donne une nouvelle version du fichier.

## Sources

| Source | Date | Ce qu'on en retient |
|---|---|---|
| [Démarrer sur EDOF](https://of.moncompteformation.gouv.fr/espace-public/demarrer-sur-edof) | mis à jour le 24/09/2026 | Formalités : formations éligibles, **NDA actif**, **Qualiopi pour chaque type d'action**, **habilitation « former » ou « former et organiser l'évaluation »** pour une certification RNCP ou RS, **SIRET référencé comme partenaire du certificateur**, obligations légales, fiscales et sociales (dont BPF), CGU lues. Pièces du formulaire : Kbis de moins de 3 mois **ou** extrait RNE ; associations : statuts, dernier PV d'AG, récépissé JOAFE ; représentant personne physique : pièce d'identité valide **et** déclaration de non-condamnation et de filiation de moins de 3 mois ; représentant personne morale : Kbis, RNE ou JOAFE de moins de 3 mois. Procédure : compte **EFP Connect habilité** pour le SIRET (e-mail à la CDC, code « Responsable des accès EDOF »), formulaire, pièces complémentaires, décision à télécharger sur EDOF |
| [Conditions particulières OF, version 15](https://www.moncompteformation.gouv.fr/espace-public/sites/mcf/files/2026-05/CPOF_MCF_V15_VF.pdf) | 05/05/2026 | Art. 2 : accusé de réception, recevabilité sous **11 jours ouvrés**, instruction approfondie, **pièces complémentaires** possibles (identité, délégation de pouvoir, honorabilité, Kbis, avis SIRENE, statuts, PV d'AG, attestation de vigilance, liasse fiscale, bilan, attestation de régularité fiscale, titres et liens juridiques des intervenants, sous-traitance, certifications habilitées, conventions avec les évaluateurs, programmes détaillés, grille de gammes de tarifs). **Accompagnement dédié et obligatoire** (webinaire, parcours, documentation) que l'organisme s'engage à suivre. Art. 3.1 : informer la CDC de tout changement de responsable légal ou de situation juridique |
| [Version 15 des conditions d'utilisation : ce qui change](https://of.moncompteformation.gouv.fr/espace-public/version-15-des-conditions-dutilisation-ce-qui-change) | 05/05/2026, mis à jour le 05/08/2026 | Version en vigueur des CGU : 15. Nouvelles pièces (RNE pour artisans et libéraux, RNA ou JOAFE pour les associations) ; déclaration annuelle de la sous-traitance |
| [Vérification des conditions de référencement des OF présents sur MCF](https://of.moncompteformation.gouv.fr/espace-public/sites/of/files/2026-04/V%C3%A9rification-enregistrement-OF-sur-MCF_0.pdf) | avril 2026 | Liste des conditions de maintien : NDA, Qualiopi, habilitation, absence de condamnation des responsables, éligibilité, obligations fiscales et sociales, capacité technique et pédagogique, BPF, justificatifs, CGU |
| [Guide EDOF « Importer un catalogue par fichier XML »](https://of.moncompteformation.gouv.fr/espace-public/sites/of/files/2023-01/Guide_EDOF_Import_catalogue_fichier_XML_20220826.pdf) | V4 du 26/08/2022 | Voir § Export XML |
| [Import catalogue de formations par fichier xml : mise à jour des documents](https://of.moncompteformation.gouv.fr/espace-public/import-catalogue-de-formations-par-fichier-xml-mise-jour-des-documents) | publié le 17/09/2024, mis à jour le 12/06/2026 | Trois documents mis à jour : « Spécifications import xml », « Exemple de catalogue à importer », `Lheo_import_fichier_xml_optimise`. Téléchargeables dans EDOF (page « Transfert XML ») **ou publiquement** dans le [kit XML de juin 2026](https://of.moncompteformation.gouv.fr/espace-public/sites/of/files/2026-06/kit_XML_062026.zip) (ZIP, 863 Ko). Règles relevées sur la page : téléphone composé uniquement de chiffres, éventuellement précédé de `+`, 15 caractères au plus (rejet du fichier sinon) ; balises de blocs de compétences optionnelles, seulement pour une certification RNCP qui en comporte |
| France compétences, fiches « Agent de prévention et de sécurité » | consultées le 02/10/2026 | Plusieurs fiches RNCP actives (dont RNCP36648, échéance le 01/07/2027), certificateurs différents |
| Annuaire des entreprises, SIREN 853 725 844 | consulté le 02/10/2026 | FORM' SSI, SARL, SIRET du siège 853 725 844 00015, 9 avenue Alexandre Maistrasse 92500 Rueil-Malmaison, NAF 85.59A, déclarée organisme de formation et certifiée Qualiopi (sans détail du certificat) |

## Divergences relevées

1. **Délai de transmission des compléments.** La note de vérification (avril 2026) indique 14 jours
   ouvrables ; l'extrait des CP V15 lu parle du « délai indiqué » dans la demande. GSMS n'impose aucun
   délai : la date limite est recopiée de la demande reçue.
2. **Accompagnement de la CDC.** Les CP V15 le disent « dédié et obligatoire » ; la note de vérification
   écrit que « la Caisse des Dépôts n'assure pas d'accompagnement personnalisé ». Les deux sont
   compatibles (accompagnement collectif, pas individuel) : GSMS suit les sessions suivies, sans en
   déduire de conformité.
3. **Business plan.** Cité dans la demande du propriétaire ; absent de l'extrait de l'article 2 des CP
   V15 relu (paragraphe 3° non relu intégralement). Gardé comme pièce « peut être demandée », jamais
   bloquante sans demande de la CDC.
4. **Attestation de vigilance.** La durée de 6 mois est une valeur GSMS (validité habituelle de
   l'attestation), marquée comme telle dans le référentiel.
5. **Guide XML.** Le guide pas à pas public date de 2022. Le schéma et les spécifications à jour sont
   publics : kit XML de juin 2026 sur le portail des organismes (corrigé le 05/10/2026 ; la version du
   02/10/2026 de ce document les disait téléchargeables seulement depuis EDOF).

## Transmission : ce qui n'existe pas

- **Aucune API publique de dépôt** de la demande de référencement n'a été trouvée : le formulaire se
  remplit sur EDOF, les pièces complémentaires s'y transmettent. GSMS prépare, contrôle et trace ;
  chaque étape externe (dépôt, compléments, décision) est saisie par une personne et datée.
- **Export XML du catalogue** : démarche distincte du référencement. Elle suppose un organisme déjà
  référencé et un accès EDOF habilité pour importer le fichier. Le schéma
  (`lheo_import_fichier_xml_optimise`) et les spécifications en vigueur sont publics (kit XML de juin
  2026, voir Sources). Champs relevés dans le guide de 2022 : code RNCP ou RS, SIRET, numéros internes de
  formation, d'action et de session, intitulé, objectifs, contenu, résumé, résultats attendus, heures en
  centre et en entreprise, dates de session, frais pédagogiques, contacts et lieux. **Non développé** :
  le kit de 2026 n'a pas encore été relu en détail. La fiche formation versionnée contient déjà
  l'essentiel de ces informations.
