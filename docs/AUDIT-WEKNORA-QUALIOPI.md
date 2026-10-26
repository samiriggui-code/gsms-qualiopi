# Audit : adapter WeKnora au cœur Qualiopi

État au 26/10/2026, branche `refonte-front`. Le document distingue ce qui **existe** (vérifié dans le code)
de ce qui est **proposé**.

## 1. Le principe à garder

- **Le moteur Qualiopi (Python, `backend/`) décide.** L'état d'un indicateur, une preuve validée, une échéance, une
  règle de financement : tout cela est calculé par l'API et ses tests. WeKnora ne recalcule rien et ne tranche rien.
- **WeKnora sert à lire, chercher, expliquer et proposer.** Il connaît les textes (référentiel, documents de
  l'organisme), il interroge le moteur par MCP, et il rédige. Toute proposition qui touche la conformité passe par
  une validation humaine dans GSMS.
- **Une bonne pratique n'est jamais présentée comme une obligation** (règle du dépôt, à inscrire dans les consignes
  de l'assistant).

## 2. Les deux sens de communication

Il y a bien **deux sens**, mais **un seul est en MCP**, et c'est le bon choix.

| Sens | Moyen | Existe ? | À quoi ça sert |
|---|---|---|---|
| WeKnora → GSMS | **MCP** : WeKnora est client, GSMS est serveur (`POST /api/v1/mcp`) | **Oui**, 13 outils en lecture seule, compte technique `assistant_ia` (`quality.read`) | L'assistant va chercher les chiffres réels : indicateurs, preuves, écarts, échéances, actions, synthèse de session, formations, sessions, audits, veille, réclamations |
| GSMS → WeKnora | **API REST** de WeKnora (`service/ia/espace.py`, `session.py`) | **Oui**, pour l'installation : comptes, membres, déclaration du serveur MCP, base « Référentiel Qualiopi » | GSMS pilote WeKnora : crée les bases, dépose les documents, ouvre la session du navigateur |
| GSMS → WeKnora | MCP (WeKnora publié comme serveur MCP, `/mcp/<endpoint>`) | Non, et **pas nécessaire** | Ne servirait que si un agent extérieur (Claude Code, Jarvis…) devait interroger les bases de connaissances |

Pourquoi ne pas tout mettre en MCP : MCP sert à donner des **outils à une IA** qui choisit elle-même quoi appeler.
Quand c'est GSMS qui agit (déposer un document, lancer une analyse à un moment précis), le chemin est connu à
l'avance. Un appel REST direct est alors plus simple, plus prévisible et plus facile à tester.

## 3. Besoins, par domaine

Priorité : **P0** bloque l'usage, **P1** apporte la valeur principale, **P2** viendra plus tard.

### 3.1 Moteur IA utilisable (P0)

| Besoin | État | À faire |
|---|---|---|
| Modèle d'embedding et modèle de discussion réglés | **Manquant** : les 65 textes du référentiel attendent l'indexation | Choisir les modèles (hébergement, coût, RGPD) et les régler |
| Régler les modèles sans le compte de service | **Point ouvert** (HANDOFF §5 quattuordecies) : le compte navigateur est contributeur, il reçoit 403 | Route GSMS d'administration (nouvelle permission `ia.admin`) qui règle les modèles avec le compte de service, côté serveur. Écran dans Paramètres |
| Français dans l'interface WeKnora | `fr-FR.ts` existe dans `app/` | Vérifier la couverture des clés (`npm run scan-i18n-gaps`) |

### 3.2 Connaissance (ce que l'assistant sait) (P1)

| Base | État | Contenu | Alimentée par |
|---|---|---|---|
| Référentiel Qualiopi | **Créée**, non indexée | Textes officiels v9 et v10 | `ia-preparer` (existe) |
| Documents de l'organisme | Proposée | Procédures, livret d'accueil, règlement intérieur, CGV, programmes, modèles | GSMS par REST, à chaque dépôt ou modification de ces documents dans GSMS |
| Dossiers des stagiaires | **À ne pas créer** | — | Données personnelles : elles restent dans GSMS, lues au cas par cas par MCP |

Règle : une base de connaissances ne contient que des documents **de l'organisme ou officiels**, jamais de pièces
nominatives. Les noms des stagiaires restent derrière le serveur MCP, qui filtre déjà les coordonnées.

### 3.3 Outils MCP (ce que l'assistant peut demander au moteur) (P1)

Existants (lecture, 13 outils) : `etat_indicateurs`, `fiche_indicateur`, `lister_preuves`, `fiche_preuve`,
`lister_ecarts`, `lister_echeances`, `lister_actions_correctives`, `synthese_session`, et depuis le 26/10/2026
`fiche_formation`, `lister_sessions`, `lister_audits`, `lister_veille`, `lister_reclamations` (commit `c9f8736`).
Chacun reprend une route existante ; aucun calcul nouveau.

Écriture : **pas d'écriture directe**. Si l'on veut que l'assistant agisse, il doit seulement déposer des
**propositions** que quelqu'un valide dans GSMS :

| Outil proposé | Ce qu'il crée | Qui valide |
|---|---|---|
| `proposer_action_corrective` | Un brouillon d'action rattaché à un écart | Responsable qualité, dans la page Constats et actions |
| `proposer_rattachement_preuve` | Une suggestion « ce document prouve l'indicateur N » | Responsable qualité, dans la fiche preuve |

Cela demande un statut « proposé par l'assistant » côté backend (table, journal, permission dédiée au compte
technique, par exemple `quality.propose`). Le compte technique ne reçoit jamais `quality.write`.

