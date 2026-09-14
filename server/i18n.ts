import { readFileSync } from 'node:fs'

export type Language = 'fr' | 'es' | 'de' | 'en'
export const supportedLanguages: Language[] = ['fr', 'es', 'de', 'en']
const catalogs = JSON.parse(
  readFileSync(new URL('../l10n/translations.json', import.meta.url), 'utf8')
) as Record<string, Record<string, string | string[]>>

/** Match regional variants and respect the browser's language preference order. */
export function selectLanguage(header = '', explicit = ''): Language {
  const normalize = (value: string) => value.trim().toLowerCase().split(/[-_]/)[0] as Language
  if (supportedLanguages.includes(normalize(explicit))) return normalize(explicit)
  const preferences = header
    .split(',')
    .map((part) => {
      const [tag, ...parameters] = part.split(';')
      const quality = parameters.find((value) => value.trim().startsWith('q='))
      return { language: normalize(tag), quality: quality ? Number(quality.trim().slice(2)) : 1 }
    })
    .filter(({ quality }) => Number.isFinite(quality) && quality > 0 && quality <= 1)
    .sort((a, b) => b.quality - a.quality)
  return preferences.find(({ language }) => supportedLanguages.includes(language))?.language ?? 'fr'
}

export function dictionary(language: Language): Record<string, string> {
  return Object.fromEntries(
    Object.entries(catalogs[language] ?? {}).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value
    ])
  )
}

export function translate(language: Language, key: string) {
  const value = catalogs[language]?.[key]
  return (Array.isArray(value) ? value[0] : value) ?? key
}
