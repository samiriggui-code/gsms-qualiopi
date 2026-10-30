# Parcours « Référencement CPF (EDOF) » dans GSMS Qualiopi

Menu **Offre de formation › Référencement CPF**. Inventaire : [`INVENTAIRE.md`](INVENTAIRE.md).
Sources officielles : [`SOURCES.md`](SOURCES.md).

## 1. Le parcours retenu

| Étape | Où | Ce que fait GSMS |
|---|---|---|
| 1. Situation administrative | `/formation/edof` | Identité, SIRET, NDA, représentant, Qualiopi, accès EFP Connect, vérifications à attester, pièces communes |
| 2. Choisir une formation | `/formation/edof` | Liste des formations et état de leur dossier ; « Préparer son dossier » |
| 3. Programme validé | Onglet Programme | Fiche unique ; points à arbitrer ; modules ; validation d'une **version figée** |
| 4. Contenus, intervenants, moyens | Onglet Contenus | Intervenants (titres et dates de validité) ; contenus avec origine, droits, état |
| 5. Certification et habilitations | Onglet Certification | Fondement CPF, code, échéance, certificateur ; habilitation (former / former et évaluer), SIRET partenaire, évaluateur ; correspondance compétences / modules / évaluation ; vérifications attestées |
| 6. Contrôles | Onglet Contrôles | Anomalies bloquantes ou à vérifier, chacune avec sa cible |
| 7. Corriger | Bouton « Corriger » | Ouvre l'onglet et met en évidence le champ, la pièce ou l'intervenant |
| 8. Documents et aperçu | Onglet Documents et aperçu | Programme rédigé (HTML imprimable, empreinte) et aperçu de fiche catalogue, tirés d'une version validée |
| 9. Préparer la transmission | Onglet Transmission | Pièces de la formation, validation interne |
| 10. Dépôt, compléments, décision | Onglet Transmission, dossier établissement | Dépôt déclaré (instantané figé), compléments recopiés, décision enregistrée, accompagnement CDC |

États d'un dossier : **Dossier incomplet** (au moins un point bloquant) → **Prêt pour validation
interne** → **Validé en interne, à déposer** → **Déposé** → **Compléments demandés** → **Décision
officielle reçue**. Les deux premiers sont calculés ; les autres sont saisis. Un dossier complet dans
GSMS n'est pas une acceptation : l'écran le rappelle.