### 3.4 L'assistant lui-même (P1)

Un seul agent préréglé suffit pour la V1 : **« Assistant Qualiopi »**, créé par `ia-preparer` comme la base du
référentiel.

- Il a accès à la base Référentiel, à la base Documents de l'organisme et au serveur MCP GSMS.
- Ses consignes :
  - citer l'indicateur et le texte source ;
  - séparer « exigé par le référentiel » et « bonne pratique » ;
  - ne jamais affirmer qu'un indicateur est conforme sans le résultat de `etat_indicateurs` ou `fiche_indicateur` ;
  - répondre « je ne sais pas » plutôt qu'inventer.
- Un deuxième agent (préparation d'audit, analyse documentaire) n'est utile que si l'usage le réclame. On commence
  avec un seul.

### 3.4 bis Les 4 agents intégrés de WeKnora, appliqués à Qualiopi (P1)

La doc WeKnora annonce quatre agents intégrés : réponse rapide, raisonnement, analyse de données et Wiki. Le chat
choisit entre deux modes (`quick-answer`, `smart-reasoning`). Proposition : quatre agents GSMS préréglés par
`ia-preparer`, chacun bâti sur un de ces modes.

| Mode WeKnora | Agent GSMS proposé | Sources | Exemples |
|---|---|---|---|
| Réponse rapide (`quick-answer`) | **Référentiel Qualiopi** | Base Référentiel seulement, aucun outil | « Que demande l'indicateur 4 ? », « Différence v9 / v10 ? », avec la source citée |
| Raisonnement (`smart-reasoning`) | **Préparation d'audit** | Référentiel, Documents de l'organisme, outils MCP GSMS | « Où en suis-je avant l'audit ? », « Quels écarts sur le critère 3 ? », brouillon de plan d'actions |
| Analyse de données | **Résultats et satisfaction** | Exports de GSMS (questionnaires, résultats) | Lecture des tendances de satisfaction, abandons, réclamations. Les chiffres officiels restent ceux du moteur |
| Wiki | **Manuel qualité** | Documents de l'organisme | Pages lisibles par processus ou par indicateur. C'est un brouillon, pas une preuve |

À vérifier sur l'instance : l'analyse de données et le Wiki peuvent dépendre du sandbox, aujourd'hui masqué.

### 3.5 Contexte de page (P1)

`app/src/stores/assistant.ts` ne connaît que les pages de WeKnora (`knowledge_base`, `chat`, `agent_editor`…).
Il faut ajouter les pages GSMS (`indicateur`, `preuve`, `session`, `formation`, `constat`) et l'identifiant ouvert.
L'assistant saura alors de quoi on parle et passera directement le bon identifiant aux outils MCP. C'est uniquement du
front : aucune règle métier.

### 3.6 Analyse de documents (P2, la vraie valeur IA)

C'est l'étape où un LLM est réellement nécessaire : lire un programme de formation et dire ce qui manque
(objectifs, prérequis, modalités d'évaluation, accessibilité…) par rapport aux indicateurs concernés.

Déroulé proposé, piloté par le code :

1. On dépose un document dans GSMS.
2. GSMS l'envoie à la base « Documents de l'organisme » (REST).
3. GSMS lance une question cadrée à l'agent, avec une réponse attendue au format JSON (indicateur, élément trouvé ou
   absent, extrait cité).
4. GSMS enregistre le résultat comme **suggestion**, jamais comme constat validé.
5. Le responsable qualité accepte ou rejette la suggestion.

### 3.7 Fonctions WeKnora : garder ou couper

Déjà masqué (`config/gitssFeatures.ts`) : sandbox, membres, variables d'environnement, messageries, outil en ligne
de commande, fournisseurs chinois, analyse WeKnora Cloud, guides d'accueil.

| Fonction | Recommandation | Raison |
|---|---|---|
| Bases de connaissances, discussion, recherche ⌘K | Garder | Cœur de l'usage |
| Agents | Garder pour l'admin, masquer pour les autres rôles | L'agent Qualiopi est préréglé |
| Services MCP (boîte à outils) | Lecture seule | Le serveur GSMS est déclaré automatiquement, sa configuration est remise à chaque session |
| Organisations et partage | Couper | Une instance GSMS sert un seul organisme |
| Chat intégrable (embed) | Couper pour l'instant | Non publié par Caddy, surface d'attaque inutile |
| Sources de données (Notion, Confluence…) | Couper | Les documents viennent de GSMS |
| Wiki, artefacts, automatisations | À décider après un essai | Pas de besoin Qualiopi identifié |

## 4. Sécurité et RGPD

- **Fournisseur de modèles** : les questions et les extraits de documents partent chez lui. Choisir un fournisseur
  dans l'UE, ou un modèle local (la machine Ryzen AI Max+ 395 128 Go comparée plus tôt peut faire tourner un modèle
  correct). À décider avant de mettre en service.
