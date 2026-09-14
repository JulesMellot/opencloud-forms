import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import translations from '../../l10n/translations.json'

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.(ts|vue)$/.test(path) ? [path] : []
  })
}

it.each(['fr', 'es', 'de'] as const)(
  'has %s translations for every gettext message',
  (language) => {
    const missing: string[] = []
    for (const file of [...sourceFiles('src'), 'server/public-page.ts']) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(
        /(?:\$(?:n)?gettext|\bt|\binitial)\(\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/g
      )) {
        const parsed = ts.createSourceFile('message.ts', match[1], ts.ScriptTarget.Latest)
        const statement = parsed.statements[0] as ts.ExpressionStatement
        const key = (statement.expression as ts.StringLiteral).text
        const translation = translations[language][key as keyof typeof translations.fr]
        if (!translation || (Array.isArray(translation) && translation.some((value) => !value))) {
          missing.push(`${file}: ${key}`)
        }
      }
    }
    expect(missing).toEqual([])
  }
)

it('keeps the same message keys, plural forms and interpolation parameters in every language', () => {
  const placeholders = (value: string) =>
    [...value.matchAll(/%{[^}]+}/g)].map(([match]) => match).sort()
  for (const language of ['fr', 'es', 'de'] as const) {
    expect(Object.keys(translations[language]).sort()).toEqual(Object.keys(translations.fr).sort())
    for (const [key, value] of Object.entries(translations[language])) {
      expect(Array.isArray(value)).toBe(
        Array.isArray(translations.fr[key as keyof typeof translations.fr])
      )
      for (const text of Array.isArray(value) ? value : [value]) {
        expect(text.trim(), `${language}: ${key}`).not.toBe('')
        expect(placeholders(text), `${language}: ${key}`).toEqual(placeholders(key))
      }
    }
  }
})
