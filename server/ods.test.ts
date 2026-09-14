import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crc32 } from 'node:zlib'
import { buildOds, ODS_MIME } from './ods.ts'

function readZip(zip: Buffer) {
  const entries: Record<string, string> = {}
  let offset = 0
  while (zip.readUInt32LE(offset) === 0x04034b50) {
    const crc = zip.readUInt32LE(offset + 14)
    const size = zip.readUInt32LE(offset + 18)
    const nameLength = zip.readUInt16LE(offset + 26)
    const name = zip.toString('utf8', offset + 30, offset + 30 + nameLength)
    const data = zip.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size)
    assert.equal(crc32(data), crc, `crc of ${name}`)
    entries[name] = data.toString('utf8')
    offset += 30 + nameLength + size
  }
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50)
  return entries
}

test('writes a spreadsheet whose first entry is the stored mimetype', () => {
  const zip = buildOds([['Name'], ['Ada']])
  assert.equal(zip.toString('utf8', 30, 38), 'mimetype')
  const entries = readZip(zip)
  assert.deepEqual(Object.keys(entries), ['mimetype', 'META-INF/manifest.xml', 'content.xml'])
  assert.equal(entries.mimetype, ODS_MIME)
  assert.match(entries['content.xml'], /<text:p>Ada<\/text:p>/)
})

test('escapes markup and keeps formulas as plain text', () => {
  const content = readZip(buildOds([['<b>&"x"</b>', '=HYPERLINK("http://evil")', 'ab']]))[
    'content.xml'
  ]
  assert.match(content, /&lt;b&gt;&amp;&quot;x&quot;&lt;\/b&gt;/)
  assert.doesNotMatch(content, /table:formula/)
  assert.match(content, /<text:p>ab<\/text:p>/)
})
