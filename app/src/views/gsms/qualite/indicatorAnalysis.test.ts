import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanQuestion, groupReferencesByBase, passageAnchor, referenceLabels, withDecision } from './indicatorAnalysis.ts'

const ref = (base: string, id: string) => ({ base, passage_id: id })

test('les passages sont groupés par base : référentiel puis organisme, ordre de l’API conservé', () => {
  const groups = groupReferencesByBase([ref('organisme', 'o1'), ref('referentiel', 'r1'), ref('organisme', 'o2'), ref('referentiel', 'r2')])
  assert.deepEqual(groups.map((g) => g.base), ['referentiel', 'organisme'])
  assert.deepEqual(groups[0].references.map((r) => r.passage_id), ['r1', 'r2'])
  assert.deepEqual(groups[1].references.map((r) => r.passage_id), ['o1', 'o2'])
})

test('une base absente n’apparaît pas ; une base inconnue est gardée après les bases connues', () => {
  assert.deepEqual(groupReferencesByBase([]), [])
  const groups = groupReferencesByBase([ref('autre', 'a1'), ref('organisme', 'o1')])
  assert.deepEqual(groups.map((g) => g.base), ['organisme', 'autre'])
})

test('la question est nettoyée, vide → absente, coupée à 500 caractères', () => {
  assert.equal(cleanQuestion('   '), undefined)
  assert.equal(cleanQuestion(null), undefined)
  assert.equal(cleanQuestion('  Où est la procédure ?  '), 'Où est la procédure ?')
  assert.equal(cleanQuestion('x'.repeat(600))?.length, 500)
})

test('l’ancre d’un passage est un identifiant HTML sûr', () => {
  assert.equal(passageAnchor('abc-123_x'), 'passage-abc-123_x')
  assert.equal(passageAnchor('a b/c:d'), 'passage-a_b_c_d')
})

test('les repères P1, P2… suivent l’ordre des références de l’API, pas le regroupement par base', () => {
  const labels = referenceLabels([ref('organisme', 'o1'), ref('referentiel', 'r1')])
  assert.equal(labels.get('o1'), 'P1')
  assert.equal(labels.get('r1'), 'P2')
  assert.equal(labels.get('inconnu'), undefined)
})

test('la décision rendue par l’API remplace la proposition concernée, et elle seule', () => {
  const list = [{ id: 'a', statut: 'PROPOSEE', action: 'A' }, { id: 'b', statut: 'PROPOSEE', action: 'B' }]
  const out = withDecision(list, { id: 'b', statut: 'REJETEE', motif: 'hors sujet' })
  assert.deepEqual(out[0], list[0])
  assert.deepEqual(out[1], { id: 'b', statut: 'REJETEE', action: 'B', motif: 'hors sujet' })
  assert.deepEqual(withDecision(list, { id: 'z', statut: 'ACCEPTEE' }), list)
})
