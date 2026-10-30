import assert from 'node:assert/strict'
import test from 'node:test'
import { modulesToText, textToModules } from './moduleText.ts'

test('le programme fait l\'aller-retour entre modules et texte', () => {
  const modules = [
    { code: 'UV1', title: 'Secourisme', hours: '14.00', details: ['Gestes de premiers secours.', 'Alerte.'] },
    { code: 'UV2', title: 'Cadre juridique', details: [] },
  ]
  const text = modulesToText(modules)
  assert.equal(text, 'UV1 | Secourisme | 14\n- Gestes de premiers secours.\n- Alerte.\n\nUV2 | Cadre juridique')
  assert.deepEqual(textToModules(text), [
    { code: 'UV1', title: 'Secourisme', hours: 14, details: ['Gestes de premiers secours.', 'Alerte.'] },
    { code: 'UV2', title: 'Cadre juridique', details: [] },
  ])
})

test('un intitulé seul reçoit un code, les heures se lisent avec virgule ou « h »', () => {
  assert.deepEqual(textToModules('Partie théorique\n• Le feu\nUV3 | Pratique | 3,5 h'), [
    { code: 'M1', title: 'Partie théorique', details: ['Le feu'] },
    { code: 'UV3', title: 'Pratique', hours: 3.5, details: [] },
  ])
  assert.deepEqual(textToModules('- point sans module\n\n'), [])
})
