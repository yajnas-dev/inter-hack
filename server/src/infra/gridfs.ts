import { Readable } from 'node:stream';
import type { Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { Application } from '../models';
import { ApiError, notFound } from '../http/errors';

const BUCKET_NAME = 'resumes';

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: BUCKET_NAME });

export function uploadResumeFile(
  buffer: Buffer,
  meta: { originalName: string; mimeType: string; userId: string }
): Promise<Types.ObjectId> {
  return new Promise((resolve, reject) => {
    const upload = bucket().openUploadStream(meta.originalName, {
      contentType: meta.mimeType,
      metadata: { userId: meta.userId }
    });
    upload.on('error', reject);
    upload.on('finish', () => resolve(upload.id as Types.ObjectId));
    Readable.from(buffer).pipe(upload);
  });
}

/** Streams the stored file to `res`; a missing file becomes a 404 before any header is sent. */
export function streamResumeFile(
  fileId: Types.ObjectId | string,
  res: Response,
  file: { originalName?: string; mimeType?: string }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const download = bucket().openDownloadStream(new Types.ObjectId(String(fileId)));
    download.once('error', () => reject(notFound('Resume file not found')));
    download.once('file', () => {
      res.set('Content-Type', file.mimeType || 'application/octet-stream');
      res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName || 'resume')}"`);
    });
    download.once('end', resolve);
    download.pipe(res);
  });
}

/** Applications keep a snapshot of the resume they were sent with, so only delete unreferenced files. */
export async function deleteResumeFileIfUnreferenced(fileId: Types.ObjectId | string | undefined): Promise<void> {
  if (!fileId) return;
  const id = new Types.ObjectId(String(fileId));
  if (await Application.exists({ 'resumeSnapshot.fileId': id })) return;
  try {
    await bucket().delete(id);
  } catch (err) {
    if (!/FileNotFound/i.test((err as Error).message)) throw new ApiError(500, 'Failed to delete resume file');
  }
}
