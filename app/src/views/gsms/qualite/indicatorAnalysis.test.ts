import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanQuestion, groupReferencesByBase } from './indicatorAnalysis.ts'

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
