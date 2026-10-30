# Inventaire des données — GSMS Qualiopi

Audit des données du moteur Python (`backend/app/types/*.py`, `backend/config/dossiers/standard.yaml`, `backend/config/edof/referencement.yaml`) et des écrans du back-office (`app/src/views/gsms`, `app/src/views/settings/gsms`), état de la branche `refonte-front` au 26/10/2026 (modifications non commitées incluses : `service`, `site_*` du personnel et des formateurs).

Ce document est un **audit en lecture seule**. Il ne modifie ni le moteur ni le front et ne décide d'aucune règle.

**Comment lire les niveaux** (règle §2 de `HANDOFF.md`) :

| Niveau | Sens |
|---|---|
| **LÉGAL** | Obligation d'un texte (loi, décret, arrêté) cité avec son article. |
| **QUALIOPI n°X** | Le référentiel national qualité exige une **preuve** pour l'indicateur X. Le champ ou la pièce proposé est **une** façon de la produire, jamais la seule. Les « exemples de preuves » du guide de lecture **ne sont pas des obligations**. |
| **RÉSEAU** | Exigence d'un financeur, d'un certificateur ou d'un réseau (CNAPS, INRS pour le SST, arrêté SSIAP, CGU Mon Compte Formation, OPCO…). Elle ne s'applique qu'à l'organisme concerné par ce réseau. |
| **BONNE PRATIQUE** | Recommandé, jamais obligatoire. À présenter comme « recommandé ». |
| **CONFORT ERP** | Utile à la gestion courante, sans portée de contrôle. |
| **À VÉRIFIER** | Je n'ai pas pu lire le texte en vigueur. À ne pas présenter comme une règle tant que ce n'est pas vérifié. |

**Priorités :** P1 = indispensable pour un audit ou un contrôle ; P2 = ERP courant ; P3 = confort.

**Sources consultées le 26/10/2026** (liste complète en §12). Le référentiel v10 du dépôt (`backend/referentials/qualiopi/v10/source/`) donne les énoncés du décret n° 2026-728 du 1er août 2026 ; les niveaux attendus et les exemples de preuves cités ici viennent du guide de lecture V9 (`v9/source/`), le seul guide présent dans le dépôt. **Il faut confirmer avec le guide de lecture v10 du ministère dès qu'il sera publié.**

---

## 0. Synthèse : les manques P1 les plus graves pour un audit ou un contrôle

