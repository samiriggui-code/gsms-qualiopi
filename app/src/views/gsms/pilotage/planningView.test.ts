import assert from 'node:assert/strict'
import test from 'node:test'
import { alertRoute, fill, formationTone, monthGrid, packLanes, placeOnGrid, rangeFor, shiftAnchor, TONES } from './planningView.ts'

test('le mois est couvert du lundi au dimanche, sans dépasser la borne de 93 jours', () => {
  const g = monthGrid('2026-10-26')
  assert.equal(g.du, '2026-09-28')
  assert.equal(g.au, '2026-11-01')
  assert.equal(g.weeks.length, 5)
  assert.ok(g.weeks.every((w) => w.length === 7))
  const march = monthGrid('2026-03-15') // le 1er est un dimanche : 6 semaines
  assert.equal(march.weeks.length, 6)
  assert.equal(rangeFor('liste', '2026-01-01', 200).au, '2026-04-03')
})

test('périodes et navigation selon la vue', () => {
  assert.deepEqual(rangeFor('semaine', '2026-10-28', 31), { du: '2026-10-26', au: '2026-11-01' })
  assert.deepEqual(rangeFor('semaine', '2026-10-28', 14), { du: '2026-10-26', au: '2026-11-08' })
  assert.equal(shiftAnchor('semaine', '2026-10-28', 1, 14), '2026-11-11')
  assert.equal(shiftAnchor('mois', '2026-01-31', 1, 31), '2026-02-01')
  assert.equal(shiftAnchor('semaine', '2026-10-28', -1, 31), '2026-10-21')
  assert.equal(shiftAnchor('liste', '2026-10-01', 1, 14), '2026-10-15')
})

test('une alerte mène à l’écran de sa cible', () => {
  assert.equal(alertRoute({ cible: 'SESSION', id: 's1', onglet: 'parcours' }), '/platform/sessions/s1?onglet=parcours')
  assert.equal(alertRoute({ cible: 'EMARGEMENT', id: 's1', onglet: null }), '/platform/emargement/s1')
  assert.equal(alertRoute({ cible: 'FORMATEUR', id: 'f1', onglet: null }), '/platform/formateurs/f1')
  assert.equal(alertRoute({ cible: 'SALLE', id: 'p1', onglet: null }), '/platform/lieux')
  assert.equal(alertRoute({ cible: 'AUTRE', id: 'x', onglet: null }), null)
})

test('jauge et couleur : dessin seulement', () => {
  assert.deepEqual(fill(5, 10), { pct: 50, over: false })
  assert.deepEqual(fill(12, 10), { pct: 100, over: true })
  assert.equal(fill(3, null), null)
  const tone = formationTone('programme-1')
  assert.equal(tone, formationTone('programme-1'))
  assert.ok(tone >= 0 && tone < TONES)
})

test('le diagramme place les créneaux en demi-journées et range les chevauchements en couloirs', () => {
  const s = (debut: string, fin: string, periode: string | null, heure_debut: string | null = null, heure_fin: string | null = null) =>
    ({ debut, fin, periode, heure_debut, heure_fin })
  const du = '2026-10-26', au = '2026-11-01'
  assert.deepEqual(placeOnGrid(s('2026-10-26', '2026-10-26', 'MATIN'), du, au), { from: 0, to: 1 })
  assert.deepEqual(placeOnGrid(s('2026-10-27', '2026-10-27', 'APRES_MIDI'), du, au), { from: 3, to: 4 })
  assert.deepEqual(placeOnGrid(s('2026-10-28', '2026-10-28', null, '09:00', '17:00'), du, au), { from: 4, to: 6 })
  assert.deepEqual(placeOnGrid(s('2026-10-28', '2026-10-28', null, '14:00', '17:00'), du, au), { from: 5, to: 6 })
  // session entière qui déborde de la période : coupée aux bornes
  assert.deepEqual(placeOnGrid(s('2026-10-20', '2026-10-27', null), du, au), { from: 0, to: 4 })
  assert.deepEqual(placeOnGrid(s('2026-10-31', '2026-11-05', null), du, au), { from: 10, to: 14 })
  assert.equal(placeOnGrid(s('2026-11-02', '2026-11-02', 'MATIN'), du, au), null)

  // A : lundi matin, lundi après-midi, mardi matin (contigus) puis jeudi ; B : session entière lundi-mardi.
  const a = (debut: string, periode: string) => ({ ...s(debut, debut, periode), session: 'A' })
  const { placed, lanes } = packLanes([
    a('2026-10-26', 'MATIN'), a('2026-10-26', 'APRES_MIDI'), a('2026-10-27', 'MATIN'), a('2026-10-29', 'MATIN'),
    { ...s('2026-10-26', '2026-10-27', null), session: 'B' },
  ], du, au, (x) => x.session)
  assert.equal(lanes, 2)
  assert.deepEqual(placed.map((p) => [p.items[0]!.session, p.items.length, p.from, p.to, p.lane]),
    [['B', 1, 0, 4, 0], ['A', 3, 0, 3, 1], ['A', 1, 6, 7, 0]])
})
