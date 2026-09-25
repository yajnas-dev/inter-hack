import { Readable } from 'node:stream';
import mongoose, { Types } from 'mongoose';

/**
 * Private binary storage for resumes (GridFS bucket "resumes"). Files are addressed only by an internal id
 * that never leaves the server; every read goes through an authorisation check in the resume service.
 */
const BUCKET_NAME = 'resumes';
const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: BUCKET_NAME });

export function putFile(buffer: Buffer, meta: { filename: string; contentType: string; ownerId: string }): Promise<Types.ObjectId> {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(meta.filename, { metadata: { ownerId: meta.ownerId, contentType: meta.contentType } });
    upload.on('error', reject);
    upload.on('finish', () => resolve(upload.id as Types.ObjectId));
    Readable.from(buffer).pipe(upload);
  });
}

/** A readable stream of the file, or null if the bytes are missing (checked before any header is sent). */
export async function openFile(fileId: Types.ObjectId): Promise<Readable | null> {
  const [file] = await bucket().find({ _id: fileId }).limit(1).toArray();
  return file ? bucket().openDownloadStream(fileId) : null;
}

/** Whole file in memory (resumes are capped at 5 MB); used to hand a PDF to the AI provider. */
export async function readFile(fileId: Types.ObjectId): Promise<Buffer | null> {
  const stream = await openFile(fileId);
  if (!stream) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

export async function deleteFile(fileId: Types.ObjectId): Promise<void> {
  try {
    await bucket().delete(new Types.ObjectId(String(fileId)));
  } catch (err) {
    if (!/FileNotFound/i.test((err as Error).message)) throw err;
  }
}
