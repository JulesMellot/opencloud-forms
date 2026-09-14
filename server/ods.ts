import { crc32 } from 'node:zlib'

/*
 * Minimal OpenDocument spreadsheet writer. OpenCloud has no API to edit spreadsheet cells
 * (Collabora only edits through WOPI), so the responses spreadsheet is a projection
 * regenerated as a whole from the canonical response files.
 */

export const ODS_MIME = 'application/vnd.oasis.opendocument.spreadsheet'

function escapeXml(value: string) {
  return (
    value
      // characters not allowed in XML 1.0
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  )
}

/** String cells only: ODS evaluates table:formula attributes, never cell text */
function cell(value: string) {
  const paragraphs = value
    .split(/\r?\n/)
    .map((line) => `<text:p>${escapeXml(line)}</text:p>`)
    .join('')
  return `<table:table-cell office:value-type="string">${paragraphs}</table:table-cell>`
}

function contentXml(rows: string[][], sheetName: string) {
  const body = rows
    .map((row) => `<table:table-row>${row.map(cell).join('')}</table:table-row>`)
    .join('')
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
    ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"' +
    ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.3">' +
    `<office:body><office:spreadsheet><table:table table:name="${escapeXml(sheetName)}">` +
    body +
    '</table:table></office:spreadsheet></office:body></office:document-content>'
  )
}

const MANIFEST =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">' +
  `<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="${ODS_MIME}"/>` +
  '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
  '</manifest:manifest>'

/** ZIP with stored (uncompressed) entries, as ODS requires for the leading mimetype entry */
export function zipStore(entries: { name: string; data: Buffer }[]) {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8')
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(10, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(0, 8) // stored
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(0x21, 12) // date: 1980-01-01
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(10, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)

    locals.push(local, nameBytes, data)
    centrals.push(central, nameBytes)
    offset += local.length + nameBytes.length + data.length
  }

  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, ...centrals, end])
}

export function buildOds(rows: string[][], sheetName = 'Responses') {
  return zipStore([
    { name: 'mimetype', data: Buffer.from(ODS_MIME) },
    { name: 'META-INF/manifest.xml', data: Buffer.from(MANIFEST) },
    { name: 'content.xml', data: Buffer.from(contentXml(rows, sheetName)) }
  ])
}
