import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AVATAR_LIBRARY, PHOTO_MAX_BYTES, photoProblem } from './photo'

test('photoProblem : types et poids acceptés par l’API', () => {
  assert.equal(photoProblem({ type: 'image/jpeg', size: 1000 }), null)
  assert.equal(photoProblem({ type: 'image/webp', size: PHOTO_MAX_BYTES }), null)
  assert.equal(photoProblem({ type: 'image/gif', size: 1000 }), 'type')
  assert.equal(photoProblem({ type: '', size: 1000 }), null)
  assert.equal(photoProblem({ type: 'image/png', size: PHOTO_MAX_BYTES + 1 }), 'poids')
})

test('AVATAR_LIBRARY : chemins de médiathèque acceptés par photo_url', () => {
  assert.equal(AVATAR_LIBRARY.length, 34)
  for (const p of AVATAR_LIBRARY) assert.match(p, /^media\/avatars\/300-\d+\.png$/)
})
