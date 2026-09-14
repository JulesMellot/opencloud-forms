import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { publicPage } from '../../server/public-page.ts'
import { translate } from '../../server/i18n.ts'
import { createField, createForm, respondentView } from '../../src/schema.ts'

for (const language of ['fr', 'es', 'de'] as const) {
  test(`public form renders, validates and submits in ${language}`, async () => {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ locale: language })
      page.setDefaultTimeout(5000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const form = createForm()
      const number = createField('number', 'Custom number')
      const checkbox = createField('checkbox', 'Custom choice')
      checkbox.required = true
      checkbox.options = [{ id: 'choice', label: 'Custom option' }]
      const boolean = createField('boolean', 'Custom boolean')
      const upload = createField('file', 'Custom upload')
      upload.maxFiles = 2
      form.fields = [number, checkbox, boolean, upload]
      form.settings.acceptingResponses = true
      let submissions = 0
      await page.route('https://forms.test/**', (route) => {
        const path = new URL(route.request().url()).pathname
        if (path.endsWith('/submissions')) {
          submissions++
          return route.fulfill({ status: 201, json: {} })
        }
        if (path.includes('/v1/public/')) return route.fulfill({ json: respondentView(form) })
        if (path.includes('/p/'))
          return route.fulfill({ contentType: 'text/html', body: publicPage(language) })
        return route.fulfill({ status: 404, json: {} })
      })
      const t = (key: string) => translate(language, key)
      await page.goto('https://forms.test/forms-api/p/token')
      await page.getByRole('heading', { name: t('Untitled form') }).waitFor()
      assert.equal(await page.locator('html').getAttribute('lang'), language)
      await page.getByRole('radio', { name: t('Yes'), exact: true }).check()
      await page.getByLabel('Custom number').fill('1.5')
      await page.getByRole('button', { name: t('Submit'), exact: true }).click()
      await page.getByText(t('This question is required.'), { exact: true }).waitFor()
      assert.equal(submissions, 0)
      assert.ok(
        (await page.locator('body').innerText()).includes(
          t('Up to %{count} files').replace('%{count}', '2')
        )
      )
      await page.getByRole('checkbox').check()
      await page.getByRole('button', { name: t('Submit'), exact: true }).click()
      await page.getByRole('heading', { name: t('Response sent') }).waitFor()
      await page.getByText(t('Your response has been recorded.'), { exact: true }).waitFor()
      assert.equal(submissions, 1)
      await page.getByRole('button', { name: t('Submit another response') }).click()
      await page.getByRole('heading', { name: t('Untitled form') }).waitFor()
      assert.deepEqual(errors, [])
    } finally {
      await browser.close()
    }
  })
}