- **Traçabilité** : garder dans GSMS qui a demandé quoi à l'assistant quand une suggestion est acceptée (source,
  date, validateur). Un auditeur peut demander d'où vient une action corrective.
- **Existant à conserver** :
  - jeton « mcp » refusé derrière un proxy, `/api/v1/mcp` non publié ;
  - aucune journalisation des arguments ;
  - compte navigateur contributeur, sans jeton de renouvellement.

## 5. Ordre conseillé

1. **P0** : choisir le fournisseur et déclarer les modèles dans `ia/config/builtin_models.yaml` (clés dans `ia/.env`,
   relu à chaque démarrage du moteur) : pas besoin de route d'administration.
2. Indexer le référentiel et vérifier une question simple de bout en bout (texte + outil MCP).
3. ~~Assistants préréglés dans `ia-preparer`~~ : fait (trois assistants, `assistants.py`, commits `3852784` à `3b7ab11`).
4. Ajouter le contexte de page GSMS (les 5 outils MCP de lecture sont faits).
5. Alimenter la base « Documents de l'organisme » depuis GSMS.
6. Ensuite seulement : propositions (écriture validée) et analyse de documents.

## 6. Questions à trancher par le propriétaire

1. Modèles : fournisseur externe (lequel) ou machine locale ?
2. L'assistant doit-il pouvoir **proposer** des actions (§3.3), ou rester en lecture seule ?
3. Quelles fonctions WeKnora du §3.7 couper pour de bon ?
