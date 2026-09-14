import type { FileCategory } from '../src/schema.ts'

export type SniffedCategory = Exclude<FileCategory, 'any'> | 'text' | 'executable' | 'unknown'

export interface Sniffed {
  category: SniffedCategory
  mime: string
  ext: string
}

/** Never stored, whatever the field accepts: executable or rendered as active content */
const DANGEROUS_EXTENSIONS = new Set([
  'apk',
  'app',
  'bat',
  'bash',
  'cmd',
  'com',
  'cpl',
  'dll',
  'exe',
  'hta',
  'htm',
  'html',
  'jar',
  'js',
  'jse',
  'lnk',
  'mjs',
  'msi',
  'php',
  'ps1',
  'scr',
  'sh',
  'svg',
  'svgz',
  'vbs',
  'wsf',
  'xhtml',
  'xml'
])

const OFFICE_ZIP: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation'
}
const OFFICE_OLE: Record<string, string> = {
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint'
}
const TEXT_DOCUMENTS: Record<string, string> = {
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  rtf: 'application/rtf'
}

export function extensionOf(fileName: string) {
  const match = /\.([a-z0-9]{1,10})$/i.exec(fileName)
  return match ? match[1].toLowerCase() : ''
}

/** Keeps a displayable original name: no path, no control characters, bounded length */
export function sanitizeFileName(fileName: string) {
  const base = (fileName.split(/[/\\]/).pop() || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 180)
  return base || 'file'
}

function bytesEqual(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((b, i) => bytes[offset + i] === b)
}

function ascii(bytes: Uint8Array, offset: number, text: string) {
  return bytesEqual(
    bytes,
    offset,
    [...text].map((c) => c.charCodeAt(0))
  )
}

function isUtf8Text(bytes: Uint8Array) {
  const sample = bytes.subarray(0, 8192)
  if (sample.includes(0)) {
    return false
  }
  try {
    // a multi-byte character cut at the sample boundary is not an error
    new TextDecoder('utf-8', { fatal: true }).decode(sample, { stream: true })
    return true
  } catch {
    return false
  }
}

/**
 * Detects the type from the content only. The browser-provided MIME type is ignored and
 * the name's extension is used solely to tell apart formats sharing a container (zip, OLE).
 */
export function sniff(bytes: Uint8Array, fileName: string): Sniffed {
  const ext = extensionOf(fileName)
  const is = (offset: number, expected: number[]) => bytesEqual(bytes, offset, expected)

  if (
    ascii(bytes, 0, 'MZ') ||
    is(0, [0x7f, 0x45, 0x4c, 0x46]) ||
    is(0, [0xfe, 0xed, 0xfa, 0xce]) ||
    is(0, [0xfe, 0xed, 0xfa, 0xcf]) ||
    is(0, [0xce, 0xfa, 0xed, 0xfe]) ||
    is(0, [0xcf, 0xfa, 0xed, 0xfe]) ||
    is(0, [0xca, 0xfe, 0xba, 0xbe]) ||
    ascii(bytes, 0, '#!') ||
    DANGEROUS_EXTENSIONS.has(ext)
  ) {
    return { category: 'executable', mime: 'application/octet-stream', ext: 'bin' }
  }
  if (is(0, [0xff, 0xd8, 0xff])) {
    return { category: 'image', mime: 'image/jpeg', ext: 'jpg' }
  }
  if (is(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { category: 'image', mime: 'image/png', ext: 'png' }
  }
  if (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a')) {
    return { category: 'image', mime: 'image/gif', ext: 'gif' }
  }
  if (ascii(bytes, 0, 'RIFF')) {
    if (ascii(bytes, 8, 'WEBP')) {
      return { category: 'image', mime: 'image/webp', ext: 'webp' }
    }
    if (ascii(bytes, 8, 'WAVE')) {
      return { category: 'audio', mime: 'audio/wav', ext: 'wav' }
    }
    if (ascii(bytes, 8, 'AVI ')) {
      return { category: 'video', mime: 'video/x-msvideo', ext: 'avi' }
    }
  }
  if (ascii(bytes, 4, 'ftyp')) {
    const brand = String.fromCharCode(...bytes.subarray(8, 12))
    if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) {
      return { category: 'image', mime: 'image/heic', ext: 'heic' }
    }
    if (brand === 'M4A ') {
      return { category: 'audio', mime: 'audio/mp4', ext: 'm4a' }
    }
    if (brand === 'qt  ') {
      return { category: 'video', mime: 'video/quicktime', ext: 'mov' }
    }
    return { category: 'video', mime: 'video/mp4', ext: 'mp4' }
  }
  if (is(0, [0x1a, 0x45, 0xdf, 0xa3])) {
    return { category: 'video', mime: 'video/webm', ext: ext === 'mkv' ? 'mkv' : 'webm' }
  }
  if (ascii(bytes, 0, 'OggS')) {
    return { category: 'audio', mime: 'audio/ogg', ext: 'ogg' }
  }
  if (ascii(bytes, 0, 'fLaC')) {
    return { category: 'audio', mime: 'audio/flac', ext: 'flac' }
  }
  if (ascii(bytes, 0, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return { category: 'audio', mime: 'audio/mpeg', ext: 'mp3' }
  }
  if (ascii(bytes, 0, '%PDF-')) {
    return { category: 'pdf', mime: 'application/pdf', ext: 'pdf' }
  }
  if (is(0, [0x50, 0x4b, 0x03, 0x04])) {
    if (OFFICE_ZIP[ext]) {
      return { category: 'document', mime: OFFICE_ZIP[ext], ext }
    }
    return { category: 'archive', mime: 'application/zip', ext: 'zip' }
  }
  if (is(0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) && OFFICE_OLE[ext]) {
    return { category: 'document', mime: OFFICE_OLE[ext], ext }
  }
  if (is(0, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return { category: 'archive', mime: 'application/x-7z-compressed', ext: '7z' }
  }
  if (is(0, [0x1f, 0x8b])) {
    return { category: 'archive', mime: 'application/gzip', ext: 'gz' }
  }
  if (bytes.length && isUtf8Text(bytes)) {
    if (TEXT_DOCUMENTS[ext]) {
      return { category: 'document', mime: TEXT_DOCUMENTS[ext], ext }
    }
    return { category: 'text', mime: 'text/plain', ext: 'txt' }
  }
  return { category: 'unknown', mime: 'application/octet-stream', ext: ext || 'bin' }
}

export function isAccepted(sniffed: Sniffed, accept: FileCategory[] = ['any']) {
  if (sniffed.category === 'executable') {
    return false
  }
  if (accept.includes('any')) {
    return true
  }
  const category = sniffed.category === 'text' ? 'document' : sniffed.category
  return accept.includes(category as FileCategory)
}