1. **La fiche stagiaire est presque vide.** `Learner` ne contient que le nom, le prénom, l'e-mail, le téléphone, l'entreprise et la photo. La date de naissance, la civilité, l'adresse et la nationalité sont saisies dans la **préinscription** mais ne sont pas reprises lors de la conversion en stagiaire. Le prestataire de formation en sécurité privée doit pourtant tenir la liste des stagiaires avec leur **civilité, leur prénom, leur nom et leur date de naissance** (arrêté du 23/10/2024, art. 10). Pour un stagiaire inscrit sans préinscription, ces données manquent. Le front n'a d'ailleurs aucun formulaire de création ou de modification d'un stagiaire.
2. **L'autorisation préalable ou la carte professionnelle du stagiaire CNAPS n'est pas enregistrée.** Un prestataire ne peut accepter en formation APS qu'un candidat titulaire de l'autorisation préalable, de l'autorisation provisoire ou de la carte professionnelle (CSI, art. R625-2). Le moteur n'a aucun champ pour le numéro, ni pour la date de vérification. Le formulaire public ne recueille qu'une case cochée par le candidat (« Démarches CNAPS menées par l'école »).
3. **Les déclarations CNAPS ne sont pas suivies.** La déclaration de chaque session au CNAPS (au moins 15 jours avant, avec l'identité des stagiaires, R625-1) et celle de chaque examen (15 jours avant, ou 35 jours si l'administration organise une épreuve, R625-36 et R625-38) ne sont pas enregistrées : ni date, ni référence, ni alerte.
4. **Les titres réglementaires de l'organisme n'ont pas de champ.** Il manque l'autorisation d'exercer du CNAPS, l'agrément préfectoral SSIAP (n° à 4 chiffres, 5 ans, renouvellement au moins 2 mois avant l'échéance), l'habilitation INRS pour le SST et l'assurance de responsabilité civile. Cette assurance est obligatoire pour l'agrément SSIAP (art. 12-4) et pour la formation APS (arrêté du 23/10/2024, art. 4). Le CNAPS retire l'autorisation si le renouvellement Qualiopi ne lui est pas transmis dans le mois qui suit la fin de validité (R625-16). La date de fin de validité Qualiopi existe bien, mais seulement dans le dossier EDOF : aucune alerte CNAPS ne l'exploite.
5. **Les formateurs indépendants et sous-traitants n'ont pas de dossier fournisseur.** Il manque le SIRET, le n° de déclaration d'activité (NDA), l'attestation de vigilance URSSAF (obligatoire dès 5 000 € HT, à la signature puis tous les 6 mois, Code du travail L8222-1), l'extrait Kbis ou RNE, l'assurance, la certification Qualiopi avec ses dates, et l'habilitation du certificateur. En CPF, le sous-traitant doit être certifié Qualiopi et habilité, sauf exception pour certains micro-entrepreneurs (FAQ ministère, décret 2023-1350). Le formateur n'est pas non plus rattaché au sous-traitant qui l'emploie.
6. **La carte professionnelle de formateur CNAPS a un type de titre mais aucune règle d'application.** Elle est obligatoire depuis le 01/03/2025 (CSI, L625-11 et R625-23 à R625-29, validité 5 ans). Le type `CARTE_PRO_FORMATEUR_CNAPS` existe, mais rien n'indique quelles formations l'exigent. Le moteur ne peut donc pas signaler un formateur APS dont la carte est absente ou expirée. Il en va de même pour le certificat de formateur SST (3 ans, MAC tous les 36 mois, INRS) et pour la qualification des formateurs SSIAP.
7. **Les prérequis réglementaires du stagiaire ne sont pas des pièces.** Le SSIAP 1 exige un certificat médical de moins de 3 mois (annexe VII) et un secourisme valide (PSC1 de moins de 2 ans, ou SST ou PSE1 en cours de validité). Aujourd'hui, `Positioning.prerequisites_met` n'est qu'un booléen, sans pièce ni date de validité. Le moteur ne prévoit pas de dossier de pièces pour le stagiaire : les sujets possibles sont seulement `ORGANISME`, `FORMATEUR` et `FORMATION`.
8. **Les lieux et équipements ne sont pas prêts pour un contrôle.** Pour les lieux, il manque le type et la catégorie ERP, la convention de mise à disposition (exigée par le CNAPS, art. 5, et par l'agrément SSIAP, art. 12-5), l'autorisation ou la convention pour les feux réels (SSIAP, art. 12-6) et le registre public d'accessibilité (décret 2017-431). Pour les équipements, il manque le numéro de série, l'organisme vérificateur, le rapport de vérification et le suivi d'hygiène des mannequins.
9. **Le développement des compétences ne couvre que les formateurs (indicateur 22).** `StaffDevelopmentAction` est rattaché à `trainer_id` seulement. La direction, l'équipe administrative et le référent handicap, qui sont des salariés, n'ont aucune action de formation possible. Les entretiens professionnels ne sont pas enregistrés.
10. **Les données du BPF manquent** (le moteur le dit lui-même dans `pilotage/bpf.py`) : la situation du stagiaire (salarié, demandeur d'emploi, particulier…), le code NSF des formations, l'adresse et la forme juridique de l'organisme, et la ventilation des heures par formateur interne ou externe.

**Ce qu'il ne faut PAS collecter par défaut :** le NIR (aucun texte ne l'impose à l'OF pour ses stagiaires), une copie de pièce d'identité du stagiaire (sauf démarche précise et justifiée), un bulletin de casier judiciaire du stagiaire, un diagnostic médical ou la nature d'un handicap. Le détail est au §2.3.

---

## 1. Inventaire de l'existant

### 1.1 Organisme (`formation.organization`, `edof.establishment`)

| Entité | Champs en base | Écrans | Champs en base absents des formulaires |
|---|---|---|---|
| `Organization` | `name`, `nda_number`, `siret`, `action_categories`, `is_new_entrant`, `disability_referent_name/email`, `mobility_referent_name` | Paramètres › Organisme (`OrganismeSettings.vue`) : tout est éditable | aucun (le référent mobilité n'a **pas** d'e-mail en base) |
| `Establishment` (EDOF) | raison sociale, forme juridique, type de structure, adresse, code NAF, source et date de l'identité, représentant (type, nom, fonction), `nda_checked_on`, certificat Qualiopi (n°, certificateur, fin de validité, catégories, date de vérification), statut EFP Connect, `obligations_checked_on`, `bpf_last_year`, version des CGU lue, `uses_subcontracting`, `note` | Paramètres › EDOF (`EdofSettings.vue`) : tout est éditable | aucun |
| Pièces EDOF (`edof.piece`, `config/edof/referencement.yaml`) | Kbis, extrait RNE, statuts, pièce d'identité du représentant, déclaration de non-condamnation, avis SIRENE, attestation de vigilance, attestation de régularité fiscale, liasse, bilan, grille tarifaire, contrats de sous-traitance, autorisation d'exercice (CNAPS)… avec `issued_on`, `valid_until`, `siret_on_document` | EDOF › Dossier (`EdofDossier.vue`) | — |
| Dossier qualité (`config/dossiers/standard.yaml`, sujet `ORGANISME`) | organigramme, compte rendu de réunion pédagogique, inventaire des ressources, procédure de réclamations, règlement intérieur, procédure contre les violences et discriminations, analyse des risques | Qualité › Dossier de l'organisme (`OrganismeDossier.vue`) | — |

À noter : l'identité légale (adresse, forme juridique, représentant, Qualiopi) n'existe que dans le dossier EDOF. Le BPF et les documents émis ne peuvent donc pas la reprendre de façon générale.

### 1.2 Stagiaire, entreprise cliente, préinscription

| Entité | Champs en base | Écrans | Absents des formulaires |
|---|---|---|---|
| `Learner` | `first_name`, `last_name`, `email`, `phone`, `company_id`, `photo_url` | Stagiaires (`Learners.vue`, liste), fiche (`LearnerSheet.vue`, lecture) | **Aucun formulaire** de création ni de modification dans le front. L'API `POST/PATCH /learners` existe. Un stagiaire est aujourd'hui créé par la conversion d'une préinscription. |
| `Preinscription` | civilité, prénom, nom, nom d'usage, e-mail, téléphone, date, ville, département et pays de naissance, nationalité, adresse, code postal, ville, formation, session souhaitée, mode de financement, situation actuelle, expérience, motivation, `compliance` (6 déclarations cochées), `consented_at`, suivi (statut, traité par, motif de refus, conversion) | Commercial › Demandes (`Requests.vue`, `RequestSheet.vue`, lecture et actions) | — (données du candidat, non modifiables) |
| `Company` | nom, SIRET, contact (nom, e-mail, fonction), code client, adresse, code postal, ville, téléphone | Commercial › Entreprises (`Companies.vue`, `CompanySheet.vue`, `companyForm.ts`) | à confirmer champ par champ (le formulaire est construit depuis `companyForm.ts`) |

**Écart majeur :** à la conversion (`/preinscriptions/{id}/conversion`), seul le schéma `PersonIn` (nom, prénom, e-mail, téléphone, entreprise, photo) passe dans `Learner`. La naissance, l'adresse, la nationalité et la situation restent dans la préinscription.

### 1.3 Formateurs, titres, développement des compétences

| Entité | Champs | Écrans | Absents des formulaires |
|---|---|---|---|
| `Trainer` | prénom, nom, e-mail, `is_external`, `specialties`, `user_id`, `photo_url`, `site_visible`, `site_title`, `site_bio` (non commités) | RH › Formateurs (`Trainers.vue`), fiche (`TrainerDetail.vue`), formulaire `rh/forms.ts` | `photo_url`, `site_visible`, `site_title`, `site_bio` (le chantier C20 est en cours) |
| `TrainerQualification` | `kind` (`CARTE_PRO_FORMATEUR_CNAPS`, `SSIAP3`, `FORMATEUR_SST`, `HABILITATION_ELECTRIQUE`, `DIPLOME`, `AUTRE`), `label`, `number`, `obtained_on`, `valid_until`, `document_id` | `TrainerDetail.vue` (ajout et modification) | — |
| Dossier formateur (`standard.yaml`, sujet `FORMATEUR`) | `CV` (validité 730 j, grille : compétences, carte CNAPS, titres métier), `CHARTE_FORMATEUR` (charte ou contrat d'intervention signé) | RH › Dossier formateur (`TrainerDossier.vue`) | — |
| `StaffDevelopmentAction` | `trainer_id` (**seulement**), `label`, `planned_on`, `completed_on` | RH › Développement (`StaffDevelopment.vue`) | — |
| `ProgramTrainer` | formation, formateur, rôle (formateur, évaluateur, responsable pédagogique), modules | Fiche formation (lecture) | — |

### 1.4 Personnel RH

| Entité | Champs | Écrans | Absents des formulaires |
|---|---|---|---|
| `StaffMember` | prénom, nom, e-mail, `kind` (salarié, indépendant, sous-traitant, intérimaire, stagiaire), `job_title`, `active`, `user_id`, `trainer_id`, `photo_url`, `service` (direction, pédagogie, RH), `site_*` | RH › Personnel (`Staff.vue`) | `active`, `photo_url`, `service`, `site_visible`, `site_title`, `site_bio`, `user_id` |
| `StaffContract` | `kind` (CDI, CDD, intérim, stage, apprentissage, prestation, sous-traitance), début, fin, temps de travail, note | `Staff.vue` | — |
| `StaffAbsence` | début, fin, type (congé, maladie, formation, autre), note | `Staff.vue` | — |

### 1.5 Sous-traitants, partenaires, veille, réclamations

| Entité | Champs | Écrans | Absents des formulaires |
|---|---|---|---|
| `Subcontractor` | nom, SIRET, `qualiopi_certified` (booléen), `contract_signed_on`, `last_review_on` | Ressources › Sous-traitants, Paramètres › Moyens | — |
| `PartnerNetwork` | `kind` (handicap, socio-économique), nom, `last_contact_on` | Ressources › Partenaires | — |
| `WatchItem` | domaine, titre, source, date, exploitation, date d'exploitation | Qualité › Veille | — |
| `Complaint` | session, type (réclamation, difficulté, aléa), partie prenante, reçue le, description, accusé de réception, réponse, résolution | Qualité › Réclamations | — |

### 1.6 Lieux et équipements

| Entité | Champs | Écrans | Absents des formulaires |
|---|---|---|---|
| `Premises` | code, nom, type (site, salle, plateau technique, stockage), parent, adresse, étage, capacité, accessibilité (texte), statut, `checked_on`, `source`, note | Ressources › Lieux, Paramètres › Moyens | `source` |
| `Equipment` | code, libellé, catégorie (secourisme, incendie, sécurité privée, EPI, informatique, mobilier), quantité, lieu, `regulatory_ref`, statut, `last_check_on`, `next_check_on`, `source`, note | Ressources › Équipements | `source` |

### 1.7 Offre, sessions, parcours

| Entité | Champs | Écrans | Absents des formulaires |
|---|---|---|---|
| `Program` | code, titre, catégorie, `is_certifying`, `rncp_code`, durée, prix, prérequis, objectifs, contenu, méthodes pédagogiques, méthodes d'évaluation, délai d'accès, accessibilité, `certification_alignment`, `public_info_reviewed_on`, taux de réussite et de satisfaction, public, compétences, modalité, modules, moyens, `catalog_slug`, `review_notes`, `results_basis`, filière, parcours (initial, MAC, RAN), `evaluation_steps`, `image_url` | Formations › Catalogue (création : code, titre, durée), fiche (`ProgramSheet.vue`, « Compléter » : public, compétences, contenu, modalité, méthodes, moyens, évaluation, délai, accessibilité, alignement, objectifs, prérequis) | `price_eur`, `rncp_code`, `is_certifying`, `modules`, `evaluation_steps`, `success_rate`, `satisfaction_rate`, `track`, `pathway`, `image_url`, `public_info_reviewed_on` (affichés en partie, non éditables) |
| `ProgramCertification` | base (RNCP, RS…), code, titre, certificateur, fin d'enregistrement, URL, vérification, habilitation, SIRET du partenaire, évaluateur, correspondance des compétences, autres exigences | Fiche formation (formulaire « certification visée ») | `partner_siret`, `habilitation_checked_*`, `competence_mapping`, `other_requirements` (à confirmer) |
| `ProgramResource`, `ProgramVersion` | ressources pédagogiques (droits, origine) ; versions validées du programme | Fiche formation | — |
| `TrainingSession` | référence, formation, dates, lieu (**texte**), salle (texte), **un seul** formateur, capacité, statut, motif d'annulation, sous-traitant | Sessions (liste, détail) | **Aucun formulaire** de création ni de modification de session dans le front |
| `Enrollment` | session, stagiaire, entreprise, statut, `funding` (texte), abandon (date, motif), jeton d'émargement | Détail de session (inscription : choix du stagiaire seulement), parcours | `company_id` et `funding` à l'inscription |
| `NeedsAnalysis`, `Positioning`, `Convocation`, `Agreement`, `Assessment`, `Certificate`, `AttendanceSlot` et `AttendanceSignature`, `SatisfactionSurvey` | besoin, adaptation (statut et notes), positionnement (méthode, niveau, `prerequisites_met`), convocation, convention (envoi, signature, signataire), évaluations (type, note, réussite), attestation, créneaux et signatures (méthode, auteur, motif), questionnaires | Parcours (`LearnerJourney.vue`), Registres, Émargement, Évaluations, Satisfaction, pages publiques | — |

### 1.8 Financement, devis, facturation, documents

| Entité | Champs | Écrans |
|---|---|---|
| `FundingCase` / `FundingSource` / `FundingStep` | coût ; dispositif (CPF, OPCO, France Travail, entreprise, personnel), état, financeur, signataire, destinataire de la facture, payeur, montants demandé, accordé et payé, `external_ref` (n° EDOF ou OPCO), `invoice_ref`, motif, étapes datées | Finances › Financements |
| `Project` / `QuoteLine` (devis) | référence, client, sections, validité, version, lignes | Commercial › Devis |
| `Invoice` / `InvoiceLine` / `Payment` | numérotation continue, client (identité et SIRET), bon de commande, période de la prestation, échéance, totaux, TVA, avoir, encaissements | Finances › Factures, Encaissements |
| `Document` | type, rattachement (`entity_type`/`entity_id`), version, statut, signature, empreinte, `requirement`, grille de contrôle | Communication › Documents, dossiers |
| `DocumentRequest` | sujet **`ORGANISME` ou `FORMATEUR` seulement**, pièce, demandée à, échéance, statut | dossiers |

---

## 2. Stagiaire / apprenant

### 2.1 Attributs et pièces manquants

| Donnée ou pièce | Utilité | Niveau | Source | RGPD | Prio |
|---|---|---|---|---|---|
| Civilité, nom de naissance et nom d'usage | listes CNAPS, attestations, diplômes | LÉGAL (formations APS) ; CONFORT ailleurs | Arrêté du 23/10/2024, art. 10 (liste des stagiaires : civilité, prénom, nom, date de naissance) | ordinaire | P1 |
| **Date de naissance** | liste CNAPS, déclaration de session (« identité des stagiaires », R625-1), justificatif d'aptitude, procès-verbaux SSIAP et SST | LÉGAL (APS) ; RÉSEAU (SSIAP, SST : à vérifier sur les modèles de diplôme et de certificat) | CSI R625-1 ; arrêté du 23/10/2024, art. 10 | ordinaire ; accès réservé à la gestion | P1 |
| Lieu (ville, pays) de naissance | identification sur les diplômes ou justificatifs | À VÉRIFIER : l'ancien arrêté du 01/07/2016, art. 3, l'exigeait pour le justificatif d'aptitude, mais il est abrogé depuis le 01/03/2025 ; le cahier des charges de 2025 n'a pas été vérifié | — | ordinaire | P2 |
| Nationalité | CNAPS (titre de séjour, niveau de français B1 pour les étrangers, R625-26 pour les formateurs, loi « sécurité globale » pour les agents) | RÉSEAU (CNAPS, instruit par le CNAPS, pas par l'OF) | CSI R625-26 ; actualité CNAPS sur la loi sécurité globale | **ne pas la demander par défaut** ; seulement si la formation l'exige (L6353-9) | P3 |
| Adresse postale | contrat individuel (L6353-3), facture au particulier, convocation | LÉGAL indirect (contrat et facture d'un particulier) | C. trav. L6353-3 et L6353-4 | ordinaire | P2 |
| **N° d'autorisation préalable, d'autorisation provisoire ou de carte professionnelle CNAPS**, type, date de délivrance, date de vérification (téléservice), auteur | accepter le stagiaire en formation APS | **LÉGAL** | CSI R625-2 I ; R625-34 (formations armées) | ordinaire ; c'est un numéro, **pas une copie** | **P1** |
| Pièce d'identité : seulement **vue et vérifiée** (date, auteur), pas copiée | contrôle d'identité à l'examen (SSIAP, CQP, TFP) | RÉSEAU (modalités d'examen : à vérifier selon chaque certificateur) | arrêté du 02/05/2005, art. 8 (à vérifier) | **ne pas conserver de copie par défaut** (§2.3) | P2 |
| **Certificat médical SSIAP 1, 2, 3** (date, médecin, « apte », fin de validité = date + 3 mois à l'entrée) | prérequis | **LÉGAL** (arrêté) | Arrêté du 02/05/2005, annexe VII (certificat de moins de 3 mois) et art. 4 | **donnée de santé** (art. 9 RGPD) : ne garder que la date et la mention « apte », le document en accès restreint, durée limitée | P1 |
| **Secourisme pour le SSIAP 1** (PSC1 de moins de 2 ans, ou SST ou PSE1 valide) : type, date, n°, pièce | prérequis | **LÉGAL** (arrêté) | Arrêté du 02/05/2005, art. 4 et tableau des conditions | ordinaire | P1 |
| SSIAP antérieur et expérience (SSIAP 2 et 3, recyclage, remise à niveau) | prérequis | LÉGAL (arrêté) | Arrêté du 02/05/2005 (art. 4 à 7, à détailler par niveau) | ordinaire | P1 |
| Certificat SST antérieur (pour un MAC SST) : n°, date, validité de 24 mois | prérequis du MAC | RÉSEAU (INRS) | Document de référence SST de l'INRS (certificat SST valable 2 ans) | ordinaire | P2 |
| Prérequis atteste par une pièce (au lieu de `prerequisites_met` en booléen) | preuve de l'indicateur 8 et des prérequis de l'indicateur 5 | QUALIOPI n°8 | v10 `08-positionnement-evaluation-entree.md` | — | P1 |
| **Situation** (salarié, demandeur d'emploi, particulier, apprenti, autre) | BPF (cadre F), financement | **LÉGAL** (BPF) | C. trav. L6352-11 ; cerfa 10443 ; `pilotage/bpf.py` le signale comme manquant | ordinaire | P1 |
| Employeur (si salarié) et lien avec l'entreprise cliente | convention, OPCO | LÉGAL (convention L6353-1) | — | ordinaire | P2 (existe : `company_id`) |
| Besoin d'adaptation (handicap) : **le besoin seulement**, jamais le diagnostic ; consentement daté ; orientation vers un partenaire | preuve de l'indicateur 26, adaptation (indicateur 10) | QUALIOPI n°26 et n°10 | v9 `26-…md` (niveau attendu) | **donnée de santé** : le consentement explicite est la base retenue ici, à valider par un DPO ; accès restreint (existe déjà pour `/parcours/adaptations`) ; ne pas demander « quel handicap » | P1 (existe en partie : `NeedsAnalysis.adaptation_*`) |
| Contact d'urgence | sécurité pendant les exercices pratiques (feu, secourisme) | BONNE PRATIQUE | — | ordinaire, facultatif | P3 |
| Documents du parcours (contrat individuel, convention, convocation, attestation, certificat de réalisation, diplôme ou certificat obtenu) | dossier stagiaire complet pour l'audit et le financeur | LÉGAL (contrat L6353-3, attestation de fin L6353-1 al. 2, à vérifier) ; RÉSEAU (certificat de réalisation pour CPF et OPCO) | C. trav. L6353-1, L6353-3 et L6353-4 ; précis de l'apprentissage (modèle de certificat de réalisation, conservation 3 ans) | ordinaire | P1 |
| **Résultat de certification** : obtenu ou non, n° de diplôme ou de certificat (SSIAP, SST par la plateforme INRS, CQP, TFP), date, date de fin de validité ou de recyclage | indicateur 3 (taux d'obtention), justificatif d'aptitude, relance des MAC et recyclages | QUALIOPI n°3 ; LÉGAL (APS : justificatifs d'aptitude tenus 3 ans, arrêté du 23/10/2024, art. 10) | — | ordinaire | P1 |
| Attestation sur l'honneur pour l'assurance du véhicule (si des véhicules de stagiaires servent aux mises en situation) | APS | LÉGAL (APS) | Arrêté du 23/10/2024, art. 4 | ordinaire | P3 |
| Devenir à 6 mois (insertion, poursuite d'études) | indicateur 29 si applicable | QUALIOPI n°29 (selon les prestations) | v10 `29-…md` | ordinaire | P2 |

### 2.2 Impact sur les écrans (stagiaire)

- **Fiche stagiaire** : blocs « Identité », « Titres CNAPS », « Prérequis et pièces » et « Certifications obtenues ». Les champs sensibles sont masqués sans droit dédié.
- **Formulaire** : création et modification (absentes aujourd'hui). Reprendre toutes les données de la préinscription à la conversion, avec le consentement daté.
- **Liste** : colonnes pour l'autorisation CNAPS (oui, non, expirée), les prérequis complets et la situation BPF.
- **Alertes** : autorisation préalable absente avant l'ouverture de la session ; certificat médical de plus de 3 mois au premier jour ; recyclage SSIAP (3 ans) et MAC SST (24 mois) à proposer, en relance commerciale facultative.
- **Dossier de pièces** : ajouter le sujet `STAGIAIRE` à `standard.yaml` (certificat médical, secourisme, autorisation CNAPS, contrat ou convention, diplôme).

### 2.3 Sensibilité RGPD : à ne pas collecter par défaut

| Donnée | Position | Source |
|---|---|---|
| **NIR (numéro de sécurité sociale)** | **Ne pas collecter pour les stagiaires.** Aucun texte n'impose à l'OF de le recueillir pour une action de formation, un dossier CPF ou EDOF (le titulaire s'identifie lui-même sur Mon Compte Formation), le BPF ou le CNAPS. Son usage est encadré par le décret « cadre NIR » n° 2019-341. Exceptions possibles : le contrat d'apprentissage (cerfa, rempli par l'employeur ou le CFA ; à vérifier si GSMS gère un jour l'apprentissage) et la **paie des salariés de l'OF**, qui relève du logiciel de paie et non de GSMS. | CNIL, « Tout savoir sur le décret cadre NIR » ; référentiel GRH de la CNIL (nov. 2019) : NIR « dans les conditions fixées par le décret 2019-341 » |
| **Copie de pièce d'identité du stagiaire** | **Pas de copie par défaut.** Le principe de minimisation (RGPD, art. 5.1.c) et le Code du travail limitent les informations demandées au candidat à ce qui permet d'apprécier son aptitude à suivre la formation (L6353-9). Préférer « pièce vue le …, par … ». La copie se justifie quand l'OF mène lui-même, pour le stagiaire, une démarche qui l'exige (dépôt CNAPS par mandat : le formulaire de préinscription annonce « Démarches CNAPS menées par l'école »). Dans ce cas : finalité écrite, accès restreint, suppression dès la démarche aboutie. La CNIL rappelle qu'une copie n'est pas nécessaire quand l'identité est établie autrement. | C. trav. L6353-9 ; CNIL, « Répondre à une demande de droit d'accès » |
| **Copie de pièce d'identité du formateur** | **Exigée** dans le dossier d'agrément SSIAP (art. 12-7 : liste des formateurs avec CV et photocopie d'une pièce d'identité), pour les seuls formateurs SSIAP déclarés au préfet. Accès restreint ; à conserver tant que l'agrément le requiert. | Arrêté du 02/05/2005, art. 12 |
| **Casier judiciaire** | Le contrôle de moralité du stagiaire APS est fait **par le CNAPS** (autorisation préalable). L'OF ne doit **pas** demander de bulletin n°3 au stagiaire. La case « Aucune condamnation incompatible » de la préinscription est une déclaration relevant de l'art. 10 du RGPD (données d'infraction) : la faire valider par un DPO, ou la remplacer par « titulaire de l'autorisation préalable du CNAPS ». Le bulletin n°3 est exigé **du représentant légal de l'OF** pour l'agrément SSIAP (art. 12-2), et les pièces de non-condamnation du dossier EDOF concernent aussi le représentant. | Arrêté du 02/05/2005, art. 12 ; CSI R625-2 ; RGPD, art. 10 |
| **Santé (handicap, certificat médical)** | Données sensibles (art. 9). Recueillir le besoin d'adaptation, pas la pathologie. Certificat médical : mention « apte » et date ; le document en accès restreint, durée courte (fin de la session plus le délai de contrôle). | RGPD, art. 9 ; v9 indicateur 26 |
| **Photo** | Facultative, avec consentement. Utile seulement pour une carte de stagiaire ou un trombinoscope (CONFORT ERP). | — |

**Durées de conservation à paramétrer (à valider par un DPO) :**

- pièces justificatives d'une action financée : 3 ans à compter de la fin de l'année du dernier paiement (modèle de certificat de réalisation, précis de l'apprentissage) ;
- documents APS (liste des stagiaires, justificatifs de présence, justificatifs d'aptitude) : 3 ans sur place (arrêté du 23/10/2024, art. 10). L'ancien arrêté de 2016, qui fixait 5 ans, est abrogé ;
- pièces comptables : 10 ans (C. com. L123-22) ;
- personnel : référentiel GRH de la CNIL (durées à reprendre dans le texte ; non relues en détail).

---

## 3. Formateurs (salarié interne, indépendant, formateur d'un sous-traitant)

### 3.1 Attributs et pièces manquants

| Donnée ou pièce | Formateur concerné | Niveau | Source | RGPD | Prio |
|---|---|---|---|---|---|
| CV à jour (existe : pièce `CV`, 730 jours) | tous | LÉGAL (titres et qualités) ; QUALIOPI n°21 | C. trav. **L6352-1** (justifier des titres et qualités des personnels d'enseignement) ; v9 indicateur 21 (le CV est un exemple de preuve) | ordinaire | P1 (existe) |
| Diplômes et titres avec pièce et validité (existe : `TrainerQualification`) | tous | LÉGAL L6352-1 ; QUALIOPI n°21 | idem | ordinaire | P1 (existe) |
| **Carte professionnelle de formateur CNAPS** : n° d'enregistrement, date de délivrance, expiration (5 ans), date de vérification sur le téléservice | formateurs des formations APS (sauf fonctionnaires, militaires d'active, magistrats… R625-24) | **LÉGAL** depuis le 01/03/2025 | CSI L625-11, R625-23, R625-25 (5 ans), R625-29 (numéro communiqué à l'employeur, carte d'entreprise remise) | ordinaire (numéro) | **P1** (le type existe ; il manque le lien formation → titre exigé et l'alerte) |
| Carte professionnelle d'entreprise remise par l'employeur (R625-29) | formateurs APS salariés | LÉGAL | CSI R625-29 | ordinaire | P2 |
| **Qualifications exigées par module APS** (expérience de 2 ans, attestation de formateur, CQP ou RNCP de niveau 4 ; SSIAP pour l'incendie ; formateur SST pour le secourisme) | formateurs APS | LÉGAL (arrêté) | Arrêté du 23/10/2024, art. 18 et annexe ; l'ancienne annexe III (arrêté de 2016) donnait le détail. **Le détail de l'annexe 2024 est À VÉRIFIER.** | ordinaire | P1 |
| Expérience professionnelle datée (années dans l'activité ou la sécurité publique) | formateurs APS | LÉGAL (arrêté), À VÉRIFIER (détail) | idem | ordinaire | P2 |
| **Certificat de formateur SST** : n°, date, fin de validité (3 ans), date du MAC formateur (tous les 36 mois) | formateurs SST | RÉSEAU (INRS) | INRS, « Devenir formateur SST » ; document de référence SST § 4.2.3 | ordinaire | P1 (le type existe ; il manque la règle des 36 mois) |
| **Qualification SSIAP du formateur** (au moins un formateur avec une qualification de l'art. 6) et déclaration au préfet (date de l'arrêté modificatif) | formateurs SSIAP | LÉGAL (arrêté) | Arrêté du 02/05/2005, art. 12-7 et 12 (tout changement de formateur → arrêté modificatif) | **copie de pièce d'identité exigée** dans le dossier d'agrément | P1 |
| Engagement de participation aux formations (SSIAP) | formateurs SSIAP | LÉGAL (arrêté) | Arrêté du 02/05/2005, art. 12-7 | ordinaire | P1 |
| Habilitation électrique et compétence de formateur H0B0 | formateurs en habilitation électrique | BONNE PRATIQUE (la norme NF C 18-510 n'est pas un texte légal ; l'employeur délivre l'habilitation, C. trav. R4544-9 : à vérifier) | — | ordinaire | P3 |
| **Contrat** : contrat de travail (salarié), contrat de prestation (indépendant) ou contrat de sous-traitance (structure) | tous | LÉGAL (CNAPS : contrats tenus 3 ans, arrêté du 23/10/2024, art. 10) ; QUALIOPI n°27 (traçabilité dans les contrats de sous-traitance, v10) | arrêté 2024, art. 10 ; v10 `27-…md` | ordinaire | P1 (existe pour le personnel `StaffContract`, mais pas de lien `Trainer` → contrat sans fiche `StaffMember`) |
| SIRET (avis de situation INSEE) et Kbis ou extrait RNE | indépendant, sous-traitant | LÉGAL (vigilance) | C. trav. D8222-5 (document d'immatriculation, détail du 2° à vérifier) | ordinaire | P1 |
| **Attestation de vigilance URSSAF** : date, validité (6 mois), vérification sur urssaf.fr | indépendant ou sous-traitant, **contrat d'au moins 5 000 € HT** (montant global) | **LÉGAL** | C. trav. L8222-1, D8222-5 ; service-public.fr F31422 (vérifié le 06/07/2026) : à la conclusion du contrat puis **tous les 6 mois** jusqu'à la fin de son exécution | ordinaire | **P1** |
| NDA du formateur indépendant ou du sous-traitant | indépendant ou sous-traitant qui facture des actions | LÉGAL pour lui (L6351-1) ; à **vérifier** par l'OF : RÉSEAU (CPF : enregistrement auprès du service régional de contrôle obligatoire pour **tous** les sous-traitants) | FAQ ministère « CPF : encadrement de la sous-traitance » ; C. trav. L6351-1 | ordinaire | P1 |
| Certification Qualiopi du sous-traitant (n°, certificateur, fin de validité) et habilitation du certificateur | sous-traitant intervenant sur une action CPF | RÉSEAU (CPF, depuis le 01/04/2024 ; exception pour un micro-entrepreneur sous le plafond de chiffre d'affaires) | FAQ ministère ; CGU Mon Compte Formation v15 (mai 2026) ; décret 2023-1350 | ordinaire | P1 |
| Assurance de responsabilité civile professionnelle | indépendant, sous-traitant | BONNE PRATIQUE (aucun texte général trouvé ; pour l'OF lui-même, voir §6) | — | ordinaire | P2 |
| Déclaration sur l'honneur (situation, cumul d'activités, non-condamnation) | indépendant | BONNE PRATIQUE ; la non-condamnation est une donnée de l'art. 10 du RGPD | — | **éviter** les données pénales | P3 |
| Charte qualité ou engagement (existe : `CHARTE_FORMATEUR`) | tous | QUALIOPI n°27 (externes), n°21 | v9 indicateur 27 (charte en exemple) | ordinaire | P1 (existe) |
| Évaluation du formateur (par les stagiaires et par l'OF, observation en séance) | tous | QUALIOPI n°21 (« vérifiée par le prestataire ») | v9 indicateur 21, niveau attendu | ordinaire | P2 |
| Formation continue (déjà possible pour les formateurs) et démarche de formation continue des indépendants | tous | QUALIOPI n°22 (salariés) ; NB du v9 : les indépendants démontrent leur démarche de formation continue | v9 indicateur 22 | ordinaire | P1 |
| **Rattachement du formateur à un sous-traitant** (`subcontractor_id`) | formateur d'un sous-traitant | QUALIOPI n°27 ; RÉSEAU (EDOF : titres des formateurs du sous-traitant, pièce `CONTRAT_SOUS_TRAITANCE`) | `referencement.yaml` | — | P1 |
| Formations ou modules que le formateur est habilité à animer (lien titre → formation) | tous | QUALIOPI n°21 (« compétences définies en amont ») | v9 indicateur 21 | — | P1 (`ProgramTrainer` existe, sans les titres exigés) |
| Coordonnées (téléphone, adresse) | tous | CONFORT ERP | — | ordinaire | P3 |

### 3.2 Impact sur les écrans (formateurs)

- **Fiche formateur** : onglets « Statut et contrat », « Pièces fournisseur » (pour les externes), « Titres exigés par formation » (calculés par l'API) et « Évaluations ».
- **Formulaire** : SIRET, NDA, rattachement au sous-traitant, type de lien (salarié, prestataire, salarié d'un sous-traitant), ainsi que photo et `site_*` (en attente).
- **Liste** : pastille « titres requis à jour » décidée par l'API, et pastille « vigilance à jour ».
- **Alertes d'échéance** : carte CNAPS, certificat de formateur SST (36 mois), attestation de vigilance (6 mois), Qualiopi du sous-traitant ; formateur affecté à une session alors qu'un titre exigé est absent ou expiré (refus motivé ou avertissement, selon une règle de l'API).

---

## 4. Personnel (direction, pédagogie, RH, administratif)

| Donnée | Utilité | Niveau | Source | RGPD | Prio |
|---|---|---|---|---|---|
| **Actions de développement des compétences pour tout salarié** (`staff_id`, pas seulement `trainer_id`) | preuve de l'indicateur 22 | QUALIOPI n°22 (non-conformité majeure ; auditée en surveillance pour un nouvel entrant) | v9 `22-…md` | ordinaire | **P1** |
| Entretiens professionnels (date, prochaine échéance, compte rendu) | obligation de l'employeur ; preuve de l'indicateur 22 (exemple) | LÉGAL (C. trav. L6315-1) — **périodicité À VÉRIFIER** (réforme de l'entretien professionnel annoncée en 2025) | v9 indicateur 22 (exemple) | ordinaire, accès RH | P2 |
| **Référents** (handicap, mobilité, réclamations, RGPD) liés à une fiche du personnel, avec nomination datée et formation suivie | indicateur 26 (compétences du référent), indicateur 20 (CFA seulement) | QUALIOPI n°26 ; n°20 **pour les CFA uniquement** (missions du CFA, L6231-2) | v9 indicateurs 20 et 26 | ordinaire | P1 (seuls des noms libres existent dans `Organization`) |
| Diplômes et qualifications du personnel d'encadrement | titres et qualités du personnel d'encadrement | LÉGAL | C. trav. L6352-1 | ordinaire | P2 |
| Personne référente pour le CNAPS (civilité, nom, date de naissance, adresse, e-mail) | liste tenue pour le CNAPS | LÉGAL (APS) | Arrêté du 23/10/2024, art. 10 | ordinaire | P1 |
| Dirigeant : agrément CNAPS du dirigeant (n°, validité) | exercice de l'activité de formation APS | LÉGAL | CSI R625-9 à R625-12 (contenu non relu en détail : **À VÉRIFIER**) | ordinaire | P1 |
| Contrats (existe), avenants, temps de travail | gestion RH | LÉGAL (employeur) | — | ordinaire | P2 (existe) |
| NIR, coordonnées bancaires, situation familiale | paie | LÉGAL **pour la paie**, hors du périmètre de GSMS | Référentiel GRH de la CNIL | **ne pas les stocker dans GSMS** | — |
| Sensibilisation à l'accueil des personnes handicapées | indicateur 21 (exemple) | QUALIOPI n°21 (exemple, pas une obligation) | v9 indicateur 21 | — | P3 |

**Écrans :** formulaire « Personnel » à compléter (`active`, `service`, photo, `site_*`), onglets « Développement » et « Entretiens » sur la fiche, choix des référents dans Paramètres › Organisme à partir du personnel, alerte sur l'échéance des entretiens.

---

## 5. Sous-traitants (structures) et partenaires

### 5.1 Sous-traitants

| Donnée ou pièce | Niveau | Source | Prio |
|---|---|---|---|
| Raison sociale, adresse, contact, SIRET (existe), NDA | LÉGAL (vigilance) ; RÉSEAU (CPF : enregistrement auprès du SRC) | D8222-5 ; FAQ ministère sur la sous-traitance CPF | P1 |
| Contrat de sous-traitance (pièce, date ; seule la date existe) **avec clause de conformité au référentiel** | QUALIOPI n°27 (v10 : « traçabilité dans les contrats de sous-traitance ») ; LÉGAL (APS : contrats de sous-traitance tenus 3 ans) | v10 `27-…md` ; arrêté du 23/10/2024, art. 10 | P1 |
| Qualiopi : n° du certificat, certificateur, catégories, fin de validité (remplace le booléen) | RÉSEAU (CPF) ; n°27 ne l'impose pas en dehors du CPF (NB du guide v9) | v9 indicateur 27 NB ; FAQ CPF | P1 |
| Habilitation du certificateur pour la certification visée | RÉSEAU (CPF) | FAQ CPF | P1 |
| Attestation de vigilance (6 mois) et Kbis | LÉGAL (au moins 5 000 € HT) | L8222-1 ; F31422 | P1 |
| Autorisation CNAPS du sous-traitant (s'il dispense de la formation APS) | LÉGAL (il exerce l'activité de formation APS) | CSI L625-1 et suivants | P1 |
| Formateurs du sous-traitant et leurs titres | QUALIOPI n°27 ; RÉSEAU (EDOF) | `referencement.yaml` (`CONTRAT_SOUS_TRAITANCE`) | P1 |
| Formations confiées, part sous-traitée (plafond de 80 % des frais pédagogiques en CPF) | RÉSEAU (CPF) | CGU Mon Compte Formation, CPOF 3.5 ; arrêté du 03/01/2024 | P2 |
| Évaluation ou revue du sous-traitant (existe : `last_review_on`) avec son compte rendu | QUALIOPI n°27 (pilotage) | v9 indicateur 27 | P2 |
| Assurance de responsabilité civile | BONNE PRATIQUE | — | P2 |

Le chantier C15 (vérification du NDA dans la liste publique de la DGEFP, facultative) est déjà prévu dans `docs/CDC.md`.

### 5.2 Partenaires (indicateurs 26 et 28)

| Donnée | Niveau | Source | Prio |
|---|---|---|---|
| Contact (nom, fonction, e-mail, téléphone), territoire, type (Agefiph, Cap emploi, MDPH, Ressource Handicap Formation, entreprises, branches…) | QUALIOPI n°26 (liste des partenaires, exemple) | v9 indicateur 26 | P1 |
| Journal des échanges : date, objet, compte rendu ou pièce (une seule date existe aujourd'hui) | QUALIOPI n°26 et n°28 (comptes rendus, invitations en exemples) | v9 indicateur 26 | P1 |
| Convention ou charte signée | BONNE PRATIQUE ; exemple de l'indicateur 26 | v9 | P2 |
| Organisme évaluateur ou certificateur partenaire (convention, voir `CONVENTION_EVALUATEUR` d'EDOF) | RÉSEAU (EDOF, certificateur) | `referencement.yaml` | P2 |

**Écrans :** fiche sous-traitant avec ses pièces (dossier `SOUS_TRAITANT` dans `standard.yaml`), ses formateurs rattachés et ses échéances. Pour les partenaires : liste des échanges sur la fiche.

---

## 6. Organisme

| Donnée ou pièce | Niveau | Source | État | Prio |
|---|---|---|---|---|
| NDA (existe), date d'enregistrement, région | LÉGAL | C. trav. L6351-1 | NDA présent | P1 |
| Adresse du siège et forme juridique dans `Organization` (pas seulement dans EDOF), téléphone, e-mail, site | LÉGAL (BPF, factures, documents) | L6352-11 ; manque signalé par `bpf.py` | en partie dans EDOF | P1 |
| Qualiopi : n°, certificateur, catégories, dates de **début** et de fin, dates des audits | LÉGAL (fonds publics et mutualisés, L6316-1) ; LÉGAL (APS : dates de validité tenues pour le CNAPS, renouvellement transmis dans le mois, R625-16) | arrêté du 23/10/2024, art. 10 ; CSI R625-16 | présent dans EDOF, sans date de début ni alerte CNAPS | P1 |
| **Autorisation d'exercer du CNAPS** (n°, date, fin de validité, périmètre des formations) | LÉGAL | CSI L625-2 et suivants, R625-13 et suivants (durée **À VÉRIFIER**) ; autorisation provisoire de 6 mois au plus (R625-17) | pièce EDOF `AUTORISATION_EXERCICE` seulement | **P1** |
| **Agrément préfectoral SSIAP** : n° à 4 chiffres, date de l'arrêté, fin (5 ans), arrêtés modificatifs, rappel du renouvellement **au moins 2 mois avant** | LÉGAL | Arrêté du 02/05/2005, art. 12 | absent | **P1** |
| Habilitation INRS pour le SST (niveau 1 ou 2 ; n°, validité) | RÉSEAU (INRS : seuls les organismes habilités dispensent le SST) | inrs.fr, habilitation des organismes ; document de référence SST | absent | P1 |
| Habilitations des certificateurs (CQP, TFP APS, RNCP et RS) | RÉSEAU | `ProgramCertification.habilitation` existe par formation | existe | P1 |
| **Assurance de responsabilité civile** (assureur, n° de police, échéance, attestation) | **LÉGAL pour l'APS** (arrêté du 23/10/2024, art. 4) et **pour l'agrément SSIAP** (arrêté du 02/05/2005, art. 12-4) ; BONNE PRATIQUE ailleurs | idem | absent | P1 |
| Règlement intérieur (existe dans le dossier qualité) avec la date de remise aux stagiaires | LÉGAL | C. trav. L6352-3, R6352-1 ; L6353-8 (mis à disposition avant l'inscription) | pièce présente | P1 |
| Conditions générales de vente (version, date) | LÉGAL indirect (contrat individuel L6353-4 ; mentions de la facture) | — | absent | P2 |
| Médiateur de la consommation (pour les ventes aux particuliers) | LÉGAL (C. consom. L612-1, **à vérifier** pour l'activité de formation) | — | absent | P2 |
| Référents handicap (existe), mobilité (sans e-mail), réclamations, RGPD ou DPO | QUALIOPI n°26 ; n°20 pour les CFA ; RGPD (DPO selon les cas) | v9 | en partie | P1 |
| Personne référente pour le CNAPS (voir §4) | LÉGAL (APS) | arrêté du 23/10/2024, art. 10 | absent | P1 |
| Comptes annuels (bilan, compte de résultat, annexe) | LÉGAL (L6352-6) | — | pièce EDOF | P2 |
| BPF déposé (exercice, date, n° de dépôt) | LÉGAL (L6352-11) | — | `bpf_last_year` | P1 |
| Registre de sécurité, DUERP (document unique d'évaluation des risques) | LÉGAL (employeur, ERP) ; exemples de l'indicateur 17 | v9 indicateur 17 | absent | P2 |

**Écrans :** Paramètres › Organisme, avec un bloc « Autorisations et agréments » (CNAPS, SSIAP, INRS, Qualiopi, assurance) et le compte à rebours de chaque échéance. Ajouter une alerte au Pilotage. Ajouter les pièces correspondantes au dossier `ORGANISME`.

---

## 7. Lieux et équipements (indicateur 17)

### 7.1 Lieux

| Donnée ou pièce | Niveau | Source | Prio |
|---|---|---|---|
| Type et catégorie ERP | LÉGAL (règlement de sécurité ERP) | arrêté du 25/06/1980 (non relu en détail) | P2 |
| **Registre public d'accessibilité** (pièce, date de mise à jour) | LÉGAL (ERP) ; exemple de l'indicateur 17 | Décret 2017-431 ; arrêté du 19/04/2017 ; v9 indicateur 17 | P1 |
| Bail, contrat de location ou **convention de mise à disposition** (salles, ERP pour la manipulation du SSI, matériel) | LÉGAL (APS : convention tenue pour le CNAPS, arrêté du 23/10/2024, art. 5) ; LÉGAL (SSIAP, art. 12-5) ; exemple de l'indicateur 17 | idem | P1 |
| **Autorisation ou convention pour les feux réels**, ou bac à feux écologique à gaz | LÉGAL (agrément SSIAP) | Arrêté du 02/05/2005, art. 12-6 | P1 |
| Dernière visite de la commission de sécurité (date, avis) si la catégorie l'impose | LÉGAL selon la catégorie, À VÉRIFIER | — | P2 |
| Capacité (existe) et règle de 12 stagiaires par formateur pour l'APS (exceptions) | LÉGAL (APS) | Arrêté du 23/10/2024, art. 6 | P1 (règle de l'API à la planification) |
| Lieu de session rattaché à `Premises` (aujourd'hui `location` et `room` sont du texte libre) | QUALIOPI n°17 (preuve de l'adéquation des moyens) | — | P2 |
| DUERP | LÉGAL (employeur) ; exemple de l'indicateur 17 | v9 | P2 |

### 7.2 Équipements

| Donnée | Niveau | Source | Prio |
|---|---|---|---|
| Marque, modèle, **n° de série** (un équipement suivi à l'unité et non par lot quand une vérification est individuelle) | BONNE PRATIQUE ; nécessaire pour rattacher un rapport de vérification | — | P1 |
| Date d'achat, fournisseur, facture, garantie, mise en service, mise au rebut | CONFORT ERP | — | P3 |
| Déclaration de conformité CE et notice du fabricant | LÉGAL pour la mise sur le marché ; utile au contrôle | — | P2 |
| **Vérification périodique** : périodicité, organisme vérificateur, rapport (pièce), résultat (`last_check_on` et `next_check_on` existent, sans rapport) | dépend de l'équipement (voir ci-dessous) | — | P1 |
| Extincteurs | LÉGAL (essais et visites périodiques du matériel, C. trav. R4227-39, à vérifier ; ERP : arrêté du 25/06/1980, article à vérifier) ; la règle APSAD R4 est un référentiel d'assureur (RÉSEAU ou BONNE PRATIQUE) | — | P1 |
| DAE installé dans l'ERP | LÉGAL (décret 2018-1186, selon la catégorie : à vérifier pour la 5e) ; maintenance des dispositifs médicaux (CSP, à vérifier) | — | P1 |
| DAE de formation, mannequins | pas des dispositifs médicaux (DAE de formation : à vérifier) ; **suivi de l'entretien sanitaire** : l'ancien arrêté APS de 2016 (annexe III) imposait un cahier, **À VÉRIFIER** dans le cahier des charges du 01/09/2025 ; RÉSEAU (INRS : recommandations d'hygiène, à vérifier) | — | P2 |
| Matériel de sécurité incendie pédagogique (SSI, désenfumage), bac à feux à gaz | LÉGAL (SSIAP : moyens conformes à l'annexe XI) ; vérification du matériel à gaz À VÉRIFIER | Arrêté du 02/05/2005, art. 12-5 et annexe XI | P1 |
| Armes et munitions (si formation armée) : **registre d'inventaire et état journalier** des sorties et réintégrations, conservés 3 ans | LÉGAL | CSI R625-32 | P1 si l'activité existe, sinon sans objet |
| Plan de maintenance (périodicité par catégorie) | BONNE PRATIQUE | — | P2 |

**Écrans :** fiche équipement avec un historique des vérifications (une ligne par visite et sa pièce), une liste filtrable sur « vérification échue », des alertes à 30 jours et le lien entre une session et le matériel requis (P3).

---

## 8. Formations, sessions, inscriptions, financement, facturation

| Donnée | Utilité | Niveau | Source | Prio |
|---|---|---|---|---|
| **Code NSF** (spécialité de formation) | BPF | LÉGAL (BPF) | L6352-11 ; manque signalé par `bpf.py` | P1 |
| Titres exigés des formateurs par formation ou module (APS, SSIAP, SST) | contrôle des titres et qualités | LÉGAL (L6352-1, arrêtés) ; QUALIOPI n°21 | — | P1 |
| Session : **déclaration CNAPS** (date, n° ou accusé de réception, au moins J-15), modifications (au moins 48 h avant leur effet) | APS | LÉGAL | CSI R625-1 | **P1** |
| Session d'examen : date, lieu, jury (civilité, nom, date de naissance), **déclaration CNAPS** (J-15, ou J-35 si l'administration organise une épreuve), résultats | APS ; SSIAP (jury, procès-verbal) | LÉGAL | CSI R625-36, R625-38 ; arrêté du 23/10/2024, art. 10 | **P1** |
| Plusieurs formateurs par session (aujourd'hui un seul `trainer_id`) avec les heures de chacun | BPF (heures interne / externe), 12 stagiaires par formateur, émargement du formateur | LÉGAL (BPF, APS) | `bpf.py` ; arrêté 2024, art. 6 | P1 |
| Type de session (inter, intra), entreprise de l'intra, tarif de la session | convention, facturation | CONFORT ERP | — | P2 |
| Formulaire de **création et de modification de session** dans le front | — | CONFORT ERP (l'API existe, à confirmer) | — | P1 (ERP) |
| Inscription : dispositif de financement structuré (aujourd'hui `funding` est du texte ; `FundingSource` existe), entreprise | EDOF, OPCO | RÉSEAU | — | P2 |
| Heures réalisées par stagiaire (calculées depuis l'émargement) et heures prévues | certificat de réalisation, BPF, service fait en CPF | RÉSEAU (CPF, OPCO) ; LÉGAL (BPF) | — | P1 |
| Certificat de réalisation (modèle du ministère) distinct de l'attestation de fin | financeurs | RÉSEAU | précis de l'apprentissage (modèle) | P1 (à confirmer : `Certificate.kind` vaut `ATTESTATION` par défaut) |
| Contrat individuel (particulier) : signature, délai de rétractation de 10 jours, acompte limité à 30 % | particulier qui finance lui-même | **LÉGAL** | C. trav. L6353-3 à L6353-6 | P1 (`Agreement.kind` existe ; il manque la règle de rétractation et d'acompte dans l'API) |
| Informations remises avant l'inscription (programme, formateurs, règlement intérieur, tarifs), avec la date de remise | preuve | LÉGAL | L6353-8 | P2 |
| Données EDOF : n° de dossier (`external_ref`), états (existent) ; déclaration d'entrée et de sortie, service fait | CPF | RÉSEAU (CGU Mon Compte Formation) | CGU v15 | P2 |
| Facture : mention d'exonération de TVA, n° de NDA, référence de la convention | facturation | LÉGAL (CGI, art. 261-4-4°, à vérifier pour la mention exacte) | `docs/facturation/SOURCES.md` | P2 |
| Produits et charges de l'exercice, actions sous-traitées reçues ou données | BPF | LÉGAL | `bpf.py` | P2 |

---

## 9. Réclamations, veille, satisfaction

| Donnée | Niveau | Source | Prio |
|---|---|---|---|
| Réclamant (nom, contact), canal, inscription concernée | QUALIOPI n°31 | v10 `31-…md` | P2 |
| Analyse et lien vers l'action corrective (le module CAPA existe côté qualité) | QUALIOPI n°31 et n°32 | v10 | P2 |
| Veille : responsable, diffusion à l'équipe, lien vers la formation modifiée | QUALIOPI n°23 à 25 | v10 | P3 |
| Satisfaction des financeurs et des formateurs (les audiences existent) | QUALIOPI n°30 | v10 | P3 (existe) |

---

## 10. Dossiers de pièces : ce qu'il faut ajouter à `config/dossiers/standard.yaml`

| Dossier | Pièces proposées | Niveau principal |
|---|---|---|
| `ORGANISME` | autorisation CNAPS, agrément SSIAP et arrêtés modificatifs, habilitation INRS, attestation d'assurance RC, CGV, registre d'accessibilité, convention de lieux, autorisation pour les feux réels, DUERP | LÉGAL et RÉSEAU |
| `FORMATEUR` | diplômes et titres (déjà possibles par `TrainerQualification`), carte professionnelle CNAPS, certificat de formateur SST, contrat de travail ou de prestation, engagement SSIAP, pièce d'identité (formateurs SSIAP seulement) | LÉGAL et RÉSEAU |
| **`SOUS_TRAITANT`** (nouveau) | contrat de sous-traitance, Kbis ou RNE, attestation de vigilance (183 jours), certificat Qualiopi, NDA, autorisation CNAPS, assurance | LÉGAL, QUALIOPI n°27, RÉSEAU |
| **`STAGIAIRE`** (nouveau) | autorisation préalable CNAPS (référence plutôt que copie), certificat médical SSIAP (90 jours, santé), attestation de secourisme, contrat ou convention, diplôme obtenu | LÉGAL et RÉSEAU |
| **`EQUIPEMENT`** ou **`LIEU`** (nouveaux) | rapport de vérification, déclaration CE, bail ou convention | LÉGAL et QUALIOPI n°17 |

`DocumentRequest.subject` est à étendre de la même façon (aujourd'hui `ORGANISME` et `FORMATEUR` seulement).

---

## 11. Priorités et impact sur les écrans

| Catégorie | P1 (audit ou contrôle) | P2 (ERP courant) | P3 (confort) | Écrans touchés |
|---|---|---|---|---|
| Stagiaire | identité (date de naissance), autorisation CNAPS, prérequis SSIAP en pièces, situation BPF, résultat de certification, formulaire de création et de modification | adresse, devenir, contrôle de pièce d'identité « vue » | contact d'urgence, photo | fiche, formulaire (nouveau), liste, alertes, dossier `STAGIAIRE` |
| Formateur | carte CNAPS, certificat de formateur SST et SSIAP liés aux formations ; contrat ; vigilance ; NDA ; Qualiopi du sous-traitant ; rattachement au sous-traitant | expérience, évaluations, RC | coordonnées, habilitation électrique | fiche, formulaire, liste (pastilles), alertes |
| Personnel | développement des compétences de tous les salariés, référents liés au personnel, agrément du dirigeant, référent CNAPS | entretiens professionnels, diplômes | sensibilisation au handicap | fiche, Paramètres › Organisme |
| Sous-traitants et partenaires | pièces du sous-traitant, contrat avec clause qualité, Qualiopi daté, journal des échanges | part sous-traitée, revue | — | fiche, dossier `SOUS_TRAITANT` |
| Organisme | autorisations CNAPS, SSIAP et INRS, assurance, Qualiopi daté avec alerte CNAPS, adresse et forme juridique, référent CNAPS | CGV, médiateur, comptes, DUERP | — | Paramètres › Organisme, Pilotage (alertes) |
| Lieux et équipements | registre d'accessibilité, conventions, feux réels, vérifications avec rapport, n° de série | type ERP, lieu de session lié à `Premises`, CE, plan de maintenance | achat, fournisseur | fiches, liste « échues », alertes |
| Sessions et financement | déclarations CNAPS (session, examen), jury, plusieurs formateurs, NSF, heures réalisées, certificat de réalisation, contrat individuel (rétractation) | formulaire de session, financement structuré, intra / inter | matériel par session | détail de session, Pilotage › BPF, finances |

---

## 12. Sources (consultées le 26/10/2026)

**Textes du dépôt**
- `backend/referentials/qualiopi/v10/source/*.md` : énoncés, décret n° 2026-728 du 1er août 2026.
- `backend/referentials/qualiopi/v9/source/*.md` : guide de lecture V9 du 8 janvier 2024 (DGEFP), utilisé pour les niveaux attendus et les exemples de preuves des indicateurs 17, 20, 21, 22, 26 et 27.

**Code du travail (Légifrance)**
- L6351-1, L6352-1, L6352-3, L6352-6, L6352-11, L6353-1, L6353-3 à L6353-6, L6353-8, L6353-9, L6354-1 : https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006072050/LEGISCTA000006160828/
- L6352-1 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000021343625
- D8222-5 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046078939

**Obligation de vigilance**
- Service-public.fr F31422 (vérifié le 06/07/2026) : https://entreprendre.service-public.fr/vosdroits/F31422
- URSSAF : https://www.urssaf.fr/accueil/attestation-vigilance.html

**Code de la sécurité intérieure** (formation aux activités privées de sécurité)
- R625-1 à R625-42 : https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000025503132/LEGISCTA000032464319/
- Carte professionnelle des formateurs, R625-23 à R625-30 : https://www.legifrance.gouv.fr/codes/id/LEGIARTI000049382622/2025-03-01

**Arrêtés sécurité privée**
- Arrêté du 23 octobre 2024 relatif aux conditions matérielles et pédagogiques de la formation aux activités privées de sécurité (art. 4, 5, 6, 9, 10, 18) : https://www.legifrance.gouv.fr/jorf/id/JORFSCTA000050398621
- Arrêté du 1er septembre 2025 portant cahier des charges de la formation initiale : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000052197461 (annexes non relues : À VÉRIFIER)
- Arrêté du 1er juillet 2016 : **abrogé au 01/03/2025** (cité seulement pour l'historique) : https://www.legifrance.gouv.fr/loda/id/JORFTEXT000032922646/
- CNAPS, « Loi sécurité globale, ce qui change » : https://www.cnaps.interieur.gouv.fr/Actualites/Loi-securite-globale-ce-qui-change-pour-les-activites-privees-de-securite

**SSIAP et SST**
- Arrêté du 2 mai 2005 (SSIAP), art. 12 : https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000023450193
- Arrêté du 2 mai 2005, annexe VII : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000023149622
- Arrêté du 2 mai 2005, art. 4 : https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000049957995
- INRS, formateur SST : https://www.inrs.fr/formation/themes/sauvetage-secourisme/formateurs-SST.html
- INRS, document de référence SST : https://www.inrs.fr/dam/jcr:19c32df0-7404-4608-8bb9-f5bb3557b6cb/document-reference-sst.pdf
- INRS, habilitation des organismes : https://www.inrs.fr/formation/devenir-organisme-habilite/habilitation-organismes-formation.html

**CPF et sous-traitance**
- FAQ du ministère : https://travail-emploi.gouv.fr/compte-personnel-de-formation-cpf-encadrement-de-la-sous-traitance-des-organismes-de-formation-foire-aux-questions
- CGU Mon Compte Formation : https://www.moncompteformation.gouv.fr/espace-public/conditions-generales-dutilisation
- Conditions particulières OF v15 (mai 2026) : https://www.moncompteformation.gouv.fr/espace-public/sites/mcf/files/2026-05/CPOF_MCF_V15_VF.pdf
- Décret 2023-1350 : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000048729031

**RGPD (CNIL)**
- Décret cadre NIR : https://www.cnil.fr/fr/tout-savoir-sur-le-decret-cadre-nir-dans-le-champ-de-la-sante
- Référentiel GRH (novembre 2019) : https://www.cnil.fr/sites/default/files/atoms/files/referentiel_grh_novembre_2019_0.pdf
- Justificatif d'identité : https://www.cnil.fr/fr/repondre-une-demande-de-droit-dacces

**ERP, accessibilité, DAE**
- Décret 2017-431 et arrêté du 19/04/2017 (registre public d'accessibilité) : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000034454237
- Décret 2018-1186 (défibrillateurs dans les ERP) : https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000037839290

**Pièces justificatives**
- Précis de l'apprentissage (modèle de certificat de réalisation, conservation 3 ans) : https://travail-emploi.gouv.fr/sites/travail-emploi/files/files-spip/pdf/precis-apprentissage.pdf

**Points À VÉRIFIER avant toute règle dans l'API**
- durée de l'autorisation d'exercer du CNAPS ;
- détail de l'annexe de l'arrêté du 23/10/2024 sur les qualifications des formateurs APS ;
- cahier de suivi sanitaire du matériel de secourisme ;
- périodicité des entretiens professionnels après la réforme de 2025 ;
- vérifications des extincteurs et des DAE selon la catégorie ERP ;
- modalités du contrôle d'identité aux examens SSIAP et CQP ;
- lieu de naissance sur les justificatifs d'aptitude ;
- mention de TVA exacte sur les factures ;
- médiateur de la consommation ;
- durées de conservation des données du personnel (référentiel GRH de la CNIL).
