import zlib from 'node:zlib';

/** Builds small but genuinely valid resume files, so downloads open in real PDF/Word viewers. */

function wrap(line: string, width = 92): string[] {
  const out: string[] = [];
  let current = '';
  for (const word of line.split(' ')) {
    if (`${current} ${word}`.trim().length > width) {
      out.push(current);
      current = word;
    } else current = `${current} ${word}`.trim();
  }
  out.push(current);
  return out;
}

const pdfEscape = (s: string): string => s.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '?');

/** A single-page PDF with a bold title and body lines (Helvetica, xref table with correct offsets). */
export function makePdf(title: string, lines: string[]): Buffer {
  const body = lines.flatMap((l) => (l === '' ? [''] : wrap(l))).slice(0, 56);
  const stream = [
    `BT /F2 18 Tf 50 800 Td (${pdfEscape(title)}) Tj ET`,
    'BT /F1 10 Tf 13 TL 50 775 Td',
    ...body.map((l) => (l === '' ? 'T*' : `(${pdfEscape(l)}) Tj T*`)),
    'ET'
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// ---- DOCX ----------------------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const xmlEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

/** A minimal, valid .docx (opens in Word/LibreOffice). Returns the file and its plain text. */
export function makeDocx(title: string, lines: string[]): { file: Buffer; text: string } {
  const paragraphs = [title, ...lines];
  const document =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    paragraphs
      .map((p, i) => `<w:p><w:r>${i === 0 ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xmlEscape(p)}</w:t></w:r></w:p>`)
      .join('') +
    '</w:body></w:document>';

  const entries: Array<[string, string]> = [
    ['[Content_Types].xml', CONTENT_TYPES],
    ['_rels/.rels', RELS],
    ['word/document.xml', document]
  ];
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const raw = Buffer.from(content);
    const data = zlib.deflateRawSync(raw);
    const nameBuf = Buffer.from(name);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0x5c21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0x5c21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return { file: Buffer.concat([...locals, centralBuf, end]), text: paragraphs.join('\n') };
}
