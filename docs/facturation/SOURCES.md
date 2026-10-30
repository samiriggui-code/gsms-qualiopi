# Facturation — sources réglementaires

Sources officielles consultées le **26/10/2026** pour le module de facturation (chantier C10). Chaque règle du code
(`backend/app/application/service/invoicing/`) indique son fondement ; ce qui n'en a pas est un **choix de GSMS**
(réglage par défaut ou bonne pratique), présenté comme tel. Aucune règle n'est tirée d'un blog ou d'un forum.

## 1. Textes et pages consultés

| Source | Adresse | Ce qu'on en retient |
|---|---|---|
| Code de commerce, art. L441-9 (version en vigueur depuis le 26/04/2019) | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000038414397 | Facture délivrée dès la réalisation de la prestation ; mentions : parties et adresses, date de la prestation, quantité, dénomination, prix unitaire HT, réductions, **date de règlement**, **conditions d'escompte**, **taux des pénalités**, **indemnité forfaitaire pour frais de recouvrement**, **n° de bon de commande** s'il existe ; conservation selon le CGI. |
| CGI, annexe II, art. 242 nonies A | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000050811276 | Mentions fiscales : 1° nom, n° SIREN/SIRET et adresse de l'assujetti et du client ; 2° n° de TVA ; 6° date d'émission ; **7° numéro unique, séquence chronologique et continue, séries distinctes possibles si justifiées** ; 8° quantité, dénomination, prix HT, taux de TVA ou bénéfice d'une exonération ; 8° bis catégorie d'opération (biens / services) ; 10° date de la prestation ; 11° TVA et total HT par taux ; 11° bis option pour les débits ; **12° en cas d'exonération, référence à la disposition du CGI**. |
| CGI, art. 289, I-5 | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048827413 | Tout document qui modifie la facture initiale et y fait référence de façon spécifique et non équivoque est assimilé à une facture (**avoir, facture rectificative**). |
| BOFiP BOI-TVA-DECLA-30-20-20-10 (§ 70-80) | https://bofip.impots.gouv.fr/bofip/140-PGP.html/identifiant%3DBOI-TVA-DECLA-30-20-20-10-20120912 | Numérotation chronologique au fil des émissions, continue, par série ; deux factures émises la même année ne peuvent pas porter le même numéro ; préfixe distinct par série conseillé. |
| BOFiP BOI-TVA-DECLA-30-20-20-20 (§ V) | https://bofip.impots.gouv.fr/bofip/142-PGP.html/identifiant%3DBOI-TVA-DECLA-30-20-20-20-20220119 | L'avoir fait référence explicite à la facture initiale (**numéro et date**) et porte toutes les mentions, sauf 2° et 12° dont on peut se dispenser. |
| CGI, art. 261, 4, 4° a | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000054374042 | Exonération de TVA de la formation professionnelle continue assurée par une personne de droit privé **titulaire d'une attestation** de l'autorité administrative. |
| BOFiP BOI-TVA-CHAMP-30-10-20-50 | https://bofip.impots.gouv.fr/bofip/943-PGP.html/identifiant%3DBOI-TVA-CHAMP-30-10-20-50-20191016 | L'attestation entraîne l'exonération (l'organisme ne peut y renoncer ; seul le retrait la fait cesser) ; elle ne couvre que la formation professionnelle continue, les autres opérations restent taxables ; sans attestation, pas d'exonération. |
| service-public.fr, F32231 et R19113 | https://entreprendre.service-public.fr/vosdroits/F32231 · https://entreprendre.service-public.fr/vosdroits/R19113 | Même règle, demande d'attestation au titre de la formation professionnelle continue. |
| service-public.fr, F31808 « Mentions obligatoires sur une facture » | https://entreprendre.service-public.fr/vosdroits/F31808 | Tableau des mentions ; forme juridique et capital pour une société ; n° de TVA non exigé si total HT ≤ 150 € ; « Escompte pour paiement anticipé : néant » à défaut d'escompte ; indemnité de 40 € pour un client professionnel. |
| service-public.fr, F23211 (mise à jour 07/08/2026) | https://entreprendre.service-public.fr/vosdroits/F23211 | Délai de paiement de 30 jours à défaut d'accord (L441-10) ; pénalités au moins égales à 3 fois le taux d'intérêt légal, taux supplétif : taux de refinancement de la BCE majoré de 10 points ; indemnité forfaitaire de 40 €. |
| service-public.fr, F10029 et F23208 | https://entreprendre.service-public.fr/vosdroits/F10029 · https://entreprendre.service-public.fr/vosdroits/F23208 | Conservation des factures : 10 ans (pièce comptable), 6 ans au titre fiscal. |
| economie.gouv.fr, « Tout savoir sur la facturation électronique » | https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises | Réforme entrée en vigueur le **01/09/2026** : réception pour toutes les entreprises, émission pour les grandes entreprises et ETI ; émission pour les PME et micro-entreprises au **01/09/2027**. « Les opérations bénéficiant d'une exonération de TVA ne sont pas soumises à la facturation électronique. » Nouvelles mentions : SIREN du client, catégorie d'opération, option pour les débits, adresse de livraison si différente. |
| service-public.fr, A15683 | https://entreprendre.service-public.fr/actualites/A15683 | Même calendrier ; nouvelles mentions au 01/09/2026 (GE, ETI) et au 01/09/2027 (PME, micro). |