Règles du cycle (décidées par l'API) : la validation interne exige zéro point bloquant et zéro point
à vérifier (pièces validées, vérifications attestées) ; le dépôt d'une offre suppose le dossier de
l'établissement déposé (offre témoin) et non refusé ; un dossier déposé n'accepte de pièce qu'en
réponse à une demande de compléments ; les pièces sont jugées à la date du dépôt une fois déposé.

## 2. Contrôles

| Contrôle | Message | Automatique | Humain |
|---|---|---|---|
| SIRET : 14 chiffres, clé de Luhn, pas de zéros de démonstration | « SIRET invalide » | ✔ | |
| SIRET lu sur Kbis, RNE, avis SIRENE, attestation, justificatif d'habilitation, SIRET partenaire du certificateur | « SIRET différent de celui de l'établissement » | ✔ (comparaison) | ✔ (lecture du document) |
| Ancienneté (moins de 3 mois, 6 mois) et fin de validité | « Justificatif expiré » | ✔ | |
| Pièce applicable absente (selon structure, représentant, certification, sous-traitance) | « Pièce manquante : … » | ✔ | |
| Situation qui ne permet pas de dire si une pièce s'applique | « Pièce peut-être requise : … » | ✔ | |
| Pièce déposée non relue | « Pièce à valider : … » | | ✔ |
| NDA présent / actif | « NDA non renseigné » / « NDA actif à vérifier » | ✔ / | / ✔ |
| Qualiopi : certificat, échéance, catégories couvrant les actions proposées | « Certification Qualiopi non renseignée », « Justificatif expiré », « Qualiopi ne couvre pas la catégorie… » | ✔ | ✔ (relecture du certificat) |
| Obligations légales, fiscales et sociales, BPF, CGU V15, sous-traitance déclarée | « … à vérifier », « … à confirmer » | | ✔ |
| Accès EFP Connect habilité | « Accès EFP Connect habilité à EDOF manquant » | | ✔ (déclaré) |
| Rubriques de la fiche formation | « Modalités d'évaluation manquantes », « Tarif manquant »… | ✔ | |
| Version validée à jour | « Programme non validé » | ✔ (empreinte) | ✔ (validation) |
| Fondement CPF identifié, certification enregistrée et non échue | « Fondement d'éligibilité CPF non identifié », « Justificatif expiré » | ✔ | ✔ (relecture de la fiche France compétences) |
| Habilitation : pas d'habilitation, former seulement sans évaluateur | « Habilitation à vérifier », « Partenaire évaluateur à identifier » | ✔ | ✔ |
| Correspondance compétences / modules / évaluation | « Modalités d'évaluation manquantes », « Module inconnu… » | ✔ | ✔ (pertinence) |
| Intervenants associés, titres à jour | « Aucun intervenant associé », « Justificatif expiré » | ✔ | |
| Contenus : droits de réutilisation, contenu à rédiger | « Droits de réutilisation à vérifier », « Contenu à rédiger » | ✔ | ✔ |
| Compléments de la CDC | « Pièce demandée par la CDC non fournie » | ✔ | |
| Accompagnement de la CDC après dépôt | « Accompagnement obligatoire de la CDC : aucun suivi enregistré » | | ✔ |

Jamais automatique : l'éligibilité réelle, l'habilitation, l'authenticité d'une pièce, la décision.
GSMS ne fabrique ni attestation, ni signature, ni habilitation : il range ce que les personnes ou
organismes compétents fournissent, et prépare des trames quand c'est permis.

Les pièces sensibles (pièce d'identité, déclaration de non-condamnation, d'interdiction de gérer)
exigent la permission `edof.sensitive` (rôle Direction) pour être déposées, vues ou téléchargées.

## 3. Première tranche réelle : TFP APS

`python -m app.cmd.cli import-formssi` crée ou complète, sans rien écraser :

- l'établissement Form'SSI (identité relevée sur l'Annuaire des entreprises) et son dossier ; le NDA
  `11922308992`, la certification Qualiopi « Actions de formation » et le dernier BPF (exercice 2025)
  repris de la liste publique des organismes de formation (DGEFP, consultée le 05/10/2026) ;
- la formation **TFP-APS** avec les modules UV1 à UV14 et les prérequis repris de GSMS School ; la
  durée (175 h), le tarif « à partir de » (1 190 €) et les modalités d'évaluation (évaluation continue,
  QCU, jury) repris de la fiche TFP APS de GSMS School, chacun avec un point « à confirmer » ; la
  certification « à déterminer », l'autorisation CNAPS reprise de GSMS School « à vérifier », les
  contenus LMS générés automatiquement listés « à rédiger », et ses points à arbitrer.

Rien n'est attesté à la place d'une personne : « NDA actif », identité, certificat Qualiopi restent à
vérifier. Les taux de réussite (97 %) et de satisfaction (94 %) de la fiche ne sont pas repris : ils
sont écrits en dur, sans calcul ni période.

Sur cette base (05/10/2026), le dossier affiche 10 points bloquants et 5 à vérifier pour la formation,
5 bloquants et 8 à vérifier pour l'établissement : c'est l'état réel, pas un défaut.

## 4. Informations à obtenir de Form'SSI

**Établissement**
1. Vérification sur Mon Activité Formation que le NDA `11922308992` est actif (il figure sur la liste
   publique DGEFP, à attester dans GSMS).
2. Représentant légal (personne physique ou morale), nom et qualité.
3. Certificat Qualiopi : numéro, certificateur, date de fin (catégorie « Actions de formation »
   confirmée par la liste publique DGEFP).
4. Kbis de moins de 3 mois ; pièce d'identité et déclaration de non-condamnation et de filiation du
   représentant (si personne physique), signées de sa main.
5. État du compte EFP Connect et de l'habilitation EDOF pour le SIRET 853 725 844 00015.
6. Recours ou non à la sous-traitance, lecture des CGU V15 (dernier BPF : exercice 2025, déclaré le
   31/05/2026 selon la liste publique DGEFP).
7. Adresse : « 9 » avenue Alexandre Maistrasse (siège, Annuaire et liste DGEFP) ; le « 5 » cité comme
   lieu de session dans GSMS School est-il un second local ou une erreur ?

**TFP APS**
8. Fiche RNCP retenue et certificateur, avec la convention ou l'attestation de partenariat (Form'SSI
   habilitée à former seulement, ou à former et organiser l'évaluation ; SIRET référencé).
9. Si habilitée à former seulement : organisme évaluateur et convention.
10. Confirmation de la durée (175 h reprises, à rapprocher de l'arrêté du 1er septembre 2025 et du
    cahier des charges de la certification) et du tarif (1 190 € « à partir de » : ce qu'il comprend) ;
    délai d'accès, accessibilité, moyens (plateau, poste de sécurité, matériel), objectifs
    opérationnels et compétences selon le référentiel.
11. Confirmation des modalités d'évaluation reprises (évaluation continue, QCU, jury) au regard du
    référentiel de certification et du rôle de Form'SSI.
12. Formateurs de la formation, avec carte professionnelle de formateur CNAPS et titres en cours.
13. Autorisation d'exercice CNAPS de l'organisme (`FOP-092-2023-09-13-20230855451` dans GSMS School) :
    document et date de fin.
14. Contenus pédagogiques réels et droits de réutilisation (les cours et quiz du LMS sont des
    textes générés à remplacer).

## 5. Suites proposées

1. Importer les 31 autres formations du catalogue GSMS School (même méthode, sans inventer).
2. Relier les sessions à la version de programme en vigueur à leur confirmation.
3. Lier la progression LMS (après rédaction des contenus) au suivi pédagogique, sans la présenter
   comme preuve de présence.
4. Export XML du catalogue, à partir du kit XML public de juin 2026 (voir SOURCES.md).
5. Vitrine publique Form'SSI alimentée par les versions validées (HANDOFF §7.5).
