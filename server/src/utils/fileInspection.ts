import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { RESUME_MIME_TYPES, type ResumeExtension } from '@jobportal/shared';

/**
 * Resume files are inspected by their BYTES. The client's Content-Type and filename are untrusted:
 * a renamed executable must not become "resume.pdf" with type application/pdf.
 */

const PDF_MAGIC = Buffer.from('%PDF-');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export interface InspectedFile {
  extension: ResumeExtension;
  mimeType: string;
  safeName: string;
  sha256: string;
}

export type InspectionFailure =
  | { reason: 'EMPTY' }
  | { reason: 'BAD_EXTENSION' }
  | { reason: 'UNRECOGNISED_CONTENT' }
  | { reason: 'EXTENSION_MISMATCH'; detected: ResumeExtension }
  | { reason: 'MACROS' };

export function extensionOf(filename: string): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec(filename.trim());
  return match ? match[1]!.toLowerCase() : '';
}

export const isAllowedExtension = (ext: string): ext is ResumeExtension => Object.hasOwn(RESUME_MIME_TYPES, ext);

/** Detects PDF, DOCX (a zip containing word/document.xml) or legacy DOC (OLE2 compound file). */
export function detectResumeType(buf: Buffer): ResumeExtension | null {
  // PDF readers accept the header anywhere in the first KB (some generators prepend junk); so do we.
  if (buf.subarray(0, 1024).includes(PDF_MAGIC)) return 'pdf';
  if (buf.subarray(0, 4).equals(ZIP_MAGIC)) return buf.includes('word/document.xml') ? 'docx' : null;
  if (buf.subarray(0, 8).equals(OLE_MAGIC)) return 'doc';
  return null;
}

/**
 * Makes a client-supplied filename safe to store and to echo in Content-Disposition: strips any path,
 * control and reserved characters, collapses whitespace, caps the length and forces the detected extension.
 */
export function sanitizeFilename(original: string, extension: ResumeExtension): string {
  const base = original.split(/[\\/]/).pop() ?? '';
  const stem = base
    .normalize('NFC')
    .replace(/\.[^.]*$/, '')
    .replace(/[\p{Cc}\p{Cf}<>:"|?*\\/]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100);
  return `${stem || 'resume'}.${extension}`;
}

export function inspectResume(buf: Buffer, originalName: string): InspectedFile | InspectionFailure {
  if (buf.length === 0) return { reason: 'EMPTY' };
  const claimed = extensionOf(originalName);
  if (!isAllowedExtension(claimed)) return { reason: 'BAD_EXTENSION' };

  const detected = detectResumeType(buf);
  if (!detected) return { reason: 'UNRECOGNISED_CONTENT' };
  if (detected !== claimed) return { reason: 'EXTENSION_MISMATCH', detected };
  // Macro-enabled Word documents (.docm renamed to .docx) carry executable VBA.
  if (detected === 'docx' && buf.includes('vbaProject.bin')) return { reason: 'MACROS' };

  return {
    extension: detected,
    mimeType: RESUME_MIME_TYPES[detected],
    safeName: sanitizeFilename(originalName, detected),
    sha256: crypto.createHash('sha256').update(buf).digest('hex')
  };
}

// ---- DOCX text extraction (for the AI match feature) -------------------------------------------

const MAX_XML_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

/**
 * Reads word/document.xml out of a DOCX with a minimal zip central-directory walk and returns plain text.
 * Bounded against zip bombs (inflate output capped). Returns null for anything it cannot read.
 */
export function extractDocxText(buf: Buffer): string | null {
  try {
    // End of central directory record: last 22+ bytes, signature 0x06054b50.
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) return null;
    const entries = buf.readUInt16LE(eocd + 10);
    let ptr = buf.readUInt32LE(eocd + 16);

    for (let i = 0; i < entries && ptr + 46 <= buf.length; i += 1) {
      if (buf.readUInt32LE(ptr) !== 0x02014b50) return null;
      const method = buf.readUInt16LE(ptr + 10);
      const compressedSize = buf.readUInt32LE(ptr + 20);
      const nameLen = buf.readUInt16LE(ptr + 28);
      const extraLen = buf.readUInt16LE(ptr + 30);
      const commentLen = buf.readUInt16LE(ptr + 32);
      const localOffset = buf.readUInt32LE(ptr + 42);
      const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);

      if (name === 'word/document.xml') {
        const localNameLen = buf.readUInt16LE(localOffset + 26);
        const localExtraLen = buf.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localNameLen + localExtraLen;
        const data = buf.subarray(start, start + compressedSize);
        const xml = method === 0 ? data : method === 8 ? zlib.inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES }) : null;
        return xml ? xmlToText(xml.toString('utf8')) : null;
      }
      ptr += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  } catch {
    return null;
  }
}

function xmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<\/w:p>|<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}
