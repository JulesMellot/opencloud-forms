import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectLanguage, translate, dictionary } from './i18n.ts'
import { publicPage } from './public-page.ts'
import { responseRows } from './forms.ts'
import { createForm, createField, type FormResponse } from '../src/schema.ts'

test('negotiates regional languages, quality weights and explicit overrides', () => {
  assert.equal(selectLanguage('de-DE,de;q=0.9,en;q=0.8'), 'de')
  assert.equal(selectLanguage('es-MX,fr;q=0.8'), 'es')
  assert.equal(selectLanguage('fr;q=0.2,de;q=0.9'), 'de')
  assert.equal(selectLanguage('es;q=0,de;q=0.9'), 'de')
  assert.equal(selectLanguage('de-DE', 'fr'), 'fr')
  assert.equal(selectLanguage('es', '<script>'), 'es')
  assert.equal(selectLanguage('ja'), 'fr')
})

for (const language of ['fr', 'es', 'de'] as const) {
  test(`public page and spreadsheet use ${language} translations`, () => {
    const page = publicPage(language)
    assert.match(page, new RegExp(`<html lang="${language}">`))
    assert.ok(page.includes(translate(language, 'Loading form')))
    assert.ok(Object.values(dictionary(language)).every((value) => typeof value === 'string'))
    const form = createForm('Custom title')
    form.settings.spreadsheetLanguage = language
    const question = createField('boolean', 'Custom question')
    form.fields = [question]
    const response: FormResponse = {
      schemaVersion: 1,
      submissionId: 'id',
      formFileId: 'file',
      formRevision: 'revision',
      submittedAt: '2026-09-14T12:00:00Z',
      respondent: { id: 'user', displayName: 'Name' },
      answers: { [question.id]: true },
      files: []
    }
    const rows = responseRows(form, [response, { ...response, answers: { [question.id]: false } }])
    assert.deepEqual(rows[0], [
      translate(language, 'Timestamp'),
      translate(language, 'Submission ID'),
      translate(language, 'Respondent'),
      'Custom question'
    ])
    assert.equal(rows[1][3], translate(language, 'Yes'))
    assert.equal(rows[2][3], translate(language, 'No'))
  })
}
