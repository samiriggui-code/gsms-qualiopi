import assert from 'node:assert/strict'
import test from 'node:test'

import { HIDDEN_SETTINGS_SECTIONS, sandboxSectionVisible, visibleAgents } from './gitssFeatures'

test('sandbox section shows only when the engine explicitly runs the docker sandbox', () => {
  assert.equal(HIDDEN_SETTINGS_SECTIONS.has('sandbox'), false)
  assert.equal(sandboxSectionVisible({ 'settings.sandbox.docker': { supported: true } }), true)
  assert.equal(sandboxSectionVisible({ 'settings.sandbox.docker': { supported: false } }), false)
  assert.equal(sandboxSectionVisible({ 'settings.sandbox': { supported: true } }), false)
  // Capability probe failed: the store keeps an empty map, the section stays hidden.
  assert.equal(sandboxSectionVisible({}), false)
})

test('agents : intégrés sans usage et assistant interne cachés, agents par défaut en français', () => {
  const agents = [
    { id: 'builtin-quick-answer', name: 'Quick Answer' },
    { id: 'builtin-smart-reasoning', name: 'Smart Reasoning' },
    { id: 'builtin-wiki-researcher', name: 'Wiki Questioner' },
    { id: 'builtin-data-analyst', name: 'Data Analyst' },
    { id: 'a1', name: 'Préparation d\'audit' },
    { id: 'a2', name: 'Analyse documentaire (GSMS)' },
  ]
  assert.deepEqual(visibleAgents(agents).map((a) => a.name),
    ['Réponse rapide', 'Raisonnement', 'Préparation d\'audit'])
  assert.equal(agents[0].name, 'Quick Answer') // la liste reçue n'est pas modifiée
})
