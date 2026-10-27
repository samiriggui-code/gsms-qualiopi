import assert from 'node:assert/strict'
import test from 'node:test'

import {
  HIDDEN_SETTINGS_SECTIONS, MEMBERS_READ_ONLY, WEKNORA_GUIDES_ENABLED, sandboxSectionVisible, visibleAgents,
} from './gitssFeatures'

test('aucune section des paramètres masquée, membres en lecture seule (comptes créés par GSMS)', () => {
  assert.equal(HIDDEN_SETTINGS_SECTIONS.size, 0)
  assert.equal(MEMBERS_READ_ONLY, true)
  assert.equal(WEKNORA_GUIDES_ENABLED, true)
})

test('bac à sable : section visible sauf si le moteur déclare n\'en avoir aucun', () => {
  assert.equal(sandboxSectionVisible({ 'settings.sandbox.docker': { supported: true } }), true)
  // Docker coupé côté moteur : la section reste visible (elle le signale), rien n'est activé.
  assert.equal(sandboxSectionVisible({ 'settings.sandbox.docker': { supported: false } }), true)
  // Détection en échec : la section reste visible, l'accès reste réservé aux administrateurs.
  assert.equal(sandboxSectionVisible({}), true)
  assert.equal(sandboxSectionVisible({ 'settings.sandbox': { supported: false } }), false)
})

test('agents : seul l\'assistant interne est caché, agents intégrés en français', () => {
  const agents = [
    { id: 'builtin-quick-answer', name: 'Quick Answer', description: 'Knowledge base RAG Q&A' },
    { id: 'builtin-smart-reasoning', name: 'Smart Reasoning' },
    { id: 'builtin-wiki-researcher', name: 'Wiki Questioner' },
    { id: 'builtin-data-analyst', name: 'Data Analyst' },
    { id: 'builtin-deep-researcher', name: 'Deep Researcher' },
    { id: 'a1', name: 'Préparation d\'audit', description: 'Assistant préréglé' },
    { id: 'a2', name: 'Analyse documentaire (GSMS)' },
  ]
  const visible = visibleAgents(agents)
  assert.deepEqual(visible.map((a) => a.name), [
    'Réponse rapide', 'Raisonnement', 'Questions sur le wiki', 'Analyse de données', 'Recherche approfondie',
    'Préparation d\'audit',
  ])
  assert.match(visible[0].description ?? '', /bases de connaissances/)
  // Pas de description ajoutée à un agent qui n'en a pas, ni changée pour un agent créé par l'organisme.
  assert.equal('description' in visible[1], false)
  assert.equal(visible[5].description, 'Assistant préréglé')
  assert.equal(agents[0].name, 'Quick Answer') // la liste reçue n'est pas modifiée
})
