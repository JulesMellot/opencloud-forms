import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isAccepted, sanitizeFileName, sniff } from './files.ts'

const bytes = (...values: number[]) => Uint8Array.from(values)
const text = (value: string) => new TextEncoder().encode(value)

test('detects images from content, not from the name', () => {
  const jpeg = sniff(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0), 'holiday.png')
  assert.deepEqual(jpeg, { category: 'image', mime: 'image/jpeg', ext: 'jpg' })
  assert.equal(isAccepted(jpeg, ['image']), true)
})

test('rejects an executable renamed to .jpg even when any file is accepted', () => {
  const exe = sniff(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03), 'malware.jpg')
  assert.equal(exe.category, 'executable')
  assert.equal(isAccepted(exe, ['image']), false)
  assert.equal(isAccepted(exe, ['any']), false)
})

test('rejects active content like svg or html', () => {
  assert.equal(isAccepted(sniff(text('<svg onload="alert(1)"/>'), 'logo.svg'), ['any']), false)
  assert.equal(isAccepted(sniff(text('<script></script>'), 'page.html'), ['any']), false)
})

test('tells office documents from plain zip archives', () => {
  const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0)
  assert.equal(sniff(zip, 'report.docx').category, 'document')
  assert.equal(sniff(zip, 'photos.zip').category, 'archive')
  assert.equal(isAccepted(sniff(zip, 'photos.zip'), ['document']), false)
})

test('a text file posing as a pdf is not a pdf', () => {
  assert.equal(isAccepted(sniff(text('hello'), 'invoice.pdf'), ['pdf']), false)
  assert.equal(isAccepted(sniff(text('%PDF-1.7'), 'invoice.pdf'), ['pdf']), true)
})

test('sanitizes names: no path traversal, no control characters', () => {
  assert.equal(sanitizeFileName('../../etc/passwd'), 'passwd')
  assert.equal(sanitizeFileName('C:\\Users\\me\\cv.pdf'), 'cv.pdf')
  assert.equal(sanitizeFileName('a\u0000b\nc.txt'), 'abc.txt')
  assert.equal(sanitizeFileName('..'), '..')
  assert.equal(sanitizeFileName(''), 'file')
})
