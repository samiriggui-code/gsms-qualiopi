import assert from 'node:assert/strict'
import test from 'node:test'

import { severityClass, severityTag } from './severity'

test('gravité : haute rouge plein, moyenne contour rouge sans fond, basse grise', () => {
  assert.deepEqual(severityTag('HAUTE'), { theme: 'danger', variant: 'light' })
  assert.deepEqual(severityTag('MOYENNE'), { theme: 'danger', variant: 'outline' })
  assert.deepEqual(severityTag('BASSE'), { theme: 'default', variant: 'light' })
  assert.deepEqual(severityTag(null), { theme: 'default', variant: 'light' })
  assert.equal(severityClass('moyenne'), 'gsms-severity--moyenne')
  assert.equal(severityClass(undefined), 'gsms-severity--basse')
})
