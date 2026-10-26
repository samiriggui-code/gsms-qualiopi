import assert from 'node:assert/strict'
import test from 'node:test'

import { HIDDEN_SETTINGS_SECTIONS, sandboxSectionVisible } from './gitssFeatures'

test('sandbox section shows only when the engine explicitly runs the docker sandbox', () => {
  assert.equal(HIDDEN_SETTINGS_SECTIONS.has('sandbox'), false)
  assert.equal(sandboxSectionVisible({ 'settings.sandbox.docker': { supported: true } }), true)
  assert.equal(sandboxSectionVisible({ 'settings.sandbox.docker': { supported: false } }), false)
  assert.equal(sandboxSectionVisible({ 'settings.sandbox': { supported: true } }), false)
  // Capability probe failed: the store keeps an empty map, the section stays hidden.
  assert.equal(sandboxSectionVisible({}), false)
})
