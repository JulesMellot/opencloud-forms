import { expect, request, test, type APIRequestContext, type Page } from '@playwright/test'

/*
 * Runs against a real OpenCloud (basic auth enabled for the API calls) with the extension
 * installed and forms-server routed at /forms-api.
 */

const ADMIN = {
  username: process.env.ADMIN_USERNAME ?? 'admin',
  password: process.env.ADMIN_PASSWORD ?? 'admin'
}
// OpenCloud's built-in "Can view" role
const VIEWER_ROLE_ID = 'b1e2218d-eef8-4d4c-b82d-0f1a1b48f3b5'
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a8f10000000049454e44ae426082',
  'hex'
)

type User = { id: string; username: string; password: string }

const basic = ({ username, password }: { username: string; password: string }) =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

let admin: APIRequestContext
const users: User[] = []

async function createUser(role: string): Promise<User> {
  const username = `forms-${role}-${Math.random().toString(36).slice(2, 8)}`
  const password = `Forms-${role}-Pass-2026!`
  const response = await admin.post('/graph/v1.0/users', {
    data: {
      onPremisesSamAccountName: username,
      displayName: `Forms ${role}`,
      mail: `${username}@example.org`,
      passwordProfile: { password }
    }
  })
  expect(response.ok()).toBeTruthy()
  const user = { id: (await response.json()).id, username, password }
  users.push(user)
  return user
}

async function login(page: Page, user: User) {
  await page.goto('/')
  await page.getByPlaceholder('Username').fill(user.username)
  await page.getByPlaceholder('Password').fill(user.password)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/files\//, { timeout: 30_000 })
}

async function createForm(page: Page) {
  const created = page.waitForResponse(
    (r) => r.url().endsWith('.ocform') && r.request().method() === 'PUT' && r.status() === 201
  )
  await page.locator('.oc-app-floating-action-button').click()
  await page.locator('.new-file-btn-ocform').click()
  await page.locator('.oc-modal-body-actions-confirm').click()
  const response = await created
  await expect(page).toHaveURL(/\/forms\/edit\//)
  return {
    fileName: decodeURIComponent(response.url().split('/').pop()),
    fileId: response.headers()['oc-fileid']
  }
}

function waitForSave(page: Page) {
  return page.waitForResponse(
    (r) => r.url().includes('.ocform') && r.request().method() === 'PUT' && r.status() === 204
  )
}

async function addQuestion(page: Page, type: string, label: string) {
  const select = page.locator('#forms-new-question-type')
  await select.click()
  await page.getByRole('option', { name: type, exact: true }).click()
  await page.getByRole('button', { name: 'Add question' }).click()
  await page.locator('[id^="forms-edit-"][id$="-label"]').last().fill(label)
}

test.beforeAll(async () => {
  admin = await request.newContext({
    baseURL: test.info().project.use.baseURL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Authorization: basic(ADMIN) }
  })
})

test.afterAll(async () => {
  for (const user of users) {
    await admin.delete(`/graph/v1.0/users/${user.id}`)
  }
  await admin.dispose()
})

