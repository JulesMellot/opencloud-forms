import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const temporary = mkdtempSync(join(tmpdir(), 'opencloud-forms-'))

function archive(name, files) {
  const staging = join(temporary, name)
  for (const file of files) {
    cpSync(join(root, file), join(staging, file), { recursive: true })
  }
  const output = join(root, name)
  rmSync(output, { force: true })
  execFileSync('zip', ['-qr', output, '.'], { cwd: staging })
}

try {
  const server = readdirSync(join(root, 'server'))
    .filter((file) => !file.endsWith('.test.ts'))
    .map((file) => `server/${file}`)
  archive('forms-server.zip', [
    ...server,
    'src/schema.ts',
    'l10n/translations.json',
    'package.json',
    'README.md',
    'LICENSE'
  ])
  archive(`opencloud-forms-${version}.zip`, [
    'src',
    'server',
    'l10n',
    'tests',
    'scripts',
    '.github',
    'package.json',
    'package-lock.json',
    'README.md',
    'CHANGELOG.md',
    'LICENSE',
    'vite.config.ts',
    'tsconfig.json',
    'eslint.config.js',
    'playwright.config.ts',
    'extension.d.ts',
    '.prettierrc.json',
    '.prettierignore',
    '.gitignore',
    'forms.zip',
    'forms-server.zip'
  ])
  const archives = ['forms.zip', 'forms-server.zip', `opencloud-forms-${version}.zip`]
  writeFileSync(
    join(root, 'SHA256SUMS'),
    archives
      .map(
        (name) =>
          `${createHash('sha256')
            .update(readFileSync(join(root, name)))
            .digest('hex')}  ${name}\n`
      )
      .join('')
  )
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
