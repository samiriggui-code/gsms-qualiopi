import assert from 'node:assert/strict'
import test from 'node:test'

import type { PublicQuestion } from '@/api/gsms/public'
import {
  answersToSend, extractSignToken, isShown, missingRequired, period, publicError, questionErrors, safeHref,
} from './publicLinks'

const qs: PublicQuestion[] = [
  { id: 'objectif', libelle: 'Objectif', type: 'texte', requis: true },
  { id: 'amenagement', libelle: 'Aménagement', type: 'oui_non', requis: true },
  { id: 'detail', libelle: 'Précisez', type: 'texte', requis: true, si: { amenagement: true } },
  { id: 'remarques', libelle: 'Remarques', type: 'texte' },
]

test('question conditionnelle affichée seulement si la condition de l\'API est remplie', () => {
  assert.equal(isShown(qs[2], {}), false)
  assert.equal(isShown(qs[2], { amenagement: false }), false)
  assert.equal(isShown(qs[2], { amenagement: true }), true)
})

test('obligatoires manquantes et réponses envoyées : questions affichées seulement, sans vide', () => {
  const answers = { objectif: '  ', amenagement: false, detail: 'oublié', remarques: ' rien ' }
  const shown = qs.filter((q) => isShown(q, answers))
  assert.deepEqual(missingRequired(shown, answers), ['objectif'])
  assert.deepEqual(answersToSend(shown, { ...answers, objectif: ' Devenir SST ' }),
    { objectif: 'Devenir SST', amenagement: false, remarques: 'rien' })
})

test('liens de l\'API : http(s) ou relatif, jamais javascript:', () => {
  assert.equal(safeHref('https://of.test/q/a.b'), 'https://of.test/q/a.b')
  assert.equal(safeHref('/api/public/documents/x'), '/api/public/documents/x')
  assert.equal(safeHref('javascript:alert(1)'), null)
  assert.equal(safeHref('//autre.test/x'), null)
  assert.equal(safeHref(null), null)
})

test('jeton d\'émargement : lien entier collé ou jeton seul', () => {
  const jeton = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'
  assert.equal(extractSignToken(`https://of.test/emarger?jeton=${jeton}`), jeton)
  assert.equal(extractSignToken(` ${jeton} `), jeton)
  assert.equal(extractSignToken('https://of.test/emarger?code=abc'), null)
  assert.equal(extractSignToken('court'), null)
})

test('statuts de l\'API traduits en genres d\'erreur, message de l\'API gardé quand il est pour la personne', () => {
  const err = (status: number, message = 'Détail API') => Object.assign(new Error(message), { status })
  assert.deepEqual(publicError(err(0)), { kind: 'reseau', detail: null })
  assert.deepEqual(publicError(err(404, 'Lien invalide')), { kind: 'invalide', detail: null })
  assert.deepEqual(publicError(err(410, 'Ce lien a expiré.')), { kind: 'ferme', detail: 'Ce lien a expiré.' })
  assert.deepEqual(publicError(err(429, 'Trop de demandes')), { kind: 'limite', detail: 'Trop de demandes' })
  assert.deepEqual(publicError(err(409, 'Hors fenêtre')), { kind: 'refus', detail: 'Hors fenêtre' })
  assert.deepEqual(publicError(err(502)), { kind: 'indisponible', detail: null })
  assert.deepEqual(questionErrors([{ question: 'niveau', message: 'Note de 1 à 5 attendue' }, 'x']),
    { niveau: 'Note de 1 à 5 attendue' })
})

test('période en toutes lettres', () => {
  assert.equal(period('2026-11-03', '2026-11-03'), 'le 3 novembre 2026')
  assert.equal(period('2026-11-03', '2026-11-04'), 'du 3 novembre 2026 au 4 novembre 2026')
})