test('a form is created from the New menu, edited, saved and reopened', async ({ page }) => {
  await login(page, await createUser('editor'))
  const { fileName } = await createForm(page)

  const title = page.locator('#forms-title')
  await expect(title).toHaveValue(fileName.replace(/\.ocform$/, ''))
  const newTitle = `Survey ${Date.now()}`
  await title.fill(newTitle)

  const renamed = page.waitForResponse(
    (r) => r.request().method() === 'MOVE' && r.status() >= 200 && r.status() < 300
  )
  await page.getByRole('button', { name: 'Rename the file' }).click()
  await renamed
  const renamedFile = `${newTitle}.ocform`
  await expect(page.getByText(`File: ${renamedFile}`)).toBeVisible()

  await page.locator('#app-top-bar-close').click()
  await expect(page).not.toHaveURL(/\/forms\/edit\//)
  await page.reload()
  await page.locator(`[data-test-resource-name="${renamedFile}"]`).first().click()

  await expect(page.locator('#forms-title')).toHaveValue(newTitle)
  await page.reload()
  await expect(page.locator('#forms-title')).toHaveValue(newTitle)
})

test('a public form collects validated anonymous responses into the spreadsheet', async ({
  page,
  browser
}) => {
  const editor = await createUser('owner')
  await login(page, editor)
  await createForm(page)

  await addQuestion(page, 'Short text', 'Your name')
  await page.getByRole('checkbox', { name: 'Required' }).last().check()
  await addQuestion(page, 'File upload', 'Your photo')
  let saved = waitForSave(page)
  await page.keyboard.press('Control+s')
  await saved

  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('radio', { name: /Anyone with the link/ }).check()
  saved = waitForSave(page)
  await page.getByRole('button', { name: 'Create a public link', exact: true }).click()
  await saved
  const publicLink = await page.getByRole('textbox', { name: 'Public link' }).inputValue()
  expect(publicLink).toMatch(/\/forms-api\/p\//)
  await expect(page.getByRole('link', { name: 'Open the public form' })).toHaveAttribute(
    'href',
    publicLink
  )
  await expect(page.getByRole('link', { name: 'Send by email' })).toHaveAttribute(
    'href',
    /^mailto:/
  )
  const publicRefresh = page.waitForResponse(
    (r) => r.url().includes('/publication/sync') && r.request().method() === 'POST' && r.ok()
  )
  await page.locator('#forms-confirmation').fill('Merci, votre réponse est enregistrée.')
  await publicRefresh

  const anonymous = await browser.newContext({ ignoreHTTPSErrors: true })
  const respondent = await anonymous.newPage()
  await respondent.goto(publicLink)
  await expect(respondent.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(respondent.locator('#app-top-bar')).toHaveCount(0)
  await respondent.getByRole('button', { name: 'Envoyer' }).click()

  await respondent.getByLabel('Your name').fill('Ada Lovelace')
  const photo = respondent.getByLabel('Your photo')
  await photo.setInputFiles({
    name: 'malware.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('MZ\x90\x00binary')
  })
  await respondent.getByRole('button', { name: 'Envoyer' }).click()
  await expect(respondent.getByText('Certaines réponses doivent être corrigées.')).toBeVisible()

  await photo.setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG })
  await respondent.getByRole('button', { name: 'Envoyer' }).click()
  await expect(respondent.getByText('Merci, votre réponse est enregistrée.')).toBeVisible()

  await respondent.getByRole('button', { name: 'Envoyer une autre réponse' }).click()
  await respondent.getByLabel('Your name').fill('Grace Hopper')
  await respondent.getByRole('button', { name: 'Envoyer' }).click()
  await expect(respondent.getByText('Merci, votre réponse est enregistrée.')).toBeVisible()
  await anonymous.close()

  await page.getByRole('tab', { name: 'Responses' }).click()
  await expect(page.getByRole('heading', { name: '2 responses' })).toBeVisible()
  await page
    .getByRole('row', { name: /Ada Lovelace/ })
    .getByRole('button', { name: 'View', exact: true })
    .click()
  await expect(page.getByText('Ada Lovelace').last()).toBeVisible()
  await expect(page.getByRole('link', { name: 'me.png' })).toBeVisible()

  saved = waitForSave(page)
  await page.getByRole('button', { name: 'Choose a folder and create the spreadsheet' }).click()
  await page
    .frameLocator('iframe[title="OpenCloud"]')
    .getByRole('button', { name: 'Create the spreadsheet here' })
    .click()
  await saved
  await expect(page.getByRole('link', { name: 'Open spreadsheet' })).toBeVisible()

  const editorApi = await request.newContext({
    baseURL: test.info().project.use.baseURL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Authorization: basic(editor) }
  })
  const listing = await editorApi.fetch(`/remote.php/dav/files/${editor.username}/`, {
    method: 'PROPFIND',
    headers: { Depth: '1' }
  })
  expect(listing.status()).toBe(207)
  const spreadsheetMatches =
    (await listing.text()).match(/<oc:name>[^<]*responses\.ods<\/oc:name>/g) ?? []
  expect(spreadsheetMatches).toHaveLength(1)
  const spreadsheet = await editorApi.get(
    `/remote.php/dav/files/${editor.username}/${encodeURIComponent('New form – responses.ods')}`
  )
  expect(spreadsheet.ok()).toBeTruthy()
  const spreadsheetContent = (await spreadsheet.body()).toString('utf8')
  expect(spreadsheetContent).toContain('Ada Lovelace')
  expect(spreadsheetContent).toContain('Grace Hopper')
  await editorApi.dispose()
})

test('people the form is shared with respond from OpenCloud', async ({ page, browser }) => {
  const editor = await createUser('sharer')
  const respondentUser = await createUser('colleague')
  await login(page, editor)
  const { fileId } = await createForm(page)

  await addQuestion(page, 'Yes / No', 'Coming to the meeting?')
  await page.getByRole('tab', { name: 'Settings' }).click()
  const saved = waitForSave(page)
  await page.getByRole('button', { name: 'Publish for OpenCloud users', exact: true }).click()
  await saved

  const editorApi = await request.newContext({
    baseURL: test.info().project.use.baseURL,
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: { Authorization: basic(editor) }
  })
  const driveId = fileId.substring(0, fileId.indexOf('!'))
  const invite = await editorApi.post(`/graph/v1beta1/drives/${driveId}/items/${fileId}/invite`, {
    data: {
      roles: [VIEWER_ROLE_ID],
      recipients: [{ objectId: respondentUser.id, '@libre.graph.recipient.type': 'user' }]
    }
  })
  expect(invite.ok()).toBeTruthy()
  await editorApi.dispose()

  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  const respondent = await context.newPage()
  await login(respondent, respondentUser)
  await respondent.goto(`/f/${fileId}`)
  await expect(respondent.getByRole('button', { name: 'Submit' })).toBeVisible({ timeout: 30_000 })
  await expect(respondent.locator('#forms-title')).toHaveCount(0)
  await respondent.getByRole('radio', { name: 'Yes' }).check()
  await respondent.getByRole('button', { name: 'Submit' }).click()
  await expect(respondent.getByText('Your response has been recorded.')).toBeVisible()
  await context.close()

  await page.getByRole('tab', { name: 'Responses' }).click()
  await page.getByRole('button', { name: 'View', exact: true }).click()
  await expect(page.getByText('Respondent: Forms colleague')).toBeVisible()
})
