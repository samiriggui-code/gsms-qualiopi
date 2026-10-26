import assert from 'node:assert/strict'
import test from 'node:test'
import { AA, DEFAULT_BRAND_COLOR, brandPalette, chosenBrandColor, contrast, parseHex } from './brandColor.ts'

const WHITE = [255, 255, 255] as [number, number, number]
const DARK = [36, 36, 36] as [number, number, number]

test('la valeur par défaut de l\'API ne remplace pas le violet GSMS', () => {
  assert.equal(chosenBrandColor(DEFAULT_BRAND_COLOR), null)
  assert.equal(chosenBrandColor(DEFAULT_BRAND_COLOR.toUpperCase()), null)
  assert.equal(chosenBrandColor(null), null)
  assert.equal(chosenBrandColor('bleu'), null)
  assert.equal(chosenBrandColor('#E11D48'), '#e11d48')
})

test('une couleur assez foncée est gardée telle quelle pour les boutons', () => {
  const p = brandPalette('#0f766e')!
  assert.equal(p.adjusted, false)
  assert.equal(p.button, '#0f766e')
  assert.equal(p.light['--td-brand-color-4'], '#0f766e')
  assert.equal(p.dark['--td-brand-color-6'], '#0f766e')
})

test('une couleur trop claire est assombrie pour le texte blanc (AA), en clair comme en sombre', () => {
  const p = brandPalette('#fbbf24')!
  assert.equal(p.adjusted, true)
  assert.ok(contrast(parseHex(p.button)!, WHITE) >= AA)
  for (const k of ['--td-brand-color-3', '--td-brand-color-4', '--td-brand-color-5']) {
    assert.ok(contrast(parseHex(p.light[k])!, WHITE) >= AA, k)
  }
  for (const k of ['--td-brand-color-5', '--td-brand-color-6', '--td-brand-color-7']) {
    assert.ok(contrast(parseHex(p.dark[k])!, WHITE) >= AA, k)
  }
  // Liens sur fond sombre lisibles.
  assert.ok(contrast(parseHex(p.dark['--td-text-color-link'])!, DARK) >= AA)
})