Les pages impots.gouv.fr de la réforme (guide pratique du 01/09/2026) étaient en maintenance lors de la consultation.

## 2. Ce que fait l'application, et sur quel fondement

| Comportement | Nature |
|---|---|
| Numéro attribué à l'émission, jamais au brouillon ; séquence sans trou (compteur incrémenté dans la transaction de l'émission) | Obligation (242 nonies A, 7°) ; le moyen technique est un choix de GSMS |
| Une série pour les factures (`FA-AAAA-NNNN`), une pour les avoirs (`AV-AAAA-NNNN`), recommencée chaque année civile, préfixée par l'année | **Choix par défaut de GSMS** (séries distinctes admises, BOFiP § 80) |
| Facture émise figée (HTML archivé, empreinte SHA-256, déclencheur en base) ; correction par avoir numéroté qui cite le numéro et la date de la facture | Obligation (CGI 289, I-5 ; BOFiP) pour l'avoir ; le figeage technique est un choix de GSMS |
| Avoir plafonné, ligne par ligne, au montant non encore crédité | Choix de GSMS (cohérence des montants) |
| Brouillon supprimable (il n'a pas de numéro) | Choix de GSMS |
| Vérifications bloquantes : SIRET et adresse de l'organisme, régime de TVA, nom et adresse du client, lignes, date de la prestation, échéance, pénalités et escompte (client professionnel), n° de TVA si lignes taxables > 150 € HT | Obligations (242 nonies A, L441-9) |
| Avertissements non bloquants : SIREN du client, forme juridique et capital, prix nul, inscription déjà facturée | SIREN : obligation selon le calendrier de la réforme (voir § 1) ; le reste : choix de GSMS |
| Mention « TVA non applicable, article 261, 4, 4° a du code général des impôts » sur les lignes exonérées | Obligation (242 nonies A, 12°) ; le régime `EXONERE` ne doit être choisi que si l'organisme détient l'attestation |
| Mention « Opérations : prestations de services » | Mention de la réforme (242 nonies A, 8° bis) |
| Délai de paiement par défaut 30 jours, taux de pénalités par défaut BCE + 10 points, escompte « néant » | Réglages par défaut reprenant le droit supplétif (L441-10) ; modifiables |
| Module désactivé par défaut | Choix de GSMS : une facture émise engage l'organisme ; l'activer quand GSMS devient l'outil de facturation |

## 3. Ce que l'application ne fait pas (à ce jour)

- Pas d'émission ni de réception au format électronique structuré, pas de raccordement à une plateforme agréée,
  pas d'e-reporting. Les prestations exonérées de formation continue ne sont pas soumises à la facturation
  électronique (economie.gouv.fr) ; une facture comportant des lignes taxables entre assujettis le serait, à
  l'émission, au 01/09/2027 pour une PME : à traiter avant cette date si l'organisme facture des opérations taxables.
- Pas de relances de paiement automatiques, pas de remboursement de trop-perçu (il est signalé).
- La conservation (10 ans) repose sur la sauvegarde de la base et du dossier des documents.
