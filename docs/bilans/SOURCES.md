# Bilans — sources réglementaires

Sources de l'aide au bilan pédagogique et financier (`GET /api/v1/bilans/bpf`,
`backend/app/application/service/pilotage/bpf.py`). Consultées le 26/10/2026.

| Source | Ce qu'on en tire |
|---|---|
| Code du travail, [art. L. 6352-11](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000037386206) (Légifrance) | Obligation : toute personne qui réalise des actions de formation professionnelle (art. L. 6313-1) adresse **chaque année** à l'autorité administrative un bilan pédagogique et financier de son activité. |
| Code du travail, [art. R. 6352-22 à R. 6352-24](https://www.legifrance.gouv.fr/codes/id/LEGISCTA000018522310) (Légifrance) | Contenu du bilan. |
| Service-public, [Déclaration du BPF, cerfa 10443*17](https://entreprendre.service-public.gouv.fr/vosdroits/R73152) (vérifié le 11/08/2025 par la DILA) | Formulaire en vigueur ; la déclaration se fait sur la plateforme « Mon activité formation » ; le cerfa papier n'est utilisé qu'en cas d'impossibilité d'y accéder (envoi à la DREETS). |
| Ministère du travail, [notice explicative du BPF n° 50199](https://travail-emploi.gouv.fr/sites/travail-emploi/files/files-spip/pdf/bilan_pedagogique_et_financier_notice.pdf) | Le BPF retrace l'activité du **dernier exercice comptable clos**, à transmettre avant le 30 avril ; définition des cadres A à G (identification, produits, charges, formateurs, stagiaires par type, sous-traitance, objectif, spécialités NSF, actions reçues en sous-traitance) ; calcul des heures-stagiaires (12 stagiaires × 6 h = 72 heures-stagiaires). |

## Ce que l'aide calcule, et ce qu'elle ne calcule pas

L'aide **ne produit pas le BPF**. Chaque cadre porte un état :

- `CALCULE` : compté sur les données (F-2, sessions confiées à un sous-traitant) ;
- `INDICATIF` : estimation à confirmer (E formateurs et heures dispensées ; F-1 types de stagiaires, suggérés par le
  financement déclaré — c'est la situation de la personne qui compte, pas le financeur) ;
- `PARTIEL` : une partie des rubriques seulement (A identification ; F-3 objectif : lignes a RNCP, b RS, e bilan,
  f VAE ; c et d non distinguées) ;
- `NON_CALCULABLE` : B, C (produits HT : la facturation n'est pas dans GSMS ; les paiements saisis dans les dossiers de
  financement sont donnés à titre d'indication, avec `funding.read`), D (charges), F-4 (codes NSF non enregistrés), G
  (actions reçues d'un autre organisme non enregistrées).

Hypothèse : exercice = année civile. Si l'exercice comptable de l'organisme est différent, les chiffres sont à refaire
sur ses dates.
